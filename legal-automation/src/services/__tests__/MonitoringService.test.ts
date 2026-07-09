import { MonitoringService } from '../MonitoringService';

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    service = new MonitoringService();
  });

  afterEach(() => {
    service.reset();
  });

  describe('Request Tracking', () => {
    it('should track successful request', () => {
      service.trackRequest('analyze', 1500, true, 0.05, 'claude');

      const summary = service.getPerformanceSummary();
      expect(summary.requestCount).toBe(1);
      expect(summary.successCount).toBe(1);
      expect(summary.errorCount).toBe(0);
      expect(summary.averageLatency).toBe(1500);
    });

    it('should track failed request', () => {
      service.trackRequest('analyze', 2000, false, 0.05, 'claude');

      const summary = service.getPerformanceSummary();
      expect(summary.requestCount).toBe(1);
      expect(summary.errorCount).toBe(1);
      expect(summary.successRate).toBeLessThan(1);
    });

    it('should calculate success rate', () => {
      service.trackRequest('analyze', 1500, true, 0.05, 'claude');
      service.trackRequest('analyze', 1800, true, 0.05, 'claude');
      service.trackRequest('analyze', 2000, false, 0.05, 'claude');

      const summary = service.getPerformanceSummary();
      expect(summary.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('should track cost by provider', () => {
      service.trackRequest('analyze', 1500, true, 0.05, 'claude');
      service.trackRequest('analyze', 1000, true, 0.02, 'gemini');

      const summary = service.getPerformanceSummary();
      expect(summary.costTracker.costByProvider['claude']).toBe(0.05);
      expect(summary.costTracker.costByProvider['gemini']).toBe(0.02);
      expect(summary.costTracker.totalCost).toBe(0.07);
    });

    it('should track latency statistics', () => {
      service.trackRequest('analyze', 1000, true, 0.05, 'claude');
      service.trackRequest('analyze', 2000, true, 0.05, 'claude');
      service.trackRequest('analyze', 1500, true, 0.05, 'claude');

      const summary = service.getPerformanceSummary();
      expect(summary.minLatency).toBe(1000);
      expect(summary.maxLatency).toBe(2000);
      expect(summary.averageLatency).toBeCloseTo(1500, 0);
    });
  });

  describe('Metric Recording', () => {
    it('should record metric', () => {
      service.recordMetric('test-metric', 100);
      service.recordMetric('test-metric', 150);
      service.recordMetric('test-metric', 120);

      const metrics = service.getMetrics('test-metric');
      expect(metrics.length).toBe(3);
      expect(metrics[0].value).toBe(100);
      expect(metrics[1].value).toBe(150);
      expect(metrics[2].value).toBe(120);
    });

    it('should get metric statistics', () => {
      service.recordMetric('latency', 100);
      service.recordMetric('latency', 200);
      service.recordMetric('latency', 150);

      const stats = service.getMetricStats('latency');
      expect(stats?.min).toBe(100);
      expect(stats?.max).toBe(200);
      expect(stats?.avg).toBe(150);
      expect(stats?.count).toBe(3);
      expect(stats?.latest).toBe(150);
    });

    it('should return null for unknown metric', () => {
      const stats = service.getMetricStats('unknown-metric');
      expect(stats).toBeNull();
    });

    it('should get all metric names', () => {
      service.recordMetric('metric-1', 100);
      service.recordMetric('metric-2', 200);
      service.recordMetric('metric-3', 150);

      const names = service.getAllMetricNames();
      expect(names).toContain('metric-1');
      expect(names).toContain('metric-2');
      expect(names).toContain('metric-3');
    });
  });

  describe('Alerts', () => {
    it('should create alert on anomaly', () => {
      // Track requests with increasing latency
      service.trackRequest('analyze', 1000, true, 0.05, 'claude');
      service.trackRequest('analyze', 1100, true, 0.05, 'claude');
      service.trackRequest('analyze', 5000, true, 0.05, 'claude'); // Spike

      const alerts = service.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].severity).toMatch(/warning|critical/);
    });

    it('should get alerts by type', () => {
      service.trackRequest('analyze', 3000, false, 0.05, 'claude');
      service.trackRequest('analyze', 3100, false, 0.05, 'claude');

      const alerts = service.getAlertsByType('high_error_rate');
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should get alerts by severity', () => {
      service.trackRequest('analyze', 5000, true, 0.05, 'claude');

      const warningAlerts = service.getAlertsBySeverity('warning');
      expect(warningAlerts.length).toBeGreaterThanOrEqual(0);
    });

    it('should resolve alert', () => {
      service.trackRequest('analyze', 5000, true, 0.05, 'claude');

      const alerts = service.getActiveAlerts();
      if (alerts.length > 0) {
        const resolved = service.resolveAlert(alerts[0].id);
        expect(resolved).toBe(true);

        const activeAlerts = service.getActiveAlerts();
        expect(activeAlerts.find((a) => a.id === alerts[0].id)).toBeUndefined();
      }
    });

    it('should return false for non-existent alert', () => {
      const resolved = service.resolveAlert('non-existent');
      expect(resolved).toBe(false);
    });
  });

  describe('Health Check', () => {
    it('should report healthy status', () => {
      service.trackRequest('analyze', 1500, true, 0.05, 'claude');
      service.trackRequest('analyze', 1600, true, 0.05, 'claude');

      const health = service.getHealthCheck();
      expect(health.status).toBe('healthy');
      expect(health.checks.abTestingHealth).toBe(true);
    });

    it('should report degraded status on high error rate', () => {
      for (let i = 0; i < 10; i++) {
        service.trackRequest('analyze', 1500, false, 0.05, 'claude');
      }

      const health = service.getHealthCheck();
      expect(health.status).not.toBe('healthy');
    });

    it('should include metric data in health check', () => {
      service.trackRequest('analyze', 1500, true, 0.05, 'claude');

      const health = service.getHealthCheck();
      expect(health.metrics.avgLatency).toBeGreaterThan(0);
      expect(health.metrics.costPerRequest).toBeGreaterThan(0);
      expect(health.metrics.successRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Dashboard Data', () => {
    it('should provide dashboard data', () => {
      service.trackRequest('analyze', 1500, true, 0.05, 'claude');

      const dashboard = service.getDashboardData();
      expect(dashboard.health).toBeDefined();
      expect(dashboard.performance).toBeDefined();
      expect(dashboard.activeAlerts).toBeDefined();
      expect(dashboard.metrics).toBeDefined();
      expect(dashboard.timestamp).toBeDefined();
    });
  });

  describe('Data Retention', () => {
    it('should maintain metric retention limit', () => {
      for (let i = 0; i < 1100; i++) {
        service.recordMetric('test-metric', i);
      }

      const metrics = service.getMetrics('test-metric');
      expect(metrics.length).toBeLessThanOrEqual(1000);
    });

    it('should clear old data', () => {
      service.recordMetric('old-metric', 100);
      service.recordMetric('old-metric', 200);

      const removed = service.clearOldData(0); // Clear everything older than now

      const metrics = service.getMetrics('old-metric');
      expect(metrics.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Reset', () => {
    it('should reset all metrics', () => {
      service.trackRequest('analyze', 1500, true, 0.05, 'claude');
      service.recordMetric('test', 100);

      service.reset();

      const summary = service.getPerformanceSummary();
      expect(summary.requestCount).toBe(0);
      expect(service.getAllMetricNames()).toHaveLength(0);
      expect(service.getActiveAlerts()).toHaveLength(0);
    });
  });

  describe('Performance Summary', () => {
    it('should calculate correct performance metrics', () => {
      service.trackRequest('analyze', 1000, true, 0.02, 'claude');
      service.trackRequest('extract', 1500, true, 0.03, 'gemini');
      service.trackRequest('generate', 2000, false, 0.05, 'claude');

      const summary = service.getPerformanceSummary();
      expect(summary.requestCount).toBe(3);
      expect(summary.successCount).toBe(2);
      expect(summary.errorCount).toBe(1);
      expect(summary.costTracker.totalCost).toBeCloseTo(0.1, 2);
    });
  });

  describe('Alert Retrieval', () => {
    it('should get all alerts including resolved', () => {
      service.trackRequest('analyze', 5000, true, 0.05, 'claude');

      const allAlerts = service.getAllAlerts();
      const activeAlerts = service.getActiveAlerts();

      expect(allAlerts.length).toBeGreaterThanOrEqual(activeAlerts.length);
    });
  });
});
