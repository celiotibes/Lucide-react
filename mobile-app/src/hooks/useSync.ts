import { useState, useEffect, useCallback } from 'react';
import { SyncService, SyncStatus } from '../services/sync/SyncService';
import { useDatabaseInstance } from '../providers/DatabaseProvider';
import { logger } from '../utils/logger';

export interface UseSyncState {
  status: SyncStatus;
  itemsSynced: number;
  itemsFailed: number;
  isLoading: boolean;
  lastSyncTime: number | null;
  error: Error | null;
}

const defaultState: UseSyncState = {
  status: 'idle',
  itemsSynced: 0,
  itemsFailed: 0,
  isLoading: false,
  lastSyncTime: null,
  error: null,
};

export const useSync = () => {
  const database = useDatabaseInstance();
  const [state, setState] = useState<UseSyncState>(defaultState);
  const [syncService, setSyncService] = useState<SyncService | null>(null);

  // Initialize sync service
  useEffect(() => {
    try {
      const service = new SyncService(database);
      setSyncService(service);
      return () => {
        // Cleanup if needed
      };
    } catch (error) {
      logger.error('Failed to initialize SyncService', error);
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error : new Error('Failed to initialize sync'),
      }));
    }
  }, [database]);

  // Manual sync trigger
  const sync = useCallback(async () => {
    if (!syncService) {
      throw new Error('SyncService not initialized');
    }

    if (state.status === 'syncing') {
      logger.warn('Sync already in progress');
      return;
    }

    try {
      setState((s) => ({ ...s, status: 'syncing', isLoading: true, error: null }));
      const stats = await syncService.syncAll();

      setState((s) => ({
        ...s,
        status: stats.status,
        itemsSynced: stats.itemsSynced,
        itemsFailed: stats.itemsFailed,
        lastSyncTime: Date.now(),
        isLoading: false,
      }));

      logger.info('Sync completed successfully', stats);
    } catch (error) {
      const syncError = error instanceof Error ? error : new Error('Sync failed');
      setState((s) => ({
        ...s,
        status: 'error',
        isLoading: false,
        error: syncError,
      }));
      logger.error('Sync error', error);
    }
  }, [syncService, state.status]);

  // Retry failed items
  const retry = useCallback(async () => {
    if (!syncService) {
      throw new Error('SyncService not initialized');
    }

    try {
      setState((s) => ({ ...s, isLoading: true, error: null }));
      const stats = await syncService.retryFailedItems();

      setState((s) => ({
        ...s,
        itemsSynced: stats.itemsSynced,
        itemsFailed: stats.itemsFailed,
        lastSyncTime: Date.now(),
        isLoading: false,
      }));

      logger.info('Retry completed', stats);
    } catch (error) {
      const syncError = error instanceof Error ? error : new Error('Retry failed');
      setState((s) => ({
        ...s,
        error: syncError,
        isLoading: false,
      }));
      logger.error('Retry error', error);
    }
  }, [syncService]);

  // Reset state
  const reset = useCallback(() => {
    setState(defaultState);
  }, []);

  return {
    ...state,
    sync,
    retry,
    reset,
  };
};
