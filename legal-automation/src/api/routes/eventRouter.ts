import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { eventService } from '@services/EventEmitterService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * POST /events/webhooks - Register webhook
 */
router.post('/webhooks', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url, events, secret, maxRetries } = req.body;

    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      throw new AppError('url e events (array não-vazio) são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const webhook = eventService.registerWebhook(url, events, secret, maxRetries || 3);

    res.status(201).json({
      statusCode: 201,
      data: webhook,
      message: 'Webhook registrado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /events/webhooks - List all webhooks
 */
router.get('/webhooks', (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhooks = eventService.listWebhooks();

    res.json({
      statusCode: 200,
      data: webhooks,
      total: webhooks.length,
      message: 'Webhooks obtidos com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /events/webhooks/:webhookId - Get specific webhook
 */
router.get('/webhooks/:webhookId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { webhookId } = req.params;

    const webhook = eventService.getWebhook(webhookId);

    if (!webhook) {
      return res.status(404).json({
        statusCode: 404,
        data: null,
        message: `Webhook ${webhookId} não encontrado`,
      });
    }

    res.json({
      statusCode: 200,
      data: webhook,
      message: 'Webhook obtido com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /events/webhooks/:webhookId - Update webhook
 */
router.put('/webhooks/:webhookId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { webhookId } = req.params;
    const { url, events, active, secret, maxRetries } = req.body;

    const updates: any = {};
    if (url) updates.url = url;
    if (events) updates.events = events;
    if (active !== undefined) updates.active = active;
    if (secret) updates.secret = secret;
    if (maxRetries) updates.maxRetries = maxRetries;

    const webhook = eventService.updateWebhook(webhookId, updates);

    if (!webhook) {
      return res.status(404).json({
        statusCode: 404,
        data: null,
        message: `Webhook ${webhookId} não encontrado`,
      });
    }

    res.json({
      statusCode: 200,
      data: webhook,
      message: 'Webhook atualizado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /events/webhooks/:webhookId - Delete webhook
 */
router.delete('/webhooks/:webhookId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { webhookId } = req.params;

    const removed = eventService.removeWebhook(webhookId);

    if (!removed) {
      return res.status(404).json({
        statusCode: 404,
        data: null,
        message: `Webhook ${webhookId} não encontrado`,
      });
    }

    res.json({
      statusCode: 200,
      message: 'Webhook removido com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /events/history - Get event history
 */
router.get('/history', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventType, limit } = req.query;

    const history = eventService.getEventHistory(
      eventType as string,
      limit ? parseInt(limit as string) : 100,
    );

    res.json({
      statusCode: 200,
      data: history,
      total: history.length,
      message: 'Histórico de eventos obtido com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /events/statistics - Get event statistics
 */
router.get('/statistics', (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = eventService.getStatistics();

    res.json({
      statusCode: 200,
      data: stats,
      message: 'Estatísticas de eventos obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /events/reset - Reset event data (testing only)
 */
router.post('/reset', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { confirmReset } = req.body;

    if (!confirmReset) {
      throw new AppError('Confirmação de reset é obrigatória', 400, 'VALIDATION_ERROR');
    }

    eventService.reset();

    res.json({
      statusCode: 200,
      message: 'EventService resetado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
