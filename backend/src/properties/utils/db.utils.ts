import { Pool, PoolClient } from 'pg';
import { Logger } from '../../shared/logger';

export class DatabaseUtils {
  constructor(private pool: Pool) {}

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      Logger.error('db-utils', 'Transaction failed', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async bulkInsert(
    table: string,
    data: Record<string, unknown>[],
    batchSize = 100
  ): Promise<number> {
    if (data.length === 0) return 0;

    let insertedCount = 0;

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const keys = Object.keys(batch[0]);
      const values = batch
        .map((row, rowIndex) => {
          const placeholders = keys
            .map((_, colIndex) => `$${rowIndex * keys.length + colIndex + 1}`)
            .join(',');
          return `(${placeholders})`;
        })
        .join(',');

      const flatValues = batch.flatMap((row) => keys.map((key) => row[key]));

      const query = `
        INSERT INTO ${table} (${keys.join(',')})
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `;

      const result = await this.pool.query(query, flatValues);
      insertedCount += result.rowCount || 0;
    }

    Logger.info('db-utils', 'Bulk insert completed', {
      table,
      total: data.length,
      inserted: insertedCount,
    });

    return insertedCount;
  }

  async getTableStats(tableName: string): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as row_count,
        pg_size_pretty(pg_total_relation_size($1)) as size
      FROM ${tableName}`,
      [tableName]
    );

    return result.rows[0] || { row_count: 0, size: '0 bytes' };
  }

  async checkConnection(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rows.length > 0;
    } catch (error) {
      Logger.error('db-utils', 'Database connection check failed', error);
      return false;
    }
  }

  async getPoolStats(): Promise<Record<string, unknown>> {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

export function buildWhereClause(
  filters: Record<string, unknown>,
  baseIndex = 1
): { clause: string; values: unknown[]; nextIndex: number } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = baseIndex;

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        const placeholders = value.map(() => `$${index++}`).join(',');
        conditions.push(`${key} IN (${placeholders})`);
        values.push(...value);
      } else if (typeof value === 'object') {
        conditions.push(`${key} @> $${index++}`);
        values.push(JSON.stringify(value));
      } else {
        conditions.push(`${key} = $${index++}`);
        values.push(value);
      }
    }
  });

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return {
    clause,
    values,
    nextIndex: index,
  };
}

export function buildUpdateQuery(
  table: string,
  data: Record<string, unknown>,
  whereClause: string
): { query: string; values: unknown[] } {
  const updates: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_at') {
      updates.push(`${key} = $${index++}`);
      values.push(value);
    }
  });

  updates.push(`updated_at = NOW()`);

  const query = `UPDATE ${table} SET ${updates.join(',')} ${whereClause} RETURNING *`;
  return { query, values };
}

export function buildInsertQuery(
  table: string,
  data: Record<string, unknown>
): { query: string; values: unknown[] } {
  const keys = Object.keys(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
  const values = keys.map((key) => data[key]);

  const query = `
    INSERT INTO ${table} (${keys.join(',')})
    VALUES (${placeholders})
    RETURNING *
  `;

  return { query, values };
}

export async function paginate(
  pool: Pool,
  table: string,
  where: string = '',
  limit = 50,
  offset = 0,
  orderBy = 'created_at DESC'
): Promise<{ data: Record<string, unknown>[]; total: number; pages: number }> {
  const dataResult = await pool.query(
    `SELECT * FROM ${table} ${where} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await pool.query(`SELECT COUNT(*) FROM ${table} ${where}`);
  const total = parseInt(countResult.rows[0].count, 10);
  const pages = Math.ceil(total / limit);

  return {
    data: dataResult.rows,
    total,
    pages,
  };
}
