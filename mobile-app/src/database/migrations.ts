import { Database, Q } from '@nozbe/watermelondb';
import { logger } from '../utils/logger';

export type Migration = {
  version: number;
  name: string;
  migrate: (database: Database) => Promise<void>;
};

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    migrate: async (database: Database) => {
      logger.info('Running migration 1: initial_schema');
      // Schema already applied by WatermelonDB
    },
  },
  // Future migrations will go here
  // {
  //   version: 2,
  //   name: 'add_attachments_table',
  //   migrate: async (database: Database) => {
  //     logger.info('Running migration 2: add_attachments_table');
  //     // Migration logic here
  //   },
  // },
];

export class MigrationManager {
  private database: Database;
  private currentVersion = 0;

  constructor(database: Database) {
    this.database = database;
  }

  async initialize(): Promise<void> {
    try {
      const versionKey = '@crmt:db_version';
      // In a real app, you'd store this in AsyncStorage or a metadata table
      this.currentVersion = 1;
      logger.info(`Database version: ${this.currentVersion}`);
    } catch (error) {
      logger.error('Failed to initialize migration manager', error);
      throw error;
    }
  }

  async runPendingMigrations(): Promise<void> {
    try {
      const pendingMigrations = migrations.filter(
        (m) => m.version > this.currentVersion,
      );

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      logger.info(
        `Running ${pendingMigrations.length} pending migrations...`,
      );

      for (const migration of pendingMigrations) {
        await this.database.action(async () => {
          await migration.migrate(this.database);
          logger.info(`✓ Migration ${migration.version} completed`);
        });
      }

      this.currentVersion = migrations[migrations.length - 1].version;
      logger.info(`Database upgraded to version ${this.currentVersion}`);
    } catch (error) {
      logger.error('Migration failed', error);
      throw new Error(`Database migration failed: ${error}`);
    }
  }

  getStatus(): {
    currentVersion: number;
    latestVersion: number;
    pendingMigrations: Migration[];
  } {
    return {
      currentVersion: this.currentVersion,
      latestVersion: migrations[migrations.length - 1]?.version || 0,
      pendingMigrations: migrations.filter((m) => m.version > this.currentVersion),
    };
  }
}
