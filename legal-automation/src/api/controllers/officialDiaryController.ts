import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { officialDiaryService } from '@services/OfficialDiaryService';

const router = Router();

// Configurar Preferências de Alerta
router.post('/alert-preferences', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      processNumbers = [],
      partyNames = [],
      keywords = [],
      states = [],
      emailNotification = true,
      smsNotification = false,
      pushNotification = true,
      slackNotification = false,
    } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.info(`Configurando preferências de alerta para ${userId}`);

    const preferences = await officialDiaryService.setAlertPreferences(userId, {
      processNumbers,
      partyNames,
      keywords,
      states,
      emailNotification,
      smsNotification,
      pushNotification,
      slackNotification,
    });

    res.json({
      status: 'success',
      data: preferences,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao configurar preferências');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Preferências de Alerta
router.get('/alert-preferences', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Obtendo preferências de alerta para ${userId}`);

    const preferences = await officialDiaryService.getAlertPreferences(userId);

    res.json({
      status: 'success',
      data: preferences,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter preferências');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Alertas
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { unread = false, limit = 50, offset = 0 } = req.query;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Obtendo alertas para ${userId}`);

    const alerts = await officialDiaryService.getAlerts(
      userId,
      unread === 'true',
      parseInt(limit as string) || 50,
      parseInt(offset as string) || 0,
    );

    res.json({
      status: 'success',
      data: alerts,
      pagination: {
        limit: parseInt(limit as string) || 50,
        offset: parseInt(offset as string) || 0,
        total: alerts.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter alertas');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Marcar Alerta como Lido
router.post('/alerts/:alertId/read', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { alertId } = req.params;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Marcando alerta ${alertId} como lido`);

    await officialDiaryService.markAlertAsRead(userId, alertId);

    res.json({
      status: 'success',
      message: 'Alerta marcado como lido',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao marcar alerta');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Marcar Todos os Alertas como Lidos
router.post('/alerts/mark-all-read', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.info(`Marcando todos os alertas de ${userId} como lidos`);

    const count = await officialDiaryService.markAllAlertsAsRead(userId);

    res.json({
      status: 'success',
      message: 'Alertas marcados como lidos',
      markedCount: count,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao marcar alertas');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Buscar Diários
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query, state, limit = 20 } = req.query;

    if (!query) {
      throw new AppError(400, 'Query é obrigatório');
    }

    logger.debug(`Buscando diários com query: "${query}"`);

    const results = await officialDiaryService.searchDiaries(
      query as string,
      state as string | undefined,
      parseInt(limit as string) || 20,
    );

    res.json({
      status: 'success',
      data: results,
      count: results.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar diários');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Estatísticas de Diários
router.get('/stats', async (req: Request, res: Response) => {
  try {
    logger.debug('Obtendo estatísticas de diários');

    const stats = await officialDiaryService.getDiaryStats();

    res.json({
      status: 'success',
      data: stats,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estatísticas');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
