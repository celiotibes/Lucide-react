import { SyncService, SyncStats } from './SyncService';
import { logger } from '../../utils/logger';

export interface SyncScheduleConfig {
  intervalMs: number; // How often to sync (default: 5 minutes)
  retryOnFailureMs: number; // Retry interval on failure (default: 1 minute)
  maxConcurrentSyncs: number; // Max parallel syncs (default: 1)
}

export const DEFAULT_SYNC_CONFIG: SyncScheduleConfig = {
  intervalMs: 5 * 60 * 1000, // 5 minutes
  retryOnFailureMs: 1 * 60 * 1000, // 1 minute
  maxConcurrentSyncs: 1,
};

export class SyncScheduler {
  private syncService: SyncService;
  private config: SyncScheduleConfig;
  private timerId: NodeJS.Timeout | null = null;
  private lastSyncTime: number = 0;
  private consecutiveFailures: number = 0;
  private isRunning: boolean = false;

  constructor(syncService: SyncService, config?: Partial<SyncScheduleConfig>) {
    this.syncService = syncService;
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
    logger.info('SyncScheduler initialized', this.config);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('SyncScheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('SyncScheduler starting...');

    // Run first sync immediately
    await this.runSync();

    // Schedule periodic syncs
    this.scheduleNextSync();
  }

  stop(): void {
    if (!this.isRunning) {
      logger.warn('SyncScheduler is not running');
      return;
    }

    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    logger.info('SyncScheduler stopped');
  }

  private scheduleNextSync(): void {
    if (!this.isRunning) return;

    // Calculate next sync interval based on last sync result
    const interval =
      this.consecutiveFailures > 0
        ? this.config.retryOnFailureMs
        : this.config.intervalMs;

    this.timerId = setTimeout(() => {
      if (this.isRunning) {
        this.runSync().then(() => this.scheduleNextSync());
      }
    }, interval);

    logger.debug(
      `Next sync scheduled in ${interval / 1000}s`,
    );
  }

  private async runSync(): Promise<void> {
    // Prevent overlapping syncs
    if (this.syncService.isSyncInProgress()) {
      logger.debug('Sync already in progress, skipping scheduled sync');
      return;
    }

    try {
      logger.info('Running scheduled sync...');
      const stats = await this.syncService.syncAll();

      this.lastSyncTime = Date.now();
      this.consecutiveFailures = 0;

      logger.info('Scheduled sync completed', {
        itemsSynced: stats.itemsSynced,
        itemsFailed: stats.itemsFailed,
        duration: stats.duration,
      });

      // Notify listeners if needed (implemented in next section)
      this.onSyncComplete(stats);
    } catch (error) {
      this.consecutiveFailures++;
      logger.error('Scheduled sync failed', error);
      this.onSyncError(error);
    }
  }

  forceSync(): Promise<SyncStats> {
    logger.info('Force sync requested');
    return this.syncService.syncAll();
  }

  getStatus(): {
    isRunning: boolean;
    lastSyncTime: number;
    consecutiveFailures: number;
    nextSyncIn?: number;
  } {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  setInterval(intervalMs: number): void {
    this.config.intervalMs = intervalMs;
    logger.info(`Sync interval updated to ${intervalMs}ms`);
  }

  private onSyncComplete(stats: SyncStats): void {
    // This can be extended with event emitter pattern
    // for now, just log
  }

  private onSyncError(error: any): void {
    // This can be extended with event emitter pattern
    // for now, just log
  }

  async destroy(): Promise<void> {
    this.stop();
    logger.info('SyncScheduler destroyed');
  }
}
