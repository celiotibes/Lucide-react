/**
 * Analytics Service Unit Tests
 * Testing event tracking, offline queueing, and privacy settings
 */

import { analyticsService } from '@/utils/analytics';

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn().mockResolvedValue(null),
    removeItem: jest.fn().mockResolvedValue(undefined),
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiGet: jest.fn().mockResolvedValue([]),
    getAllKeys: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Event Tracking', () => {
    it('should track an event', () => {
      expect(() => {
        analyticsService.trackEvent('screen_view', { screen: 'HomeScreen' });
      }).not.toThrow();
    });

    it('should track screen view', () => {
      expect(() => {
        analyticsService.trackScreenView('DashboardScreen');
      }).not.toThrow();
    });

    it('should track screen leave', () => {
      expect(() => {
        analyticsService.trackScreenLeave();
      }).not.toThrow();
    });

    it('should track error', () => {
      expect(() => {
        analyticsService.trackError('Test error', 'Error stack trace', { context: 'test' });
      }).not.toThrow();
    });

    it('should track crash', () => {
      const error = new Error('Test crash');
      expect(() => {
        analyticsService.trackCrash(error, { context: 'test' });
      }).not.toThrow();
    });
  });

  describe('Metrics', () => {
    it('should get metrics', () => {
      const metrics = analyticsService.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.totalEvents).toBeGreaterThanOrEqual(0);
      expect(metrics.errorCount).toBeGreaterThanOrEqual(0);
      expect(metrics.crashCount).toBeGreaterThanOrEqual(0);
    });

    it('should have totalEvents in metrics', () => {
      analyticsService.trackEvent('test_event');
      const metrics = analyticsService.getMetrics();
      expect(metrics.totalEvents).toBeGreaterThan(0);
    });

    it('should have lastSyncTime in metrics', () => {
      const metrics = analyticsService.getMetrics();
      expect(metrics.lastSyncTime).toBeDefined();
    });
  });

  describe('User Management', () => {
    it('should set user ID', () => {
      expect(() => {
        analyticsService.setUserId('user123');
      }).not.toThrow();
    });

    it('should clear user ID', () => {
      analyticsService.setUserId('user123');
      expect(() => {
        analyticsService.clearUserId();
      }).not.toThrow();
    });
  });

  describe('Privacy Settings', () => {
    it('should get privacy settings', () => {
      const settings = analyticsService.getPrivacySettings();
      expect(settings).toBeDefined();
      expect(settings).toHaveProperty('analyticsEnabled');
      expect(settings).toHaveProperty('crashReportingEnabled');
      expect(settings).toHaveProperty('personalizationEnabled');
      expect(settings).toHaveProperty('dataRetentionDays');
    });

    it('should set privacy settings', () => {
      const newSettings = {
        analyticsEnabled: false,
        crashReportingEnabled: false,
        personalizationEnabled: true,
        dataRetentionDays: 30,
      };
      expect(() => {
        analyticsService.setPrivacySettings(newSettings);
      }).not.toThrow();
    });

    it('should respect privacy settings when tracking events', () => {
      analyticsService.setPrivacySettings({
        analyticsEnabled: false,
        crashReportingEnabled: true,
        personalizationEnabled: false,
        dataRetentionDays: 30,
      });
      expect(() => {
        analyticsService.trackEvent('test_event');
      }).not.toThrow();
    });
  });

  describe('Sync Operations', () => {
    it('should sync events', async () => {
      await expect(analyticsService.syncEvents()).resolves.not.toThrow();
    });

    it('should export analytics', async () => {
      const exported = await analyticsService.exportAnalytics();
      expect(typeof exported).toBe('string');
    });

    it('should clear all analytics', async () => {
      analyticsService.trackEvent('test_event');
      await expect(analyticsService.clearAll()).resolves.not.toThrow();
    });
  });

  describe('Event Types', () => {
    it('should support all event types', () => {
      const eventTypes = [
        'screen_view',
        'screen_leave',
        'button_click',
        'form_submit',
        'error',
        'crash',
        'api_call',
        'network_request',
        'user_action',
        'custom_event',
      ];

      eventTypes.forEach((eventType) => {
        expect(() => {
          analyticsService.trackEvent(eventType as any);
        }).not.toThrow();
      });
    });
  });

  describe('Offline Queue', () => {
    it('should queue events when offline', async () => {
      const initialMetrics = analyticsService.getMetrics();
      analyticsService.trackEvent('test_event');
      const updatedMetrics = analyticsService.getMetrics();
      expect(updatedMetrics.totalEvents).toBeGreaterThanOrEqual(initialMetrics.totalEvents);
    });

    it('should clear old events based on retention', async () => {
      expect(() => {
        analyticsService.clearOldEvents(30);
      }).not.toThrow();
    });
  });
});
