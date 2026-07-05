import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { astreaService } from '@services/AstreaService';

const router = Router();

/**
 * POST /astrea/analytics/kpis
 * Registrar um KPI
 */
router.post('/kpis', verifyToken, async (req: Request, res: Response) => {
  try {
    const { escritorioId, name, category, value, target, unit, period, trend, changePercentage } = req.body;

    if (!escritorioId || !name || !category || value === undefined || !unit || !period) {
      return res.status(400).json({
        error: 'escritorioId, name, category, value, unit e period são obrigatórios',
      });
    }

    const kpi = await astreaService.recordKPI(escritorioId, {
      name,
      category,
      value,
      target,
      unit,
      period,
      trend: trend || 'stable',
      changePercentage: changePercentage || 0,
    });

    res.json({
      status: 'success',
      kpi,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao registrar KPI');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao registrar KPI',
    });
  }
});

/**
 * GET /astrea/analytics/kpis
 * Listar KPIs
 */
router.get('/kpis', verifyToken, async (req: Request, res: Response) => {
  try {
    const { escritorioId, category } = req.query;

    if (!escritorioId) {
      return res.status(400).json({
        error: 'escritorioId é obrigatório',
      });
    }

    const kpis = await astreaService.getKPIs(
      escritorioId as string,
      category as string,
    );

    res.json({
      status: 'success',
      count: kpis.length,
      kpis,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar KPIs');
    res.status(500).json({
      error: 'Erro ao listar KPIs',
    });
  }
});

/**
 * GET /astrea/analytics/escritorio/:escritorioId/dashboard
 * Obter dashboard analítico do escritório
 */
router.get('/escritorio/:escritorioId/dashboard', verifyToken, async (req: Request, res: Response) => {
  try {
    const { escritorioId } = req.params;

    const financialMetrics = await astreaService.getFinancialMetrics(escritorioId);
    const kpis = await astreaService.getKPIs(escritorioId);

    res.json({
      status: 'success',
      dashboard: {
        financial: {
          totalRevenue: financialMetrics.totalRevenue,
          totalCosts: financialMetrics.totalCosts,
          netProfit: financialMetrics.netProfit,
          profitMargin: financialMetrics.profitMargin,
          accountsReceivable: financialMetrics.accountsReceivable,
          cashFlow: financialMetrics.cashFlow,
        },
        kpis: {
          financial: kpis.filter(k => k.category === 'financial'),
          operational: kpis.filter(k => k.category === 'operational'),
          quality: kpis.filter(k => k.category === 'quality'),
        },
        performance: {
          averageCaseRevenue: financialMetrics.averageCaseRevenue,
          averageCaseCost: financialMetrics.averageCaseCost,
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter dashboard');
    res.status(500).json({
      error: 'Erro ao obter dashboard',
    });
  }
});

/**
 * GET /astrea/analytics/financial-health
 * Obter indicadores de saúde financeira
 */
router.get('/financial-health', verifyToken, async (req: Request, res: Response) => {
  try {
    const { escritorioId } = req.query;

    if (!escritorioId) {
      return res.status(400).json({
        error: 'escritorioId é obrigatório',
      });
    }

    const metrics = await astreaService.getFinancialMetrics(escritorioId as string);

    const health = {
      status: metrics.profitMargin > 30 ? 'excellent' : metrics.profitMargin > 20 ? 'good' : metrics.profitMargin > 10 ? 'fair' : 'poor',
      metrics,
      recommendations: [] as string[],
    };

    if (metrics.profitMargin < 15) {
      health.recommendations.push('Aumentar taxas ou reduzir custos operacionais');
    }

    if (metrics.accountsReceivable > metrics.totalRevenue * 0.3) {
      health.recommendations.push('Focar em cobrança de contas a receber');
    }

    res.json({
      status: 'success',
      health,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter saúde financeira');
    res.status(500).json({
      error: 'Erro ao obter saúde financeira',
    });
  }
});

/**
 * GET /astrea/analytics/trends
 * Obter tendências
 */
router.get('/trends', verifyToken, async (req: Request, res: Response) => {
  try {
    const { escritorioId, period } = req.query;

    if (!escritorioId) {
      return res.status(400).json({
        error: 'escritorioId é obrigatório',
      });
    }

    const kpis = await astreaService.getKPIs(escritorioId as string);

    const trends = {
      revenue: kpis
        .filter(k => k.name.includes('Revenue'))
        .map(k => ({
          period: k.period,
          value: k.value,
          trend: k.trend,
          changePercentage: k.changePercentage,
        })),
      profit: kpis
        .filter(k => k.name.includes('Profit'))
        .map(k => ({
          period: k.period,
          value: k.value,
          trend: k.trend,
          changePercentage: k.changePercentage,
        })),
      efficiency: kpis
        .filter(k => k.category === 'operational')
        .map(k => ({
          name: k.name,
          value: k.value,
          trend: k.trend,
          target: k.target,
        })),
    };

    res.json({
      status: 'success',
      trends,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter tendências');
    res.status(500).json({
      error: 'Erro ao obter tendências',
    });
  }
});

export const astreaAnalyticsController = router;
