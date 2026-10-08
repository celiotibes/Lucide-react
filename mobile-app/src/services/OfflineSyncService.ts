import { Database } from '@nozbe/watermelondb';
import { SyncQueueRepository } from '../database/repositories/SyncQueueRepository';

export interface OfflineOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  entityId: string;
  data: Record<string, any>;
  timestamp: number;
  retries: number;
  lastError?: string;
  status: 'pending' | 'synced' | 'failed';
}

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOperations: number;
  lastSyncTime?: number;
  lastError?: string;
}

class OfflineSyncService {
  private database: Database;
  private syncQueue: SyncQueueRepository;
  private isOnline = true;
  private isSyncing = false;
  private listeners: Map<string, Function[]> = new Map();
  private maxRetries = 3;
  private retryDelayMs = 1000;

  constructor(database: Database) {
    this.database = database;
    this.syncQueue = new SyncQueueRepository(database);
  }

  /**
   * Initialize offline sync service
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing OfflineSyncService');

      // Setup network listeners
      this.setupNetworkListeners();

      // Clean up failed operations
      await this.cleanupFailedOperations();

      console.log('OfflineSyncService initialized');
    } catch (error) {
      console.error('Error initializing OfflineSyncService:', error);
      throw error;
    }
  }

  /**
   * Setup network change listeners
   */
  private setupNetworkListeners(): void {
    // In a real app, would use NetInfo from react-native-community/net-info
    // This is a mock implementation
  }

  /**
   * Queue an operation for offline syncing
   */
  async queueOperation(
    type: 'create' | 'update' | 'delete',
    entity: string,
    entityId: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      const operation: OfflineOperation = {
        id: `${entity}-${entityId}-${Date.now()}`,
        type,
        entity,
        entityId,
        data,
        timestamp: Date.now(),
        retries: 0,
        status: 'pending'
      };

      // Save to local queue
      await this.syncQueue.create(operation);

      // Emit event
      this.emit('queue:operation-added', operation);

      console.log('Operation queued:', operation.id);
    } catch (error) {
      console.error('Error queuing operation:', error);
      throw error;
    }
  }

  /**
   * Get sync state
   */
  async getSyncState(): Promise<SyncState> {
    try {
      const pendingOperations = await this.syncQueue.getPendingCount();
      const lastSyncTime = await this.syncQueue.getLastSyncTime();

      return {
        isOnline: this.isOnline,
        isSyncing: this.isSyncing,
        pendingOperations,
        lastSyncTime,
      };
    } catch (error) {
      console.error('Error getting sync state:', error);
      return {
        isOnline: this.isOnline,
        isSyncing: this.isSyncing,
        pendingOperations: 0,
      };
    }
  }

  /**
   * Sync pending operations
   */
  async syncPendingOperations(): Promise<{ succeeded: number; failed: number }> {
    if (this.isSyncing) {
      console.warn('Sync already in progress');
      return { succeeded: 0, failed: 0 };
    }

    if (!this.isOnline) {
      console.warn('Offline - cannot sync');
      return { succeeded: 0, failed: 0 };
    }

    this.isSyncing = true;
    const results = { succeeded: 0, failed: 0 };

    try {
      this.emit('sync:started');

      // Get pending operations
      const operations = await this.syncQueue.getPending();

      for (const operation of operations) {
        try {
          // Attempt to sync
          await this.syncOperation(operation);
          results.succeeded++;

          // Mark as synced
          await this.syncQueue.markSynced(operation.id);
          this.emit('sync:operation-complete', { id: operation.id, success: true });
        } catch (error) {
          results.failed++;

          // Retry logic
          if (operation.retries < this.maxRetries) {
            await this.syncQueue.incrementRetries(operation.id);
            this.emit('sync:operation-retry', { id: operation.id, retries: operation.retries + 1 });
          } else {
            await this.syncQueue.markFailed(operation.id, error instanceof Error ? error.message : String(error));
            this.emit('sync:operation-failed', { id: operation.id, error: String(error) });
          }
        }
      }

      this.emit('sync:completed', results);
    } catch (error) {
      console.error('Error syncing operations:', error);
      this.emit('sync:error', error);
    } finally {
      this.isSyncing = false;
    }

    return results;
  }

  /**
   * Sync a single operation
   */
  private async syncOperation(operation: OfflineOperation): Promise<void> {
    // This would call the actual API endpoint
    // For now, just simulate a successful sync
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('Operation synced:', operation.id);
  }

  /**
   * Set online/offline status
   */
  setOnlineStatus(isOnline: boolean): void {
    if (this.isOnline === isOnline) {
      return;
    }

    this.isOnline = isOnline;
    console.log(`Network status changed: ${isOnline ? 'online' : 'offline'}`);

    this.emit('network:status-changed', { isOnline });

    // Trigger sync when coming online
    if (isOnline) {
      this.syncPendingOperations().catch(error => {
        console.error('Error auto-syncing on network recovery:', error);
      });
    }
  }

  /**
   * Get operation status
   */
  async getOperationStatus(operationId: string): Promise<OfflineOperation | null> {
    try {
      return await this.syncQueue.getById(operationId);
    } catch (error) {
      console.error('Error getting operation status:', error);
      return null;
    }
  }

  /**
   * Retry failed operation
   */
  async retryOperation(operationId: string): Promise<void> {
    try {
      const operation = await this.syncQueue.getById(operationId);
      if (!operation) {
        throw new Error('Operation not found');
      }

      // Reset retries and status
      await this.syncQueue.update(operationId, {
        retries: 0,
        status: 'pending',
        lastError: undefined
      });

      this.emit('queue:operation-retry-requested', { id: operationId });
    } catch (error) {
      console.error('Error retrying operation:', error);
      throw error;
    }
  }

  /**
   * Delete operation from queue
   */
  async deleteOperation(operationId: string): Promise<void> {
    try {
      await this.syncQueue.delete(operationId);
      this.emit('queue:operation-deleted', { id: operationId });
    } catch (error) {
      console.error('Error deleting operation:', error);
      throw error;
    }
  }

  /**
   * Clear all pending operations
   */
  async clearPendingOperations(): Promise<void> {
    try {
      const operations = await this.syncQueue.getPending();
      for (const operation of operations) {
        await this.deleteOperation(operation.id);
      }
      this.emit('queue:cleared');
    } catch (error) {
      console.error('Error clearing pending operations:', error);
      throw error;
    }
  }

  /**
   * Cleanup failed operations
   */
  private async cleanupFailedOperations(): Promise<void> {
    try {
      // Remove operations that failed and exceeded max retries
      const operations = await this.syncQueue.getFailed();
      for (const operation of operations) {
        if (operation.retries >= this.maxRetries) {
          await this.deleteOperation(operation.id);
        }
      }
    } catch (error) {
      console.error('Error cleaning up failed operations:', error);
    }
  }

  /**
   * Listen to offline sync events
   */
  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const callbacks = this.listeners.get(event)!;
    callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Emit event
   */
  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  /**
   * Cleanup service
   */
  async cleanup(): Promise<void> {
    try {
      this.listeners.clear();
      console.log('OfflineSyncService cleaned up');
    } catch (error) {
      console.error('Error cleaning up OfflineSyncService:', error);
      throw error;
    }
  }
}

export { OfflineSyncService };
