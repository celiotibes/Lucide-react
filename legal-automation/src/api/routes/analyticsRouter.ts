/**
 * Analytics Router
 * REST endpoints para métricas, KPIs e relatórios
 */

import { Router, Request, Response } from 'express';
import { analyticsService } from '@services/AnalyticsService';
import { verifyToken } from '@middlewares/authMiddleware';
import { logger } from '@utils/logger';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string };
}

/**
 * GET /api/v1/analytics/dashboard - Dashboard com todos os dados
 */
router.get('/dashboard', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dashboard = await analyticsService.getDashboardMetrics();
    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter dashboard');
    res.status(500).json({
      success: false,
      error: 'Erro ao obter dashboard',
    });
  }
});

/**
 * GET /api/v1/analytics/kpis - KPIs principais
 */
router.get('/kpis', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const kpis = await analyticsService.calculateKPIs();
    res.json({
      success: true,
      data: kpis,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao calcular KPIs');
    res.status(500).json({
      success: false,
      error: 'Erro ao calcular KPIs',
    });
  }
});

/**
 * GET /api/v1/analytics/cases - Métricas de casos
 */
router.get('/cases', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = await analyticsService.getCaseMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter métricas de casos');
    res.status(500).json({
      success: false,
      error: 'Erro ao obter métricas de casos',
    });
  }
});

/**
 * GET /api/v1/analytics/clients - Métricas de clientes
 */
router.get('/clients', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = await analyticsService.getClientMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter métricas de clientes');
    res.status(500).json({
      success: false,
      error: 'Erro ao obter métricas de clientes',
    });
  }
});

/**
 * GET /api/v1/analytics/financial - Métricas financeiras
 */
router.get('/financial', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = await analyticsService.getFinancialMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter métricas financeiras');
    res.status(500).json({
      success: false,
      error: 'Erro ao obter métricas financeiras',
    });
  }
});

/**
 * GET /api/v1/analytics/performance - Métricas de desempenho
 */
router.get('/performance', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = await analyticsService.getPerformanceMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter métricas de desempenho');
    res.status(500).json({
      success: false,
      error: 'Erro ao obter métricas de desempenho',
    });
  }
});

/**
 * GET /api/v1/analytics/metrics - Métricas por período
 */
router.get('/metrics', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate e endDate são requeridos',
      });
    }

    const metrics = await analyticsService.getMetricsByPeriod(
      new Date(startDate as string),
      new Date(endDate as string),
    );

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter métricas por período');
    res.status(500).json({
      success: false,
      error: 'Erro ao obter métricas por período',
    });
  }
});

/**
 * GET /api/v1/analytics/lawyer/:lawyerId - Métricas de advogado
 */
router.get('/lawyer/:lawyerId', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { lawyerId } = req.params;
    const metrics = await analyticsService.getMetricsByLawyer(lawyerId);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter métricas de advogado');
    res.status(500).json({
      success: false,
      error: 'Erro ao obter métricas de advogado',
    });
  }
});

/**
 * POST /api/v1/analytics/cache/clear - Limpar cache de analytics
 */
router.post('/cache/clear', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await analyticsService.clearAnalyticsCache();
    res.json({
      success: true,
      message: 'Cache de analytics limpo com sucesso',
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao limpar cache');
    res.status(500).json({
      success: false,
      error: 'Erro ao limpar cache',
    });
  }
});

export default router;
