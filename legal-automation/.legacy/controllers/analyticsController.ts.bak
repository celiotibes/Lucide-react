import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { analyticsService } from '@services/AnalyticsService';

const router = Router();

// Obter Métricas do Dashboard
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, period = '30d' } = req.query;

    let start: Date;
    let end: Date = new Date();

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new AppError(400, 'Datas inválidas. Use formato ISO 8601');
      }
    } else {
      // Parse period string (30d, 90d, 1y, etc)
      const match = (period as string).match(/^(\d+)([dwmy])$/);
      if (!match) {
        throw new AppError(400, 'Período inválido. Use formato como 30d, 90d, 1y');
      }

      const [, amount, unit] = match;
      const numAmount = parseInt(amount);

      switch (unit) {
        case 'd':
          start = new Date(end.getTime() - numAmount * 24 * 60 * 60 * 1000);
          break;
        case 'w':
          start = new Date(end.getTime() - numAmount * 7 * 24 * 60 * 60 * 1000);
          break;
        case 'm':
          start = new Date(end.getTime() - numAmount * 30 * 24 * 60 * 60 * 1000);
          break;
        case 'y':
          start = new Date(end.getTime() - numAmount * 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          throw new AppError(400, 'Unidade de período inválida');
      }
    }

    logger.info(`Obtendo métricas de dashboard para período: ${start.toISOString()} a ${end.toISOString()}`);

    const metrics = await analyticsService.getDashboardMetrics({
      startDate: start,
      endDate: end,
    });

    res.json({
      status: 'success',
      data: metrics,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter métricas de dashboard');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Performance de Advogado
router.get('/lawyer-performance/:lawyerId', async (req: Request, res: Response) => {
  try {
    const { lawyerId } = req.params;
    const { startDate, endDate, period = '90d' } = req.query;

    if (!lawyerId) {
      throw new AppError(400, 'ID do advogado é obrigatório');
    }

    let start: Date;
    let end: Date = new Date();

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new AppError(400, 'Datas inválidas. Use formato ISO 8601');
      }
    } else {
      const match = (period as string).match(/^(\d+)([dwmy])$/);
      if (!match) {
        throw new AppError(400, 'Período inválido. Use formato como 30d, 90d, 1y');
      }

      const [, amount, unit] = match;
      const numAmount = parseInt(amount);

      switch (unit) {
        case 'd':
          start = new Date(end.getTime() - numAmount * 24 * 60 * 60 * 1000);
          break;
        case 'w':
          start = new Date(end.getTime() - numAmount * 7 * 24 * 60 * 60 * 1000);
          break;
        case 'm':
          start = new Date(end.getTime() - numAmount * 30 * 24 * 60 * 60 * 1000);
          break;
        case 'y':
          start = new Date(end.getTime() - numAmount * 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          throw new AppError(400, 'Unidade de período inválida');
      }
    }

    logger.info(`Obtendo performance do advogado ${lawyerId} para período: ${start.toISOString()} a ${end.toISOString()}`);

    const performance = await analyticsService.getLawyerPerformance(lawyerId, {
      startDate: start,
      endDate: end,
    });

    res.json({
      status: 'success',
      data: performance,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter performance de advogado');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Prever Resultado de Caso
router.post('/predict-outcome', async (req: Request, res: Response) => {
  try {
    const { caseId } = req.body;

    if (!caseId) {
      throw new AppError(400, 'ID do caso é obrigatório');
    }

    logger.debug(`Prevendo resultado para caso ${caseId}`);

    const prediction = await analyticsService.predictCaseOutcome(caseId);

    res.json({
      status: 'success',
      data: prediction,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao prever resultado do caso');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Insights de Jurisprudência
router.get('/jurisprudence-insights/:caseId', async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    if (!caseId) {
      throw new AppError(400, 'ID do caso é obrigatório');
    }

    logger.debug(`Obtendo insights de jurisprudência para caso ${caseId}`);

    const insights = await analyticsService.getJurisprudenceInsights(caseId);

    res.json({
      status: 'success',
      data: insights,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter insights de jurisprudência');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Comparação de Tribunais
router.get('/tribunal-comparison', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, period = '90d' } = req.query;

    let start: Date;
    let end: Date = new Date();

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new AppError(400, 'Datas inválidas. Use formato ISO 8601');
      }
    } else {
      const match = (period as string).match(/^(\d+)([dwmy])$/);
      if (!match) {
        throw new AppError(400, 'Período inválido. Use formato como 30d, 90d, 1y');
      }

      const [, amount, unit] = match;
      const numAmount = parseInt(amount);

      switch (unit) {
        case 'd':
          start = new Date(end.getTime() - numAmount * 24 * 60 * 60 * 1000);
          break;
        case 'w':
          start = new Date(end.getTime() - numAmount * 7 * 24 * 60 * 60 * 1000);
          break;
        case 'm':
          start = new Date(end.getTime() - numAmount * 30 * 24 * 60 * 60 * 1000);
          break;
        case 'y':
          start = new Date(end.getTime() - numAmount * 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          throw new AppError(400, 'Unidade de período inválida');
      }
    }

    logger.info(`Obtendo comparação de tribunais para período: ${start.toISOString()} a ${end.toISOString()}`);

    const comparison = await analyticsService.getTribunalComparisonPublic({
      startDate: start,
      endDate: end,
    });

    res.json({
      status: 'success',
      data: comparison,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter comparação de tribunais');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Taxa de Sucesso por Tribunal
router.get('/success-rate-by-tribunal', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, period = '90d' } = req.query;

    let start: Date;
    let end: Date = new Date();

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new AppError(400, 'Datas inválidas. Use formato ISO 8601');
      }
    } else {
      const match = (period as string).match(/^(\d+)([dwmy])$/);
      if (!match) {
        throw new AppError(400, 'Período inválido. Use formato como 30d, 90d, 1y');
      }

      const [, amount, unit] = match;
      const numAmount = parseInt(amount);

      switch (unit) {
        case 'd':
          start = new Date(end.getTime() - numAmount * 24 * 60 * 60 * 1000);
          break;
        case 'w':
          start = new Date(end.getTime() - numAmount * 7 * 24 * 60 * 60 * 1000);
          break;
        case 'm':
          start = new Date(end.getTime() - numAmount * 30 * 24 * 60 * 60 * 1000);
          break;
        case 'y':
          start = new Date(end.getTime() - numAmount * 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          throw new AppError(400, 'Unidade de período inválida');
      }
    }

    logger.debug(`Obtendo taxa de sucesso por tribunal para período: ${start.toISOString()} a ${end.toISOString()}`);

    const successRates = await analyticsService.getSuccessRateByTribunal({
      startDate: start,
      endDate: end,
    });

    res.json({
      status: 'success',
      data: successRates,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter taxa de sucesso por tribunal');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Obter Tendências Temporais
router.get('/trends', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, period = '90d', granularity = 'daily' } = req.query;

    let start: Date;
    let end: Date = new Date();

    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new AppError(400, 'Datas inválidas. Use formato ISO 8601');
      }
    } else {
      const match = (period as string).match(/^(\d+)([dwmy])$/);
      if (!match) {
        throw new AppError(400, 'Período inválido. Use formato como 30d, 90d, 1y');
      }

      const [, amount, unit] = match;
      const numAmount = parseInt(amount);

      switch (unit) {
        case 'd':
          start = new Date(end.getTime() - numAmount * 24 * 60 * 60 * 1000);
          break;
        case 'w':
          start = new Date(end.getTime() - numAmount * 7 * 24 * 60 * 60 * 1000);
          break;
        case 'm':
          start = new Date(end.getTime() - numAmount * 30 * 24 * 60 * 60 * 1000);
          break;
        case 'y':
          start = new Date(end.getTime() - numAmount * 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          throw new AppError(400, 'Unidade de período inválida');
      }
    }

    if (!['daily', 'weekly', 'monthly'].includes(granularity as string)) {
      throw new AppError(400, 'Granularidade inválida. Use: daily, weekly, monthly');
    }

    logger.debug(`Obtendo tendências para período: ${start.toISOString()} a ${end.toISOString()}`);

    const trends = await analyticsService.getTrends({
      startDate: start,
      endDate: end,
      granularity: granularity as 'daily' | 'weekly' | 'monthly',
    });

    res.json({
      status: 'success',
      data: trends,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter tendências');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
