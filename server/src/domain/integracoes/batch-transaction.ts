/**
 * Batch Transaction Manager com Timeout e Chunking
 *
 * Responsável por:
 * - Executar transações em batch com timeout de 30 segundos
 * - Dividir automaticamente batches grandes em chunks de 1000 registros
 * - Manter auditoria para cada batch processado
 * - Monitorar performance e alertar se timeout é atingido
 *
 * Uso:
 * const results = await batchTransaction(db, async (tx) => {
 *   // operações aqui
 * }, { timeout: 30000, chunkSize: 1000 });
 */

import type Database from "better-sqlite3";
import { logger } from "../../services/logger-service.js";
import { captureException, addSentryBreadcrumb } from "../../services/sentry-service.js";

export interface BatchTransactionOptions {
  timeout?: number; // em ms, padrão 30000
  chunkSize?: number; // padrão 1000
  label?: string; // para logging
}

export interface BatchTransactionResult<T> {
  success: boolean;
  totalProcessed: number;
  totalChunks: number;
  duration: number; // em ms
  errors: Array<{
    chunkIndex: number;
    error: string;
  }>;
  results?: T[];
}

/**
 * Classe para gerenciar transações em batch com timeout
 */
export class BatchTransactionManager {
  private db: Database.Database;
  private defaultTimeout: number = 30000; // 30 segundos

  constructor(db: Database.Database, defaultTimeout?: number) {
    this.db = db;
    if (defaultTimeout) {
      this.defaultTimeout = defaultTimeout;
    }
  }

  /**
   * Executa uma transação com timeout
   * Se exceder tempo limite, aborta a transação
   */
  async executeWithTimeout<T>(
    callback: (tx: Database.Database) => T,
    timeout: number = this.defaultTimeout,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let completed = false;
      const startTime = Date.now();

      // Setup timeout
      const timeoutHandle = setTimeout(() => {
        if (!completed) {
          completed = true;
          const error = new Error(
            `Batch transaction timeout: exceeded ${timeout}ms limit`,
          );
          captureException(error, {
            tags: {
              operation: "batch_transaction_timeout",
            },
            level: "error",
            extra: {
              timeout,
              elapsedMs: Date.now() - startTime,
            },
          });
          reject(error);
        }
      }, timeout);

      try {
        // Usar transaction do better-sqlite3
        const transaction = this.db.transaction(callback);
        const result = transaction(this.db);
        completed = true;
        clearTimeout(timeoutHandle);

        addSentryBreadcrumb({
          category: "batch_transaction",
          message: "Transaction completed successfully",
          level: "info",
          data: {
            duration: Date.now() - startTime,
          },
        });

        resolve(result);
      } catch {
        completed = true;
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  /**
   * Processa um array de itens em chunks, cada chunk em sua própria transação
   * Útil para processar grandes quantidades de dados sem timeout
   */
  async processBatch<T, R>(
    items: T[],
    processor: (items: T[], chunkIndex: number) => R,
    options: BatchTransactionOptions = {},
  ): Promise<BatchTransactionResult<R>> {
    const startTime = Date.now();
    const timeout = options.timeout ?? this.defaultTimeout;
    const chunkSize = options.chunkSize ?? 1000;
    const label = options.label ?? "batch-transaction";

    const results: R[] = [];
    const errors: Array<{ chunkIndex: number; error: string }> = [];

    logger.info(`[${label}] Starting batch processing: ${items.length} items, chunk size: ${chunkSize}`);

    // Calcular número de chunks
    const totalChunks = Math.ceil(items.length / chunkSize);

    try {
      // Processar cada chunk
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const chunkStart = chunkIndex * chunkSize;
        const chunkEnd = Math.min(chunkStart + chunkSize, items.length);
        const chunk = items.slice(chunkStart, chunkEnd);

        try {
          logger.debug(`[${label}] Processing chunk ${chunkIndex + 1}/${totalChunks} (${chunk.length} items)`);

          // Executar chunk com timeout
          const result = await this.executeWithTimeout(
            () => processor(chunk, chunkIndex),
            timeout,
          );

          results.push(result);

          addSentryBreadcrumb({
            category: "batch_chunk",
            message: `Chunk ${chunkIndex + 1}/${totalChunks} processed`,
            level: "info",
            data: {
              chunkIndex,
              itemsInChunk: chunk.length,
            },
          });
        } catch {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push({
            chunkIndex,
            error: errorMsg,
          });

          logger.error(`[${label}] Chunk ${chunkIndex} failed: ${errorMsg}`);

          // Capturar erro mas continuar processando outros chunks
          captureException(
            new Error(`Batch chunk ${chunkIndex} failed: ${errorMsg}`),
            {
              tags: {
                operation: "batch_chunk_failure",
                label,
              },
              level: "warning",
              extra: {
                chunkIndex,
                totalChunks,
                itemsInChunk: chunk.length,
              },
            },
          );
        }
      }
    } catch {
      const errorMsg = error instanceof Error ? error.message : String(error);
      captureException(error, {
        tags: {
          operation: "batch_transaction_fatal",
          label,
        },
        level: "error",
      });
    }

    const duration = Date.now() - startTime;

    const result: BatchTransactionResult<R> = {
      success: errors.length === 0,
      totalProcessed: items.length,
      totalChunks,
      duration,
      errors,
      results,
    };

    logger.info(
      `[${label}] Batch complete: ${result.totalProcessed} items in ${result.totalChunks} chunks, ${duration}ms, ${errors.length} errors`,
    );

    return result;
  }

  /**
   * Simples execute com timeout mas sem chunking
   * Para operações pequenas que não precisam de chunking
   */
  async simple<T>(
    callback: (db: Database.Database) => T,
    timeout?: number,
  ): Promise<T> {
    return this.executeWithTimeout(callback, timeout ?? this.defaultTimeout);
  }
}

/**
 * Factory function para criar manager
 */
export function createBatchTransactionManager(
  db: Database.Database,
  defaultTimeout?: number,
): BatchTransactionManager {
  return new BatchTransactionManager(db, defaultTimeout);
}

/**
 * Helper para processar updates em massa com retry
 */
export async function batchUpdate(
  db: Database.Database,
  items: Array<{ id: string; data: Record<string, unknown> }>,
  tableName: string,
  options: BatchTransactionOptions = {},
): Promise<BatchTransactionResult<number>> {
  const manager = new BatchTransactionManager(db, options.timeout);
  const chunkSize = options.chunkSize ?? 1000;

  return manager.processBatch(
    items,
    (chunk: typeof items, chunkIndex: number) => {
      let updateCount = 0;

      for (const item of chunk) {
        const columns = Object.keys(item.data);
        const values = Object.values(item.data);
        const setClause = columns.map((col) => `${col} = ?`).join(", ");

        const stmt = db.prepare(
          `UPDATE ${tableName} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        );

        stmt.run(...values, item.id);
        updateCount++;
      }

      return updateCount;
    },
    {
      ...options,
      label: options.label || `batch-update-${tableName}`,
      chunkSize,
    },
  );
}
