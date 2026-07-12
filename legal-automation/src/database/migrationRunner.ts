import fs from 'fs';
import path from 'path';
import { poolManager } from '@database/poolManager';
import { logger } from '@utils/logger';

// ============================================================================
// MIGRATION RUNNER - Database Schema Versioning & Management
// ============================================================================

interface Migration {
  id: string;
  name: string;
  timestamp: number;
  up: string;
  down: string;
}

class MigrationRunner {
  private migrationsPath: string;

  constructor(migrationsPath: string = path.join(__dirname, '../..', 'migrations')) {
    this.migrationsPath = migrationsPath;
  }

  async initialize(): Promise<void> {
    try {
      const pool = poolManager.getPool();

      // Create migrations table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          execution_time_ms INTEGER
        )
      `);

      logger.info('Migrations table initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize migrations table');
      throw error;
    }
  }

  async runPending(): Promise<Migration[]> {
    await this.initialize();

    const pool = poolManager.getPool();
    const executed = await this.getExecutedMigrations();
    const available = this.getAvailableMigrations();

    const pending = available.filter((m) => !executed.some((e) => e.name === m.name));

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return [];
    }

    const results: Migration[] = [];

    for (const migration of pending) {
      const startTime = Date.now();

      try {
        await pool.query(migration.up);
        await pool.query('INSERT INTO migrations (name, execution_time_ms) VALUES ($1, $2)', [
          migration.name,
          Date.now() - startTime,
        ]);

        logger.info({ migration: migration.name, timeMs: Date.now() - startTime }, 'Migration executed');
        results.push(migration);
      } catch (error) {
        logger.error({ migration: migration.name, error }, 'Migration failed');
        throw error;
      }
    }

    return results;
  }

  async rollback(steps: number = 1): Promise<void> {
    await this.initialize();

    const pool = poolManager.getPool();
    const executed = await this.getExecutedMigrations();
    const available = this.getAvailableMigrations();

    const toRollback = executed.slice(-steps);

    for (const migration of toRollback) {
      const availableMigration = available.find((m) => m.name === migration.name);

      if (!availableMigration) {
        logger.error({ migration: migration.name }, 'Migration file not found for rollback');
        continue;
      }

      try {
        await pool.query(availableMigration.down);
        await pool.query('DELETE FROM migrations WHERE name = $1', [migration.name]);

        logger.info({ migration: migration.name }, 'Migration rolled back');
      } catch (error) {
        logger.error({ migration: migration.name, error }, 'Rollback failed');
        throw error;
      }
    }
  }

  async status(): Promise<{
    executed: string[];
    pending: string[];
  }> {
    await this.initialize();

    const executed = await this.getExecutedMigrations();
    const available = this.getAvailableMigrations();

    return {
      executed: executed.map((m) => m.name),
      pending: available.filter((m) => !executed.some((e) => e.name === m.name)).map((m) => m.name),
    };
  }

  private getAvailableMigrations(): Migration[] {
    if (!fs.existsSync(this.migrationsPath)) {
      logger.warn({ path: this.migrationsPath }, 'Migrations directory not found');
      return [];
    }

    const files = fs.readdirSync(this.migrationsPath).filter((f) => f.endsWith('.sql'));

    return files
      .map((file) => {
        const filePath = path.join(this.migrationsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Parse migration file (expects SQL with UP and DOWN sections)
        const upMatch = content.match(/--\s*UP\s*\n([\s\S]*?)(?=--\s*DOWN|\Z)/i);
        const downMatch = content.match(/--\s*DOWN\s*\n([\s\S]*?)$/i);

        return {
          id: file,
          name: file.replace('.sql', ''),
          timestamp: parseInt(file.split('_')[0], 10),
          up: upMatch ? upMatch[1].trim() : '',
          down: downMatch ? downMatch[1].trim() : '',
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private async getExecutedMigrations(): Promise<Array<{ name: string }>> {
    try {
      const pool = poolManager.getPool();
      const result = await pool.query('SELECT name FROM migrations ORDER BY executed_at ASC');
      return result.rows;
    } catch {
      return [];
    }
  }
}

export const migrationRunner = new MigrationRunner();
