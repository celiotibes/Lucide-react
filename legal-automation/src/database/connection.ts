import { Pool, PoolClient } from 'pg';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { allMigrations } from './models';

let pool: Pool | null = null;

export async function initDatabase(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  try {
    pool = new Pool({
      connectionString: config.database_url || 'postgresql://legaluser:legalpass@localhost:5432/legal_automation',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (error: Error) => {
      logger.error({ err: error }, 'Erro não esperado no pool PostgreSQL');
    });

    const client = await pool.connect();
    try {
      await client.query('SELECT NOW()');
      logger.info('✓ Conectado ao PostgreSQL');
    } finally {
      client.release();
    }

    await runMigrations(pool);

    return pool;
  } catch (error) {
    logger.error({ err: error }, 'Erro ao conectar com banco de dados');
    throw error;
  }
}

async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    logger.info('Rodando migrations...');

    for (const migration of allMigrations) {
      await client.query(migration);
    }

    logger.info('✓ Migrations completadas');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao rodar migrations');
    throw error;
  } finally {
    client.release();
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
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Pool PostgreSQL fechado');
  }
}

export function getPool(): Pool | null {
  return pool;
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
      return pool.query(convertPlaceholders(sql), params).then((res: any) => res.rows[0]);
    },
    all: (...params: any[]) => {
      if (!pool) throw new Error('Pool não inicializado');
      return pool.query(convertPlaceholders(sql), params.length > 0 ? params : []).then((res: any) => res.rows);
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
