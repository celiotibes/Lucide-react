import AsyncStorage from '@react-native-async-storage/async-storage';
import { compressImage, getSizeInBytes } from '../compression/imageCompressor';

export interface SyncJob {
  id: string;
  type: 'media' | 'item' | 'observation';
  mediaId?: string;
  itemVistoriaId?: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  lastAttempt?: number;
  createdAt: number;
  updatedAt: number;
  data: any;
}

export interface SyncProgress {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  syncedBytes: number;
  totalBytes: number;
}

const SYNC_QUEUE_KEY = '@sync_queue';
const SYNC_PROGRESS_KEY = '@sync_progress';
const BACKGROUND_SYNC_INTERVAL = 60000; // 1 minute
const MAX_CONCURRENT_JOBS = 3;
const RETRY_BACKOFF_BASE = 1000; // 1 second

export class BackgroundSyncManager {
  private queue: SyncJob[] = [];
  private syncTimer: NodeJS.Timeout | null = null;
  private activeSyncs: Set<string> = new Set();
  private syncCallback?: (progress: SyncProgress) => void;

  async initialize() {
    // Load queue from storage
    const stored = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    if (stored) {
      try {
        this.queue = JSON.parse(stored);
      } catch (err) {
        console.error('Failed to load sync queue:', err);
        this.queue = [];
      }
    }
  }

  async addMediaSync(mediaId: string, itemVistoriaId: string, data: any) {
    const job: SyncJob = {
      id: `media-${mediaId}-${Date.now()}`,
      type: 'media',
      mediaId,
      itemVistoriaId,
      status: 'pending',
      retryCount: 0,
      maxRetries: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data,
    };

    this.queue.push(job);
    await this.persistQueue();
  }

  async addItemSync(itemVistoriaId: string, data: any) {
    const job: SyncJob = {
      id: `item-${itemVistoriaId}-${Date.now()}`,
      type: 'item',
      itemVistoriaId,
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data,
    };

    this.queue.push(job);
    await this.persistQueue();
  }

  private async persistQueue() {
    try {
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      console.error('Failed to persist sync queue:', err);
    }
  }

  async startBackgroundSync(callback?: (progress: SyncProgress) => void) {
    this.syncCallback = callback;

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Run immediately once
    await this.processQueue();

    // Then run periodically
    this.syncTimer = setInterval(() => {
      this.processQueue();
    }, BACKGROUND_SYNC_INTERVAL);
  }

  stopBackgroundSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private async processQueue() {
    const pendingJobs = this.queue.filter((j) => j.status === 'pending');

    if (pendingJobs.length === 0) {
      return;
    }

    // Process up to MAX_CONCURRENT_JOBS at a time
    const toProcess = pendingJobs.slice(0, MAX_CONCURRENT_JOBS);

    const promises = toProcess.map((job) => this.syncJob(job));
    await Promise.allSettled(promises);

    if (this.syncCallback) {
      this.syncCallback(this.getProgress());
    }
  }

  private async syncJob(job: SyncJob) {
    if (this.activeSyncs.has(job.id)) {
      return; // Already syncing
    }

    this.activeSyncs.add(job.id);

    try {
      job.status = 'syncing';
      job.lastAttempt = Date.now();
      await this.persistQueue();

      switch (job.type) {
        case 'media':
          await this.syncMedia(job);
          break;
        case 'item':
          await this.syncItem(job);
          break;
        case 'observation':
          await this.syncObservation(job);
          break;
      }

      job.status = 'completed';
      job.updatedAt = Date.now();
    } catch (error) {
      job.retryCount++;
      job.lastError = error instanceof Error ? error.message : String(error);

      if (job.retryCount >= job.maxRetries) {
        job.status = 'failed';
      } else {
        job.status = 'pending';
        // Implement exponential backoff
        const backoff = RETRY_BACKOFF_BASE * Math.pow(2, job.retryCount);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }

      job.updatedAt = Date.now();
    } finally {
      this.activeSyncs.delete(job.id);
      await this.persistQueue();
    }
  }

  private async syncMedia(job: SyncJob) {
    if (!job.mediaId || !job.itemVistoriaId) {
      throw new Error('Missing mediaId or itemVistoriaId');
    }

    const { uri, tipo } = job.data;

    // Compress if image
    let uploadUri = uri;
    if (tipo === 'foto') {
      const compressed = await compressImage(uri, {
        quality: 0.7,
        width: 1920,
        height: 1920,
      });
      uploadUri = compressed.uri;
    }

    // TODO: Upload to backend
    // const response = await fetch(`/api/vistorias/media/${job.mediaId}`, {
    //   method: 'POST',
    //   body: FormData with compressed file
    // });

    console.log(`Synced media ${job.mediaId}`);
  }

  private async syncItem(job: SyncJob) {
    if (!job.itemVistoriaId) {
      throw new Error('Missing itemVistoriaId');
    }

    // TODO: Upload item data to backend
    // const response = await fetch(`/api/vistorias/items/${job.itemVistoriaId}`, {
    //   method: 'PUT',
    //   body: JSON.stringify(job.data)
    // });

    console.log(`Synced item ${job.itemVistoriaId}`);
  }

  private async syncObservation(job: SyncJob) {
    // TODO: Upload observation data
    console.log(`Synced observation ${job.id}`);
  }

  private getProgress(): SyncProgress {
    const completed = this.queue.filter((j) => j.status === 'completed').length;
    const failed = this.queue.filter((j) => j.status === 'failed').length;

    return {
      totalJobs: this.queue.length,
      completedJobs: completed,
      failedJobs: failed,
      syncedBytes: 0, // TODO: Track actual bytes
      totalBytes: 0,
    };
  }

  getQueueStatus() {
    return {
      total: this.queue.length,
      pending: this.queue.filter((j) => j.status === 'pending').length,
      syncing: this.queue.filter((j) => j.status === 'syncing').length,
      completed: this.queue.filter((j) => j.status === 'completed').length,
      failed: this.queue.filter((j) => j.status === 'failed').length,
    };
  }

  async getFailedJobs(): Promise<SyncJob[]> {
    return this.queue.filter((j) => j.status === 'failed');
  }

  async retryFailedJobs() {
    const failedJobs = await this.getFailedJobs();
    for (const job of failedJobs) {
      job.status = 'pending';
      job.retryCount = 0;
      job.lastError = undefined;
    }
    await this.persistQueue();
    await this.processQueue();
  }

  async clearCompletedJobs() {
    this.queue = this.queue.filter((j) => j.status !== 'completed');
    await this.persistQueue();
  }
}

export const backgroundSync = new BackgroundSyncManager();
