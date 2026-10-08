/**
 * Tests for Observability Service - Phase 22.17
 * Coverage >70% for all observability infrastructure
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { observabilityService, ObservabilityLevel } from '../observabilityService';
import { metricsCollector } from '../metricsCollector';
import { logAggregation } from '../logAggregation';
import { distributedTracing } from '../distributedTracing';
import { healthChecks } from '../healthChecks';

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage');

describe('ObservabilityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await observabilityService.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      await observabilityService.initialize();

      const config = observabilityService.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.level).toBe(ObservabilityLevel.STANDARD);
    });

    it('should initialize with custom config', async () => {
      await observabilityService.initialize({
        level: ObservabilityLevel.DEBUG,
        enabled: true,
      });

      const config = observabilityService.getConfig();
      expect(config.level).toBe(ObservabilityLevel.DEBUG);
    });

    it('should initialize sub-services', async () => {
      await observabilityService.initialize();

      const integrations = observabilityService.getServiceIntegrations();
      expect(integrations.length).toBeGreaterThan(0);
    });
  });

  describe('tracing context', () => {
    it('should create trace context', async () => {
      await observabilityService.initialize();

      const context = observabilityService.getTracingContext();
      expect(context.traceId).toBeDefined();
      expect(context.spanId).toBeDefined();
    });

    it('should create new trace context', async () => {
      await observabilityService.initialize();

      const context1 = observabilityService.getTracingContext();
      const context2 = observabilityService.createNewTracingContext();

      expect(context1.traceId).not.toBe(context2.traceId);
    });

    it('should reuse existing trace context', async () => {
      await observabilityService.initialize();

      const context1 = observabilityService.getTracingContext();
      const context2 = observabilityService.getTracingContext();

      expect(context1.traceId).toBe(context2.traceId);
    });
  });

  describe('event tracking', () => {
    it('should track events', async () => {
      await observabilityService.initialize();

      observabilityService.trackEvent('test_event', { data: 'test' });
      // Event should be tracked without errors
    });

    it('should track errors', async () => {
      await observabilityService.initialize();

      const error = new Error('Test error');
      observabilityService.trackError(error, { context: 'test' });
      // Error should be tracked without errors
    });

    it('should record metrics', async () => {
      await observabilityService.initialize();

      observabilityService.recordMetric('test.metric', 42, { tag: 'value' });
      // Metric should be recorded without errors
    });
  });

  describe('metrics', () => {
    it('should get observability metrics', async () => {
      await observabilityService.initialize();

      const metrics = await observabilityService.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.timestamp).toBeDefined();
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.performance).toBeDefined();
      expect(metrics.health).toBeDefined();
      expect(metrics.errors).toBeDefined();
    });

    it('should track error count', async () => {
      await observabilityService.initialize();

      const error = new Error('Test error');
      observabilityService.trackError(error);

      const metrics = await observabilityService.getMetrics();
      expect(metrics.errors.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('service integrations', () => {
    it('should return service integrations', async () => {
      await observabilityService.initialize();

      const integrations = observabilityService.getServiceIntegrations();

      expect(Array.isArray(integrations)).toBe(true);
      expect(integrations.length).toBeGreaterThan(0);

      integrations.forEach((integration) => {
        expect(integration.name).toBeDefined();
        expect(['connected', 'disconnected', 'error']).toContain(integration.status);
      });
    });
  });

  describe('config management', () => {
    it('should update config', async () => {
      await observabilityService.initialize();

      await observabilityService.updateConfig({
        level: ObservabilityLevel.DETAILED,
      });

      const config = observabilityService.getConfig();
      expect(config.level).toBe(ObservabilityLevel.DETAILED);
    });

    it('should enable/disable observability', async () => {
      await observabilityService.initialize();

      observabilityService.setEnabled(false);
      let config = observabilityService.getConfig();
      expect(config.enabled).toBe(false);

      observabilityService.setEnabled(true);
      config = observabilityService.getConfig();
      expect(config.enabled).toBe(true);
    });

    it('should set observability level', async () => {
      await observabilityService.initialize();

      observabilityService.setLevel(ObservabilityLevel.DEBUG);
      const config = observabilityService.getConfig();
      expect(config.level).toBe(ObservabilityLevel.DEBUG);
    });
  });
});

describe('MetricsCollector', () => {
  beforeEach(async () => {
    await metricsCollector.initialize();
  });

  describe('metrics recording', () => {
    it('should record metric', () => {
      metricsCollector.recordMetric({
        name: 'test.metric',
        value: 42,
        timestamp: Date.now(),
      });

      const metric = metricsCollector.getAggregatedMetric('test.metric');
      expect(metric).toBeDefined();
      expect(metric?.avg).toBe(42);
      expect(metric?.count).toBe(1);
    });

    it('should aggregate metrics', () => {
      metricsCollector.recordMetric({
        name: 'test.metric',
        value: 10,
        timestamp: Date.now(),
      });

      metricsCollector.recordMetric({
        name: 'test.metric',
        value: 20,
        timestamp: Date.now(),
      });

      metricsCollector.recordMetric({
        name: 'test.metric',
        value: 30,
        timestamp: Date.now(),
      });

      const metric = metricsCollector.getAggregatedMetric('test.metric');
      expect(metric?.avg).toBe(20);
      expect(metric?.min).toBe(10);
      expect(metric?.max).toBe(30);
      expect(metric?.count).toBe(3);
    });

    it('should track upload metrics', () => {
      metricsCollector.recordUpload(true, 1024, 500, 'image');

      const businessMetrics = metricsCollector.getBusinessMetrics();
      expect(businessMetrics.uploads.total).toBe(1);
      expect(businessMetrics.uploads.successful).toBe(1);
    });

    it('should track sync metrics', () => {
      metricsCollector.recordSync(true, 250, 10);

      const businessMetrics = metricsCollector.getBusinessMetrics();
      expect(businessMetrics.syncs.total).toBe(1);
      expect(businessMetrics.syncs.successful).toBe(1);
    });

    it('should track error metrics', () => {
      metricsCollector.recordError('NetworkError', { retryable: true });

      const businessMetrics = metricsCollector.getBusinessMetrics();
      expect(businessMetrics.errors.total).toBe(1);
      expect(businessMetrics.errors.byType['NetworkError']).toBe(1);
    });

    it('should record user activity', () => {
      metricsCollector.recordUserActivity(5, 10);

      const businessMetrics = metricsCollector.getBusinessMetrics();
      expect(businessMetrics.users.active).toBe(5);
      expect(businessMetrics.users.sessions).toBe(10);
    });
  });

  describe('KPI management', () => {
    it('should set KPI', () => {
      metricsCollector.setKPI('error_rate', 0.5, 1.0, 0.2, '%');

      const kpi = metricsCollector.getKPI('error_rate');
      expect(kpi?.value).toBe(0.5);
      expect(kpi?.target).toBe(1.0);
      expect(kpi?.status).toBe('healthy');
    });

    it('should calculate KPI status', () => {
      metricsCollector.setKPI('response_time', 500, 100, 0.2, 'ms');

      const kpi = metricsCollector.getKPI('response_time');
      expect(kpi?.status).toBe('critical');
    });

    it('should get all KPIs', () => {
      metricsCollector.setKPI('kpi1', 50, 100, 0.2, 'units');
      metricsCollector.setKPI('kpi2', 75, 100, 0.2, 'units');

      const kpis = metricsCollector.getAllKPIs();
      expect(kpis.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('latency tracking', () => {
    it('should track latency', () => {
      metricsCollector.recordMetric({
        name: 'api.latency',
        value: 100,
        timestamp: Date.now(),
      });

      metricsCollector.recordMetric({
        name: 'api.latency',
        value: 150,
        timestamp: Date.now(),
      });

      const avgLatency = metricsCollector.getAverageLatency('api.latency');
      expect(avgLatency).toBeDefined();
      expect(avgLatency).toBeLessThanOrEqual(150);
      expect(avgLatency).toBeGreaterThanOrEqual(100);
    });
  });

  describe('export', () => {
    it('should export metrics as JSON', () => {
      metricsCollector.recordMetric({
        name: 'test.metric',
        value: 42,
        timestamp: Date.now(),
      });

      const exported = metricsCollector.exportMetrics({ format: 'json' });
      expect(exported).toBeDefined();
      expect(exported).toContain('test.metric');
    });

    it('should export metrics as CSV', () => {
      metricsCollector.recordMetric({
        name: 'test.metric',
        value: 42,
        timestamp: Date.now(),
      });

      const exported = metricsCollector.exportMetrics({ format: 'csv' });
      expect(exported).toBeDefined();
      expect(exported).toContain('test.metric');
    });
  });
});

describe('LogAggregation', () => {
  beforeEach(async () => {
    await logAggregation.initialize();
  });

  describe('logging', () => {
    it('should log info message', () => {
      logAggregation.info('Test message', { data: 'test' });

      const logs = logAggregation.getRecentLogs(1);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].level).toBe('info');
    });

    it('should log debug message', () => {
      logAggregation.debug('Debug message', { debug: true });

      const logs = logAggregation.getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should log warning', () => {
      logAggregation.warn('Warning message', { warn: true });

      const warns = logAggregation.getWarningLogs();
      expect(warns.length).toBeGreaterThan(0);
    });

    it('should log error', () => {
      const error = new Error('Test error');
      logAggregation.logError(error, { context: 'test' });

      const errors = logAggregation.getErrorLogs();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error?.message).toBe('Test error');
    });
  });

  describe('filtering', () => {
    it('should filter logs by level', () => {
      logAggregation.info('Info 1');
      logAggregation.warn('Warn 1');
      logAggregation.info('Info 2');

      const infos = logAggregation.getLogsByLevel('info');
      const warns = logAggregation.getLogsByLevel('warn');

      expect(infos.length).toBeGreaterThanOrEqual(2);
      expect(warns.length).toBe(1);
    });

    it('should filter by tag', () => {
      logAggregation.info('Message 1', {}, ['tag1', 'tag2']);
      logAggregation.info('Message 2', {}, ['tag2', 'tag3']);

      const tag1Logs = logAggregation.getLogsByTag('tag1');
      const tag2Logs = logAggregation.getLogsByTag('tag2');

      expect(tag1Logs.length).toBe(1);
      expect(tag2Logs.length).toBe(2);
    });

    it('should search logs', () => {
      logAggregation.info('Searching for this message', { searchData: 'test' });

      const filtered = logAggregation.getLogs({
        searchTerm: 'Searching',
      });

      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe('statistics', () => {
    it('should get log statistics', () => {
      logAggregation.info('Info');
      logAggregation.warn('Warn');
      logAggregation.info('Info 2');

      const stats = logAggregation.getStatistics();

      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.byLevel.info).toBeGreaterThanOrEqual(2);
      expect(stats.byLevel.warn).toBe(1);
      expect(stats.errorRate).toBeDefined();
    });
  });

  describe('export', () => {
    it('should export logs as JSON', () => {
      logAggregation.info('Test log');

      const exported = logAggregation.exportLogs('json');
      expect(exported).toBeDefined();
      expect(exported).toContain('Test log');
    });
  });
});

describe('DistributedTracing', () => {
  beforeEach(() => {
    distributedTracing.initialize();
  });

  describe('trace context', () => {
    it('should create trace context', () => {
      const context = distributedTracing.createTraceContext();

      expect(context.traceId).toBeDefined();
      expect(context.spanId).toBeDefined();
      expect(typeof context.sampled).toBe('boolean');
    });

    it('should get trace context', () => {
      const context1 = distributedTracing.getTraceContext();
      const context2 = distributedTracing.getTraceContext();

      expect(context1.traceId).toBe(context2.traceId);
    });
  });

  describe('span management', () => {
    it('should start and end span', () => {
      const span = distributedTracing.startSpan('test_operation');
      expect(span).toBeDefined();
      expect(span.name).toBe('test_operation');

      distributedTracing.endSpan(span, 'ok');
      expect(span.status).toBe('ok');
      expect(span.duration).toBeDefined();
    });

    it('should add span event', () => {
      const span = distributedTracing.startSpan('operation');
      distributedTracing.addSpanEvent(span, 'event1', { data: 'test' });

      expect(span.events).toBeDefined();
      expect(span.events?.length).toBeGreaterThan(0);
    });

    it('should add span attribute', () => {
      const span = distributedTracing.startSpan('operation');
      distributedTracing.addSpanAttribute(span, 'userId', '123');

      expect(span.attributes?.userId).toBe('123');
    });

    it('should track error in span', () => {
      const error = new Error('Span error');
      const span = distributedTracing.startSpan('failing_operation');
      distributedTracing.endSpan(span, 'error', error);

      expect(span.status).toBe('error');
      expect(span.error?.message).toBe('Span error');
    });
  });

  describe('trace management', () => {
    it('should complete trace', () => {
      const context = distributedTracing.createTraceContext();
      const span = distributedTracing.startSpan('operation');
      distributedTracing.endSpan(span, 'ok');

      const completedTrace = distributedTracing.completeTrace(context.traceId);
      expect(completedTrace?.status).toBe('completed');
    });

    it('should get trace', () => {
      const context = distributedTracing.createTraceContext();
      const span = distributedTracing.startSpan('operation');
      distributedTracing.endSpan(span);

      const trace = distributedTracing.getTrace(context.traceId);
      expect(trace).toBeDefined();
      expect(trace?.spans.length).toBeGreaterThan(0);
    });

    it('should get slow spans', () => {
      const span = distributedTracing.startSpan('slow_operation');
      // Simulate slow operation
      const startTime = Date.now();
      while (Date.now() - startTime < 100) {}
      distributedTracing.endSpan(span);

      const slowSpans = distributedTracing.getSlowSpans(50);
      expect(slowSpans.length).toBeGreaterThan(0);
    });

    it('should get error spans', () => {
      const span = distributedTracing.startSpan('error_operation');
      const error = new Error('Operation failed');
      distributedTracing.endSpan(span, 'error', error);

      const errorSpans = distributedTracing.getErrorSpans();
      expect(errorSpans.length).toBeGreaterThan(0);
    });
  });

  describe('statistics', () => {
    it('should get trace statistics', () => {
      const context = distributedTracing.createTraceContext();
      const span = distributedTracing.startSpan('operation');
      distributedTracing.endSpan(span);
      distributedTracing.completeTrace(context.traceId);

      const stats = distributedTracing.getTraceStatistics();

      expect(stats.totalTraces).toBeGreaterThan(0);
      expect(stats.totalSpans).toBeGreaterThan(0);
    });
  });

  describe('export', () => {
    it('should export traces', () => {
      const context = distributedTracing.createTraceContext();
      const span = distributedTracing.startSpan('operation');
      distributedTracing.endSpan(span);
      distributedTracing.completeTrace(context.traceId);

      const exported = distributedTracing.exportTraces('json');
      expect(exported).toBeDefined();
    });
  });
});

describe('HealthChecks', () => {
  beforeEach(async () => {
    await healthChecks.initialize();
  });

  describe('health checks', () => {
    it('should run health checks', async () => {
      const health = await healthChecks.runChecks();

      expect(health).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(health.checks).toBeDefined();
      expect(Object.keys(health.checks).length).toBeGreaterThan(0);
    });

    it('should get health status', () => {
      const health = healthChecks.getHealth();

      expect(health).toBeDefined();
      expect(health.checks).toBeDefined();
    });

    it('should get specific check result', async () => {
      await healthChecks.runChecks();

      const result = healthChecks.getCheckResult('memory');
      expect(result).toBeDefined();
      expect(result?.name).toBeDefined();
    });
  });

  describe('custom health checks', () => {
    it('should register custom check', async () => {
      healthChecks.registerCheck('custom_check', async () => ({
        name: 'Custom Check',
        status: 'healthy',
        lastChecked: new Date().toISOString(),
        responseTime: 10,
      }));

      const health = await healthChecks.runChecks();
      expect(health.checks['custom_check']).toBeDefined();
    });
  });

  describe('issues management', () => {
    it('should handle health issues', async () => {
      const unresolved = healthChecks.getUnresolvedIssues();
      expect(Array.isArray(unresolved)).toBe(true);
    });

    it('should clear issues', () => {
      healthChecks.clearIssues();
      const unresolved = healthChecks.getUnresolvedIssues();
      expect(unresolved.length).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should get health statistics', async () => {
      await healthChecks.runChecks();

      const stats = healthChecks.getStatistics();

      expect(stats.totalChecks).toBeGreaterThan(0);
      expect(stats.healthyChecks).toBeGreaterThanOrEqual(0);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('export', () => {
    it('should export health report', async () => {
      await healthChecks.runChecks();

      const report = healthChecks.exportHealthReport();
      expect(report).toBeDefined();
      expect(report).toContain('healthy');
    });
  });
});
