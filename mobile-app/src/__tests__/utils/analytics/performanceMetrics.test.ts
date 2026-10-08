/**
 * Performance Metrics Service Unit Tests
 * Testing startup time, memory, API latency, and network latency tracking
 */

import { performanceMetrics } from '@/utils/analytics';

jest.mock('react-native-performance-monitor', () => ({
  PerformanceMonitor: {
    getMemoryStats: jest.fn(() => ({
      usedMemory: 100000000,
      totalMemory: 200000000,
      freeMemory: 100000000,
    })),
  },
}));

describe('PerformanceMetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Metric Recording', () => {
    it('should record a metric', () => {
      expect(() => {
        performanceMetrics.recordMetric('test_metric', 100, 'ms');
      }).not.toThrow();
    });

    it('should record metric with metadata', () => {
      expect(() => {
        performanceMetrics.recordMetric('test_metric', 100, 'ms', { type: 'test' });
      }).not.toThrow();
    });
  });

  describe('Performance Marks', () => {
    it('should mark performance point', () => {
      expect(() => {
        performanceMetrics.mark('start_point');
      }).not.toThrow();
    });

    it('should measure performance between marks', () => {
      performanceMetrics.mark('start_measure');
      const duration = performanceMetrics.measure('test_measure', 'start_measure');
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing start mark', () => {
      const duration = performanceMetrics.measure('test_measure', 'non_existent_mark');
      expect(duration).toBe(0);
    });
  });

  describe('API Request Tracking', () => {
    it('should track API request', () => {
      expect(() => {
        performanceMetrics.trackApiRequest('/api/test', 100, 200);
      }).not.toThrow();
    });

    it('should get average API response time', () => {
      performanceMetrics.trackApiRequest('/api/test1', 100);
      performanceMetrics.trackApiRequest('/api/test2', 200);
      const avg = performanceMetrics.getAverageApiResponseTime();
      expect(typeof avg).toBe('number');
      expect(avg).toBeGreaterThan(0);
    });

    it('should get P95 API response time', () => {
      for (let i = 0; i < 100; i++) {
        performanceMetrics.trackApiRequest(`/api/test${i}`, i * 10);
      }
      const p95 = performanceMetrics.getP95ApiResponseTime();
      expect(typeof p95).toBe('number');
      expect(p95).toBeGreaterThan(0);
    });

    it('should get P99 API response time', () => {
      for (let i = 0; i < 100; i++) {
        performanceMetrics.trackApiRequest(`/api/test${i}`, i * 10);
      }
      const p99 = performanceMetrics.getP99ApiResponseTime();
      expect(typeof p99).toBe('number');
      expect(p99).toBeGreaterThan(0);
    });

    it('should return 0 for empty API times', () => {
      performanceMetrics.clearMetrics();
      const avg = performanceMetrics.getAverageApiResponseTime();
      expect(avg).toBe(0);
    });
  });

  describe('Network Latency Tracking', () => {
    it('should track network latency', () => {
      expect(() => {
        performanceMetrics.trackNetworkLatency(50, 'api.example.com');
      }).not.toThrow();
    });

    it('should get average network latency', () => {
      performanceMetrics.trackNetworkLatency(50);
      performanceMetrics.trackNetworkLatency(100);
      const avg = performanceMetrics.getAverageNetworkLatency();
      expect(typeof avg).toBe('number');
      expect(avg).toBeGreaterThan(0);
    });

    it('should return 0 for empty latencies', () => {
      performanceMetrics.clearMetrics();
      const avg = performanceMetrics.getAverageNetworkLatency();
      expect(avg).toBe(0);
    });
  });

  describe('Database Operation Tracking', () => {
    it('should track database operation', () => {
      expect(() => {
        performanceMetrics.trackDatabaseOperation('SELECT', 100, 'users');
      }).not.toThrow();
    });
  });

  describe('Screen Render Tracking', () => {
    it('should track screen render time', () => {
      expect(() => {
        performanceMetrics.trackScreenRender('HomeScreen', 500);
      }).not.toThrow();
    });
  });

  describe('Frame Rate Tracking', () => {
    it('should track frame rate', () => {
      expect(() => {
        performanceMetrics.trackFrameRate(60);
      }).not.toThrow();
    });
  });

  describe('Metrics Query', () => {
    it('should get metrics by name', () => {
      performanceMetrics.recordMetric('test_metric', 100, 'ms');
      const metrics = performanceMetrics.getMetricsByName('test_metric');
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should get metrics by type', () => {
      performanceMetrics.recordMetric('test_metric', 100, 'ms', { type: 'test_type' });
      const metrics = performanceMetrics.getMetricsByType('test_type');
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should get metrics in time range', () => {
      performanceMetrics.recordMetric('test_metric', 100, 'ms');
      const start = new Date(Date.now() - 1000).toISOString();
      const end = new Date(Date.now() + 1000).toISOString();
      const metrics = performanceMetrics.getMetricsInRange(start, end);
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('Performance Summary', () => {
    it('should get performance summary', () => {
      const summary = performanceMetrics.getSummary();
      expect(summary).toBeDefined();
      expect(summary).toHaveProperty('startupTime');
      expect(summary).toHaveProperty('memoryUsage');
      expect(summary).toHaveProperty('memoryAvailable');
      expect(summary).toHaveProperty('avgApiResponseTime');
      expect(summary).toHaveProperty('avgNetworkLatency');
    });

    it('should have numeric values in summary', () => {
      const summary = performanceMetrics.getSummary();
      expect(typeof summary.startupTime).toBe('number');
      expect(typeof summary.memoryUsage).toBe('number');
      expect(typeof summary.avgApiResponseTime).toBe('number');
      expect(typeof summary.avgNetworkLatency).toBe('number');
    });
  });

  describe('Memory Monitoring', () => {
    it('should stop memory monitoring', () => {
      expect(() => {
        performanceMetrics.stopMemoryMonitoring();
      }).not.toThrow();
    });
  });

  describe('Export and Clear', () => {
    it('should export metrics', async () => {
      const exported = await performanceMetrics.exportMetrics();
      expect(typeof exported).toBe('string');
    });

    it('should clear metrics', () => {
      performanceMetrics.recordMetric('test_metric', 100, 'ms');
      expect(() => {
        performanceMetrics.clearMetrics();
      }).not.toThrow();
    });

    it('should get all metrics', () => {
      performanceMetrics.recordMetric('test_metric', 100, 'ms');
      const metrics = performanceMetrics.getAllMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });
  });
});
