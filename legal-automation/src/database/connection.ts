import { Pool, PoolClient } from 'pg';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { poolManager } from '@database/poolManager';
import { migrationRunner } from '@database/migrationRunner';

let pool: Pool | null = null;

export async function initDatabase(): Promise<Pool> {
  try {
    await poolManager.initialize();
    pool = poolManager.getPool();

    logger.info('✓ Conectado ao PostgreSQL');

    // Run migrations using migration runner
    await migrationRunner.initialize();
    const migrations = await migrationRunner.runPending();

    if (migrations.length > 0) {
      logger.info({ count: migrations.length }, '✓ Migrations completadas');
    } else {
      logger.info('✓ Database schema is up to date');
    }

    return pool;
  } catch (error) {
    logger.error({ err: error }, 'Erro ao conectar com banco de dados');
    throw error;
  }
}

export async function getConnection(): Promise<PoolClient> {
  if (!pool) {
    throw new Error('Pool não inicializado');
  }
  return pool.connect();
}

export async function query(text: string, params?: any[]): Promise<any> {
  if (!pool) {
    throw new Error('Pool não inicializado');
  }
  return pool.query(text, params);
}

export async function closeDatabase(): Promise<void> {
  await poolManager.close();
  pool = null;
  logger.info('Pool PostgreSQL fechado');
}

export function getPool(): Pool | null {
  return pool || (poolManager.isInitialized() ? poolManager.getPool() : null);
}

// SQLite compatibility wrapper
export function prepare(sql: string) {
  return {
    run: (...params: any[]) => {
      if (!pool) throw new Error('Pool não inicializado');
      return pool.query(convertPlaceholders(sql), params);
    },
    get: (...params: any[]) => {
      if (!pool) throw new Error('Pool não inicializado');
      return pool
        .query(convertPlaceholders(sql), params)
        .then((res: any) => res.rows[0]);
    },
    all: (...params: any[]) => {
      if (!pool) throw new Error('Pool não inicializado');
      return pool
        .query(convertPlaceholders(sql), params.length > 0 ? params : [])
        .then((res: any) => res.rows);
    },
  };
}

// Converter placeholders SQLite (?) para PostgreSQL ($1, $2, ...)
function convertPlaceholders(sql: string): string {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

export { pool };

export default { initDatabase, getConnection, query, closeDatabase, getPool, prepare };
