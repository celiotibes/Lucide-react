import { logger } from '@utils/logger';
import { EventEmitter } from 'events';

// ============================================================================
// EVENT EMITTER SERVICE - Event-Driven Architecture & Webhooks
// ============================================================================

export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  createdAt: Date;
  lastTriggered?: Date;
  failureCount: number;
  maxRetries: number;
}

export interface EventPayload {
  eventType: string;
  timestamp: Date;
  source: string;
  data: Record<string, any>;
  userId?: string;
}

export class EventService {
  private emitter: EventEmitter;
  private webhooks: Map<string, WebhookConfig> = new Map();
  private eventHistory: EventPayload[] = [];
  private maxHistorySize = 10000;

  constructor() {
    this.emitter = new EventEmitter();
    this.setupDefaultListeners();
  }

  private setupDefaultListeners(): void {
    this.emitter.on('error', (error) => {
      logger.error({ err: error }, 'Event emitter error');
    });
  }

  emit(eventType: string, source: string, data: Record<string, any>, userId?: string): void {
    const payload: EventPayload = {
      eventType,
      timestamp: new Date(),
      source,
      data,
      userId,
    };

    this.emitter.emit(eventType, payload);
    this.storeEventHistory(payload);

    logger.info(
      { eventType, source, userId },
      `Event emitted: ${eventType}`,
    );

    this.triggerWebhooks(payload);
  }

  on(eventType: string, handler: (payload: EventPayload) => void): void {
    this.emitter.on(eventType, handler);
  }

  once(eventType: string, handler: (payload: EventPayload) => void): void {
    this.emitter.once(eventType, handler);
  }

  off(eventType: string, handler: (payload: EventPayload) => void): void {
    this.emitter.off(eventType, handler);
  }

  registerWebhook(
    url: string,
    events: string[],
    secret?: string,
    maxRetries: number = 3,
  ): WebhookConfig {
    const id = `webhook-${Date.now()}-${Math.random()}`;

    const webhook: WebhookConfig = {
      id,
      url,
      events,
      active: true,
      secret,
      createdAt: new Date(),
      failureCount: 0,
      maxRetries,
    };

    this.webhooks.set(id, webhook);

    logger.info(
      { webhookId: id, url, events: events.join(', ') },
      'Webhook registered',
    );

    return webhook;
  }

  removeWebhook(webhookId: string): boolean {
    const removed = this.webhooks.delete(webhookId);

    if (removed) {
      logger.info({ webhookId }, 'Webhook removed');
    }

    return removed;
  }

  updateWebhook(webhookId: string, updates: Partial<WebhookConfig>): WebhookConfig | null {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      return null;
    }

    Object.assign(webhook, updates);
    this.webhooks.set(webhookId, webhook);

    return webhook;
  }

  getWebhook(webhookId: string): WebhookConfig | null {
    return this.webhooks.get(webhookId) || null;
  }

  listWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  private async triggerWebhooks(payload: EventPayload): Promise<void> {
    const matchingWebhooks = Array.from(this.webhooks.values()).filter(
      (webhook) => webhook.active && webhook.events.includes(payload.eventType),
    );

    for (const webhook of matchingWebhooks) {
      this.deliverWebhook(webhook, payload);
    }
  }

  private async deliverWebhook(webhook: WebhookConfig, payload: EventPayload, retries: number = 0): Promise<void> {
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhook.secret || '',
          'X-Webhook-Event': payload.eventType,
          'X-Webhook-Timestamp': payload.timestamp.toISOString(),
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        webhook.failureCount = 0;
        webhook.lastTriggered = new Date();
        this.webhooks.set(webhook.id, webhook);

        logger.info(
          { webhookId: webhook.id, eventType: payload.eventType },
          'Webhook delivered successfully',
        );
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      webhook.failureCount++;

      if (retries < webhook.maxRetries) {
        const backoff = Math.pow(2, retries) * 1000;
        setTimeout(() => {
          this.deliverWebhook(webhook, payload, retries + 1);
        }, backoff);

        logger.warn(
          { webhookId: webhook.id, retries: retries + 1, error },
          'Webhook delivery failed, retrying',
        );
      } else {
        logger.error(
          { webhookId: webhook.id, failureCount: webhook.failureCount, error },
          'Webhook delivery failed (max retries exceeded)',
        );

        if (webhook.failureCount >= 5) {
          webhook.active = false;
          this.webhooks.set(webhook.id, webhook);
          logger.warn({ webhookId: webhook.id }, 'Webhook disabled due to repeated failures');
        }
      }

      this.webhooks.set(webhook.id, webhook);
    }
  }

  private storeEventHistory(payload: EventPayload): void {
    this.eventHistory.push(payload);

    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  getEventHistory(eventType?: string, limit: number = 100): EventPayload[] {
    let history = this.eventHistory;

    if (eventType) {
      history = history.filter((e) => e.eventType === eventType);
    }

    return history.slice(-limit).reverse();
  }

  getStatistics(): {
    totalWebhooks: number;
    activeWebhooks: number;
    failedWebhooks: number;
    totalEvents: number;
    eventsLast24h: number;
  } {
    const webhooks = Array.from(this.webhooks.values());
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      totalWebhooks: webhooks.length,
      activeWebhooks: webhooks.filter((w) => w.active).length,
      failedWebhooks: webhooks.filter((w) => w.failureCount > 0).length,
      totalEvents: this.eventHistory.length,
      eventsLast24h: this.eventHistory.filter((e) => e.timestamp >= last24h).length,
    };
  }

  reset(): void {
    this.webhooks.clear();
    this.eventHistory = [];
    this.emitter.removeAllListeners();
    this.setupDefaultListeners();
    logger.info('EventService resetado');
  }
}

export const eventService = new EventService();

export const EVENTS = {
  CLIENT_CREATED: 'client.created',
  CLIENT_UPDATED: 'client.updated',
  CLIENT_DELETED: 'client.deleted',
  CONTRACT_CREATED: 'contract.created',
  CONTRACT_UPDATED: 'contract.updated',
  CONTRACT_SIGNED: 'contract.signed',
  CONTRACT_ARCHIVED: 'contract.archived',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_SENT: 'invoice.sent',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_OVERDUE: 'invoice.overdue',
  DEADLINE_CREATED: 'deadline.created',
  DEADLINE_UPCOMING: 'deadline.upcoming',
  DEADLINE_OVERDUE: 'deadline.overdue',
  CASE_REGISTERED: 'case.registered',
  CASE_CLOSED: 'case.closed',
  CASE_PREDICTED: 'case.predicted',
  SYSTEM_ERROR: 'system.error',
  SYSTEM_WARNING: 'system.warning',
};
