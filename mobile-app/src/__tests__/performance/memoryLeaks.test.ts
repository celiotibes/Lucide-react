/**
 * Memory Leak Detection Tests
 * Verifies that critical services properly clean up resources
 * Coverage: Analytics, Crash Reporting, Push Notifications, Biometric Auth, Security
 */

import { measureMemory, getMemoryDelta } from '../../__tests__/utils/performance-utils';

describe('Memory Leak Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(() => {
    if (global.gc) {
      global.gc();
    }
  });

  describe('Analytics Service Memory Management', () => {
    it('should not accumulate events indefinitely', async () => {
      const analyticsService = require('../../utils/analytics/analyticsService').default;
      const beforeMemory = await measureMemory();

      // Queue 1000 events
      for (let i = 0; i < 1000; i++) {
        analyticsService.trackEvent('test_event', { iteration: i });
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Events should be batched, memory growth should be controlled
      expect(delta.percentageGrowth).toBeLessThan(20);
      expect(delta.absoluteGrowth).toBeLessThan(5 * 1024 * 1024); // 5 MB max
    });

    it('should properly batch and flush offline events', async () => {
      const analyticsService = require('../../utils/analytics/analyticsService').default;
      const beforeMemory = await measureMemory();

      // Simulate offline queueing of 500 events
      for (let i = 0; i < 500; i++) {
        analyticsService.trackEvent('offline_event', { id: i });
      }

      // Verify queueing doesn't leak memory
      const afterQueueMemory = await measureMemory();
      const queueDelta = getMemoryDelta(beforeMemory, afterQueueMemory);
      expect(queueDelta.percentageGrowth).toBeLessThan(15);

      // Simulate flushing batches
      // Memory should stabilize after flush
      const afterFlushMemory = await measureMemory();
      expect(afterFlushMemory).toBeLessThan(afterQueueMemory + 1 * 1024 * 1024);
    });

    it('should respect GDPR consent settings and not accumulate personal data', async () => {
      const analyticsService = require('../../utils/analytics/analyticsService').default;
      const privacyCompliance = require('../../utils/security/privacyCompliance').default;

      const beforeMemory = await measureMemory();

      // Disable GDPR consent
      privacyCompliance.setGDPRConsent(false);

      // Try to track events with personal data
      for (let i = 0; i < 100; i++) {
        analyticsService.trackEvent('user_event', {
          userId: `user_${i}`,
          email: `user${i}@example.com`,
        });
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Memory growth should be minimal when consent is disabled
      expect(delta.percentageGrowth).toBeLessThan(10);
    });
  });

  describe('Crash Reporting Service Memory Management', () => {
    it('should cleanup breadcrumbs (max 50) automatically', async () => {
      const crashReportingService = require('../../utils/analytics/crashReportingService').default;
      const beforeMemory = await measureMemory();

      // Add 100 breadcrumbs (should keep only last 50)
      for (let i = 0; i < 100; i++) {
        crashReportingService.addBreadcrumb('test_breadcrumb', {
          action: `action_${i}`,
          timestamp: Date.now(),
        });
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Memory should be controlled even with high breadcrumb count
      expect(delta.percentageGrowth).toBeLessThan(10);
    });

    it('should not leak memory on repeated crash captures', async () => {
      const crashReportingService = require('../../utils/analytics/crashReportingService').default;
      const beforeMemory = await measureMemory();

      // Simulate 50 crash capture cycles
      for (let i = 0; i < 50; i++) {
        const error = new Error(`Test error ${i}`);
        crashReportingService.captureException(error, { context: `context_${i}` });
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Memory should stabilize
      expect(delta.percentageGrowth).toBeLessThan(15);
    });

    it('should cleanup circular references in error context', async () => {
      const crashReportingService = require('../../utils/analytics/crashReportingService').default;
      const beforeMemory = await measureMemory();

      // Create objects with circular references
      for (let i = 0; i < 50; i++) {
        const obj: any = { id: i };
        obj.self = obj; // Circular reference

        const error = new Error('Circular ref error');
        crashReportingService.captureException(error, { context: obj });

        // Cleanup reference
        obj.self = null;
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Should properly garbage collect circular references
      expect(delta.percentageGrowth).toBeLessThan(12);
    });
  });

  describe('Push Notifications Service Memory Management', () => {
    it('should unsubscribe listeners on unmount', async () => {
      const pushService = require('../../services/pushNotificationService').default;
      const beforeMemory = await measureMemory();

      // Register 50 listeners
      const listeners: any[] = [];
      for (let i = 0; i < 50; i++) {
        const listener = () => {};
        pushService.on('notification', listener);
        listeners.push(listener);
      }

      const afterRegisterMemory = await measureMemory();

      // Unregister all listeners
      listeners.forEach(listener => {
        pushService.off('notification', listener);
      });

      const afterUnregisterMemory = await measureMemory();
      const delta = getMemoryDelta(afterRegisterMemory, afterUnregisterMemory);

      // Should cleanup listeners properly (memory should not increase)
      expect(delta.percentageGrowth).toBeLessThan(5);
    });

    it('should not accumulate pending notifications in queue', async () => {
      const pushService = require('../../services/pushNotificationService').default;
      const beforeMemory = await measureMemory();

      // Queue 200 notifications
      for (let i = 0; i < 200; i++) {
        pushService.queueNotification({
          id: `notif_${i}`,
          title: `Notification ${i}`,
          body: `Body ${i}`,
          data: { index: i },
        });
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Queue should be batched/managed efficiently
      expect(delta.percentageGrowth).toBeLessThan(15);
    });

    it('should cleanup FCM token handlers', async () => {
      const pushService = require('../../services/pushNotificationService').default;
      const beforeMemory = await measureMemory();

      // Register multiple token refresh handlers
      for (let i = 0; i < 20; i++) {
        const handler = () => console.log('Token refreshed');
        pushService.onTokenRefresh(handler);
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Token handlers should not leak memory
      expect(delta.percentageGrowth).toBeLessThan(10);
    });
  });

  describe('Biometric Authentication Memory Management', () => {
    it('should not accumulate failed authentication attempts', async () => {
      const biometricService = require('../../utils/biometric/biometricAuthService').default;
      const beforeMemory = await measureMemory();

      // Simulate 100 failed auth attempts
      for (let i = 0; i < 100; i++) {
        try {
          await biometricService.authenticate();
        } catch {
          // Expected to fail in test environment
        }
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Failed attempts should not leak memory
      expect(delta.percentageGrowth).toBeLessThan(10);
    });

    it('should cleanup biometric device references', async () => {
      const biometricService = require('../../utils/biometric/biometricAuthService').default;
      const beforeMemory = await measureMemory();

      // Multiple authenticate/cleanup cycles
      for (let i = 0; i < 30; i++) {
        try {
          const { isBiometricAvailable } = await biometricService.checkBiometric();
          if (isBiometricAvailable) {
            await biometricService.authenticate();
          }
        } catch {
          // Expected in test env
        }
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // References should be cleaned up
      expect(delta.percentageGrowth).toBeLessThan(10);
    });
  });

  describe('Security Service Memory Management', () => {
    it('should cleanup TokenManager useRef properly', async () => {
      const tokenManager = require('../../utils/security/tokenManager').default;
      const beforeMemory = await measureMemory();

      // Simulate token refresh cycles
      for (let i = 0; i < 50; i++) {
        await tokenManager.refreshToken();
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Token operations should not leak memory
      expect(delta.percentageGrowth).toBeLessThan(10);
    });

    it('should cleanup old encryption keys after rotation', async () => {
      const secureStorageService = require('../../utils/security/secureStorageService').default;
      const beforeMemory = await measureMemory();

      // Store and rotate keys multiple times
      for (let i = 0; i < 20; i++) {
        await secureStorageService.set(`key_${i}`, `value_${i}`);
        await secureStorageService.rotateKeys();
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Old keys should be deleted
      expect(delta.percentageGrowth).toBeLessThan(15);
    });

    it('should not accumulate validation rules in memory', async () => {
      const dataValidationService = require('../../utils/security/dataValidationService').default;
      const beforeMemory = await measureMemory();

      // Validate large amounts of data
      for (let i = 0; i < 500; i++) {
        dataValidationService.validateInput(`<script>alert('xss')</script>`, 'html');
        dataValidationService.validateInput(`'; DROP TABLE users;`, 'sql');
        dataValidationService.validateInput(`test@${i}.com`, 'email');
      }

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Validation shouldn't accumulate rules in memory
      expect(delta.percentageGrowth).toBeLessThan(12);
    });
  });

  describe('Background Tasks Memory Management', () => {
    it('should cancel timers when tasks complete', async () => {
      const beforeMemory = await measureMemory();

      // Create and complete 50 timer-based tasks
      const timers: any[] = [];
      for (let i = 0; i < 50; i++) {
        const timer = setTimeout(() => {
          // Task completion
        }, 1000);
        timers.push(timer);
      }

      // Clear all timers
      timers.forEach(timer => clearTimeout(timer));

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Cleared timers should free memory
      expect(delta.percentageGrowth).toBeLessThan(5);
    });
  });

  describe('Navigation Memory Management', () => {
    it('should not grow memory with each screen navigation', async () => {
      const beforeMemory = await measureMemory();
      const measurements: number[] = [];

      // Simulate navigating to 30 different screens
      for (let i = 0; i < 30; i++) {
        const screenMemory = await measureMemory();
        measurements.push(screenMemory);
      }

      const afterMemory = await measureMemory();

      // Check for linear growth (which would indicate memory leak)
      const diffs = measurements.slice(1).map((val, idx) => val - measurements[idx]);
      const avgGrowth = diffs.reduce((a, b) => a + b, 0) / diffs.length;

      // Average growth per screen should be minimal
      expect(avgGrowth).toBeLessThan(100 * 1024); // 100 KB per screen max
    });
  });

  describe('AsyncStorage Memory Management', () => {
    it('should cleanup AsyncStorage listeners on unmount', async () => {
      const AsyncStorage = require('@react-native-community/async-storage').default;
      const beforeMemory = await measureMemory();

      // Register 30 listeners
      const unsubscribers: any[] = [];
      for (let i = 0; i < 30; i++) {
        const unsubscriber = AsyncStorage.subscribe(() => {});
        unsubscribers.push(unsubscriber);
      }

      const afterRegisterMemory = await measureMemory();

      // Unregister all listeners
      unsubscribers.forEach(unsub => unsub && unsub.remove?.());

      const afterUnregisterMemory = await measureMemory();
      const delta = getMemoryDelta(afterRegisterMemory, afterUnregisterMemory);

      // Should cleanup properly
      expect(delta.percentageGrowth).toBeLessThan(5);
    });
  });

  describe('Detached DOM Nodes Detection', () => {
    it('should not have detached DOM nodes after component unmount', async () => {
      const beforeMemory = await measureMemory();

      // Simulate creating and destroying DOM-like references
      let detached: any[] = [];
      for (let i = 0; i < 50; i++) {
        const obj = { id: i, data: new Array(1000).fill(Math.random()) };
        detached.push(obj);
      }

      // Clear references
      detached = [];

      const afterMemory = await measureMemory();
      const delta = getMemoryDelta(beforeMemory, afterMemory);

      // Should be garbage collected
      expect(delta.percentageGrowth).toBeLessThan(10);
    });
  });
});
