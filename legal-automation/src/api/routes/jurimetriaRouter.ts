import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { jurimetriaService } from '@services/JurimetriaService';
import { AppError } from '@utils/errors';

// ============================================================================
// JURIMETRIA ROUTER - Phase 4 - Legal Analytics & Case Prediction
// ============================================================================

const router = Router();

/**
 * POST /cases - Register case metrics
 */
router.post('/cases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId, caseType, court, judge, lawyer, complexity, costs, revenue } = req.body;

    if (!clientId || !caseType || !court || !judge || !lawyer || !complexity || costs === undefined || revenue === undefined) {
      throw new AppError('Todos os campos são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const validComplexities = ['simple', 'moderate', 'complex'];
    if (!validComplexities.includes(complexity)) {
      throw new AppError('Complexidade inválida', 400, 'INVALID_COMPLEXITY');
    }

    const caseMetrics = await jurimetriaService.registerCaseMetrics(
      clientId,
      caseType,
      court,
      judge,
      lawyer,
      complexity,
      costs,
      revenue,
    );

    res.status(201).json({
      statusCode: 201,
      data: caseMetrics,
      message: 'Caso registrado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /cases/:caseId/outcome - Update case outcome
 */
router.put('/cases/:caseId/outcome', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { caseId } = req.params;
    const { outcome, result } = req.body;

    if (!outcome) {
      throw new AppError('Resultado é obrigatório', 400, 'VALIDATION_ERROR');
    }

    const validOutcomes = ['favorable', 'unfavorable', 'partial', 'dismissed', 'settled'];
    if (!validOutcomes.includes(outcome)) {
      throw new AppError('Resultado inválido', 400, 'INVALID_OUTCOME');
    }

    const updated = await jurimetriaService.updateCaseOutcome(caseId, outcome, result);

    res.json({
      statusCode: 200,
      data: updated,
      message: `Caso atualizado para ${outcome}`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /case-types/:caseType/analysis - Get case type analysis
 */
router.get(
  '/case-types/:caseType/analysis',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { caseType } = req.params;

      const analysis = await jurimetriaService.getCaseTypeAnalysis(caseType);

      if (!analysis) {
        return res.json({
          statusCode: 404,
          data: null,
          message: `Nenhuma análise disponível para tipo ${caseType}`,
        });
      }

      res.json({
        statusCode: 200,
        data: analysis,
        message: 'Análise de tipo de caso obtida com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /case-types/analysis/all - Get all case type analyses
 */
router.get('/case-types/analysis/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analyses = await jurimetriaService.getAllCaseTypeAnalysis();

    res.json({
      statusCode: 200,
      data: analyses,
      total: analyses.length,
      message: 'Análises de tipos de caso obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /courts/:court/analysis - Get court analysis
 */
router.get('/courts/:court/analysis', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { court } = req.params;

    const analysis = await jurimetriaService.getCourtAnalysis(court);

    if (!analysis) {
      return res.json({
        statusCode: 404,
        data: null,
        message: `Nenhuma análise disponível para tribunal ${court}`,
      });
    }

    res.json({
      statusCode: 200,
      data: analysis,
      message: 'Análise de tribunal obtida com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /lawyers/:lawyerId/performance - Get lawyer performance
 */
router.get(
  '/lawyers/:lawyerId/performance',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lawyerId } = req.params;

      const performance = await jurimetriaService.getLawyerPerformance(lawyerId);

      if (!performance) {
        return res.json({
          statusCode: 404,
          data: null,
          message: `Nenhum desempenho disponível para advogado ${lawyerId}`,
        });
      }

      res.json({
        statusCode: 200,
        data: performance,
        message: 'Desempenho do advogado obtido com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /predict - Predict case outcome
 */
router.post('/predict', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { caseType, complexity, court } = req.body;

    if (!caseType || !complexity || !court) {
      throw new AppError('caseType, complexity e court são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const validComplexities = ['simple', 'moderate', 'complex'];
    if (!validComplexities.includes(complexity)) {
      throw new AppError('Complexidade inválida', 400, 'INVALID_COMPLEXITY');
    }

    const prediction = await jurimetriaService.predictCaseOutcome(caseType, complexity, court);

    res.json({
      statusCode: 200,
      data: prediction,
      message: 'Predição gerada com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /trends/:metric - Get trend analysis
 */
router.get('/trends/:metric', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { metric } = req.params;

    const validMetrics = ['success_rate', 'average_duration', 'profitability'];
    if (!validMetrics.includes(metric)) {
      throw new AppError('Métrica inválida', 400, 'INVALID_METRIC');
    }

    const trends = await jurimetriaService.getTrendAnalysis(
      metric as 'success_rate' | 'average_duration' | 'profitability',
    );

    res.json({
      statusCode: 200,
      data: trends,
      message: 'Análise de tendência obtida com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /statistics - Get jurimetria statistics
 */
router.get('/statistics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = jurimetriaService.getStatistics();

    res.json({
      statusCode: 200,
      data: stats,
      message: 'Estatísticas de jurimetria obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /reset - Reset service data (testing only)
 */
router.post('/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { confirmReset } = req.body;

    if (!confirmReset) {
      throw new AppError('Confirmação de reset é obrigatória', 400, 'VALIDATION_ERROR');
    }

    jurimetriaService.reset();

    res.json({
      statusCode: 200,
      message: 'Jurimetria Service resetado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
