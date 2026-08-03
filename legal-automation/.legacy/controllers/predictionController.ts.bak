import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { predictionService } from '@services/PredictionService';
import { recommendationService } from '@services/RecommendationService';

const router = Router();

// Predict Case Outcome
router.post('/predict/outcome', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId, caseType, tribunal } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!caseId || !caseType || !tribunal) {
      throw new AppError(400, 'caseId, caseType e tribunal são obrigatórios');
    }

    logger.info(`Predicting outcome for case ${caseId}`);

    const prediction = await predictionService.predictOutcome(userId, {
      caseId,
      caseType,
      tribunal,
    });

    res.json({
      status: 'success',
      data: prediction,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error predicting outcome');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Predict Case Deadline
router.post('/predict/deadline', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId, caseType, tribunal } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!caseId || !caseType || !tribunal) {
      throw new AppError(400, 'caseId, caseType e tribunal são obrigatórios');
    }

    logger.info(`Predicting deadline for case ${caseId}`);

    const prediction = await predictionService.predictDeadline(userId, {
      caseId,
      caseType,
      tribunal,
    });

    res.json({
      status: 'success',
      data: prediction,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error predicting deadline');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Calculate Success Rate
router.post('/predict/success-rate', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId, caseType, tribunal } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!caseId || !caseType || !tribunal) {
      throw new AppError(400, 'caseId, caseType e tribunal são obrigatórios');
    }

    logger.info(`Calculating success rate for case ${caseId}`);

    const prediction = await predictionService.predictSuccessRate(userId, {
      caseId,
      caseType,
      tribunal,
    });

    res.json({
      status: 'success',
      data: prediction,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error calculating success rate');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get All Predictions
router.get('/predictions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId, limit = 20 } = req.query;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Fetching predictions for user ${userId}`);

    const predictions = await predictionService.getPredictions(
      userId,
      caseId as string | undefined,
      parseInt(limit as string) || 20,
    );

    res.json({
      status: 'success',
      data: predictions,
      count: predictions.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching predictions');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Generate Recommendations
router.post('/recommendations/generate', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId, caseType, tribunal, currentStatus, daysUntilDeadline } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!caseId || !caseType || !tribunal || !currentStatus) {
      throw new AppError(400, 'caseId, caseType, tribunal e currentStatus são obrigatórios');
    }

    logger.info(`Generating recommendations for case ${caseId}`);

    const recommendations = await recommendationService.generateRecommendations({
      userId,
      caseId,
      caseType,
      tribunal,
      currentStatus,
      daysUntilDeadline,
    });

    res.json({
      status: 'success',
      data: recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating recommendations');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Recommendations
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId, implemented, limit = 50, offset = 0 } = req.query;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Fetching recommendations for user ${userId}`);

    const recommendations = await recommendationService.getRecommendations(
      userId,
      caseId as string | undefined,
      implemented === 'true' ? true : implemented === 'false' ? false : undefined,
      parseInt(limit as string) || 50,
      parseInt(offset as string) || 0,
    );

    res.json({
      status: 'success',
      data: recommendations,
      pagination: {
        limit: parseInt(limit as string) || 50,
        offset: parseInt(offset as string) || 0,
        total: recommendations.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching recommendations');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Accept Recommendation
router.post('/recommendations/:recommendationId/accept', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { recommendationId } = req.params;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.info(`Accepting recommendation ${recommendationId}`);

    const recommendation = await recommendationService.acceptRecommendation(
      userId,
      recommendationId,
    );

    res.json({
      status: 'success',
      data: recommendation,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error accepting recommendation');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Implement Recommendation
router.post('/recommendations/:recommendationId/implement', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { recommendationId } = req.params;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.info(`Implementing recommendation ${recommendationId}`);

    const recommendation = await recommendationService.implementRecommendation(
      userId,
      recommendationId,
    );

    res.json({
      status: 'success',
      data: recommendation,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error implementing recommendation');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Submit Recommendation Feedback
router.post('/recommendations/:recommendationId/feedback', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { recommendationId } = req.params;
    const { feedbackType, rating, comment } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!feedbackType || !rating) {
      throw new AppError(400, 'feedbackType e rating são obrigatórios');
    }

    logger.info(`Submitting feedback for recommendation ${recommendationId}`);

    await recommendationService.submitFeedback(userId, recommendationId, {
      recommendationId,
      feedbackType,
      rating,
      comment,
    });

    res.json({
      status: 'success',
      message: 'Feedback enviado com sucesso',
    });
  } catch (error) {
    logger.error({ err: error }, 'Error submitting feedback');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Recommendation Statistics
router.get('/recommendations/stats', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Fetching recommendation stats for user ${userId}`);

    const stats = await recommendationService.getRecommendationStats(userId);

    res.json({
      status: 'success',
      data: stats,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching stats');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
