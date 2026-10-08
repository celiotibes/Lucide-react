/**
 * Battery Optimization Service - Phase 22.15: Battery-Aware Scheduling
 *
 * Features:
 * - Real-time battery level monitoring
 * - Adaptive sync intervals based on battery state
 * - Low power mode detection (iOS/Android)
 * - Charging state detection
 * - Battery drain tracking by feature
 * - Memory optimization in low battery
 * - Battery impact metrics and reporting
 */

import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../logger';

export enum BatteryStatus {
  UNKNOWN = 'unknown',
  CRITICAL = 'critical', // < 5%
  LOW = 'low', // < 20%
  MEDIUM = 'medium', // 20-80%
  HIGH = 'high', // > 80%
}

export enum ChargingState {
  UNKNOWN = 'unknown',
  UNPLUGGED = 'unplugged',
  CHARGING = 'charging',
  FULL = 'full',
}

export interface BatteryState {
  level: number;
  status: BatteryStatus;
  isCharging: boolean;
  chargingState: ChargingState;
  isLowPowerMode: boolean;
  temperature?: number;
}

export interface BatteryImpactMetric {
  feature: string;
  estimatedDrainPercentage: number;
  lastUpdated: string;
  sampleSize: number;
}

export interface SyncIntervalConfig {
  analyticsInterval: number;
  metricsInterval: number;
  locationInterval: number;
  authRefreshInterval: number;
}

const BATTERY_STATE_KEY = '@crmt:battery_state';
const BATTERY_METRICS_KEY = '@crmt:battery_metrics';
const BATTERY_HISTORY_KEY = '@crmt:battery_history';
const MAX_BATTERY_HISTORY = 100;

// Sync interval configurations (in milliseconds)
const SYNC_INTERVALS = {
  HIGH: {
    analyticsInterval: 30000, // 30 seconds
    metricsInterval: 60000, // 1 minute
    locationInterval: 60000, // 1 minute
    authRefreshInterval: 3600000, // 1 hour
  },
  MEDIUM: {
    analyticsInterval: 60000, // 1 minute
    metricsInterval: 120000, // 2 minutes
    locationInterval: 300000, // 5 minutes
    authRefreshInterval: 3600000, // 1 hour
  },
  LOW: {
    analyticsInterval: 300000, // 5 minutes
    metricsInterval: 600000, // 10 minutes
    locationInterval: 900000, // 15 minutes
    authRefreshInterval: 1800000, // 30 minutes
  },
  CRITICAL: {
    analyticsInterval: 900000, // 15 minutes
    metricsInterval: 1800000, // 30 minutes
    locationInterval: 3600000, // 1 hour
    authRefreshInterval: 7200000, // 2 hours
  },
};

class BatteryOptimizationService {
  private batteryState: BatteryState = {
    level: 100,
    status: BatteryStatus.HIGH,
    isCharging: false,
    chargingState: ChargingState.UNKNOWN,
    isLowPowerMode: false,
  };

  private batteryMetrics: Map<string, BatteryImpactMetric> = new Map();
  private batteryHistory: BatteryState[] = [];
  private batteryChangeListeners: ((state: BatteryState) => void)[] = [];
  private monitoringActive: boolean = false;
  private drainTracker: Map<string, { startLevel: number; startTime: number }> = new Map();

  constructor() {
    this.initialize();
  }

  /**
   * Initialize battery monitoring
   */
  private async initialize(): Promise<void> {
    try {
      await this.loadBatteryMetrics();
      await this.loadBatteryHistory();
      await this.checkInitialBatteryState();
      logger.info('BatteryOptimizationService initialized', {
        batteryLevel: this.batteryState.level,
        isLowPowerMode: this.batteryState.isLowPowerMode,
      });
    } catch (error) {
      logger.error('Failed to initialize BatteryOptimizationService', error, 'Battery');
    }
  }

  /**
   * Start monitoring battery state
   */
  startMonitoring(): void {
    if (this.monitoringActive) return;

    this.monitoringActive = true;
    this.setupBatteryListener();
    this.checkBatteryState();
    logger.info('Battery monitoring started');
  }

  /**
   * Stop monitoring battery state
   */
  stopMonitoring(): void {
    this.monitoringActive = false;
    this.removeBatteryListener();
    logger.info('Battery monitoring stopped');
  }

  /**
   * Setup native battery listener (platform-specific)
   */
  private setupBatteryListener(): void {
    if (Platform.OS === 'ios') {
      this.setupiOSBatteryListener();
    } else if (Platform.OS === 'android') {
      this.setupAndroidBatteryListener();
    }
  }

  /**
   * Setup iOS battery listener
   */
  private setupiOSBatteryListener(): void {
    try {
      const { RNBatteryManager } = NativeModules;
      if (RNBatteryManager?.startMonitoring) {
        RNBatteryManager.startMonitoring(
          (state: any) => this.handleBatteryStateChange(state),
          (error: any) => logger.error('Battery monitoring error (iOS)', error, 'Battery'),
        );
      }
    } catch (error) {
      logger.warn('Failed to setup iOS battery listener', {}, 'Battery');
    }
  }

  /**
   * Setup Android battery listener
   */
  private setupAndroidBatteryListener(): void {
    try {
      const { BatteryManager } = NativeModules;
      if (BatteryManager?.startMonitoring) {
        BatteryManager.startMonitoring(
          (state: any) => this.handleBatteryStateChange(state),
          (error: any) => logger.error('Battery monitoring error (Android)', error, 'Battery'),
        );
      }
    } catch (error) {
      logger.warn('Failed to setup Android battery listener', {}, 'Battery');
    }
  }

  /**
   * Remove battery listener
   */
  private removeBatteryListener(): void {
    try {
      if (Platform.OS === 'ios') {
        const { RNBatteryManager } = NativeModules;
        RNBatteryManager?.stopMonitoring?.();
      } else if (Platform.OS === 'android') {
        const { BatteryManager } = NativeModules;
        BatteryManager?.stopMonitoring?.();
      }
    } catch (error) {
      logger.warn('Failed to remove battery listener', {}, 'Battery');
    }
  }

  /**
   * Check initial battery state
   */
  private async checkInitialBatteryState(): Promise<void> {
    try {
      const state = await this.queryBatteryState();
      if (state) {
        this.batteryState = state;
        await this.saveBatteryState();
      }
    } catch (error) {
      logger.warn('Failed to check initial battery state', {}, 'Battery');
    }
  }

  /**
   * Query current battery state (platform-specific)
   */
  private async queryBatteryState(): Promise<BatteryState | null> {
    try {
      if (Platform.OS === 'ios') {
        return await this.queryiOSBatteryState();
      } else if (Platform.OS === 'android') {
        return await this.queryAndroidBatteryState();
      }
      return null;
    } catch (error) {
      logger.warn('Failed to query battery state', {}, 'Battery');
      return null;
    }
  }

  /**
   * Query iOS battery state
   */
  private async queryiOSBatteryState(): Promise<BatteryState | null> {
    try {
      const { RNBatteryManager } = NativeModules;
      if (!RNBatteryManager?.getBatteryState) return null;

      const rawState = await RNBatteryManager.getBatteryState();
      return {
        level: rawState.level,
        status: this.determineBatteryStatus(rawState.level),
        isCharging: rawState.isCharging,
        chargingState: this.determineChargingState(
          rawState.isCharging,
          rawState.level,
          rawState.state,
        ),
        isLowPowerMode: rawState.isLowPowerMode || false,
        temperature: rawState.temperature,
      };
    } catch (error) {
      logger.warn('Failed to query iOS battery state', {}, 'Battery');
      return null;
    }
  }

  /**
   * Query Android battery state
   */
  private async queryAndroidBatteryState(): Promise<BatteryState | null> {
    try {
      const { BatteryManager } = NativeModules;
      if (!BatteryManager?.getBatteryState) return null;

      const rawState = await BatteryManager.getBatteryState();
      return {
        level: rawState.level,
        status: this.determineBatteryStatus(rawState.level),
        isCharging: rawState.isCharging,
        chargingState: this.determineChargingState(
          rawState.isCharging,
          rawState.level,
          rawState.plugged,
        ),
        isLowPowerMode: rawState.isBatterySaverEnabled || false,
        temperature: rawState.temperature,
      };
    } catch (error) {
      logger.warn('Failed to query Android battery state', {}, 'Battery');
      return null;
    }
  }

  /**
   * Periodically check battery state
   */
  private checkBatteryState(): void {
    if (!this.monitoringActive) return;

    this.queryBatteryState().then((state) => {
      if (state && JSON.stringify(state) !== JSON.stringify(this.batteryState)) {
        this.handleBatteryStateChange(state);
      }
    });

    setTimeout(() => this.checkBatteryState(), 30000); // Check every 30 seconds
  }

  /**
   * Handle battery state change
   */
  private async handleBatteryStateChange(newState: BatteryState): Promise<void> {
    const oldStatus = this.batteryState.status;
    this.batteryState = newState;

    // Save to history
    await this.addToHistory(newState);
    await this.saveBatteryState();

    logger.info('Battery state changed', {
      level: newState.level,
      status: newState.status,
      isCharging: newState.isCharging,
      isLowPowerMode: newState.isLowPowerMode,
    });

    // Notify listeners only if status changed
    if (oldStatus !== newState.status || newState.isCharging) {
      this.notifyListeners(newState);
    }
  }

  /**
   * Add battery state to history
   */
  private async addToHistory(state: BatteryState): Promise<void> {
    this.batteryHistory.push(state);
    if (this.batteryHistory.length > MAX_BATTERY_HISTORY) {
      this.batteryHistory = this.batteryHistory.slice(-MAX_BATTERY_HISTORY);
    }
    await this.saveBatteryHistory();
  }

  /**
   * Determine battery status from level
   */
  private determineBatteryStatus(level: number): BatteryStatus {
    if (level < 5) return BatteryStatus.CRITICAL;
    if (level < 20) return BatteryStatus.LOW;
    if (level < 80) return BatteryStatus.MEDIUM;
    return BatteryStatus.HIGH;
  }

  /**
   * Determine charging state
   */
  private determineChargingState(
    isCharging: boolean,
    level: number,
    state?: string,
  ): ChargingState {
    if (!isCharging) return ChargingState.UNPLUGGED;
    if (level >= 95) return ChargingState.FULL;
    return ChargingState.CHARGING;
  }

  /**
   * Get current battery state
   */
  getBatteryState(): BatteryState {
    return { ...this.batteryState };
  }

  /**
   * Get appropriate sync intervals based on battery state
   */
  getSyncIntervals(): SyncIntervalConfig {
    const status = this.batteryState.status;

    // If charging, use HIGH intervals
    if (this.batteryState.isCharging) {
      return SYNC_INTERVALS.HIGH;
    }

    // If low power mode, use LOW intervals
    if (this.batteryState.isLowPowerMode) {
      return SYNC_INTERVALS.LOW;
    }

    // Otherwise, use status-based intervals
    switch (status) {
      case BatteryStatus.CRITICAL:
        return SYNC_INTERVALS.CRITICAL;
      case BatteryStatus.LOW:
        return SYNC_INTERVALS.LOW;
      case BatteryStatus.MEDIUM:
        return SYNC_INTERVALS.MEDIUM;
      case BatteryStatus.HIGH:
      default:
        return SYNC_INTERVALS.HIGH;
    }
  }

  /**
   * Check if WiFi-only tasks should run
   */
  shouldRunWiFiOnlyTasks(): boolean {
    // Only run WiFi-only tasks when charging or battery is above 50%
    return this.batteryState.isCharging || this.batteryState.level > 50;
  }

  /**
   * Check if background tasks should run
   */
  shouldRunBackgroundTasks(): boolean {
    // Don't run background tasks in critical battery
    if (this.batteryState.status === BatteryStatus.CRITICAL) {
      return false;
    }

    // Reduce frequency in low battery
    if (this.batteryState.status === BatteryStatus.LOW) {
      return true; // Still allow, but with reduced frequency
    }

    return true;
  }

  /**
   * Get batch size for analytics based on battery
   */
  getAnalyticsBatchSize(): number {
    switch (this.batteryState.status) {
      case BatteryStatus.CRITICAL:
      case BatteryStatus.LOW:
        return 25; // Smaller batches
      case BatteryStatus.MEDIUM:
        return 40;
      case BatteryStatus.HIGH:
      default:
        return 50;
    }
  }

  /**
   * Start tracking battery drain for a feature
   */
  startFeatureDrainTracking(featureName: string): void {
    this.drainTracker.set(featureName, {
      startLevel: this.batteryState.level,
      startTime: Date.now(),
    });
  }

  /**
   * Stop tracking battery drain and calculate impact
   */
  async stopFeatureDrainTracking(featureName: string): Promise<void> {
    const tracker = this.drainTracker.get(featureName);
    if (!tracker) return;

    const drainAmount = Math.max(0, tracker.startLevel - this.batteryState.level);
    const duration = Date.now() - tracker.startTime;

    // Estimate drain percentage (drain per hour)
    const drainPerHour = (drainAmount / duration) * 3600000;

    const metric: BatteryImpactMetric = {
      feature: featureName,
      estimatedDrainPercentage: Math.round(drainPerHour * 100) / 100,
      lastUpdated: new Date().toISOString(),
      sampleSize: (this.batteryMetrics.get(featureName)?.sampleSize || 0) + 1,
    };

    this.batteryMetrics.set(featureName, metric);
    this.drainTracker.delete(featureName);

    await this.saveBatteryMetrics();

    logger.info('Battery drain tracked', {
      feature: featureName,
      drainPerHour: metric.estimatedDrainPercentage,
    });
  }

  /**
   * Get battery impact metrics
   */
  getBatteryMetrics(): BatteryImpactMetric[] {
    return Array.from(this.batteryMetrics.values()).sort(
      (a, b) => b.estimatedDrainPercentage - a.estimatedDrainPercentage,
    );
  }

  /**
   * Get battery history
   */
  getBatteryHistory(): BatteryState[] {
    return [...this.batteryHistory];
  }

  /**
   * Subscribe to battery state changes
   */
  onBatteryStateChange(callback: (state: BatteryState) => void): () => void {
    this.batteryChangeListeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.batteryChangeListeners.indexOf(callback);
      if (index > -1) {
        this.batteryChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of battery state change
   */
  private notifyListeners(state: BatteryState): void {
    this.batteryChangeListeners.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        logger.error('Battery listener error', error, 'Battery');
      }
    });
  }

  /**
   * Save battery state to storage
   */
  private async saveBatteryState(): Promise<void> {
    try {
      await AsyncStorage.setItem(BATTERY_STATE_KEY, JSON.stringify(this.batteryState));
    } catch (error) {
      logger.warn('Failed to save battery state', {}, 'Battery');
    }
  }

  /**
   * Save battery metrics to storage
   */
  private async saveBatteryMetrics(): Promise<void> {
    try {
      const metricsArray = Array.from(this.batteryMetrics.values());
      await AsyncStorage.setItem(BATTERY_METRICS_KEY, JSON.stringify(metricsArray));
    } catch (error) {
      logger.warn('Failed to save battery metrics', {}, 'Battery');
    }
  }

  /**
   * Load battery metrics from storage
   */
  private async loadBatteryMetrics(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(BATTERY_METRICS_KEY);
      if (stored) {
        const metrics = JSON.parse(stored) as BatteryImpactMetric[];
        this.batteryMetrics = new Map(metrics.map((m) => [m.feature, m]));
      }
    } catch (error) {
      logger.warn('Failed to load battery metrics', {}, 'Battery');
    }
  }

  /**
   * Save battery history to storage
   */
  private async saveBatteryHistory(): Promise<void> {
    try {
      await AsyncStorage.setItem(BATTERY_HISTORY_KEY, JSON.stringify(this.batteryHistory));
    } catch (error) {
      logger.warn('Failed to save battery history', {}, 'Battery');
    }
  }

  /**
   * Load battery history from storage
   */
  private async loadBatteryHistory(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(BATTERY_HISTORY_KEY);
      if (stored) {
        this.batteryHistory = JSON.parse(stored);
      }
    } catch (error) {
      logger.warn('Failed to load battery history', {}, 'Battery');
    }
  }

  /**
   * Get average battery drain rate
   */
  getAverageDrainRate(): number {
    if (this.batteryHistory.length < 2) return 0;

    const first = this.batteryHistory[0];
    const last = this.batteryHistory[this.batteryHistory.length - 1];
    const drain = first.level - last.level;
    const duration = new Date(last.temperature?.toString() || '').getTime() -
                    new Date(first.temperature?.toString() || '').getTime();

    if (duration <= 0) return 0;
    return (drain / duration) * 3600000; // Return drain per hour
  }

  /**
   * Estimate time until critical battery
   */
  estimateTimeUntilCritical(): number {
    const rate = this.getAverageDrainRate();
    if (rate <= 0) return -1; // Unknown

    const timeToEmpty = (this.batteryState.level / rate) * 3600000;
    const timeToCritical = ((this.batteryState.level - 5) / rate) * 3600000;

    return Math.max(0, timeToCritical);
  }

  /**
   * Clear all battery data
   */
  async clearAll(): Promise<void> {
    try {
      this.batteryMetrics.clear();
      this.batteryHistory = [];
      this.drainTracker.clear();
      await AsyncStorage.removeItem(BATTERY_STATE_KEY);
      await AsyncStorage.removeItem(BATTERY_METRICS_KEY);
      await AsyncStorage.removeItem(BATTERY_HISTORY_KEY);
      logger.info('Battery data cleared');
    } catch (error) {
      logger.error('Failed to clear battery data', error, 'Battery');
    }
  }
}

export const batteryOptimizationService = new BatteryOptimizationService();
