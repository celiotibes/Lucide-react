import { Pool, QueryResult } from 'pg';
import { logger } from '@utils/logger';
import { config } from '@utils/config';

// ============================================================================
// DATABASE POOL MANAGER - Connection Pooling & Management
// ============================================================================

class PoolManager {
  private pool: Pool | null = null;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Pool already initialized');
      return;
    }

    try {
      this.pool = new Pool({
        connectionString: config.database_url || `postgres://postgres:postgres@localhost:5432/legal_automation`,
        max: config.db_pool_size || 20,
        idleTimeoutMillis: config.db_idle_timeout || 30000,
        connectionTimeoutMillis: config.db_connection_timeout || 5000,
      });

      this.pool.on('error', (err) => {
        logger.error({ err }, 'Unexpected error on idle client');
      });

      // Test connection
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();

      this.initialized = true;
      logger.info(
        {
          poolSize: config.db_pool_size || 20,
          connectedAt: result.rows[0].now,
        },
        '✓ PostgreSQL pool initialized',
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize database pool');
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool || !this.initialized) {
      throw new Error('Database pool not initialized. Call initialize() first.');
    }
    return this.pool;
  }

  async query<T = any>(sql: string, values?: any[]): Promise<QueryResult<T>> {
    if (!this.pool || !this.initialized) {
      throw new Error('Database pool not initialized');
    }

    try {
      const result = await this.pool.query<T>(sql, values);
      return result;
    } catch (error) {
      logger.error({ sql, error }, 'Database query failed');
      throw error;
    }
  }

  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    if (!this.pool || !this.initialized) {
      throw new Error('Database pool not initialized');
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error }, 'Transaction failed');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      logger.info('Database pool closed');
    }
  }

  async getStats(): Promise<{
    totalConnections: number;
    idleConnections: number;
    waitingRequests: number;
  }> {
    if (!this.pool || !this.initialized) {
      throw new Error('Database pool not initialized');
    }

    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingRequests: this.pool.waitingCount,
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const poolManager = new PoolManager();
