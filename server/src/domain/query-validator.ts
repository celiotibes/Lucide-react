/**
 * Query Validator para Detecção de N+1 e Performance
 *
 * Responsável por:
 * - Detectar N+1 queries (mesma query executada > 2x em um request)
 * - Validar que índices são usados (EXPLAIN QUERY PLAN)
 * - Alertar via Sentry quando problemas são detectados
 * - Manter histórico de queries para análise
 *
 * Uso:
 * const validator = createQueryValidator(db);
 * const result = validator.validateQuery(statement);
 * if (!result.valid) {
 *   console.warn(`Query performance issue: ${result.issues.join(', ')}`);
 * }
 */

import type Database from "better-sqlite3";
import { logger } from "../services/logger-service.js";
import { captureException, addSentryBreadcrumb } from "../services/sentry-service.js";

export interface QueryPlan {
  detail: string;
  selectid?: number;
  order?: number;
  from?: number;
  notused?: number | null;
  name?: string;
  scantype?: string;
  iskeyword?: string;
  explain?: string;
}

export interface QueryValidationResult {
  valid: boolean;
  query: string;
  usesIndex: boolean;
  fullScan: boolean;
  issues: string[];
  queryPlan: QueryPlan[];
  estimatedRows?: number;
}

export interface QueryTracking {
  query: string;
  count: number;
  lastSeen: Date;
  firstSeen: Date;
}

/**
 * Query Validator Class
 */
export class QueryValidator {
  private db: Database.Database;
  private queryHistory: Map<string, QueryTracking> = new Map();
  private n1QueryThreshold: number = 2; // Alerta se mesma query executada mais de 2x
  private maxTrackedQueries: number = 1000; // Limitar tamanho do histórico

  constructor(db: Database.Database, n1QueryThreshold?: number) {
    this.db = db;
    if (n1QueryThreshold) {
      this.n1QueryThreshold = n1QueryThreshold;
    }
  }

  /**
   * Executa EXPLAIN QUERY PLAN para uma query
   */
  private getQueryPlan(query: string): QueryPlan[] {
    try {
      const explainQuery = `EXPLAIN QUERY PLAN ${query}`;
      const stmt = this.db.prepare(explainQuery);
      const plans = stmt.all() as QueryPlan[];

      return plans;
    } catch (error) {
      logger.warn(`Failed to get query plan: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Valida se query usa índices
   */
  private validateIndexUsage(plan: QueryPlan[]): {
    usesIndex: boolean;
    fullScan: boolean;
    details: string[];
  } {
    const details: string[] = [];
    let usesIndex = false;
    let fullScan = false;

    for (const step of plan) {
      const detail = step.detail || "";

      // Detectar se usa índice
      if (detail.includes("USING INDEX")) {
        usesIndex = true;
        details.push(`Uses index: ${step.name || "unnamed"}`);
      }

      // Detectar full table scan (SQLite returns "SCAN tablename" not "SCAN TABLE")
      if (detail.match(/^SCAN\s+\w+/) && !detail.includes("USING INDEX")) {
        fullScan = true;
        details.push(`Full table scan: ${step.name || "unknown"}`);
      }

      // Detectar search com índice
      if (detail.includes("SEARCH")) {
        details.push(`Search: ${detail}`);
      }
    }

    return { usesIndex, fullScan, details };
  }

  /**
   * Normaliza query para rastreamento (remove valores específicos)
   */
  private normalizeQuery(query: string): string {
    return query
      .replace(/\?/g, "?") // Manter placeholders
      .replace(/\s+/g, " ") // Normalizar espaços
      .trim()
      .toUpperCase();
  }

  /**
   * Rastreia execução de query
   */
  private trackQueryExecution(query: string): void {
    const normalized = this.normalizeQuery(query);

    if (this.queryHistory.has(normalized)) {
      const tracking = this.queryHistory.get(normalized)!;
      tracking.count++;
      tracking.lastSeen = new Date();

      // Alertar se detecta N+1
      if (tracking.count > this.n1QueryThreshold) {
        const message = `N+1 Query Detected: Query "${query}" executed ${tracking.count} times`;

        logger.warn(message);

        captureException(new Error(message), {
          tags: {
            operation: "n1_query_detected",
          },
          level: "warning",
          extra: {
            query: normalized,
            executionCount: tracking.count,
            firstSeen: tracking.firstSeen.toISOString(),
            lastSeen: tracking.lastSeen.toISOString(),
          },
        });
      }
    } else {
      // Nova query no histórico
      if (this.queryHistory.size >= this.maxTrackedQueries) {
        // Limpar histórico se ficar muito grande
        const oldest = Array.from(this.queryHistory.values()).sort(
          (a, b) => a.lastSeen.getTime() - b.lastSeen.getTime(),
        )[0];

        if (oldest) {
          const oldestKey = Array.from(this.queryHistory.entries()).find(
            (e) => e[1] === oldest,
          )?.[0];
          if (oldestKey) {
            this.queryHistory.delete(oldestKey);
          }
        }
      }

      this.queryHistory.set(normalized, {
        query: normalized,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
      });
    }
  }

  /**
   * Valida uma query individual
   */
  validateQuery(query: string): QueryValidationResult {
    const queryPlan = this.getQueryPlan(query);
    const { usesIndex, fullScan, details: planDetails } = this.validateIndexUsage(queryPlan);

    const issues: string[] = [];

    // Detectar problemas
    if (fullScan) {
      issues.push("Full table scan detected - consider adding an index");
    }

    if (!usesIndex && !fullScan && query.toUpperCase().includes("SELECT")) {
      // Pode ser uma query simples ou sem índice disponível
      if (query.toUpperCase().includes("WHERE")) {
        issues.push("WHERE clause without index usage");
      }
    }

    // Rastrear para detectar N+1
    this.trackQueryExecution(query);

    addSentryBreadcrumb({
      category: "query_validation",
      message: `Query validated: ${query.substring(0, 50)}...`,
      level: "debug",
      data: {
        usesIndex,
        fullScan,
        issues,
      },
    });

    return {
      valid: issues.length === 0,
      query,
      usesIndex,
      fullScan,
      issues,
      queryPlan,
    };
  }

  /**
   * Retorna estatísticas de queries rastreadas
   */
  getQueryStatistics(): QueryTracking[] {
    return Array.from(this.queryHistory.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * Detecta N+1 queries baseado no histórico
   */
  detectN1Queries(): Array<{
    query: string;
    count: number;
    severity: "low" | "medium" | "high";
  }> {
    return Array.from(this.queryHistory.values())
      .filter((tracking) => tracking.count > this.n1QueryThreshold)
      .map((tracking) => ({
        query: tracking.query,
        count: tracking.count,
        severity:
          tracking.count > 10
            ? "high"
            : tracking.count > 5
              ? "medium"
              : "low",
      }));
  }

  /**
   * Limpa histórico de queries
   */
  clearHistory(): void {
    this.queryHistory.clear();
  }

  /**
   * Retorna queries mais executadas
   */
  getTopQueries(limit: number = 10): QueryTracking[] {
    return Array.from(this.queryHistory.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}

/**
 * Factory function para criar validator
 */
export function createQueryValidator(
  db: Database.Database,
  n1QueryThreshold?: number,
): QueryValidator {
  return new QueryValidator(db, n1QueryThreshold);
}

/**
 * Wrapper para prepared statement que valida query
 * Retorna statement normal mas com validação
 */
export function createValidatedStatement(
  db: Database.Database,
  query: string,
  validator: QueryValidator,
): Database.Statement {
  // Validar query antes de retornar
  const result = validator.validateQuery(query);

  if (!result.valid) {
    logger.warn(`Query validation issues: ${result.issues.join(", ")}`);
  }

  return db.prepare(query);
}
