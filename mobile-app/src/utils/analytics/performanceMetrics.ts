/**
 * Performance Metrics Service - Phase 22.13: Analytics & Monitoring
 *
 * Features:
 * - App startup time tracking
 * - Memory usage monitoring
 * - API response time tracking
 * - Network latency measurement
 * - Frame rate and animation performance
 * - Database operation timing
 * - Custom performance marks and measures
 */

import { PerformanceMonitor } from 'react-native-performance-monitor';
import { logger } from '../logger';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface PerformanceTimestamp {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

export interface AppPerformanceStats {
  startupTime: number;
  memoryUsage: number;
  memoryAvailable: number;
  avgApiResponseTime: number;
  avgNetworkLatency: number;
  crashes: number;
  errors: number;
}

const METRIC_STORAGE_KEY = '@crmt:performance_metrics';
const MAX_STORED_METRICS = 1000;
const MEMORY_CHECK_INTERVAL = 60000; // 1 minute

class PerformanceMetricsService {
  private metrics: PerformanceMetric[] = [];
  private timestamps: Map<string, PerformanceTimestamp> = new Map();
  private appStartTime: number = Date.now();
  private memoryCheckTimer: NodeJS.Timeout | null = null;
  private apiTimes: number[] = [];
  private networkLatencies: number[] = [];

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      this.startMemoryMonitoring();
      this.recordStartupTime();
      logger.info('PerformanceMetricsService initialized');
    } catch (error) {
      logger.error('Failed to initialize PerformanceMetricsService', error, 'Performance');
    }
  }

  /**
   * Record app startup time
   */
  private recordStartupTime(): void {
    const startupTime = Date.now() - this.appStartTime;
    this.recordMetric('app_startup', startupTime, 'ms', { type: 'startup' });
    logger.info(`App startup completed in ${startupTime}ms`);
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.memoryCheckTimer = setInterval(() => {
      this.recordMemoryUsage();
    }, MEMORY_CHECK_INTERVAL);
  }

  /**
   * Stop memory monitoring
   */
  stopMemoryMonitoring(): void {
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
  }

  /**
   * Record memory usage
   */
  private recordMemoryUsage(): void {
    try {
      if (PerformanceMonitor) {
        const stats = PerformanceMonitor.getMemoryStats?.();
        if (stats) {
          this.recordMetric('memory_usage', stats.usedMemory, 'bytes', {
            totalMemory: stats.totalMemory,
            freeMemory: stats.freeMemory,
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to record memory usage', {}, 'Performance');
    }
  }

  /**
   * Record generic performance metric
   */
  recordMetric(name: string, value: number, unit: string, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.metrics.push(metric);

    if (this.metrics.length > MAX_STORED_METRICS) {
      this.metrics = this.metrics.slice(-MAX_STORED_METRICS);
    }
  }

  /**
   * Mark performance timestamp
   */
  mark(name: string): void {
    this.timestamps.set(name, {
      name,
      startTime: performance.now?.() || Date.now(),
    });
  }

  /**
   * Measure performance between marks
   */
  measure(name: string, startMark: string): number {
    const endTime = performance.now?.() || Date.now();
    const startTimestamp = this.timestamps.get(startMark);

    if (!startTimestamp) {
      logger.warn(`Start mark not found: ${startMark}`, {}, 'Performance');
      return 0;
    }

    const duration = endTime - startTimestamp.startTime;
    startTimestamp.endTime = endTime;
    startTimestamp.duration = duration;

    this.recordMetric(name, duration, 'ms', {
      startMark,
      type: 'measure',
    });

    return duration;
  }

  /**
   * Track API request time
   */
  trackApiRequest(endpoint: string, duration: number, statusCode?: number): void {
    this.apiTimes.push(duration);
    this.recordMetric('api_response_time', duration, 'ms', {
      endpoint,
      statusCode,
      type: 'api',
    });
  }

  /**
   * Track network latency
   */
  trackNetworkLatency(latency: number, host?: string): void {
    this.networkLatencies.push(latency);
    this.recordMetric('network_latency', latency, 'ms', {
      host,
      type: 'network',
    });
  }

  /**
   * Track database operation
   */
  trackDatabaseOperation(operation: string, duration: number, table?: string): void {
    this.recordMetric('db_operation', duration, 'ms', {
      operation,
      table,
      type: 'database',
    });
  }

  /**
   * Track screen render time
   */
  trackScreenRender(screenName: string, duration: number): void {
    this.recordMetric('screen_render', duration, 'ms', {
      screenName,
      type: 'ui',
    });
  }

  /**
   * Track animation frame rate
   */
  trackFrameRate(fps: number): void {
    this.recordMetric('frame_rate', fps, 'fps', {
      type: 'animation',
    });
  }

  /**
   * Get average API response time
   */
  getAverageApiResponseTime(): number {
    if (this.apiTimes.length === 0) return 0;
    const sum = this.apiTimes.reduce((a, b) => a + b, 0);
    return sum / this.apiTimes.length;
  }

  /**
   * Get average network latency
   */
  getAverageNetworkLatency(): number {
    if (this.networkLatencies.length === 0) return 0;
    const sum = this.networkLatencies.reduce((a, b) => a + b, 0);
    return sum / this.networkLatencies.length;
  }

  /**
   * Get p95 API response time
   */
  getP95ApiResponseTime(): number {
    if (this.apiTimes.length === 0) return 0;
    const sorted = [...this.apiTimes].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index];
  }

  /**
   * Get p99 API response time
   */
  getP99ApiResponseTime(): number {
    if (this.apiTimes.length === 0) return 0;
    const sorted = [...this.apiTimes].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.99);
    return sorted[index];
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.name === name);
  }

  /**
   * Get metrics by type
   */
  getMetricsByType(type: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.metadata?.type === type);
  }

  /**
   * Get metrics in time range
   */
  getMetricsInRange(startTime: string, endTime: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.timestamp >= startTime && m.timestamp <= endTime);
  }

  /**
   * Get performance summary
   */
  getSummary(): AppPerformanceStats {
    const startupMetric = this.metrics.find((m) => m.name === 'app_startup');
    const startupTime = startupMetric?.value || 0;

    const memoryMetrics = this.getMetricsByName('memory_usage');
    const latestMemory = memoryMetrics[memoryMetrics.length - 1];
    const memoryUsage = latestMemory?.value || 0;
    const memoryAvailable = latestMemory?.metadata?.freeMemory || 0;

    return {
      startupTime: Math.round(startupTime),
      memoryUsage: Math.round(memoryUsage / 1024 / 1024), // Convert to MB
      memoryAvailable: Math.round(memoryAvailable / 1024 / 1024),
      avgApiResponseTime: Math.round(this.getAverageApiResponseTime()),
      avgNetworkLatency: Math.round(this.getAverageNetworkLatency()),
      crashes: 0,
      errors: 0,
    };
  }

  /**
   * Export performance data
   */
  async exportMetrics(): Promise<string> {
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        summary: this.getSummary(),
        metrics: this.metrics,
        timestamps: Array.from(this.timestamps.values()),
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      logger.error('Failed to export metrics', error, 'Performance');
      throw error;
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.timestamps.clear();
    this.apiTimes = [];
    this.networkLatencies = [];
    logger.info('Performance metrics cleared');
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

export const performanceMetrics = new PerformanceMetricsService();
