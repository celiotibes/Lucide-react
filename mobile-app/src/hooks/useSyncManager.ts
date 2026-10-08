import { useState, useCallback, useRef, useEffect } from 'react';
import { useDatabaseInstance } from '../providers/DatabaseProvider';
import { SyncManagerService } from '../services/SyncManagerService';
import { NetworkMonitorService } from '../services/NetworkMonitorService';
import { SyncStatus, SyncConflict } from '../types/api';
import { logger } from '../utils/logger';

export interface UseSyncManagerState {
  syncStatus: SyncStatus;
  isOnline: boolean;
  conflicts: SyncConflict[];
  error: Error | null;
  isSyncing: boolean;
}

export interface UseSyncManagerConfig {
  apiBaseURL: string;
  deviceId: string;
  autoSync?: boolean;
  syncInterval?: number;
  authToken?: string;
}

export const useSyncManager = (config: UseSyncManagerConfig) => {
  const database = useDatabaseInstance();
  const syncManagerRef = useRef<SyncManagerService | null>(null);
  const networkMonitorRef = useRef<NetworkMonitorService | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<UseSyncManagerState>({
    syncStatus: {
      isSyncing: false,
      pendingChanges: 0,
      conflicts: 0,
      syncProgress: 0,
    },
    isOnline: true,
    conflicts: [],
    error: null,
    isSyncing: false,
  });

  // Initialize services
  const initializeServices = useCallback(async () => {
    if (!syncManagerRef.current) {
      syncManagerRef.current = new SyncManagerService(database, {
        apiBaseURL: config.apiBaseURL,
        deviceId: config.deviceId,
        autoSync: config.autoSync ?? true,
        syncInterval: config.syncInterval ?? 300000,
      });

      if (config.authToken) {
        syncManagerRef.current.setAuthToken(config.authToken);
      }

      // Set progress callback
      syncManagerRef.current.setSyncProgressCallback(() => {
        // Refresh sync status
        updateSyncStatus();
      });
    }

    if (!networkMonitorRef.current) {
      networkMonitorRef.current = new NetworkMonitorService();

      // Subscribe to network changes
      networkMonitorRef.current.subscribe((status) => {
        setState((prev) => ({
          ...prev,
          isOnline: status.isOnline,
        }));

        // Auto-sync when coming back online
        if (status.isOnline && config.autoSync && syncManagerRef.current) {
          performSync();
        }
      });
    }
  }, [database, config]);

  const updateSyncStatus = useCallback(async () => {
    if (!syncManagerRef.current) return;

    try {
      const status = await syncManagerRef.current.getSyncStatus();
      setState((prev) => ({
        ...prev,
        syncStatus: status,
      }));
    } catch (error) {
      logger.error('Failed to update sync status', error);
    }
  }, []);

  const performSync = useCallback(async (): Promise<boolean> => {
    if (!syncManagerRef.current) {
      await initializeServices();
    }

    try {
      setState((prev) => ({
        ...prev,
        isSyncing: true,
        error: null,
      }));

      const result = await syncManagerRef.current!.performSync();

      await updateSyncStatus();

      setState((prev) => ({
        ...prev,
        isSyncing: false,
      }));

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        error: err,
      }));
      logger.error('Sync failed', err);
      return false;
    }
  }, [initializeServices, updateSyncStatus]);

  const setAuthToken = useCallback((token: string) => {
    if (syncManagerRef.current) {
      syncManagerRef.current.setAuthToken(token);
    }
  }, []);

  const retryFailedSync = useCallback(async (): Promise<boolean> => {
    if (!syncManagerRef.current) {
      await initializeServices();
    }

    try {
      const result = await syncManagerRef.current!.retryFailedSync();
      await updateSyncStatus();
      return result;
    } catch (error) {
      logger.error('Retry sync failed', error);
      return false;
    }
  }, [initializeServices, updateSyncStatus]);

  const clearSyncQueue = useCallback(async (): Promise<void> => {
    if (!syncManagerRef.current) {
      await initializeServices();
    }

    try {
      await syncManagerRef.current!.clearSyncQueue();
      await updateSyncStatus();
    } catch (error) {
      logger.error('Failed to clear sync queue', error);
    }
  }, [initializeServices, updateSyncStatus]);

  const waitForOnline = useCallback(
    async (timeout?: number): Promise<boolean> => {
      if (!networkMonitorRef.current) {
        await initializeServices();
      }
      return networkMonitorRef.current!.waitForOnline(timeout);
    },
    [initializeServices],
  );

  // Initialize on mount
  useEffect(() => {
    initializeServices();
    updateSyncStatus();

    // Set up auto-sync interval if enabled
    if (config.autoSync) {
      syncIntervalRef.current = setInterval(
        () => performSync(),
        config.syncInterval ?? 300000,
      );
    }

    // Cleanup on unmount
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      if (networkMonitorRef.current) {
        networkMonitorRef.current.destroy();
        networkMonitorRef.current = null;
      }
    };
  }, [config, initializeServices, updateSyncStatus, performSync]);

  return {
    // State
    ...state,

    // Methods
    performSync,
    retryFailedSync,
    clearSyncQueue,
    setAuthToken,
    waitForOnline,
    updateSyncStatus,
  };
};

export default useSyncManager;
