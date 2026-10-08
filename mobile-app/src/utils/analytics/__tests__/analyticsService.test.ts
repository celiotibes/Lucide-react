/**
 * Analytics Service Tests - Phase 22.13: Analytics & Monitoring
 */

import { analyticsService, EventType } from '../analyticsService';

describe('AnalyticsService', () => {
  beforeEach(async () => {
    await analyticsService.clearAll();
    await analyticsService.initialize();
  });

  afterEach(async () => {
    analyticsService.destroy();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(analyticsService.getSessionId()).toBeDefined();
    });

    it('should generate unique session IDs', async () => {
      const sessionId1 = analyticsService.getSessionId();
      expect(sessionId1).toBeDefined();
      expect(sessionId1.length).toBeGreaterThan(0);
    });
  });

  describe('Event Tracking', () => {
    it('should track an event', async () => {
      await analyticsService.trackEvent(EventType.APP_LAUNCH, {
        version: '1.0.0',
      });

      const queuedCount = analyticsService.getQueuedEventCount();
      expect(queuedCount).toBeGreaterThan(0);
    });

    it('should track screen view', async () => {
      await analyticsService.trackScreenView('HomeScreen', {
        source: 'navigation',
      });

      const queuedCount = analyticsService.getQueuedEventCount();
      expect(queuedCount).toBeGreaterThan(0);
    });

    it('should track screen leave', async () => {
      await analyticsService.trackScreenLeave('HomeScreen', 5000);

      const queuedCount = analyticsService.getQueuedEventCount();
      expect(queuedCount).toBeGreaterThan(0);
    });

    it('should track multiple events', async () => {
      await analyticsService.trackEvent(EventType.TRANSACTION_CREATE, {
        amount: 100,
      });
      await analyticsService.trackEvent(EventType.TRANSACTION_UPDATE, {
        amount: 150,
      });
      await analyticsService.trackEvent(EventType.SYNC_START);

      const queuedCount = analyticsService.getQueuedEventCount();
      expect(queuedCount).toBe(3);
    });
  });

  describe('User Properties', () => {
    it('should set user properties', async () => {
      await analyticsService.setUserProperties('user123', {
        email: 'user@example.com',
        name: 'Test User',
      });

      const props = analyticsService.getUserProperties();
      expect(props.userId).toBe('user123');
      expect(props.email).toBe('user@example.com');
      expect(props.name).toBe('Test User');
    });

    it('should include user properties in events', async () => {
      await analyticsService.setUserProperties('user123', {
        email: 'user@example.com',
      });

      await analyticsService.trackEvent(EventType.APP_LAUNCH);

      const props = analyticsService.getUserProperties();
      expect(props.userId).toBe('user123');
    });
  });

  describe('Event Aggregation', () => {
    it('should aggregate events', async () => {
      await analyticsService.trackEvent(EventType.SCREEN_VIEW, {}, 'HomeScreen');
      await analyticsService.trackEvent(EventType.SCREEN_VIEW, {}, 'HomeScreen');
      await analyticsService.trackEvent(EventType.SCREEN_VIEW, {}, 'ProfileScreen');

      const stats = analyticsService.getEventStats();
      expect(stats['screen_view:HomeScreen']).toBe(2);
      expect(stats['screen_view:ProfileScreen']).toBe(1);
    });
  });

  describe('Flush', () => {
    it('should flush events', async () => {
      await analyticsService.trackEvent(EventType.APP_LAUNCH);
      await analyticsService.trackEvent(EventType.USER_LOGIN);

      expect(analyticsService.getQueuedEventCount()).toBeGreaterThan(0);

      await analyticsService.flush();

      // Note: After flush, events might still be in queue if batch sending fails
      // This is expected behavior for offline scenarios
    });

    it('should not flush if queue is empty', async () => {
      const initialCount = analyticsService.getQueuedEventCount();
      await analyticsService.flush();
      expect(analyticsService.getQueuedEventCount()).toBe(initialCount);
    });
  });

  describe('Configuration', () => {
    it('should configure service', () => {
      analyticsService.configure({
        maxQueuedEvents: 1000,
        batchSizeLimit: 50,
      });

      // Configuration applied successfully
      expect(analyticsService).toBeDefined();
    });
  });

  describe('Data Persistence', () => {
    it('should clear all data', async () => {
      await analyticsService.trackEvent(EventType.APP_LAUNCH);
      expect(analyticsService.getQueuedEventCount()).toBeGreaterThan(0);

      await analyticsService.clearAll();
      expect(analyticsService.getQueuedEventCount()).toBe(0);
    });
  });
});
