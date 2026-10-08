import { Database } from '@nozbe/watermelondb';
import {
  DocumentRepository,
  TransactionRepository,
  PropertyRepository,
  SyncQueueRepository,
} from '../database/repositories';
import { APIClient } from './APIClient';
import { SyncStatus, SyncConflict } from '../types/api';
import { logger } from '../utils/logger';

export interface SyncManagerConfig {
  apiBaseURL: string;
  deviceId: string;
  autoSync?: boolean;
  syncInterval?: number;
}

export interface SyncProgress {
  phase: 'fetch' | 'upload' | 'resolve' | 'commit';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  error?: string;
}

export class SyncManagerService {
  private documentRepo: DocumentRepository;
  private transactionRepo: TransactionRepository;
  private propertyRepo: PropertyRepository;
  private syncQueueRepo: SyncQueueRepository;
  private apiClient: APIClient;
  private config: Required<SyncManagerConfig>;
  private syncStatus: SyncStatus = {
    isSyncing: false,
    pendingChanges: 0,
    conflicts: 0,
    syncProgress: 0,
  };
  private syncProgressCallback?: (progress: SyncProgress) => void;
  private lastSyncTimestamp: number = 0;

  constructor(database: Database, config: SyncManagerConfig) {
    this.documentRepo = new DocumentRepository(database);
    this.transactionRepo = new TransactionRepository(database);
    this.propertyRepo = new PropertyRepository(database);
    this.syncQueueRepo = new SyncQueueRepository(database);

    this.apiClient = new APIClient({
      baseURL: config.apiBaseURL,
      timeout: 60000,
      retryAttempts: 5,
      retryDelay: 2000,
    });

    this.config = {
      apiBaseURL: config.apiBaseURL,
      deviceId: config.deviceId,
      autoSync: config.autoSync ?? true,
      syncInterval: config.syncInterval ?? 300000, // 5 minutes default
    };
  }

  setSyncProgressCallback(
    callback: (progress: SyncProgress) => void,
  ): void {
    this.syncProgressCallback = callback;
  }

  setAuthToken(token: string): void {
    this.apiClient.setAuthToken(token);
  }

  private reportProgress(progress: SyncProgress): void {
    if (this.syncProgressCallback) {
      this.syncProgressCallback(progress);
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const pendingItems = await this.syncQueueRepo.getAll();
      const conflicts = pendingItems.filter(
        (item) => item.errorMessage && item.errorMessage.includes('conflict'),
      ).length;

      this.syncStatus = {
        isSyncing: this.syncStatus.isSyncing,
        lastSyncTime: this.lastSyncTimestamp,
        pendingChanges: pendingItems.length,
        conflicts,
        syncProgress: this.syncStatus.syncProgress,
      };

      return this.syncStatus;
    } catch (error) {
      logger.error('Failed to get sync status', error);
      return this.syncStatus;
    }
  }

  async performSync(): Promise<boolean> {
    if (this.syncStatus.isSyncing) {
      logger.warn('Sync already in progress');
      return false;
    }

    if (!this.apiClient.isOnline()) {
      logger.warn('Device is offline, skipping sync');
      return false;
    }

    try {
      this.syncStatus.isSyncing = true;
      this.syncStatus.syncProgress = 0;

      // Phase 1: Fetch remote changes
      this.reportProgress({
        phase: 'fetch',
        status: 'in_progress',
        progress: 10,
      });

      const remoteChanges = await this.fetchRemoteChanges();

      this.reportProgress({
        phase: 'fetch',
        status: 'completed',
        progress: 30,
      });

      // Phase 2: Upload local changes
      this.reportProgress({
        phase: 'upload',
        status: 'in_progress',
        progress: 40,
      });

      const uploadResult = await this.uploadLocalChanges();

      this.reportProgress({
        phase: 'upload',
        status: 'completed',
        progress: 60,
      });

      // Phase 3: Resolve conflicts
      this.reportProgress({
        phase: 'resolve',
        status: 'in_progress',
        progress: 70,
      });

      const conflicts = await this.resolveConflicts(remoteChanges);

      this.reportProgress({
        phase: 'resolve',
        status: 'completed',
        progress: 80,
      });

      // Phase 4: Commit changes
      this.reportProgress({
        phase: 'commit',
        status: 'in_progress',
        progress: 90,
      });

      await this.commitRemoteChanges(remoteChanges);

      this.reportProgress({
        phase: 'commit',
        status: 'completed',
        progress: 100,
      });

      this.lastSyncTimestamp = Date.now();
      logger.info('Sync completed successfully');
      return true;
    } catch (error) {
      logger.error('Sync failed', error);
      this.reportProgress({
        phase: 'fetch',
        status: 'failed',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    } finally {
      this.syncStatus.isSyncing = false;
    }
  }

  private async fetchRemoteChanges(): Promise<any> {
    try {
      const response = await this.apiClient.get<any>(
        `/sync/changes?since=${this.lastSyncTimestamp}`,
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch remote changes');
      }

      logger.info('Remote changes fetched');
      return response.data || {};
    } catch (error) {
      logger.error('Failed to fetch remote changes', error);
      throw error;
    }
  }

  private async uploadLocalChanges(): Promise<boolean> {
    try {
      const pendingItems = await this.syncQueueRepo.getAll();

      if (pendingItems.length === 0) {
        logger.info('No local changes to upload');
        return true;
      }

      // Group changes by entity type and operation
      const changes = this.groupChanges(pendingItems);

      const response = await this.apiClient.post<any>(
        '/sync/upload',
        {
          changes,
          deviceId: this.config.deviceId,
          timestamp: Date.now(),
        },
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to upload changes');
      }

      // Mark uploaded items as synced
      await this.markSyncedItems(pendingItems);

      logger.info(`Uploaded ${pendingItems.length} changes`);
      return true;
    } catch (error) {
      logger.error('Failed to upload local changes', error);
      throw error;
    }
  }

  private async resolveConflicts(remoteChanges: any): Promise<SyncConflict[]> {
    try {
      const conflicts: SyncConflict[] = [];

      // Check for conflicts in documents
      if (remoteChanges.documents) {
        for (const remoteDoc of remoteChanges.documents) {
          const localDoc = await this.documentRepo.getByServerId(
            remoteDoc.serverId,
          );
          if (
            localDoc &&
            localDoc.updatedAt > remoteDoc.updatedAt
          ) {
            conflicts.push({
              entityType: 'document',
              entityId: remoteDoc.id,
              local: localDoc,
              remote: remoteDoc,
            });
          }
        }
      }

      // Check for conflicts in transactions
      if (remoteChanges.transactions) {
        for (const remoteTx of remoteChanges.transactions) {
          const localTx = await this.transactionRepo.getByServerId(
            remoteTx.serverId,
          );
          if (
            localTx &&
            localTx.updatedAt > remoteTx.updatedAt
          ) {
            conflicts.push({
              entityType: 'transaction',
              entityId: remoteTx.id,
              local: localTx,
              remote: remoteTx,
            });
          }
        }
      }

      // Check for conflicts in properties
      if (remoteChanges.properties) {
        for (const remoteProp of remoteChanges.properties) {
          const localProp = await this.propertyRepo.getByServerId(
            remoteProp.serverId,
          );
          if (
            localProp &&
            localProp.updatedAt > remoteProp.updatedAt
          ) {
            conflicts.push({
              entityType: 'property',
              entityId: remoteProp.id,
              local: localProp,
              remote: remoteProp,
            });
          }
        }
      }

      if (conflicts.length > 0) {
        logger.warn(`Found ${conflicts.length} conflicts during sync`);
      }

      return conflicts;
    } catch (error) {
      logger.error('Failed to resolve conflicts', error);
      throw error;
    }
  }

  private async commitRemoteChanges(remoteChanges: any): Promise<void> {
    try {
      if (remoteChanges.documents) {
        for (const doc of remoteChanges.documents) {
          const existing = await this.documentRepo.getByServerId(
            doc.serverId,
          );
          if (!existing) {
            // Create new document
            await this.documentRepo.create({
              serverId: doc.serverId,
              type: doc.type,
              counterpartyName: doc.counterpartyName,
              filePath: doc.filePath,
              fileSize: doc.fileSize,
            });
          } else {
            // Update existing
            await this.documentRepo.update(existing.id, doc);
          }
        }
      }

      if (remoteChanges.transactions) {
        for (const tx of remoteChanges.transactions) {
          const existing = await this.transactionRepo.getByServerId(
            tx.serverId,
          );
          if (!existing) {
            await this.transactionRepo.create(tx);
          } else {
            await this.transactionRepo.update(existing.id, tx);
          }
        }
      }

      if (remoteChanges.properties) {
        for (const prop of remoteChanges.properties) {
          const existing = await this.propertyRepo.getByServerId(
            prop.serverId,
          );
          if (!existing) {
            await this.propertyRepo.create(prop);
          } else {
            await this.propertyRepo.update(existing.id, prop);
          }
        }
      }

      // Handle deletions
      if (remoteChanges.deletedIds) {
        if (remoteChanges.deletedIds.documents) {
          for (const id of remoteChanges.deletedIds.documents) {
            await this.documentRepo.delete(id);
          }
        }
        if (remoteChanges.deletedIds.transactions) {
          for (const id of remoteChanges.deletedIds.transactions) {
            await this.transactionRepo.delete(id);
          }
        }
        if (remoteChanges.deletedIds.properties) {
          for (const id of remoteChanges.deletedIds.properties) {
            await this.propertyRepo.delete(id);
          }
        }
      }

      logger.info('Remote changes committed');
    } catch (error) {
      logger.error('Failed to commit remote changes', error);
      throw error;
    }
  }

  private groupChanges(items: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const item of items) {
      if (!grouped[item.entityType]) {
        grouped[item.entityType] = [];
      }
      grouped[item.entityType].push({
        id: item.entityId,
        operation: item.operation,
        payload: item.getPayload(),
      });
    }

    return grouped;
  }

  private async markSyncedItems(items: any[]): Promise<void> {
    for (const item of items) {
      await this.syncQueueRepo.remove(item.id);
    }
  }

  async retryFailedSync(): Promise<boolean> {
    try {
      const retryable = await this.syncQueueRepo.getRetryable();

      if (retryable.length === 0) {
        logger.info('No retryable items');
        return true;
      }

      logger.info(`Retrying ${retryable.length} failed sync items`);
      return await this.performSync();
    } catch (error) {
      logger.error('Failed to retry sync', error);
      return false;
    }
  }

  async clearSyncQueue(): Promise<void> {
    try {
      await this.syncQueueRepo.removeAll();
      logger.info('Sync queue cleared');
    } catch (error) {
      logger.error('Failed to clear sync queue', error);
      throw error;
    }
  }
}
