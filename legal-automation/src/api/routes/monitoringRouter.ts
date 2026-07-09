import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { monitoringService } from '@services/MonitoringService';

const router = Router();

// GET /monitoring/health - Get system health status
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = monitoringService.getHealthCheck();

    res.status(health.status === 'critical' ? 503 : 200).json({
      status: 'success',
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter status de saúde');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter status de saúde',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /monitoring/performance - Get performance metrics
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const performance = monitoringService.getPerformanceSummary();

    res.json({
      status: 'success',
      data: performance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter métricas de performance');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter métricas de performance',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /monitoring/alerts - Get active alerts
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const severity = req.query.severity as string | undefined;
    const type = req.query.type as string | undefined;

    let alerts = monitoringService.getActiveAlerts();

    if (severity) {
      alerts = monitoringService.getAlertsBySeverity(severity as any);
    }

    if (type) {
      alerts = alerts.filter((a) => a.type === type);
    }

    res.json({
      status: 'success',
      data: {
        total: alerts.length,
        alerts,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter alertas');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter alertas',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /monitoring/alerts/:alertId/resolve - Resolve alert
router.post('/alerts/:alertId/resolve', async (req: Request, res: Response) => {
  try {
    const alertId = req.params.alertId;
    const resolved = monitoringService.resolveAlert(alertId);

    if (!resolved) {
      return res.status(404).json({
        status: 'error',
        message: `Alerta não encontrado: ${alertId}`,
      });
    }

    res.json({
      status: 'success',
      message: `Alerta ${alertId} resolvido`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao resolver alerta');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao resolver alerta',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /monitoring/metrics - Get all metric names
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const names = monitoringService.getAllMetricNames();

    res.json({
      status: 'success',
      data: {
        total: names.length,
        metrics: names,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter nomes de métricas');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter nomes de métricas',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /monitoring/metrics/:metricName - Get metric data and stats
router.get('/metrics/:metricName', async (req: Request, res: Response) => {
  try {
    const metricName = req.params.metricName;
    const metrics = monitoringService.getMetrics(metricName);
    const stats = monitoringService.getMetricStats(metricName);

    if (!stats) {
      return res.status(404).json({
        status: 'error',
        message: `Métrica não encontrada: ${metricName}`,
      });
    }

    res.json({
      status: 'success',
      data: {
        name: metricName,
        stats,
        recent: metrics.slice(-20), // Last 20 points
        total: metrics.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter métrica');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter métrica',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /monitoring/dashboard - Get full dashboard data
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const dashboard = monitoringService.getDashboardData();

    res.json({
      status: 'success',
      data: dashboard,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter dados do dashboard');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter dados do dashboard',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /monitoring/track - Track request performance (internal)
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { taskType, latency, success, cost, provider } = req.body;

    if (!taskType || latency === undefined || success === undefined || !provider) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: taskType, latency, success, provider',
      });
    }

    monitoringService.trackRequest(taskType, latency, success, cost || 0, provider);

    res.json({
      status: 'success',
      message: 'Request tracked',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao rastrear requisição');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao rastrear requisição',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /monitoring/cleanup - Clean old monitoring data
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const minutes = req.body.olderThanMinutes || 60;
    const removed = monitoringService.clearOldData(minutes);

    res.json({
      status: 'success',
      data: {
        removed,
        message: `Removed ${removed} old data points older than ${minutes} minutes`,
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
