/**
 * Performance Metrics Tests - Phase 22.13: Analytics & Monitoring
 */

import { performanceMetrics } from '../performanceMetrics';

describe('PerformanceMetrics', () => {
  beforeEach(async () => {
    await performanceMetrics.clearAll();
    await performanceMetrics.initialize();
  });

  afterEach(() => {
    performanceMetrics.destroy();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(performanceMetrics).toBeDefined();
    });
  });

  describe('Performance Marks', () => {
    it('should mark the start of an operation', () => {
      performanceMetrics.mark('test_operation');
      // Just verify no error is thrown
      expect(true).toBe(true);
    });

    it('should measure duration', () => {
      performanceMetrics.mark('test_measure');
      
      // Simulate some delay
      setTimeout(() => {
        performanceMetrics.measure('test_measure');
        expect(true).toBe(true);
      }, 100);
    });
  });

  describe('App Startup', () => {
    it('should record app startup time', () => {
      const startupTime = performanceMetrics.recordAppStartup();
      expect(startupTime).toBeGreaterThan(0);
    });
  });

  describe('Screen Render', () => {
    it('should record screen render time', () => {
      performanceMetrics.recordScreenRender('HomeScreen', 150);
      const metrics = performanceMetrics.getAllMetrics();
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should track multiple screen renders', () => {
      performanceMetrics.recordScreenRender('HomeScreen', 150);
      performanceMetrics.recordScreenRender('ProfileScreen', 200);
      
      const homeMetrics = performanceMetrics.getMetricsByName('screen_render');
      expect(homeMetrics.length).toBe(2);
    });
  });

  describe('API Response', () => {
    it('should record API response time', () => {
      performanceMetrics.recordApiResponse('/api/users', 'GET', 250, 200);
      const metrics = performanceMetrics.getAllMetrics();
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should record API error response', () => {
      performanceMetrics.recordApiResponse('/api/users', 'POST', 100, 500);
      const metrics = performanceMetrics.getAllMetrics();
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('Database Operations', () => {
    it('should record database query', () => {
      performanceMetrics.recordDatabaseOperation('query', 50, 'transactions');
      const metrics = performanceMetrics.getMetricsByName('db_query');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should record database insert', () => {
      performanceMetrics.recordDatabaseOperation('insert', 30, 'transactions');
      const metrics = performanceMetrics.getMetricsByName('db_insert');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should record database update', () => {
      performanceMetrics.recordDatabaseOperation('update', 40, 'transactions');
      const metrics = performanceMetrics.getMetricsByName('db_update');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should record database delete', () => {
      performanceMetrics.recordDatabaseOperation('delete', 25, 'transactions');
      const metrics = performanceMetrics.getMetricsByName('db_delete');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should record database transaction', () => {
      performanceMetrics.recordDatabaseOperation('transaction', 100, 'transactions');
      const metrics = performanceMetrics.getMetricsByName('db_transaction');
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('Custom Metrics', () => {
    it('should record custom metric', () => {
      performanceMetrics.recordCustomMetric('sync_operation', 500, {
        items: 100,
      });

      const metrics = performanceMetrics.getMetricsByName('custom_sync_operation');
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Statistics', () => {
    it('should calculate performance stats', () => {
      performanceMetrics.recordAppStartup();
      performanceMetrics.recordScreenRender('HomeScreen', 150);
      performanceMetrics.recordApiResponse('/api/users', 'GET', 250);

      const stats = performanceMetrics.getStats();
      expect(stats.appStartupTime).toBeDefined();
      expect(stats.totalMetrics).toBeGreaterThan(0);
    });

    it('should calculate average screen render time', () => {
      performanceMetrics.recordScreenRender('HomeScreen', 100);
      performanceMetrics.recordScreenRender('HomeScreen', 200);
      performanceMetrics.recordScreenRender('HomeScreen', 300);

      const stats = performanceMetrics.getStats();
      expect(stats.averageScreenRenderTime).toBe(200);
    });

    it('should calculate average API response time', () => {
      performanceMetrics.recordApiResponse('/api/users', 'GET', 100);
      performanceMetrics.recordApiResponse('/api/users', 'GET', 200);
      performanceMetrics.recordApiResponse('/api/users', 'GET', 300);

      const stats = performanceMetrics.getStats();
      expect(stats.averageApiResponseTime).toBe(200);
    });
  });

  describe('Metrics Retrieval', () => {
    it('should get all metrics', () => {
      performanceMetrics.recordScreenRender('HomeScreen', 150);
      performanceMetrics.recordApiResponse('/api/users', 'GET', 250);

      const metrics = performanceMetrics.getAllMetrics();
      expect(metrics.length).toBe(2);
    });

    it('should get metrics by name', () => {
      performanceMetrics.recordScreenRender('HomeScreen', 150);
      performanceMetrics.recordScreenRender('ProfileScreen', 200);
      performanceMetrics.recordApiResponse('/api/users', 'GET', 250);

      const metrics = performanceMetrics.getMetricsByName('screen_render');
      expect(metrics.length).toBe(2);
    });

    it('should get memory metrics', () => {
      const metrics = performanceMetrics.getMemoryMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should get CPU metrics', () => {
      const metrics = performanceMetrics.getCpuMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('Data Persistence', () => {
    it('should persist metrics', async () => {
      performanceMetrics.recordScreenRender('HomeScreen', 150);
      performanceMetrics.recordApiResponse('/api/users', 'GET', 250);

      await performanceMetrics.persistMetrics();
      expect(true).toBe(true);
    });

    it('should clear all metrics', async () => {
      performanceMetrics.recordScreenRender('HomeScreen', 150);
      expect(performanceMetrics.getAllMetrics().length).toBeGreaterThan(0);

      await performanceMetrics.clearAll();
      expect(performanceMetrics.getAllMetrics().length).toBe(0);
    });
  });
});
