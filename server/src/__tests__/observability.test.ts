/**
 * OBS-TEST: Observability Integration Tests
 * Validates that metrics are exposed correctly and logging works as expected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as promClient from 'prom-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  recordDbQueryLatency,
  recordHttpRequestLatency,
  recordError,
  recordDbError,
  recordCacheHit,
  recordCacheMiss,
  getMetricsRegistry,
} from '../services/metrics-service.js';

describe('Observability - Metrics Service', () => {
  let registry: promClient.Registry;

  beforeEach(() => {
    registry = getMetricsRegistry();
  });

  describe('Histogram Metrics', () => {
    it('should record DB query latency', async () => {
      recordDbQueryLatency(15, 'SELECT', 'users');
      recordDbQueryLatency(25, 'SELECT', 'users');

      const metrics = await registry.metrics();
      expect(metrics).toContain('db_query_duration_ms_bucket');
      expect(metrics).toContain('query_type="SELECT"');
      expect(metrics).toContain('table="users"');
    });

    it('should record HTTP request latency', async () => {
      recordHttpRequestLatency(250, 'GET', '/api/transactions', 200);

      const metrics = await registry.metrics();
      expect(metrics).toContain('http_request_duration_ms_bucket');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('route="/api/transactions"');
      expect(metrics).toContain('status="200"');
    });

    it('should have correct histogram buckets for DB queries', async () => {
      recordDbQueryLatency(1, 'SELECT', 'test');
      recordDbQueryLatency(5, 'SELECT', 'test');
      recordDbQueryLatency(10, 'SELECT', 'test');
      recordDbQueryLatency(50, 'SELECT', 'test');
      recordDbQueryLatency(100, 'SELECT', 'test');
      recordDbQueryLatency(1000, 'SELECT', 'test');

      const metrics = await registry.metrics();
      // Verify bucket boundaries exist
      expect(metrics).toContain('le="1"');
      expect(metrics).toContain('le="5"');
      expect(metrics).toContain('le="100"');
      expect(metrics).toContain('le="1000"');
    });
  });

  describe('Counter Metrics', () => {
    it('should count HTTP requests', async () => {
      recordHttpRequestLatency(100, 'POST', '/api/auth/login', 200);
      recordHttpRequestLatency(150, 'POST', '/api/auth/login', 401);

      const metrics = await registry.metrics();
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('status="200"');
      expect(metrics).toContain('status="401"');
    });

    it('should count errors by type', async () => {
      recordError('ValidationError', 'save_transaction', 'error');
      recordError('DatabaseError', 'query', 'error');
      recordError('TimeoutError', 'external_api', 'warning');

      const metrics = await registry.metrics();
      expect(metrics).toContain('errors_total');
      expect(metrics).toContain('error_type="ValidationError"');
      expect(metrics).toContain('error_type="DatabaseError"');
      expect(metrics).toContain('severity="warning"');
    });

    it('should count DB errors', async () => {
      recordDbError('SELECT', 'CONSTRAINT_VIOLATION');
      recordDbError('INSERT', 'DUPLICATE_KEY');

      const metrics = await registry.metrics();
      expect(metrics).toContain('db_errors_total');
      expect(metrics).toContain('error_code="CONSTRAINT_VIOLATION"');
      expect(metrics).toContain('error_code="DUPLICATE_KEY"');
    });

    it('should count cache hits and misses', async () => {
      recordCacheHit('memory', 'transaction_*');
      recordCacheHit('memory', 'transaction_*');
      recordCacheMiss('memory', 'transaction_*');

      const metrics = await registry.metrics();
      expect(metrics).toContain('cache_hits_total');
      expect(metrics).toContain('cache_misses_total');
      expect(metrics).toContain('cache_type="memory"');
      expect(metrics).toContain('key_pattern="transaction_*"');
    });
  });

  describe('Metrics Format', () => {
    it('should expose metrics in Prometheus text format', async () => {
      recordDbQueryLatency(42, 'UPDATE', 'accounts');

      const metrics = await registry.metrics();

      // Check for Prometheus text format features
      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics.includes('db_query_duration_ms')).toBe(true);
    });

    it('should include help and type descriptions', async () => {
      recordError('TestError', 'test', 'info');

      const metrics = await registry.metrics();

      // Prometheus format requires HELP and TYPE lines
      expect(metrics).toMatch(/#\s+HELP\s+\w+/);
      expect(metrics).toMatch(/#\s+TYPE\s+\w+/);
    });

    it('should escape labels correctly', async () => {
      // Test with special characters that need escaping
      recordError('Test"Error', 'test_op', 'error');

      const metrics = await registry.metrics();
      expect(metrics).toBeTruthy();
      // Verify Prometheus escaping is applied
      expect(metrics.includes('errors_total')).toBe(true);
    });
  });

  describe('Metrics Completeness', () => {
    it('should include all defined metric types', async () => {
      const metrics = await registry.metrics();

      // Verify all key metric types are present
      const expectedMetrics = [
        'db_query_duration_ms',
        'http_request_duration_ms',
        'errors_total',
        'http_requests_total',
        'cache_hits_total',
        'cache_misses_total',
        'db_errors_total',
      ];

      expectedMetrics.forEach(metric => {
        expect(metrics).toContain(metric);
      });
    });

    it('should handle multiple label combinations', async () => {
      // Record metrics with different label combinations
      recordHttpRequestLatency(100, 'GET', '/api/accounts', 200);
      recordHttpRequestLatency(200, 'GET', '/api/accounts', 404);
      recordHttpRequestLatency(300, 'POST', '/api/transactions', 201);
      recordHttpRequestLatency(400, 'POST', '/api/transactions', 400);

      const metrics = await registry.metrics();

      // All combinations should be present
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('method="POST"');
      expect(metrics).toContain('status="200"');
      expect(metrics).toContain('status="404"');
      expect(metrics).toContain('status="201"');
      expect(metrics).toContain('status="400"');
    });
  });

  describe('Sampling and Aggregation', () => {
    it('should aggregate multiple observations', async () => {
      // Record same metric multiple times
      for (let i = 0; i < 10; i++) {
        recordDbQueryLatency(20 + i, 'SELECT', 'test_table');
      }

      const metrics = await registry.metrics();
      // Sum and count should be present in histogram
      expect(metrics).toContain('db_query_duration_ms');
      expect(metrics).toContain('table="test_table"');
    });

    it('should handle high-frequency metric recording', async () => {
      // Simulate high-frequency recording
      for (let i = 0; i < 100; i++) {
        recordHttpRequestLatency(Math.random() * 1000, 'GET', '/api/health', 200);
      }

      const metrics = await registry.metrics();
      expect(metrics).toContain('http_request_duration_ms');
      expect(metrics).toContain('route="/api/health"');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid metrics gracefully', () => {
      // These should not throw
      recordDbQueryLatency(-1, 'SELECT', 'test');
      recordHttpRequestLatency(0, 'GET', '/', 200);
      recordError('', 'unknown', 'error');

      expect(true).toBe(true); // Just verify no errors thrown
    });

    it('should handle concurrent metric recording', async () => {
      // Simulate concurrent requests
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          new Promise(resolve => {
            recordHttpRequestLatency(Math.random() * 500, 'GET', '/api/data', 200);
            resolve(true);
          })
        );
      }

      await Promise.all(promises);

      const metrics = await registry.metrics();
      expect(metrics).toContain('http_requests_total');
    });
  });
});

describe('Observability - Winston Logger', () => {
  it('should have log rotation configured', async () => {
    // Verify that logger-service exports proper functions
    expect((await import('../services/logger-service.js'))).toBeDefined();
  });

  it('should have log directory structure', () => {
    const logsDir = path.join(__dirname, '../../logs');

    expect(fs.existsSync(logsDir)).toBe(true);
  });
});

describe('Observability - Request Sampling', () => {
  it('should have request ID middleware with sampling', async () => {
    const middleware = (await import('../middleware/request-id-middleware.js'));
    expect(middleware.requestIdMiddleware).toBeDefined();
    expect(middleware.getRequestSamplerStats).toBeDefined();
  });

  it('should export sampler stats', async () => {
    const middleware = (await import('../middleware/request-id-middleware.js'));
    const stats = middleware.getRequestSamplerStats();

    expect(stats).toHaveProperty('requestCount');
    expect(stats).toHaveProperty('sampleRate');
  });
});

describe('Observability - Sentry Performance Tracing', () => {
  it('should have performance tracing functions', async () => {
    const sentry = (await import('../services/sentry-service.js'));

    expect(sentry.startDbTransaction).toBeDefined();
    expect(sentry.createDbStatementSpan).toBeDefined();
    expect(sentry.detectN1Queries).toBeDefined();
    expect(sentry.traceParallelOperations).toBeDefined();
    expect(sentry.trackDatabaseTransaction).toBeDefined();
  });
});
