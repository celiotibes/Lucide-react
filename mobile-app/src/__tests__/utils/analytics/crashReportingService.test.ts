/**
 * Crash Reporting Service Unit Tests
 * Testing crash reporting, breadcrumbs, and context management
 */

import { crashReportingService } from '@/utils/analytics';

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn().mockResolvedValue(null),
    removeItem: jest.fn().mockResolvedValue(undefined),
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiGet: jest.fn().mockResolvedValue([]),
  },
}));

describe('CrashReportingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Reporting', () => {
    it('should report an error', () => {
      const error = new Error('Test error');
      expect(() => {
        crashReportingService.reportError(error, 'TestError');
      }).not.toThrow();
    });

    it('should handle non-Error objects', () => {
      expect(() => {
        crashReportingService.reportError('String error', 'StringError');
      }).not.toThrow();
    });

    it('should create crash report with stack trace', () => {
      const error = new Error('Test crash');
      crashReportingService.reportError(error);
      const reports = crashReportingService.getCrashReports();
      expect(reports.length).toBeGreaterThan(0);
    });
  });

  describe('Breadcrumb Tracking', () => {
    it('should add breadcrumb', () => {
      expect(() => {
        crashReportingService.addBreadcrumb('user_action', 'Button clicked', 'info');
      }).not.toThrow();
    });

    it('should add breadcrumb with data', () => {
      expect(() => {
        crashReportingService.addBreadcrumb('api_call', 'API request', 'debug', {
          endpoint: '/api/test',
          method: 'GET',
        });
      }).not.toThrow();
    });

    it('should get breadcrumbs', () => {
      crashReportingService.addBreadcrumb('test', 'Test breadcrumb', 'info');
      const breadcrumbs = crashReportingService.getBreadcrumbs();
      expect(Array.isArray(breadcrumbs)).toBe(true);
    });

    it('should support all breadcrumb levels', () => {
      const levels: Array<'debug' | 'info' | 'warning' | 'error'> = ['debug', 'info', 'warning', 'error'];
      levels.forEach((level) => {
        expect(() => {
          crashReportingService.addBreadcrumb('test', `Breadcrumb ${level}`, level);
        }).not.toThrow();
      });
    });
  });

  describe('Context Management', () => {
    it('should set context', () => {
      expect(() => {
        crashReportingService.setContext({
          userId: 'user123',
          sessionId: 'session456',
          screen: 'HomeScreen',
        });
      }).not.toThrow();
    });

    it('should get context', () => {
      crashReportingService.setContext({ userId: 'user123' });
      const context = crashReportingService.getContext();
      expect(context).toBeDefined();
      expect(context.userId).toBe('user123');
    });

    it('should clear context', () => {
      crashReportingService.setContext({ userId: 'user123' });
      expect(() => {
        crashReportingService.clearContext();
      }).not.toThrow();
    });

    it('should merge context', () => {
      crashReportingService.setContext({ userId: 'user123' });
      crashReportingService.setContext({ screen: 'HomeScreen' });
      const context = crashReportingService.getContext();
      expect(context.userId).toBe('user123');
      expect(context.screen).toBe('HomeScreen');
    });
  });

  describe('Crash Report Management', () => {
    it('should get crash reports', () => {
      const reports = crashReportingService.getCrashReports();
      expect(Array.isArray(reports)).toBe(true);
    });

    it('should get crash count', () => {
      const count = crashReportingService.getCrashCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should get unsynced crash count', () => {
      const count = crashReportingService.getUnsyncedCrashCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should track synced status', () => {
      const error = new Error('Test error');
      crashReportingService.reportError(error);
      const reports = crashReportingService.getCrashReports();
      expect(reports.length).toBeGreaterThan(0);
      const report = reports[reports.length - 1];
      expect(report).toHaveProperty('synced');
    });
  });

  describe('Sync Operations', () => {
    it('should sync crashes', async () => {
      await expect(crashReportingService.syncCrashes()).resolves.not.toThrow();
    });

    it('should export crash reports', async () => {
      const exported = await crashReportingService.exportCrashReports();
      expect(typeof exported).toBe('string');
    });

    it('should clear crash reports', async () => {
      await expect(crashReportingService.clearCrashReports()).resolves.not.toThrow();
    });

    it('should clear breadcrumbs', async () => {
      await expect(crashReportingService.clearBreadcrumbs()).resolves.not.toThrow();
    });
  });

  describe('Crash Report Structure', () => {
    it('should have required fields in crash report', () => {
      const error = new Error('Test crash');
      crashReportingService.reportError(error);
      const reports = crashReportingService.getCrashReports();
      const report = reports[reports.length - 1];

      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('message');
      expect(report).toHaveProperty('stack');
      expect(report).toHaveProperty('context');
      expect(report).toHaveProperty('breadcrumbs');
      expect(report).toHaveProperty('sessionId');
      expect(report).toHaveProperty('synced');
    });
  });

  describe('Global Error Handling', () => {
    it('should be initialized', () => {
      expect(crashReportingService).toBeDefined();
    });
  });
});
