import { logger } from '@utils/logger';

export interface MetricPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface Alert {
  id: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'critical';
  type: string;
  message: string;
  metadata?: Record<string, any>;
  resolved?: boolean;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: Date;
  checks: {
    cacheHealth: boolean;
    rateLimitHealth: boolean;
    abTestingHealth: boolean;
    optimizationHealth: boolean;
  };
  metrics: {
    avgLatency: number;
    errorRate: number;
    successRate: number;
    costPerRequest: number;
  };
}

export interface PerformanceMetrics {
  requestCount: number;
  totalLatency: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  errorCount: number;
  successCount: number;
  successRate: number;
  costTracker: {
    totalCost: number;
    averageCostPerRequest: number;
    costByProvider: Record<string, number>;
  };
}

// ============================================================================
// MONITORING SERVICE
// ============================================================================
export class MonitoringService {
  private metrics: Map<string, MetricPoint[]> = new Map();
  private alerts: Alert[] = [];
  private readonly MAX_METRICS_RETENTION = 1000; // Max points per metric
  private readonly ALERT_RETENTION = 500; // Max alerts to keep
  private performanceMetrics: PerformanceMetrics = {
    requestCount: 0,
    totalLatency: 0,
    averageLatency: 0,
    minLatency: Infinity,
    maxLatency: 0,
    errorCount: 0,
    successCount: 0,
    successRate: 0,
    costTracker: {
      totalCost: 0,
      averageCostPerRequest: 0,
      costByProvider: {},
    },
  };

  /**
   * Track request performance
   */
  trackRequest(
    taskType: string,
    latency: number,
    success: boolean,
    cost: number,
    provider: string
  ): void {
    // Update performance metrics
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalLatency += latency;
    this.performanceMetrics.minLatency = Math.min(this.performanceMetrics.minLatency, latency);
    this.performanceMetrics.maxLatency = Math.max(this.performanceMetrics.maxLatency, latency);

    if (success) {
      this.performanceMetrics.successCount++;
    } else {
      this.performanceMetrics.errorCount++;
    }

    this.performanceMetrics.averageLatency =
      this.performanceMetrics.totalLatency / this.performanceMetrics.requestCount;
    this.performanceMetrics.successRate =
      this.performanceMetrics.successCount / this.performanceMetrics.requestCount;

    // Track cost
    this.performanceMetrics.costTracker.totalCost += cost;
    this.performanceMetrics.costTracker.averageCostPerRequest =
      this.performanceMetrics.costTracker.totalCost / this.performanceMetrics.requestCount;

    if (!this.performanceMetrics.costTracker.costByProvider[provider]) {
      this.performanceMetrics.costTracker.costByProvider[provider] = 0;
    }
    this.performanceMetrics.costTracker.costByProvider[provider] += cost;

    // Record metric
    this.recordMetric(`latency:${taskType}`, latency);

    // Check for anomalies
    if (latency > this.performanceMetrics.averageLatency * 2) {
      this.createAlert('latency_spike', {
        severity: 'warning',
        message: `High latency detected for ${taskType}: ${latency}ms (avg: ${Math.round(this.performanceMetrics.averageLatency)}ms)`,
        metadata: { taskType, latency, provider },
      });
    }

    if (!success) {
      this.recordMetric(`errors:${taskType}`, 1);
      if (this.performanceMetrics.successRate < 0.9) {
        this.createAlert('high_error_rate', {
          severity: 'warning',
          message: `High error rate detected: ${((1 - this.performanceMetrics.successRate) * 100).toFixed(1)}%`,
          metadata: { errorRate: 1 - this.performanceMetrics.successRate },
        });
      }
    }
  }

  /**
   * Record a metric value
   */
  recordMetric(metricName: string, value: number, label?: string): void {
    if (!this.metrics.has(metricName)) {
      this.metrics.set(metricName, []);
    }

    const points = this.metrics.get(metricName)!;
    points.push({
      timestamp: new Date(),
      value,
      label,
    });

    // Enforce retention limit
    if (points.length > this.MAX_METRICS_RETENTION) {
      points.shift();
    }
  }

  /**
   * Get metrics for a specific name
   */
  getMetrics(metricName: string): MetricPoint[] {
    return this.metrics.get(metricName) || [];
  }

  /**
   * Get all metrics names
   */
  getAllMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Create alert
   */
  private createAlert(type: string, options: { severity: string; message: string; metadata?: any }): void {
    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      severity: options.severity as 'info' | 'warning' | 'critical',
      type,
      message: options.message,
      metadata: options.metadata,
      resolved: false,
    };

    this.alerts.push(alert);

    // Enforce retention limit
    if (this.alerts.length > this.ALERT_RETENTION) {
      this.alerts.shift();
    }

    logger.warn({ alert }, `Alert created: ${type}`);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter((a) => !a.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): Alert[] {
    return this.alerts;
  }

  /**
   * Get alerts by type
   */
  getAlertsByType(type: string): Alert[] {
    return this.alerts.filter((a) => a.type === type);
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: 'info' | 'warning' | 'critical'): Alert[] {
    return this.alerts.filter((a) => a.severity === severity);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Perform health check
   */
  getHealthCheck(): HealthCheck {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter((a) => a.severity === 'critical').length;
    const warningAlerts = activeAlerts.filter((a) => a.severity === 'warning').length;

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (criticalAlerts > 0) {
      status = 'critical';
    } else if (warningAlerts > 3 || this.performanceMetrics.successRate < 0.95) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date(),
      checks: {
        cacheHealth: warningAlerts < 2,
        rateLimitHealth: this.getAlertsBySeverity('critical').length === 0,
        abTestingHealth: this.performanceMetrics.successRate > 0.8,
        optimizationHealth: !this.getAlertsByType('optimization_failure')[0],
      },
      metrics: {
        avgLatency: Math.round(this.performanceMetrics.averageLatency),
        errorRate: 1 - this.performanceMetrics.successRate,
        successRate: this.performanceMetrics.successRate,
        costPerRequest: this.performanceMetrics.costTracker.averageCostPerRequest,
      },
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get metric statistics
   */
  getMetricStats(metricName: string): {
    min: number;
    max: number;
    avg: number;
    count: number;
    latest: number | null;
  } | null {
    const points = this.metrics.get(metricName);
    if (!points || points.length === 0) {
      return null;
    }

    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const latest = values[values.length - 1] || null;

    return { min, max, avg, count: values.length, latest };
  }

  /**
   * Get dashboard data
   */
  getDashboardData() {
    return {
      health: this.getHealthCheck(),
      performance: this.getPerformanceSummary(),
      activeAlerts: this.getActiveAlerts(),
      metrics: {
        latency: this.getMetricStats('latency:analyze'),
        errorRate: this.getMetricStats('errors:analyze'),
        costPerRequest: this.performanceMetrics.costTracker.averageCostPerRequest,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clear old data
   */
  clearOldData(olderThanMinutes: number = 60): number {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - olderThanMinutes);

    let removed = 0;

    // Clear old metric points
    for (const points of this.metrics.values()) {
      const beforeLength = points.length;
      const filtered = points.filter((p) => p.timestamp > cutoffTime);
      removed += beforeLength - filtered.length;
    }

    // Clear old alerts
    const beforeAlerts = this.alerts.length;
    this.alerts = this.alerts.filter(
      (a) => a.timestamp > cutoffTime || !a.resolved
    );
    removed += beforeAlerts - this.alerts.length;

    logger.info(`Cleared ${removed} old monitoring data points`);
    return removed;
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset(): void {
    this.metrics.clear();
    this.alerts = [];
    this.performanceMetrics = {
      requestCount: 0,
      totalLatency: 0,
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      errorCount: 0,
      successCount: 0,
      successRate: 0,
      costTracker: {
        totalCost: 0,
        averageCostPerRequest: 0,
        costByProvider: {},
      },
    };
    logger.info('Monitoring metrics reset');
  }
}

export const monitoringService = new MonitoringService();
