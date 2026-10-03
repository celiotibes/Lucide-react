/**
 * PERF-003: Database Index Validator Service
 *
 * Validates that database indices are being used effectively
 * and identifies redundant or unused indices.
 *
 * Usage:
 *   const validator = new IndexValidatorService(db);
 *   validator.runAnalyze(); // Update statistics
 *   const report = validator.validateIndices();
 *   console.log(report);
 */

import type Database from 'better-sqlite3';
import { logger } from './logger-service.js';

export interface IndexValidationResult {
  name: string;
  table: string;
  columns: string;
  isUnique: boolean;
  isUseful: boolean;
  warnings: string[];
}

export interface ValidationReport {
  totalIndices: number;
  usefulIndices: number;
  potentiallyUnusedIndices: string[];
  redundantIndexGroups: string[][];
  recommendations: string[];
  timestamp: string;
}

export class IndexValidatorService {
  constructor(private db: Database.Database) {}

  /**
   * Runs ANALYZE to update query optimizer statistics
   */
  runAnalyze(): void {
    try {
      this.db.exec('ANALYZE');
      logger.info('[IndexValidator] ANALYZE completed successfully');
    } catch (err) {
      logger.error('[IndexValidator] Error running ANALYZE', err);
    }
  }

  /**
   * Gets all indices in the database
   */
  private getAllIndices(): Array<{
    name: string;
    table: string;
    columns: string;
    isUnique: boolean;
    sql: string | null;
  }> {
    const stmt = this.db.prepare(`
      SELECT
        name,
        tbl_name as 'table',
        GROUP_CONCAT(name, ',') as columns,
        unique as isUnique,
        sql
      FROM sqlite_master
      WHERE type = 'index'
        AND tbl_name NOT LIKE 'sqlite_%'
      GROUP BY name
      ORDER BY tbl_name, name
    `);

    return stmt.all() as Array<{
      name: string;
      table: string;
      columns: string;
      isUnique: boolean;
      sql: string | null;
    }>;
  }

  /**
   * Gets all primary keys (which are always used)
   */
  private getPrimaryKeyColumns(table: string): string[] {
    const stmt = this.db.prepare(`
      PRAGMA table_info(${table})
    `);

    const columns = stmt.all() as Array<{ name: string; pk: number }>;
    return columns.filter(c => c.pk > 0).map(c => c.name);
  }

  /**
   * Checks if an index is redundant (duplicate of another index or subset of compound index)
   */
  private findRedundantIndexes(indices: Array<{
    name: string;
    table: string;
    columns: string;
  }>): string[][] {
    const redundantGroups: string[][] = [];
    const processed = new Set<string>();

    for (let i = 0; i < indices.length; i++) {
      if (processed.has(indices[i].name)) continue;

      const group = [indices[i].name];

      for (let j = i + 1; j < indices.length; j++) {
        if (processed.has(indices[j].name)) continue;

        // Same table and same columns = exact duplicate
        if (
          indices[i].table === indices[j].table &&
          this.columnsAreEqual(indices[i].columns, indices[j].columns)
        ) {
          group.push(indices[j].name);
          processed.add(indices[j].name);
        }

        // One index is prefix of another = potentially redundant
        if (
          indices[i].table === indices[j].table &&
          this.isColumnPrefix(indices[i].columns, indices[j].columns)
        ) {
          group.push(`${indices[j].name} (subset of ${indices[i].name})`);
          processed.add(indices[j].name);
        }
      }

      if (group.length > 1) {
        redundantGroups.push(group);
        processed.add(indices[i].name);
      }
    }

    return redundantGroups;
  }

  /**
   * Checks if two column lists are equal
   */
  private columnsAreEqual(cols1: string, cols2: string): boolean {
    const normalize = (s: string) => s.split(',').map(c => c.trim()).sort().join(',');
    return normalize(cols1) === normalize(cols2);
  }

  /**
   * Checks if cols1 is a prefix of cols2 (cols1 columns appear first in cols2)
   */
  private isColumnPrefix(cols1: string, cols2: string): boolean {
    const c1 = cols1.split(',').map(c => c.trim());
    const c2 = cols2.split(',').map(c => c.trim());

    if (c1.length >= c2.length) return false;

    return c1.every((col, idx) => col === c2[idx]);
  }

  /**
   * Simulates query execution to estimate index usage
   * (This is a simplified heuristic - production should use EXPLAIN QUERY PLAN)
   */
  private estimateIndexUsage(indexName: string, table: string, columns: string): boolean {
    try {
      // Try a simple SELECT with the indexed columns to estimate usage
      const columnList = columns.split(',')[0]; // First column
      const stmt = this.db.prepare(`
        EXPLAIN QUERY PLAN
        SELECT 1 FROM ${table} WHERE ${columnList.trim()} IS NOT NULL LIMIT 1
      `);

      const plan = stmt.all() as Array<{ detail: string }>;
      const planText = JSON.stringify(plan);

      // Check if the index name appears in the query plan
      return planText.includes(indexName) || planText.includes('SEARCH');
    } catch {
      return false; // If query fails, assume index is not used
    }
  }

  /**
   * Validates all indices and returns a detailed report
   */
  validateIndices(): ValidationReport {
    const indices = this.getAllIndices();
    const results: IndexValidationResult[] = [];
    const unusedIndices: string[] = [];

    for (const idx of indices) {
      const warnings: string[] = [];
      let isUseful = true;

      // Check if index is unique (usually more useful)
      if (idx.isUnique) {
        warnings.push('Unique constraint - should be validated');
      }

      // Estimate if index is being used (simplified heuristic)
      const estimatedUsage = this.estimateIndexUsage(idx.name, idx.table, idx.columns);
      if (!estimatedUsage && !idx.isUnique) {
        warnings.push('May not be used by query optimizer');
        isUseful = false;
        unusedIndices.push(idx.name);
      }

      // Check for very small tables (index not worth it)
      try {
        const countStmt = this.db.prepare(`SELECT COUNT(*) as cnt FROM ${idx.table}`);
        const { cnt } = countStmt.get() as { cnt: number };
        if (cnt < 100) {
          warnings.push(`Table has only ${cnt} rows - index may not be beneficial`);
        }
      } catch {
        // Table might not exist
      }

      results.push({
        name: idx.name,
        table: idx.table,
        columns: idx.columns,
        isUnique: idx.isUnique,
        isUseful,
        warnings,
      });
    }

    const redundantGroups = this.findRedundantIndexes(indices);

    const recommendations: string[] = [];
    if (unusedIndices.length > 0) {
      recommendations.push(
        `Consider removing unused indices: ${unusedIndices.join(', ')}`,
      );
    }
    if (redundantGroups.length > 0) {
      recommendations.push(
        `Remove redundant indices: ${redundantGroups.map(g => g.join(' = ')).join('; ')}`,
      );
    }

    return {
      totalIndices: indices.length,
      usefulIndices: results.filter(r => r.isUseful).length,
      potentiallyUnusedIndices: unusedIndices,
      redundantIndexGroups: redundantGroups,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Logs index validation report to logger
   */
  logValidationReport(): void {
    this.runAnalyze();
    const report = this.validateIndices();

    logger.info('[IndexValidator] Index Validation Report', {
      totalIndices: report.totalIndices,
      usefulIndices: report.usefulIndices,
      unusedIndices: report.potentiallyUnusedIndices.length,
      timestamp: report.timestamp,
    });

    if (report.potentiallyUnusedIndices.length > 0) {
      logger.warn('[IndexValidator] Unused indices detected', {
        indices: report.potentiallyUnusedIndices,
      });
    }

    if (report.redundantIndexGroups.length > 0) {
      logger.warn('[IndexValidator] Redundant indices detected', {
        groups: report.redundantIndexGroups,
      });
    }

    if (report.recommendations.length > 0) {
      logger.info('[IndexValidator] Recommendations', {
        recommendations: report.recommendations,
      });
    }
  }

  /**
   * Gets a detailed index report for specific table
   */
  getTableIndexReport(tableName: string): IndexValidationResult[] {
    const indices = this.getAllIndices();
    const tableIndices = indices.filter(idx => idx.table === tableName);

    return tableIndices.map(idx => ({
      name: idx.name,
      table: idx.table,
      columns: idx.columns,
      isUnique: idx.isUnique,
      isUseful: this.estimateIndexUsage(idx.name, idx.table, idx.columns),
      warnings: [],
    }));
  }
}
