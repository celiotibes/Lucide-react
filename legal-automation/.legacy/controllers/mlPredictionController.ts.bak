/**
 * ML Prediction Controller
 * Endpoints for predictive analytics
 */

import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { mlPredictionService } from '@services/MLPredictionService';
import { auditLogService } from '@services/AuditLogService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * POST /api/v1/ml/predict/decision
 * Predict case outcome
 */
router.post('/predict/decision', async (req: Request, res: Response) => {
  try {
    const { caseType, tribunal, subject, defendantType, claimAmount, previousCases, lawyerExperience, precedentsFound } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!caseType || !tribunal || !subject) {
      throw new AppError(400, 'Parâmetros obrigatórios faltando');
    }

    logger.info({ caseType, tribunal }, 'Predicting case decision');

    const prediction = await mlPredictionService.predictDecision({
      caseType,
      tribunal,
      subject,
      defendantType: defendantType || 'person',
      claimAmount,
      previousCases,
      lawyerExperience,
      precedentsFound,
    });

    await auditLogService.log({
      action: 'ML_PREDICTION_DECISION',
      entityType: 'Case',
      entityId: 'ml-pred-' + Date.now(),
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          prediction: prediction.prediction,
          confidence: prediction.confidence,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: prediction,
    });
  } catch (error) {
    logger.error({ error }, 'Decision prediction failed');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/ml/predict/duration
 * Estimate case duration
 */
router.post('/predict/duration', async (req: Request, res: Response) => {
  try {
    const { caseType, tribunal, subject, defendantType, claimAmount, lawyerExperience } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!caseType || !tribunal || !subject) {
      throw new AppError(400, 'Parâmetros obrigatórios faltando');
    }

    logger.info({ caseType, tribunal }, 'Estimating case duration');

    const prediction = await mlPredictionService.predictDuration({
      caseType,
      tribunal,
      subject,
      defendantType: defendantType || 'person',
      claimAmount,
      lawyerExperience,
    });

    await auditLogService.log({
      action: 'ML_PREDICTION_DURATION',
      entityType: 'Case',
      entityId: 'ml-pred-' + Date.now(),
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          estimatedDays: prediction.estimatedDays,
          estimatedMonths: prediction.estimatedMonths,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: prediction,
    });
  } catch (error) {
    logger.error({ error }, 'Duration prediction failed');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/ml/predict/precedents
 * Suggest relevant precedents
 */
router.post('/predict/precedents', async (req: Request, res: Response) => {
  try {
    const { subject, caseType, tribunal } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!subject || !caseType) {
      throw new AppError(400, 'Parâmetros obrigatórios faltando');
    }

    logger.info({ subject, caseType }, 'Suggesting precedents');

    const suggestions = await mlPredictionService.suggestPrecedents({
      subject,
      caseType,
      tribunal: tribunal || 'TJSC',
      defendantType: 'person',
    });

    await auditLogService.log({
      action: 'ML_PREDICTION_PRECEDENTS',
      entityType: 'Case',
      entityId: 'ml-pred-' + Date.now(),
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          precedentsFound: suggestions.precedents.length,
          averageRelevance: suggestions.averageRelevance,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    logger.error({ error }, 'Precedent suggestion failed');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/ml/models/metrics
 * Get model performance metrics
 */
router.get('/models/metrics', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching ML model metrics');

    const metrics = await mlPredictionService.getModelMetrics();

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch metrics');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
