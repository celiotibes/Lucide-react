import { Database, Q } from '@nozbe/watermelondb';
import { SyncQueue } from '../models/SyncQueue';
import { logger } from '../../utils/logger';

export class SyncQueueRepository {
  constructor(private database: Database) {}

  async create(data: {
    entityType: string;
    entityId: string;
    operation: 'create' | 'update' | 'delete';
    payload: any;
  }): Promise<SyncQueue> {
    try {
      return await this.database.action(async () => {
        const queueCollection = this.database.collections.get('sync_queue');
        const item = await queueCollection.create((q) => {
          q.entityType = data.entityType;
          q.entityId = data.entityId;
          q.operation = data.operation;
          q.payload = JSON.stringify(data.payload);
          q.retryCount = 0;
        });
        logger.info(
          `Sync queue item created: ${data.entityType} ${data.operation} ${data.entityId}`,
        );
        return item;
      });
    } catch (error) {
      logger.error('Failed to create sync queue item', error);
      throw error;
    }
  }

  async getById(queueId: string): Promise<SyncQueue | null> {
    try {
      const queueCollection = this.database.collections.get('sync_queue');
      const item = await queueCollection.find(queueId);
      return item || null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      logger.error('Failed to get sync queue item', error);
      throw error;
    }
  }

  async getAll(): Promise<SyncQueue[]> {
    try {
      const queueCollection = this.database.collections.get('sync_queue');
      return await queueCollection.query().fetch();
    } catch (error) {
      logger.error('Failed to fetch all sync queue items', error);
      throw error;
    }
  }

  async getByEntityType(entityType: string): Promise<SyncQueue[]> {
    try {
      const queueCollection = this.database.collections.get('sync_queue');
      return await queueCollection
        .query(Q.where('entity_type', entityType))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch sync queue items by type', error);
      throw error;
    }
  }

  async getByEntityId(entityId: string): Promise<SyncQueue[]> {
    try {
      const queueCollection = this.database.collections.get('sync_queue');
      return await queueCollection
        .query(Q.where('entity_id', entityId))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch sync queue items by entity', error);
      throw error;
    }
  }

  async getRetryable(): Promise<SyncQueue[]> {
    try {
      const queueCollection = this.database.collections.get('sync_queue');
      const items = await queueCollection.query().fetch();
      return items.filter((item: SyncQueue) => item.canRetry());
    } catch (error) {
      logger.error('Failed to fetch retryable sync queue items', error);
      throw error;
    }
  }

  async getByOperation(
    operation: 'create' | 'update' | 'delete',
  ): Promise<SyncQueue[]> {
    try {
      const queueCollection = this.database.collections.get('sync_queue');
      return await queueCollection
        .query(Q.where('operation', operation))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch sync queue items by operation', error);
      throw error;
    }
  }

  async incrementRetry(queueId: string): Promise<void> {
    try {
      return await this.database.action(async () => {
        const item = await this.getById(queueId);
        if (item) {
          item.incrementRetry();
        }
      });
    } catch (error) {
      logger.error('Failed to increment retry count', error);
      throw error;
    }
  }

  async setError(queueId: string, error: any): Promise<void> {
    try {
      return await this.database.action(async () => {
        const item = await this.getById(queueId);
        if (item) {
          item.setError(error);
        }
      });
    } catch (error) {
      logger.error('Failed to set error on sync queue item', error);
      throw error;
    }
  }

  async updatePayload(queueId: string, payload: any): Promise<void> {
    try {
      return await this.database.action(async () => {
        const item = await this.getById(queueId);
        if (item) {
          item.setPayload(payload);
        }
      });
    } catch (error) {
      logger.error('Failed to update sync queue item payload', error);
      throw error;
    }
  }

  async remove(queueId: string): Promise<void> {
    try {
      return await this.database.action(async () => {
        const item = await this.getById(queueId);
        if (item) {
          await item.destroyPermanently();
          logger.info(`Sync queue item removed: ${queueId}`);
        }
      });
    } catch (error) {
      logger.error('Failed to remove sync queue item', error);
      throw error;
    }
  }

  async removeAll(): Promise<void> {
    try {
      return await this.database.action(async () => {
        const items = await this.getAll();
        for (const item of items) {
          await item.destroyPermanently();
        }
        logger.info(`Removed ${items.length} sync queue items`);
      });
    } catch (error) {
      logger.error('Failed to remove all sync queue items', error);
      throw error;
    }
  }

  async getStats(): Promise<{
    total: number;
    byEntityType: Record<string, number>;
    byOperation: Record<string, number>;
    byRetryCount: Record<number, number>;
    oldestItem: SyncQueue | null;
    newestItem: SyncQueue | null;
  }> {
    try {
      const items = await this.getAll();
      const stats = {
        total: items.length,
        byEntityType: {} as Record<string, number>,
        byOperation: {} as Record<string, number>,
        byRetryCount: {} as Record<number, number>,
        oldestItem: items[0] || null,
        newestItem: items[items.length - 1] || null,
      };

      for (const item of items) {
        // Count by entity type
        if (!stats.byEntityType[item.entityType]) {
          stats.byEntityType[item.entityType] = 0;
        }
        stats.byEntityType[item.entityType]++;

        // Count by operation
        if (!stats.byOperation[item.operation]) {
          stats.byOperation[item.operation] = 0;
        }
        stats.byOperation[item.operation]++;

        // Count by retry
        if (!stats.byRetryCount[item.retryCount]) {
          stats.byRetryCount[item.retryCount] = 0;
        }
        stats.byRetryCount[item.retryCount]++;

        // Track oldest/newest
        if (item.createdAt < stats.oldestItem!.createdAt) {
          stats.oldestItem = item;
        }
        if (item.createdAt > stats.newestItem!.createdAt) {
          stats.newestItem = item;
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get sync queue statistics', error);
      throw error;
    }
  }

  async cleanupOldItems(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    try {
      return await this.database.action(async () => {
        const items = await this.getAll();
        const cutoffTime = Date.now() - maxAgeMs;
        let removed = 0;

        for (const item of items) {
          // Only remove failed items that have exhausted retries
          if (
            item.createdAt.getTime() < cutoffTime &&
            !item.canRetry()
          ) {
            await item.destroyPermanently();
            removed++;
          }
        }

        if (removed > 0) {
          logger.info(`Cleaned up ${removed} old sync queue items`);
        }

        return removed;
      });
    } catch (error) {
      logger.error('Failed to cleanup old sync queue items', error);
      throw error;
    }
  }

  async duplicateForRetry(queueId: string): Promise<SyncQueue> {
    try {
      const original = await this.getById(queueId);
      if (!original) {
        throw new Error(`Sync queue item not found: ${queueId}`);
      }

      const payload = original.getPayload();
      return await this.create({
        entityType: original.entityType,
        entityId: original.entityId,
        operation: original.operation as any,
        payload,
      });
    } catch (error) {
      logger.error('Failed to duplicate sync queue item', error);
      throw error;
    }
  }
}
