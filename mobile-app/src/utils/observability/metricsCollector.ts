/**
 * Metrics Collector - Phase 22.17: Advanced Monitoring & Observability
 *
 * Collects and manages:
 * - Key performance indicators (KPIs)
 * - Custom metrics
 * - Real-time dashboard data
 * - Business metrics (uploads, syncs, errors)
 * - Time-series data storage
 * - Batch export capabilities
 *
 * @module observability/metricsCollector
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../logger';

export interface Metric {
  name: string;
  value: number;
  tags?: Record<string, any>;
  timestamp: number;
  unit?: string;
}

export interface AggregatedMetric {
  name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number; // Median
  p95: number;
  p99: number;
  lastUpdated: string;
}

export interface KPIData {
  name: string;
  value: number;
  target: number;
  threshold: number;
  status: 'healthy' | 'warning' | 'critical';
  unit: string;
  timestamp: string;
}

export interface BusinessMetrics {
  uploads: {
    total: number;
    successful: number;
    failed: number;
    averageSize: number;
    averageDuration: number;
  };
  syncs: {
    total: number;
    successful: number;
    failed: number;
    averageDuration: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    rate: number; // per minute
  };
  users: {
    active: number;
    sessions: number;
    averageSessionDuration: number;
  };
}

export interface ExportOptions {
  format: 'json' | 'csv';
  startTime?: number;
  endTime?: number;
  metrics?: string[];
}

const METRICS_STORAGE_KEY = '@crmt:metrics_data';
const KPI_STORAGE_KEY = '@crmt:kpi_data';
const BUSINESS_METRICS_KEY = '@crmt:business_metrics';
const MAX_STORED_METRICS = 10000;

class MetricsCollector {
  private metrics: Metric[] = [];
  private aggregatedMetrics: Map<string, AggregatedMetric> = new Map();
  private kpis: Map<string, KPIData> = new Map();
  private businessMetrics: BusinessMetrics = {
    uploads: {
      total: 0,
      successful: 0,
      failed: 0,
      averageSize: 0,
      averageDuration: 0,
    },
    syncs: {
      total: 0,
      successful: 0,
      failed: 0,
      averageDuration: 0,
    },
    errors: {
      total: 0,
      byType: {},
      rate: 0,
    },
    users: {
      active: 0,
      sessions: 0,
      averageSessionDuration: 0,
    },
  };

  private latencyByType: Map<string, number[]> = new Map();
  private isInitialized = false;

  /**
   * Initialize metrics collector
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) return;

      await this.loadMetricsFromStorage();
      await this.loadKPIsFromStorage();
      await this.loadBusinessMetricsFromStorage();

      this.isInitialized = true;
      logger.info('MetricsCollector initialized');
    } catch (error) {
      logger.error('Failed to initialize MetricsCollector', error, 'Metrics');
    }
  }

  /**
   * Record a metric
   */
  recordMetric(metric: Metric): void {
    if (!this.isInitialized) return;

    try {
      this.metrics.push(metric);

      // Enforce max stored metrics
      if (this.metrics.length > MAX_STORED_METRICS) {
        this.metrics = this.metrics.slice(-MAX_STORED_METRICS);
      }

      // Update aggregated metrics
      this.updateAggregatedMetric(metric);

      // Track latency if applicable
      if (metric.name.includes('latency') || metric.name.includes('duration')) {
        this.trackLatency(metric.name, metric.value);
      }

      // Persist periodically (not on every metric)
      if (this.metrics.length % 100 === 0) {
        this.persistMetricsAsync();
      }
    } catch (error) {
      logger.warn(`Failed to record metric: ${metric.name}`, {}, 'Metrics');
    }
  }

  /**
   * Record upload metric
   */
  recordUpload(
    successful: boolean,
    size: number,
    duration: number,
    fileType?: string
  ): void {
    this.businessMetrics.uploads.total++;

    if (successful) {
      this.businessMetrics.uploads.successful++;
    } else {
      this.businessMetrics.uploads.failed++;
    }

    // Update averages
    this.businessMetrics.uploads.averageSize =
      (this.businessMetrics.uploads.averageSize * (this.businessMetrics.uploads.total - 1) +
        size) /
      this.businessMetrics.uploads.total;

    this.businessMetrics.uploads.averageDuration =
      (this.businessMetrics.uploads.averageDuration * (this.businessMetrics.uploads.total - 1) +
        duration) /
      this.businessMetrics.uploads.total;

    this.recordMetric({
      name: 'upload.completed',
      value: 1,
      tags: {
        successful,
        fileType,
      },
      timestamp: Date.now(),
      unit: 'count',
    });

    this.recordMetric({
      name: 'upload.duration',
      value: duration,
      tags: {
        fileType,
      },
      timestamp: Date.now(),
      unit: 'ms',
    });
  }

  /**
   * Record sync metric
   */
  recordSync(successful: boolean, duration: number, itemCount?: number): void {
    this.businessMetrics.syncs.total++;

    if (successful) {
      this.businessMetrics.syncs.successful++;
    } else {
      this.businessMetrics.syncs.failed++;
    }

    // Update average duration
    this.businessMetrics.syncs.averageDuration =
      (this.businessMetrics.syncs.averageDuration * (this.businessMetrics.syncs.total - 1) +
        duration) /
      this.businessMetrics.syncs.total;

    this.recordMetric({
      name: 'sync.completed',
      value: 1,
      tags: {
        successful,
        itemCount,
      },
      timestamp: Date.now(),
      unit: 'count',
    });

    this.recordMetric({
      name: 'sync.duration',
      value: duration,
      tags: {
        itemCount,
      },
      timestamp: Date.now(),
      unit: 'ms',
    });
  }

  /**
   * Record error metric
   */
  recordError(errorType: string, context?: Record<string, any>): void {
    this.businessMetrics.errors.total++;
    this.businessMetrics.errors.byType[errorType] =
      (this.businessMetrics.errors.byType[errorType] || 0) + 1;

    this.recordMetric({
      name: 'error.occurred',
      value: 1,
      tags: {
        errorType,
        ...context,
      },
      timestamp: Date.now(),
      unit: 'count',
    });
  }

  /**
   * Record user activity
   */
  recordUserActivity(activeUsers: number, sessionCount: number): void {
    this.businessMetrics.users.active = activeUsers;
    this.businessMetrics.users.sessions = sessionCount;

    this.recordMetric({
      name: 'users.active',
      value: activeUsers,
      timestamp: Date.now(),
      unit: 'count',
    });

    this.recordMetric({
      name: 'users.sessions',
      value: sessionCount,
      timestamp: Date.now(),
      unit: 'count',
    });
  }

  /**
   * Set KPI value
   */
  setKPI(name: string, value: number, target: number, threshold: number, unit: string): void {
    const status = this.calculateKPIStatus(value, target, threshold);

    const kpi: KPIData = {
      name,
      value,
      target,
      threshold,
      status,
      unit,
      timestamp: new Date().toISOString(),
    };

    this.kpis.set(name, kpi);

    this.recordMetric({
      name: `kpi.${name}`,
      value,
      tags: {
        target,
        threshold,
        status,
      },
      timestamp: Date.now(),
      unit,
    });
  }

  /**
   * Get KPI by name
   */
  getKPI(name: string): KPIData | undefined {
    return this.kpis.get(name);
  }

  /**
   * Get all KPIs
   */
  getAllKPIs(): KPIData[] {
    return Array.from(this.kpis.values());
  }

  /**
   * Calculate KPI status
   */
  private calculateKPIStatus(
    value: number,
    target: number,
    threshold: number
  ): 'healthy' | 'warning' | 'critical' {
    const deviation = Math.abs(value - target) / target;

    if (deviation > threshold) {
      return 'critical';
    } else if (deviation > threshold * 0.5) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Update aggregated metric
   */
  private updateAggregatedMetric(metric: Metric): void {
    const existing = this.aggregatedMetrics.get(metric.name) || {
      name: metric.name,
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      avg: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      lastUpdated: new Date().toISOString(),
    };

    existing.count++;
    existing.sum += metric.value;
    existing.min = Math.min(existing.min, metric.value);
    existing.max = Math.max(existing.max, metric.value);
    existing.avg = existing.sum / existing.count;
    existing.lastUpdated = new Date().toISOString();

    // Calculate percentiles based on recent metrics
    const recentMetrics = this.metrics
      .filter((m) => m.name === metric.name)
      .slice(-100)
      .map((m) => m.value)
      .sort((a, b) => a - b);

    if (recentMetrics.length > 0) {
      existing.p50 = recentMetrics[Math.floor(recentMetrics.length * 0.5)];
      existing.p95 = recentMetrics[Math.floor(recentMetrics.length * 0.95)];
      existing.p99 = recentMetrics[Math.floor(recentMetrics.length * 0.99)];
    }

    this.aggregatedMetrics.set(metric.name, existing);
  }

  /**
   * Track latency by type
   */
  private trackLatency(type: string, value: number): void {
    const latencies = this.latencyByType.get(type) || [];
    latencies.push(value);

    // Keep only last 100 latencies per type
    if (latencies.length > 100) {
      latencies.shift();
    }

    this.latencyByType.set(type, latencies);
  }

  /**
   * Get average latency by type
   */
  getAverageLatency(type: string): number | undefined {
    const latencies = this.latencyByType.get(type);
    if (!latencies || latencies.length === 0) return undefined;

    const sum = latencies.reduce((a, b) => a + b, 0);
    return sum / latencies.length;
  }

  /**
   * Get aggregated metric
   */
  getAggregatedMetric(name: string): AggregatedMetric | undefined {
    return this.aggregatedMetrics.get(name);
  }

  /**
   * Get all aggregated metrics
   */
  getAllAggregatedMetrics(): AggregatedMetric[] {
    return Array.from(this.aggregatedMetrics.values());
  }

  /**
   * Get business metrics
   */
  getBusinessMetrics(): BusinessMetrics {
    return { ...this.businessMetrics };
  }

  /**
   * Flush metrics (for batch sending)
   */
  flush(): Metric[] {
    const toReturn = [...this.metrics];
    this.metrics = [];
    return toReturn;
  }

  /**
   * Export metrics
   */
  exportMetrics(options: ExportOptions = { format: 'json' }): string {
    try {
      let metricsToExport = this.metrics;

      // Filter by time range
      if (options.startTime) {
        metricsToExport = metricsToExport.filter((m) => m.timestamp >= options.startTime!);
      }
      if (options.endTime) {
        metricsToExport = metricsToExport.filter((m) => m.timestamp <= options.endTime!);
      }

      // Filter by metric names
      if (options.metrics && options.metrics.length > 0) {
        metricsToExport = metricsToExport.filter((m) => options.metrics!.includes(m.name));
      }

      if (options.format === 'csv') {
        return this.exportAsCSV(metricsToExport);
      } else {
        return JSON.stringify(
          {
            exportDate: new Date().toISOString(),
            count: metricsToExport.length,
            metrics: metricsToExport,
            aggregated: Object.fromEntries(this.aggregatedMetrics),
            business: this.businessMetrics,
          },
          null,
          2
        );
      }
    } catch (error) {
      logger.error('Failed to export metrics', error, 'Metrics');
      throw error;
    }
  }

  /**
   * Export metrics as CSV
   */
  private exportAsCSV(metrics: Metric[]): string {
    const headers = ['timestamp', 'name', 'value', 'unit', 'tags'];
    const rows = metrics.map((m) => [
      new Date(m.timestamp).toISOString(),
      m.name,
      m.value,
      m.unit || 'none',
      m.tags ? JSON.stringify(m.tags) : '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  }

  /**
   * Clear old metrics
   */
  clearOldMetrics(retentionMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - retentionMs;
    const before = this.metrics.length;

    this.metrics = this.metrics.filter((m) => m.timestamp > cutoffTime);

    logger.info(`Cleared ${before - this.metrics.length} old metrics`);
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = [];
    this.aggregatedMetrics.clear();
    this.kpis.clear();
    this.latencyByType.clear();
    this.businessMetrics = {
      uploads: { total: 0, successful: 0, failed: 0, averageSize: 0, averageDuration: 0 },
      syncs: { total: 0, successful: 0, failed: 0, averageDuration: 0 },
      errors: { total: 0, byType: {}, rate: 0 },
      users: { active: 0, sessions: 0, averageSessionDuration: 0 },
    };
  }

  /**
   * Load metrics from storage
   */
  private async loadMetricsFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(METRICS_STORAGE_KEY);
      if (stored) {
        this.metrics = JSON.parse(stored);
      }
    } catch (error) {
      logger.error('Failed to load metrics', error, 'Metrics');
    }
  }

  /**
   * Load KPIs from storage
   */
  private async loadKPIsFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(KPI_STORAGE_KEY);
      if (stored) {
        const kpis = JSON.parse(stored);
        this.kpis = new Map(Object.entries(kpis));
      }
    } catch (error) {
      logger.error('Failed to load KPIs', error, 'Metrics');
    }
  }

  /**
   * Load business metrics from storage
   */
  private async loadBusinessMetricsFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(BUSINESS_METRICS_KEY);
      if (stored) {
        this.businessMetrics = JSON.parse(stored);
      }
    } catch (error) {
      logger.error('Failed to load business metrics', error, 'Metrics');
    }
  }

  /**
   * Persist metrics (async)
   */
  private async persistMetricsAsync(): Promise<void> {
    try {
      await AsyncStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(this.metrics));
      await AsyncStorage.setItem(
        KPI_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(this.kpis))
      );
      await AsyncStorage.setItem(BUSINESS_METRICS_KEY, JSON.stringify(this.businessMetrics));
    } catch (error) {
      logger.warn('Failed to persist metrics', {}, 'Metrics');
    }
  }
}

export const metricsCollector = new MetricsCollector();
