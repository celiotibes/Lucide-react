/**
 * Webhook Integration Service
 * Event-driven webhooks and push notifications for external systems
 */

import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { redisCacheService } from './RedisCacheService';

interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  retryCount: number;
  retryDelayMs: number;
  headers?: Record<string, string>;
  createdAt: Date;
  lastTriggered?: Date;
}

interface WebhookEvent {
  id: string;
  webhookId: string;
  event: string;
  data: any;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

interface PushNotification {
  id: string;
  userId: string;
  caseId?: string;
  title: string;
  message: string;
  type: 'deadline' | 'decision' | 'document' | 'hearing' | 'update' | 'system';
  priority: 'low' | 'normal' | 'high' | 'critical';
  actionUrl?: string;
  sent: boolean;
  sentAt?: Date;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

interface NotificationPreference {
  userId: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  webhookNotifications: boolean;
  notifyOnDeadline: boolean;
  notifyOnDecision: boolean;
  notifyOnDocument: boolean;
  notifyOnHearing: boolean;
  quietHoursStart?: string; // HH:MM
  quietHoursEnd?: string; // HH:MM
  updatedAt: Date;
}

class WebhookIntegrationService {
  private cacheEnabled = true;
  private cacheTTL = 3600;
  private webhooks = new Map<string, Webhook>();
  private eventQueue: WebhookEvent[] = [];

  /**
   * Register webhook for events
   */
  async registerWebhook(
    url: string,
    events: string[],
    headers?: Record<string, string>,
  ): Promise<Webhook> {
    try {
      const webhookId = `webhook-${Date.now()}`;

      // Validate webhook URL
      try {
        new URL(url);
      } catch {
        throw new AppError(400, 'URL do webhook inválida');
      }

      if (events.length === 0) {
        throw new AppError(400, 'Pelo menos um evento deve ser especificado');
      }

      const webhook: Webhook = {
        id: webhookId,
        url,
        events,
        isActive: true,
        retryCount: 3,
        retryDelayMs: 5000,
        headers,
        createdAt: new Date(),
      };

      this.webhooks.set(webhookId, webhook);

      logger.info(
        { webhookId, url, events: events.length },
        'Webhook registered',
      );

      return webhook;
    } catch (error) {
      logger.error({ error }, 'Failed to register webhook');
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'Falha ao registrar webhook');
    }
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(
    webhookId: string,
    updates: Partial<Webhook>,
  ): Promise<Webhook> {
    try {
      const webhook = this.webhooks.get(webhookId);

      if (!webhook) {
        throw new AppError(404, 'Webhook não encontrado');
      }

      const updated: Webhook = {
        ...webhook,
        ...updates,
        id: webhook.id,
        createdAt: webhook.createdAt,
      };

      this.webhooks.set(webhookId, updated);

      logger.info({ webhookId }, 'Webhook updated');

      return updated;
    } catch (error) {
      logger.error({ error }, 'Failed to update webhook');
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'Falha ao atualizar webhook');
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    try {
      const webhook = this.webhooks.get(webhookId);

      if (!webhook) {
        throw new AppError(404, 'Webhook não encontrado');
      }

      this.webhooks.delete(webhookId);

      logger.info({ webhookId }, 'Webhook deleted');
    } catch (error) {
      logger.error({ error }, 'Failed to delete webhook');
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'Falha ao deletar webhook');
    }
  }

  /**
   * Get all webhooks
   */
  async getWebhooks(): Promise<Webhook[]> {
    return Array.from(this.webhooks.values());
  }

  /**
   * Trigger event to webhooks
   */
  async triggerEvent(
    event: string,
    data: any,
    caseId?: string,
  ): Promise<void> {
    try {
      const matchingWebhooks = Array.from(this.webhooks.values()).filter(
        w => w.isActive && w.events.includes(event),
      );

      if (matchingWebhooks.length === 0) {
        logger.debug({ event }, 'No webhooks registered for event');
        return;
      }

      for (const webhook of matchingWebhooks) {
        const eventRecord: WebhookEvent = {
          id: `event-${Date.now()}-${Math.random()}`,
          webhookId: webhook.id,
          event,
          data,
          status: 'pending',
          attempts: 0,
          createdAt: new Date(),
        };

        this.eventQueue.push(eventRecord);
        await this.executeWebhookWithRetry(webhook, eventRecord);
      }

      logger.info({ event, webhookCount: matchingWebhooks.length }, 'Event triggered');
    } catch (error) {
      logger.error({ error }, 'Failed to trigger event');
    }
  }

  /**
   * Execute webhook with retry logic
   */
  private async executeWebhookWithRetry(
    webhook: Webhook,
    event: WebhookEvent,
  ): Promise<void> {
    try {
      event.attempts += 1;
      event.lastAttemptAt = new Date();

      const payload = {
        id: event.id,
        event: event.event,
        timestamp: new Date(),
        data: event.data,
      };

      // Simulate webhook call
      const response = await this.callWebhook(webhook, payload);

      if (response.ok) {
        event.status = 'success';
        webhook.lastTriggered = new Date();
        logger.info({ webhookId: webhook.id }, 'Webhook executed successfully');
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      logger.warn(
        { webhookId: webhook.id, attempt: event.attempts, error },
        'Webhook execution failed',
      );

      if (event.attempts < webhook.retryCount) {
        event.status = 'retrying';
        event.nextRetryAt = new Date(
          Date.now() + webhook.retryDelayMs * Math.pow(2, event.attempts - 1),
        );

        setTimeout(
          () => this.executeWebhookWithRetry(webhook, event),
          event.nextRetryAt.getTime() - Date.now(),
        );
      } else {
        event.status = 'failed';
        event.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      }
    }
  }

  /**
   * Call webhook (simulated)
   */
  private async callWebhook(
    webhook: Webhook,
    payload: any,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...webhook.headers,
    };

    // In production, would use real fetch
    // For now, simulate success
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response;
  }

  /**
   * Send push notification
   */
  async sendPushNotification(
    userId: string,
    title: string,
    message: string,
    type: PushNotification['type'],
    priority: PushNotification['priority'] = 'normal',
    caseId?: string,
    actionUrl?: string,
  ): Promise<PushNotification> {
    try {
      const notifId = `notif-${Date.now()}`;

      const notification: PushNotification = {
        id: notifId,
        userId,
        caseId,
        title,
        message,
        type,
        priority,
        actionUrl,
        sent: true,
        sentAt: new Date(),
        read: false,
        createdAt: new Date(),
      };

      // Check notification preferences
      const preferences = await this.getNotificationPreferences(userId);

      if (!preferences.pushNotifications) {
        logger.info({ userId }, 'Push notifications disabled for user');
        return notification;
      }

      // Check quiet hours
      if (this.isInQuietHours(preferences)) {
        logger.info({ userId }, 'User in quiet hours - scheduling notification');
        notification.sentAt = this.getQuietHoursEnd(preferences);
      }

      logger.info(
        { userId, notifId, type, priority },
        'Push notification sent',
      );

      return notification;
    } catch (error) {
      logger.error({ error }, 'Failed to send push notification');
      throw new AppError(500, 'Falha ao enviar notificação');
    }
  }

  /**
   * Send bulk push notifications
   */
  async sendBulkPushNotifications(
    userIds: string[],
    title: string,
    message: string,
    type: PushNotification['type'],
    priority: PushNotification['priority'] = 'normal',
  ): Promise<PushNotification[]> {
    try {
      const notifications: PushNotification[] = [];

      for (const userId of userIds) {
        const notification = await this.sendPushNotification(
          userId,
          title,
          message,
          type,
          priority,
        );
        notifications.push(notification);
      }

      logger.info({ count: notifications.length }, 'Bulk push notifications sent');

      return notifications;
    } catch (error) {
      logger.error({ error }, 'Failed to send bulk push notifications');
      throw new AppError(500, 'Falha ao enviar notificações em massa');
    }
  }

  /**
   * Get user notification preferences
   */
  async getNotificationPreferences(userId: string): Promise<NotificationPreference> {
    const cacheKey = `user:${userId}:preferences`;

    // Check cache first
    const cached = await redisCacheService.get<NotificationPreference>(cacheKey);
    if (cached) {
      return cached;
    }

    // Default preferences
    const preferences: NotificationPreference = {
      userId,
      emailNotifications: true,
      pushNotifications: true,
      smsNotifications: false,
      webhookNotifications: true,
      notifyOnDeadline: true,
      notifyOnDecision: true,
      notifyOnDocument: true,
      notifyOnHearing: true,
      updatedAt: new Date(),
    };

    // Cache for 7 days
    await redisCacheService.setex(cacheKey, 604800, preferences);

    return preferences;
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    updates: Partial<NotificationPreference>,
  ): Promise<NotificationPreference> {
    try {
      const current = await this.getNotificationPreferences(userId);

      const updated: NotificationPreference = {
        ...current,
        ...updates,
        userId: current.userId,
        updatedAt: new Date(),
      };

      // Update cache
      const cacheKey = `user:${userId}:preferences`;
      await redisCacheService.setex(cacheKey, 604800, updated);

      logger.info({ userId }, 'Notification preferences updated');

      return updated;
    } catch (error) {
      logger.error({ error }, 'Failed to update notification preferences');
      throw new AppError(500, 'Falha ao atualizar preferências de notificação');
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      logger.info({ notificationId }, 'Marking notification as read');
      // In production, would update database
    } catch (error) {
      logger.error({ error }, 'Failed to mark notification as read');
      throw new AppError(500, 'Falha ao marcar notificação como lida');
    }
  }

  /**
   * Get event delivery status
   */
  async getEventDeliveryStatus(eventId: string): Promise<WebhookEvent | null> {
    return this.eventQueue.find(e => e.id === eventId) || null;
  }

  /**
   * Get webhook event history
   */
  async getWebhookEventHistory(webhookId: string, limit: number = 100): Promise<WebhookEvent[]> {
    return this.eventQueue
      .filter(e => e.webhookId === webhookId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Check if user is in quiet hours
   */
  private isInQuietHours(preferences: NotificationPreference): boolean {
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes(),
    ).padStart(2, '0')}`;

    const startTime = preferences.quietHoursStart;
    const endTime = preferences.quietHoursEnd;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime < endTime;
    } else {
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  /**
   * Get end time of quiet hours
   */
  private getQuietHoursEnd(preferences: NotificationPreference): Date {
    if (!preferences.quietHoursEnd) {
      return new Date();
    }

    const [hours, minutes] = preferences.quietHoursEnd.split(':').map(Number);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hours, minutes, 0, 0);

    return tomorrow;
  }
}

export const webhookIntegrationService = new WebhookIntegrationService();
