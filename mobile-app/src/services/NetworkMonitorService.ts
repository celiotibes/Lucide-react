import { AppState, AppStateStatus } from 'react-native';
import { logger } from '../utils/logger';

export interface NetworkStatus {
  isOnline: boolean;
  isMetered?: boolean;
  connectionType?: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
  lastChecked: number;
}

export type NetworkStatusCallback = (status: NetworkStatus) => void;

export class NetworkMonitorService {
  private currentStatus: NetworkStatus = {
    isOnline: true,
    lastChecked: Date.now(),
  };

  private statusCallbacks: Set<NetworkStatusCallback> = new Set();
  private appStateSubscription: any;
  private onlineTimeoutId?: NodeJS.Timeout;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Check initial online status
      if (typeof navigator !== 'undefined') {
        this.currentStatus.isOnline = navigator.onLine;
      }

      // Listen for online/offline events
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
      }

      // Listen for app state changes
      if (AppState) {
        this.appStateSubscription = AppState.addEventListener(
          'change',
          this.handleAppStateChange,
        );
      }

      logger.info(`Network initialized: ${this.currentStatus.isOnline ? 'online' : 'offline'}`);
    } catch (error) {
      logger.error('Failed to initialize network monitor', error);
    }
  }

  private handleOnline = (): void => {
    this.currentStatus.isOnline = true;
    this.currentStatus.lastChecked = Date.now();
    this.notifyStatusChange();
    logger.info('Device came online');

    // Clear any pending timeout
    if (this.onlineTimeoutId) {
      clearTimeout(this.onlineTimeoutId);
    }
  };

  private handleOffline = (): void => {
    this.currentStatus.isOnline = false;
    this.currentStatus.lastChecked = Date.now();
    this.notifyStatusChange();
    logger.warn('Device went offline');
  };

  private handleAppStateChange = (state: AppStateStatus): void => {
    if (state === 'active') {
      // App came to foreground, check connectivity
      this.checkConnectivity();
    }
  };

  private async checkConnectivity(): Promise<void> {
    try {
      // Try a simple ping to verify connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        'https://www.google.com/generate_204',
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);
      const wasOnline = this.currentStatus.isOnline;
      this.currentStatus.isOnline = response.ok || response.status === 204;

      if (wasOnline !== this.currentStatus.isOnline) {
        this.notifyStatusChange();
      }
    } catch (error) {
      this.currentStatus.isOnline = false;
      this.notifyStatusChange();
      logger.warn('Connectivity check failed', error);
    }
  }

  private notifyStatusChange(): void {
    this.statusCallbacks.forEach((callback) => {
      try {
        callback(this.currentStatus);
      } catch (error) {
        logger.error('Error in status callback', error);
      }
    });
  }

  subscribe(callback: NetworkStatusCallback): () => void {
    this.statusCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  getStatus(): NetworkStatus {
    return { ...this.currentStatus };
  }

  isOnline(): boolean {
    return this.currentStatus.isOnline;
  }

  async waitForOnline(timeout: number = 30000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.currentStatus.isOnline) {
        resolve(true);
        return;
      }

      const timeoutId = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeout);

      const unsubscribe = this.subscribe((status) => {
        if (status.isOnline) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  async simulateOffline(duration: number = 10000): Promise<void> {
    if (this.currentStatus.isOnline) {
      this.handleOffline();
    }

    // Clear any existing timeout
    if (this.onlineTimeoutId) {
      clearTimeout(this.onlineTimeoutId);
    }

    this.onlineTimeoutId = setTimeout(() => {
      this.handleOnline();
    }, duration);
  }

  destroy(): void {
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
      }

      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
      }

      if (this.onlineTimeoutId) {
        clearTimeout(this.onlineTimeoutId);
      }

      this.statusCallbacks.clear();
      logger.info('Network monitor destroyed');
    } catch (error) {
      logger.error('Failed to destroy network monitor', error);
    }
  }
}
