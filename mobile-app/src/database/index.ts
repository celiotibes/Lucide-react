import SQLite from 'react-native-sqlite-2';
import { Database } from '@nozbe/watermelondb';
import LokiAdapter from '@nozbe/watermelondb/adapters/sqlite/sqlite-library';
import { schema } from './schema';
import { Document } from './models/Document';
import { Transaction } from './models/Transaction';
import { Property } from './models/Property';
import { SyncQueue } from './models/SyncQueue';
import { SyncLog } from './models/SyncLog';
import { logger } from '../utils/logger';

let database: Database | null = null;

export const initializeDatabase = async (): Promise<Database> => {
  if (database) {
    return database;
  }

  try {
    logger.info('Initializing WatermelonDB...');

    const adapter = new LokiAdapter({
      schema,
      dbName: 'crmt_mobile',
      onSetUpError: (error) => {
        logger.error('Database setup error', error);
      },
    });

    database = new Database({
      adapter,
      modelClasses: [Document, Transaction, Property, SyncQueue, SyncLog],
      actionsEnabled: true,
    });

    // Verify database connection
    await database.action(async () => {
      const docCount = await database.collections.get('documents').query().fetch();
      logger.info(`Database initialized. Documents count: ${docCount.length}`);
    });

    return database;
  } catch (error) {
    logger.error('Failed to initialize database', error);
    throw new Error('Database initialization failed');
  }
};

export const getDatabase = (): Database => {
  if (!database) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return database;
};

export const closeDatabase = async (): Promise<void> => {
  if (database) {
    await database.close();
    database = null;
    logger.info('Database closed');
  }
};

export const resetDatabase = async (): Promise<void> => {
  if (database) {
    await database.unsafeResetDatabase();
    logger.info('Database reset');
  }
};
