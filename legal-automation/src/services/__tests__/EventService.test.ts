import { eventService, EVENTS } from '@services/EventEmitterService';

describe('EventService', () => {
  beforeEach(() => {
    eventService.reset();
  });

  describe('emit and subscribe', () => {
    test('should emit event and trigger listener', (done) => {
      eventService.on(EVENTS.CONTRACT_CREATED, (payload) => {
        expect(payload.eventType).toBe(EVENTS.CONTRACT_CREATED);
        expect(payload.source).toBe('test');
        done();
      });

      eventService.emit(EVENTS.CONTRACT_CREATED, 'test', { contractId: 'c1' });
    });

    test('should emit multiple events', (done) => {
      let count = 0;

      eventService.on(EVENTS.CLIENT_CREATED, () => {
        count++;
        if (count === 2) done();
      });

      eventService.emit(EVENTS.CLIENT_CREATED, 'test', { clientId: 'cl1' });
      eventService.emit(EVENTS.CLIENT_CREATED, 'test', { clientId: 'cl2' });
    });

    test('should handle one-time subscription', (done) => {
      let count = 0;

      eventService.once(EVENTS.INVOICE_CREATED, () => {
        count++;
        setTimeout(() => {
          expect(count).toBe(1);
          done();
        }, 100);
      });

      eventService.emit(EVENTS.INVOICE_CREATED, 'test', { invoiceId: 'i1' });
      eventService.emit(EVENTS.INVOICE_CREATED, 'test', { invoiceId: 'i2' });
    });

    test('should unsubscribe from event', (done) => {
      let count = 0;

      const handler = () => {
        count++;
      };

      eventService.on(EVENTS.DEADLINE_CREATED, handler);
      eventService.off(EVENTS.DEADLINE_CREATED, handler);

      eventService.emit(EVENTS.DEADLINE_CREATED, 'test', { deadlineId: 'd1' });

      setTimeout(() => {
        expect(count).toBe(0);
        done();
      }, 100);
    });
  });

  describe('webhooks', () => {
    test('should register webhook', () => {
      const webhook = eventService.registerWebhook(
        'https://example.com/hook',
        [EVENTS.CONTRACT_CREATED],
        'secret123',
      );

      expect(webhook.url).toBe('https://example.com/hook');
      expect(webhook.events).toContain(EVENTS.CONTRACT_CREATED);
      expect(webhook.active).toBe(true);
    });

    test('should list webhooks', () => {
      eventService.registerWebhook('https://example.com/hook1', [EVENTS.CONTRACT_CREATED]);
      eventService.registerWebhook('https://example.com/hook2', [EVENTS.CLIENT_CREATED]);

      const webhooks = eventService.listWebhooks();

      expect(webhooks).toHaveLength(2);
    });

    test('should get webhook by ID', () => {
      const registered = eventService.registerWebhook(
        'https://example.com/hook',
        [EVENTS.CONTRACT_CREATED],
      );

      const retrieved = eventService.getWebhook(registered.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.url).toBe('https://example.com/hook');
    });

    test('should update webhook', () => {
      const webhook = eventService.registerWebhook(
        'https://example.com/hook',
        [EVENTS.CONTRACT_CREATED],
      );

      const updated = eventService.updateWebhook(webhook.id, {
        active: false,
        events: [EVENTS.CONTRACT_CREATED, EVENTS.CLIENT_CREATED],
      });

      expect(updated?.active).toBe(false);
      expect(updated?.events).toContain(EVENTS.CLIENT_CREATED);
    });

    test('should remove webhook', () => {
      const webhook = eventService.registerWebhook(
        'https://example.com/hook',
        [EVENTS.CONTRACT_CREATED],
      );

      const removed = eventService.removeWebhook(webhook.id);
      const retrieved = eventService.getWebhook(webhook.id);

      expect(removed).toBe(true);
      expect(retrieved).toBeNull();
    });
  });

  describe('event history', () => {
    test('should store event in history', () => {
      eventService.emit(EVENTS.CONTRACT_CREATED, 'test', { contractId: 'c1' });
      eventService.emit(EVENTS.CLIENT_CREATED, 'test', { clientId: 'cl1' });

      const history = eventService.getEventHistory();

      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    test('should filter history by event type', () => {
      eventService.emit(EVENTS.CONTRACT_CREATED, 'test', { contractId: 'c1' });
      eventService.emit(EVENTS.CONTRACT_CREATED, 'test', { contractId: 'c2' });
      eventService.emit(EVENTS.CLIENT_CREATED, 'test', { clientId: 'cl1' });

      const contractEvents = eventService.getEventHistory(EVENTS.CONTRACT_CREATED);

      expect(contractEvents.every((e) => e.eventType === EVENTS.CONTRACT_CREATED)).toBe(true);
    });

    test('should respect limit on history', () => {
      for (let i = 0; i < 50; i++) {
        eventService.emit(EVENTS.CONTRACT_CREATED, 'test', { contractId: `c${i}` });
      }

      const history = eventService.getEventHistory(undefined, 20);

      expect(history.length).toBeLessThanOrEqual(20);
    });
  });

  describe('statistics', () => {
    test('should calculate statistics', () => {
      eventService.registerWebhook('https://example.com/hook1', [EVENTS.CONTRACT_CREATED]);
      eventService.registerWebhook('https://example.com/hook2', [EVENTS.CLIENT_CREATED]);

      eventService.emit(EVENTS.CONTRACT_CREATED, 'test', { contractId: 'c1' });
      eventService.emit(EVENTS.CLIENT_CREATED, 'test', { clientId: 'cl1' });

      const stats = eventService.getStatistics();

      expect(stats.totalWebhooks).toBe(2);
      expect(stats.activeWebhooks).toBe(2);
      expect(stats.totalEvents).toBeGreaterThanOrEqual(2);
    });

    test('should track failed webhooks', () => {
      const webhook = eventService.registerWebhook('https://invalid-url.local/hook', [EVENTS.CONTRACT_CREATED]);

      eventService.updateWebhook(webhook.id, { failureCount: 3 });

      const stats = eventService.getStatistics();

      expect(stats.failedWebhooks).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset', () => {
    test('should reset all data', () => {
      eventService.registerWebhook('https://example.com/hook', [EVENTS.CONTRACT_CREATED]);
      eventService.emit(EVENTS.CONTRACT_CREATED, 'test', { contractId: 'c1' });

      eventService.reset();

      const stats = eventService.getStatistics();

      expect(stats.totalWebhooks).toBe(0);
      expect(stats.totalEvents).toBe(0);
    });
  });
});
