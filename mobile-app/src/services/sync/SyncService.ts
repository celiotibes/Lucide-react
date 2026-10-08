import { Database } from '@nozbe/watermelondb';
import { axiosInstance } from '../../api/client';
import { credentialsStorage } from '../../storage/credentials';
import { logger } from '../../utils/logger';
import { SyncQueue } from '../../database/models/SyncQueue';
import { SyncLog } from '../../database/models/SyncLog';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'partial_success';

export interface SyncStats {
  startTime: number;
  endTime?: number;
  itemsSynced: number;
  itemsFailed: number;
  duration?: number;
  status: SyncStatus;
  lastError?: string;
}

export class SyncService {
  private database: Database;
  private isSyncing = false;
  private syncStats: SyncStats;
  private retryDelayMs = 1000;
  private maxRetries = 3;

  constructor(database: Database) {
    this.database = database;
    this.syncStats = {
      startTime: 0,
      itemsSynced: 0,
      itemsFailed: 0,
      status: 'idle',
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing SyncService');
    await this.cleanupOldLogs();
  }

  async syncAll(): Promise<SyncStats> {
    if (this.isSyncing) {
      logger.warn('Sync already in progress');
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    this.syncStats = {
      startTime: Date.now(),
      itemsSynced: 0,
      itemsFailed: 0,
      status: 'syncing',
    };

    try {
      logger.info('Starting full sync...');

      // Get all pending sync items
      const pendingItems = await this.getPendingSyncItems();
      logger.info(`Found ${pendingItems.length} items to sync`);

      if (pendingItems.length === 0) {
        this.syncStats.status = 'idle';
        this.syncStats.endTime = Date.now();
        this.syncStats.duration =
          this.syncStats.endTime - this.syncStats.startTime;
        logger.info('No items to sync');
        return this.syncStats;
      }

      // Process each entity type
      const docQueue = pendingItems.filter((q) => q.entityType === 'document');
      const txQueue = pendingItems.filter(
        (q) => q.entityType === 'transaction',
      );
      const propQueue = pendingItems.filter(
        (q) => q.entityType === 'property',
      );

      // Sync in order: documents first, then transactions, then properties
      await this.syncQueue(docQueue, 'document');
      await this.syncQueue(txQueue, 'transaction');
      await this.syncQueue(propQueue, 'property');

      this.syncStats.status =
        this.syncStats.itemsFailed > 0 ? 'partial_success' : 'idle';
      this.syncStats.endTime = Date.now();
      this.syncStats.duration =
        this.syncStats.endTime - this.syncStats.startTime;

      await this.logSyncResult();
      logger.info(`Sync completed: ${this.syncStats.itemsSynced} synced, ${this.syncStats.itemsFailed} failed`);

      return this.syncStats;
    } catch (error) {
      this.syncStats.status = 'error';
      this.syncStats.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.syncStats.endTime = Date.now();
      this.syncStats.duration =
        this.syncStats.endTime - this.syncStats.startTime;

      logger.error('Sync failed', error);
      await this.logSyncResult();

      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncQueue(
    items: SyncQueue[],
    entityType: string,
  ): Promise<void> {
    logger.info(`Syncing ${items.length} ${entityType} items...`);

    for (const item of items) {
      try {
        await this.syncItem(item);
        this.syncStats.itemsSynced++;
      } catch (error) {
        logger.warn(`Failed to sync ${entityType} item ${item.entityId}`, error);
        this.syncStats.itemsFailed++;

        // Update sync queue item with error
        await this.database.action(async () => {
          await item.update((q) => {
            q.setError(error);
            if (q.canRetry()) {
              q.incrementRetry();
            }
          });
        });
      }
    }
  }

  private async syncItem(item: SyncQueue): Promise<void> {
    const payload = item.getPayload();
    if (!payload) {
      throw new Error('Invalid sync item payload');
    }

    logger.debug(`Syncing ${item.entityType} ${item.operation}`, {
      entityId: item.entityId,
    });

    const endpoint = `/api/sync/${item.entityType}`;
    const response = await axiosInstance.post(endpoint, {
      operation: item.operation,
      ...payload,
    });

    // Mark as synced
    await this.database.action(async () => {
      await item.destroyPermanently();
    });

    logger.info(`Synced ${item.entityType} ${item.entityId}`);
  }

  private async getPendingSyncItems(): Promise<SyncQueue[]> {
    try {
      const syncQueueCollection =
        this.database.collections.get('sync_queue');
      return await syncQueueCollection.query().fetch();
    } catch (error) {
      logger.error('Failed to get pending sync items', error);
      return [];
    }
  }

  private async logSyncResult(): Promise<void> {
    try {
      await this.database.action(async () => {
        const syncLogCollection = this.database.collections.get('sync_log');
        await syncLogCollection.create((log) => {
          log.status = this.syncStats.status === 'error' ? 'error' : 'success';
          log.entityType = 'all';
          log.syncDurationMs = this.syncStats.duration || 0;
          log.itemsSynced = this.syncStats.itemsSynced;
          log.errorMessage = this.syncStats.lastError;
        });
      });
    } catch (error) {
      logger.error('Failed to log sync result', error);
    }
  }

  private async cleanupOldLogs(): Promise<void> {
    try {
      const syncLogCollection = this.database.collections.get('sync_log');
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const oldLogs = await syncLogCollection.query().fetch();
      const itemsToDelete = oldLogs.filter(
        (log: SyncLog) => log.timestamp.getTime() < sevenDaysAgo,
      );

      if (itemsToDelete.length > 0) {
        await this.database.action(async () => {
          for (const log of itemsToDelete) {
            await log.destroyPermanently();
          }
        });
        logger.info(`Cleaned up ${itemsToDelete.length} old sync logs`);
      }
    } catch (error) {
      logger.warn('Failed to cleanup old logs', error);
    }
  }

  getSyncStats(): SyncStats {
    return { ...this.syncStats };
  }

  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  async retryFailedItems(): Promise<SyncStats> {
    try {
      const failedItems = await this.database.collections
        .get('sync_queue')
        .query()
        .fetch();

      const retryableItems = failedItems.filter((q: SyncQueue) =>
        q.canRetry(),
      );

      logger.info(
        `Retrying ${retryableItems.length} failed items...`,
      );

      return await this.syncAll();
    } catch (error) {
      logger.error('Retry failed', error);
      throw error;
    }
  }
}
