import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { auditTrailService } from '@services/AuditTrailService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * GET /audit/logs - Query audit logs
 */
router.get('/logs', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, userId, action, entityType, entityId, status, limit, offset } = req.query;

    const criteria = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: userId as string,
      action: action as string,
      entityType: entityType as string,
      entityId: entityId as string,
      status: status as 'success' | 'failed',
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0,
    };

    const logs = auditTrailService.query(criteria);

    res.json({
      statusCode: 200,
      data: logs,
      total: logs.length,
      message: 'Logs de auditoria obtidos com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /audit/logs/:logId - Get specific log
 */
router.get('/logs/:logId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { logId } = req.params;

    const log = auditTrailService.getLog(logId);

    if (!log) {
      return res.status(404).json({
        statusCode: 404,
        data: null,
        message: `Log ${logId} não encontrado`,
      });
    }

    res.json({
      statusCode: 200,
      data: log,
      message: 'Log obtido com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /audit/entity/:entityType/:entityId - Get audit history for entity
 */
router.get('/entity/:entityType/:entityId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId } = req.params;

    const history = auditTrailService.getEntityHistory(entityType, entityId);

    res.json({
      statusCode: 200,
      data: history,
      total: history.length,
      message: 'Histórico de auditoria da entidade obtido com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /audit/user/:userId - Get user activity
 */
router.get('/user/:userId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const { days } = req.query;

    const activity = auditTrailService.getUserActivity(userId, days ? parseInt(days as string) : 30);

    res.json({
      statusCode: 200,
      data: activity,
      total: activity.length,
      message: 'Atividade do usuário obtida com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /audit/export - Export audit logs to CSV
 */
router.get('/export', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, userId, action, entityType, status } = req.query;

    const criteria = {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: userId as string,
      action: action as string,
      entityType: entityType as string,
      status: status as 'success' | 'failed',
    };

    const csv = auditTrailService.export(criteria);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /audit/statistics - Get audit statistics
 */
router.get('/statistics', (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = auditTrailService.getStatistics();

    res.json({
      statusCode: 200,
      data: stats,
      message: 'Estatísticas de auditoria obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /audit/reset - Reset audit data (testing only)
 */
router.post('/reset', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { confirmReset } = req.body;

    if (!confirmReset) {
      throw new AppError('Confirmação de reset é obrigatória', 400, 'VALIDATION_ERROR');
    }

    auditTrailService.reset();

    res.json({
      statusCode: 200,
      message: 'AuditTrailService resetado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
