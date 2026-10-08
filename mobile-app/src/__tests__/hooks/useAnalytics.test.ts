/**
 * useAnalytics Hook Unit Tests
 * Testing analytics integration hook
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { useAnalytics } from '@/hooks/useAnalytics';

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn().mockResolvedValue(null),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('react-native-performance-monitor', () => ({
  PerformanceMonitor: {
    getMemoryStats: jest.fn(() => ({
      usedMemory: 100000000,
      totalMemory: 200000000,
      freeMemory: 100000000,
    })),
  },
}));

describe('useAnalytics Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Hook Initialization', () => {
    it('should initialize hook without options', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(result.current).toBeDefined();
    });

    it('should initialize hook with options', () => {
      const { result } = renderHook(() =>
        useAnalytics({
          screenName: 'TestScreen',
          trackScreenTime: true,
          autoSync: true,
        })
      );
      expect(result.current).toBeDefined();
    });
  });

  describe('Event Tracking Methods', () => {
    it('should have trackEvent method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.trackEvent).toBe('function');
    });

    it('should track event', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.trackEvent('test_event', { data: 'test' });
      }).not.toThrow();
    });

    it('should track error', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.trackError('Error message', 'Stack trace');
      }).not.toThrow();
    });

    it('should track crash', () => {
      const { result } = renderHook(() => useAnalytics());
      const error = new Error('Test crash');
      expect(() => {
        result.current.trackCrash(error);
      }).not.toThrow();
    });
  });

  describe('Screen Tracking Methods', () => {
    it('should have trackScreenView method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.trackScreenView).toBe('function');
    });

    it('should track screen view', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.trackScreenView('TestScreen');
      }).not.toThrow();
    });

    it('should track screen leave', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.trackScreenLeave();
      }).not.toThrow();
    });
  });

  describe('Breadcrumb Methods', () => {
    it('should have addBreadcrumb method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.addBreadcrumb).toBe('function');
    });

    it('should add breadcrumb', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.addBreadcrumb('test', 'Test breadcrumb', 'info');
      }).not.toThrow();
    });
  });

  describe('Performance Methods', () => {
    it('should have markPerformance method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.markPerformance).toBe('function');
    });

    it('should have measurePerformance method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.measurePerformance).toBe('function');
    });

    it('should mark performance point', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.markPerformance('test_mark');
      }).not.toThrow();
    });

    it('should measure performance', () => {
      const { result } = renderHook(() => useAnalytics());
      result.current.markPerformance('start');
      const duration = result.current.measurePerformance('test', 'start');
      expect(typeof duration).toBe('number');
    });
  });

  describe('Metrics Methods', () => {
    it('should have getMetrics method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.getMetrics).toBe('function');
    });

    it('should get metrics', () => {
      const { result } = renderHook(() => useAnalytics());
      const metrics = result.current.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('totalEvents');
    });

    it('should have getPerformanceSummary method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.getPerformanceSummary).toBe('function');
    });

    it('should get performance summary', () => {
      const { result } = renderHook(() => useAnalytics());
      const summary = result.current.getPerformanceSummary();
      expect(summary).toBeDefined();
      expect(summary).toHaveProperty('startupTime');
    });

    it('should have getCrashCount method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.getCrashCount).toBe('function');
    });

    it('should get crash count', () => {
      const { result } = renderHook(() => useAnalytics());
      const count = result.current.getCrashCount();
      expect(typeof count).toBe('number');
    });
  });

  describe('User Management Methods', () => {
    it('should have setUserId method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.setUserId).toBe('function');
    });

    it('should set user ID', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.setUserId('user123');
      }).not.toThrow();
    });

    it('should have clearUserId method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.clearUserId).toBe('function');
    });

    it('should clear user ID', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.clearUserId();
      }).not.toThrow();
    });
  });

  describe('Context Management Methods', () => {
    it('should have setContext method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.setContext).toBe('function');
    });

    it('should set context', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.setContext({ userId: 'user123' });
      }).not.toThrow();
    });

    it('should have clearContext method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.clearContext).toBe('function');
    });

    it('should clear context', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.clearContext();
      }).not.toThrow();
    });
  });

  describe('Privacy Settings Methods', () => {
    it('should have getPrivacySettings method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.getPrivacySettings).toBe('function');
    });

    it('should get privacy settings', () => {
      const { result } = renderHook(() => useAnalytics());
      const settings = result.current.getPrivacySettings();
      expect(settings).toBeDefined();
      expect(settings).toHaveProperty('analyticsEnabled');
    });

    it('should have setPrivacySettings method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.setPrivacySettings).toBe('function');
    });

    it('should set privacy settings', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(() => {
        result.current.setPrivacySettings({
          analyticsEnabled: false,
          crashReportingEnabled: true,
          personalizationEnabled: false,
        });
      }).not.toThrow();
    });
  });

  describe('Sync Methods', () => {
    it('should have syncEvents method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.syncEvents).toBe('function');
    });

    it('should sync events', async () => {
      const { result } = renderHook(() => useAnalytics());
      await expect(result.current.syncEvents()).resolves.not.toThrow();
    });

    it('should have syncCrashes method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.syncCrashes).toBe('function');
    });

    it('should sync crashes', async () => {
      const { result } = renderHook(() => useAnalytics());
      await expect(result.current.syncCrashes()).resolves.not.toThrow();
    });
  });

  describe('Export and Clear Methods', () => {
    it('should have exportAnalytics method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.exportAnalytics).toBe('function');
    });

    it('should export analytics', async () => {
      const { result } = renderHook(() => useAnalytics());
      const exported = await result.current.exportAnalytics();
      expect(typeof exported).toBe('string');
    });

    it('should have clearAnalytics method', () => {
      const { result } = renderHook(() => useAnalytics());
      expect(typeof result.current.clearAnalytics).toBe('function');
    });

    it('should clear analytics', async () => {
      const { result } = renderHook(() => useAnalytics());
      await expect(result.current.clearAnalytics()).resolves.not.toThrow();
    });
  });

  describe('Hook Lifecycle', () => {
    it('should track screen on mount with screenName option', () => {
      const { result } = renderHook(() =>
        useAnalytics({
          screenName: 'TestScreen',
          trackScreenTime: true,
        })
      );
      expect(result.current).toBeDefined();
    });

    it('should not track screen without screenName', () => {
      const { result } = renderHook(() =>
        useAnalytics({
          trackScreenTime: true,
        })
      );
      expect(result.current).toBeDefined();
    });

    it('should handle autoSync option', () => {
      const { result } = renderHook(() =>
        useAnalytics({
          autoSync: true,
        })
      );
      expect(result.current).toBeDefined();
    });

    it('should disable autoSync when false', () => {
      const { result } = renderHook(() =>
        useAnalytics({
          autoSync: false,
        })
      );
      expect(result.current).toBeDefined();
    });
  });

  describe('Return Type', () => {
    it('should return correct method signatures', () => {
      const { result } = renderHook(() => useAnalytics());

      // Event tracking
      expect(typeof result.current.trackEvent).toBe('function');
      expect(typeof result.current.trackError).toBe('function');
      expect(typeof result.current.trackCrash).toBe('function');

      // Screen tracking
      expect(typeof result.current.trackScreenView).toBe('function');
      expect(typeof result.current.trackScreenLeave).toBe('function');

      // Breadcrumbs
      expect(typeof result.current.addBreadcrumb).toBe('function');

      // Performance
      expect(typeof result.current.markPerformance).toBe('function');
      expect(typeof result.current.measurePerformance).toBe('function');

      // Metrics
      expect(typeof result.current.getMetrics).toBe('function');
      expect(typeof result.current.getPerformanceSummary).toBe('function');
      expect(typeof result.current.getCrashCount).toBe('function');

      // User
      expect(typeof result.current.setUserId).toBe('function');
      expect(typeof result.current.clearUserId).toBe('function');

      // Context
      expect(typeof result.current.setContext).toBe('function');
      expect(typeof result.current.clearContext).toBe('function');

      // Privacy
      expect(typeof result.current.getPrivacySettings).toBe('function');
      expect(typeof result.current.setPrivacySettings).toBe('function');

      // Sync
      expect(typeof result.current.syncEvents).toBe('function');
      expect(typeof result.current.syncCrashes).toBe('function');

      // Export/Clear
      expect(typeof result.current.exportAnalytics).toBe('function');
      expect(typeof result.current.clearAnalytics).toBe('function');
    });
  });
});
