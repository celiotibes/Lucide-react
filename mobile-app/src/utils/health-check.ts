import { Database } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

export interface HealthStatus {
  timestamp: string;
  database: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    recordCount: number;
    error?: string;
  };
  storage: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    error?: string;
  };
  syncQueue: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    pendingItems: number;
    failedItems: number;
    error?: string;
  };
  overall: 'healthy' | 'degraded' | 'unhealthy';
}

export class HealthChecker {
  constructor(private database: Database) {}

  async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const dbHealth = await this.checkDatabase();
    const storageHealth = await this.checkStorage();
    const syncHealth = await this.checkSyncQueue();

    const overall = this.determineOverallHealth(dbHealth, storageHealth, syncHealth);

    return {
      timestamp,
      database: dbHealth,
      storage: storageHealth,
      syncQueue: syncHealth,
      overall,
    };
  }

  private async checkDatabase(): Promise<
    HealthStatus['database']
  > {
    try {
      const collections = [
        'documents',
        'transactions',
        'properties',
        'sync_queue',
        'sync_log',
      ];

      let totalRecords = 0;
      for (const collectionName of collections) {
        try {
          const count = await this.database.collections
            .get(collectionName)
            .query()
            .fetch()
            .then((r) => r.length);
          totalRecords += count;
        } catch (e) {
          logger.warn(`Failed to count ${collectionName}`, e);
        }
      }

      return {
        status: 'healthy',
        recordCount: totalRecords,
      };
    } catch (error) {
      logger.error('Database health check failed', error);
      return {
        status: 'unhealthy',
        recordCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkStorage(): Promise<HealthStatus['storage']> {
    try {
      // Try to write and read a test value
      const testKey = '@crmt:health_check_test';
      const testValue = `health_check_${Date.now()}`;

      await AsyncStorage.setItem(testKey, testValue);
      const retrieved = await AsyncStorage.getItem(testKey);
      await AsyncStorage.removeItem(testKey);

      if (retrieved === testValue) {
        return { status: 'healthy' };
      } else {
        return {
          status: 'degraded',
          error: 'Write/read mismatch detected',
        };
      }
    } catch (error) {
      logger.error('Storage health check failed', error);
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkSyncQueue(): Promise<
    HealthStatus['syncQueue']
  > {
    try {
      const syncQueue = this.database.collections.get('sync_queue');
      const failedQueue = this.database.collections.get('sync_queue');

      const pending = await syncQueue.query().fetch();
      const failed = await failedQueue
        .query()
        .fetch()
        .then((items) =>
          items.filter(
            (item: any) => item.retryCount >= 3,
          ).length,
        );

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (failed > 0) {
        status = 'degraded';
      }
      if (failed > 10) {
        status = 'unhealthy';
      }

      return {
        status,
        pendingItems: pending.length,
        failedItems: failed,
      };
    } catch (error) {
      logger.error('Sync queue health check failed', error);
      return {
        status: 'unhealthy',
        pendingItems: 0,
        failedItems: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private determineOverallHealth(
    dbHealth: HealthStatus['database'],
    storageHealth: HealthStatus['storage'],
    syncHealth: HealthStatus['syncQueue'],
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = [dbHealth.status, storageHealth.status, syncHealth.status];

    if (statuses.includes('unhealthy')) {
      return 'unhealthy';
    }
    if (statuses.includes('degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  async repair(): Promise<void> {
    try {
      logger.info('Starting health check repair...');

      // Try to clear corrupted data
      const syncQueue = this.database.collections.get('sync_queue');
      const failedItems = await syncQueue
        .query()
        .fetch()
        .then((items) =>
          items.filter((item: any) => item.retryCount >= 3),
        );

      for (const item of failedItems) {
        try {
          await this.database.action(async () => {
            await item.destroyPermanently();
          });
        } catch (e) {
          logger.warn('Failed to remove failed sync item', e);
        }
      }

      logger.info('Repair completed');
    } catch (error) {
      logger.error('Repair failed', error);
    }
  }
}
