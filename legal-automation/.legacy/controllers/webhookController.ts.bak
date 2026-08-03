/**
 * Webhook Controller
 * Endpoints for managing webhooks and push notifications
 */

import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { webhookIntegrationService } from '@services/WebhookIntegrationService';
import { auditLogService } from '@services/AuditLogService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * POST /api/v1/webhooks/register
 * Register a new webhook
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { url, events, headers } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!url || !events) {
      throw new AppError(400, 'URL e eventos são obrigatórios');
    }

    logger.info({ url, eventCount: events.length }, 'Registering webhook');

    const webhook = await webhookIntegrationService.registerWebhook(url, events, headers);

    await auditLogService.log({
      action: 'WEBHOOK_REGISTERED',
      entityType: 'Webhook',
      entityId: webhook.id,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          url: webhook.url,
          events: webhook.events.length,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: webhook,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to register webhook');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/webhooks
 * List all webhooks
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching all webhooks');

    const webhooks = await webhookIntegrationService.getWebhooks();

    res.json({
      success: true,
      data: webhooks,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch webhooks');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * PUT /api/v1/webhooks/:webhookId
 * Update webhook
 */
router.put('/:webhookId', async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const { isActive, events, headers } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    logger.info({ webhookId }, 'Updating webhook');

    const webhook = await webhookIntegrationService.updateWebhook(webhookId, {
      isActive,
      events,
      headers,
    });

    await auditLogService.log({
      action: 'WEBHOOK_UPDATED',
      entityType: 'Webhook',
      entityId: webhookId,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          isActive: webhook.isActive,
          events: webhook.events.length,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: webhook,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update webhook');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * DELETE /api/v1/webhooks/:webhookId
 * Delete webhook
 */
router.delete('/:webhookId', async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const userId = (req as any).user?.id || 'unknown';

    logger.info({ webhookId }, 'Deleting webhook');

    await webhookIntegrationService.deleteWebhook(webhookId);

    await auditLogService.log({
      action: 'WEBHOOK_DELETED',
      entityType: 'Webhook',
      entityId: webhookId,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        before: { webhookId },
      },
      status: 'success',
    });

    res.json({
      success: true,
      message: 'Webhook deletado com sucesso',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to delete webhook');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/webhooks/:webhookId/test
 * Test webhook delivery
 */
router.post('/:webhookId/test', async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const userId = (req as any).user?.id || 'unknown';

    logger.info({ webhookId }, 'Testing webhook');

    await webhookIntegrationService.triggerEvent('test', {
      timestamp: new Date(),
      message: 'Teste de entrega de webhook',
    });

    await auditLogService.log({
      action: 'WEBHOOK_TEST',
      entityType: 'Webhook',
      entityId: webhookId,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: { tested: true },
      },
      status: 'success',
    });

    res.json({
      success: true,
      message: 'Webhook testado com sucesso',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to test webhook');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/webhooks/:webhookId/events
 * Get webhook event history
 */
router.get('/:webhookId/events', async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const { limit = '100' } = req.query;

    logger.info({ webhookId }, 'Fetching webhook events');

    const events = await webhookIntegrationService.getWebhookEventHistory(
      webhookId,
      parseInt(limit as string, 10),
    );

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch webhook events');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/notifications/push
 * Send push notification
 */
router.post('/notifications/push', async (req: Request, res: Response) => {
  try {
    const { userId, title, message, type, priority, caseId, actionUrl } = req.body;
    const currentUserId = (req as any).user?.id || 'unknown';

    if (!userId || !title || !message || !type) {
      throw new AppError(400, 'userId, title, message e type são obrigatórios');
    }

    logger.info({ userId, type }, 'Sending push notification');

    const notification = await webhookIntegrationService.sendPushNotification(
      userId,
      title,
      message,
      type,
      priority || 'normal',
      caseId,
      actionUrl,
    );

    await auditLogService.log({
      action: 'PUSH_NOTIFICATION_SENT',
      entityType: 'Notification',
      entityId: notification.id,
      userId: currentUserId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          targetUser: userId,
          type: notification.type,
          priority: notification.priority,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to send push notification');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/notifications/push/bulk
 * Send bulk push notifications
 */
router.post('/notifications/push/bulk', async (req: Request, res: Response) => {
  try {
    const { userIds, title, message, type, priority } = req.body;
    const currentUserId = (req as any).user?.id || 'unknown';

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new AppError(400, 'Array de userIds obrigatório');
    }

    if (!title || !message || !type) {
      throw new AppError(400, 'title, message e type são obrigatórios');
    }

    logger.info({ userCount: userIds.length, type }, 'Sending bulk push notifications');

    const notifications = await webhookIntegrationService.sendBulkPushNotifications(
      userIds,
      title,
      message,
      type,
      priority || 'normal',
    );

    await auditLogService.log({
      action: 'BULK_PUSH_NOTIFICATIONS_SENT',
      entityType: 'Notification',
      entityId: `bulk-${Date.now()}`,
      userId: currentUserId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          recipientCount: notifications.length,
          type: notifications[0]?.type,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: {
        sent: notifications.length,
        notifications,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to send bulk push notifications');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/notifications/preferences
 * Get user notification preferences
 */
router.get('/notifications/preferences', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'unknown';

    logger.info({ userId }, 'Fetching notification preferences');

    const preferences = await webhookIntegrationService.getNotificationPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch notification preferences');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * PUT /api/v1/notifications/preferences
 * Update notification preferences
 */
router.put('/notifications/preferences', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'unknown';
    const updates = req.body;

    logger.info({ userId }, 'Updating notification preferences');

    const preferences = await webhookIntegrationService.updateNotificationPreferences(
      userId,
      updates,
    );

    await auditLogService.log({
      action: 'NOTIFICATION_PREFERENCES_UPDATED',
      entityType: 'User',
      entityId: userId,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          emailNotifications: preferences.emailNotifications,
          pushNotifications: preferences.pushNotifications,
          webhookNotifications: preferences.webhookNotifications,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update notification preferences');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
