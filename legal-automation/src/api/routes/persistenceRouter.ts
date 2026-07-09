import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { persistenceService } from '@services/PersistenceService';

const router = Router();

// GET /persistence/cost-analytics - Get cost analytics
router.get('/cost-analytics', async (req: Request, res: Response) => {
  try {
    const hoursBack = parseInt(req.query.hours as string) || 24;
    const analytics = await persistenceService.getCostAnalytics(hoursBack);

    res.json({
      status: 'success',
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter análise de custos');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter análise de custos',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /persistence/performance-analytics - Get performance analytics
router.get('/performance-analytics', async (req: Request, res: Response) => {
  try {
    const hoursBack = parseInt(req.query.hours as string) || 24;
    const analytics = await persistenceService.getPerformanceAnalytics(hoursBack);

    res.json({
      status: 'success',
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter análise de performance');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter análise de performance',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /persistence/system-summary - Get system summary
router.get('/system-summary', async (req: Request, res: Response) => {
  try {
    const summary = await persistenceService.getSystemSummary();

    res.json({
      status: 'success',
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter resumo do sistema');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter resumo do sistema',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /persistence/quota-stats - Get quota statistics
router.get('/quota-stats', async (req: Request, res: Response) => {
  try {
    const stats = await persistenceService.getQuotaStatistics();

    res.json({
      status: 'success',
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estatísticas de quota');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter estatísticas de quota',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /persistence/ab-testing-analytics/:taskType - Get A/B testing analytics
router.get('/ab-testing-analytics/:taskType', async (req: Request, res: Response) => {
  try {
    const taskType = req.params.taskType;
    const analytics = await persistenceService.getABTestingAnalytics(taskType);

    res.json({
      status: 'success',
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter analytics de A/B testing');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter analytics de A/B testing',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /persistence/model-performance/:model - Get model performance
router.get('/model-performance/:model', async (req: Request, res: Response) => {
  try {
    const model = req.params.model;
    const performance = await persistenceService.getModelPerformance(model);

    res.json({
      status: 'success',
      data: performance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter performance do modelo');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter performance do modelo',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /persistence/record-metric - Record a metric
router.post('/record-metric', async (req: Request, res: Response) => {
  try {
    const { metricName, metricValue, taskType, provider, analyticsData } = req.body;

    if (!metricName || metricValue === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: metricName, metricValue',
      });
    }

    await persistenceService.recordAnalytic(metricName, metricValue, taskType, provider, analyticsData);

    res.json({
      status: 'success',
      message: 'Métrica registrada com sucesso',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao registrar métrica');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao registrar métrica',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /persistence/cleanup - Cleanup old analytics data
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const daysOld = req.body.daysOld || 30;
    const removed = await persistenceService.cleanupOldAnalytics(daysOld);

    res.json({
      status: 'success',
      data: {
        removed,
        message: `${removed} registros antigos removidos`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao limpar dados antigos');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao limpar dados antigos',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
