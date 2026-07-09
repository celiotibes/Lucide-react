import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { multiModelOrchestrationService } from '@services/MultiModelOrchestrationService';

const router = Router();

// POST /multi-model/select - Select best model for a request
router.post('/select', async (req: Request, res: Response) => {
  try {
    const { taskType, taskComplexity, qualityTarget, costLimit, timeout } = req.body;

    if (!taskType || !taskComplexity) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: taskType, taskComplexity',
      });
    }

    const result = await multiModelOrchestrationService.selectModel({
      taskType,
      taskComplexity,
      qualityTarget,
      costLimit,
      timeout,
    });

    res.json({
      status: 'success',
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao selecionar modelo');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao selecionar modelo',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /multi-model/models - List all available models
router.get('/models', async (req: Request, res: Response) => {
  try {
    const models = multiModelOrchestrationService.getAllModels();

    res.json({
      status: 'success',
      data: {
        total: models.length,
        models,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar modelos');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao listar modelos',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// PUT /multi-model/strategy - Set load balancing strategy
router.put('/strategy', async (req: Request, res: Response) => {
  try {
    const { type, weights, fallbackOrder } = req.body;

    if (!type) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required field: type',
      });
    }

    const validTypes = ['round_robin', 'performance', 'cost', 'hybrid', 'adaptive'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid strategy type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    multiModelOrchestrationService.setStrategy({
      type: type as any,
      weights,
      fallbackOrder,
    });

    res.json({
      status: 'success',
      message: `Estratégia atualizada para ${type}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar estratégia');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao atualizar estratégia',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /multi-model/track - Track execution result
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { modelName, success, latency, cost } = req.body;

    if (!modelName || success === undefined || !latency || !cost) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: modelName, success, latency, cost',
      });
    }

    multiModelOrchestrationService.trackExecution(modelName, success, latency, cost);

    res.json({
      status: 'success',
      message: 'Execução rastreada com sucesso',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao rastrear execução');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao rastrear execução',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /multi-model/statistics - Get orchestration statistics
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const stats = multiModelOrchestrationService.getStatistics();

    res.json({
      status: 'success',
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estatísticas');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter estatísticas',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// PUT /multi-model/models/:modelName - Update model configuration
router.put('/models/:modelName', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const updates = req.body;

    if (!modelName) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing model name',
      });
    }

    multiModelOrchestrationService.updateModel(modelName, updates);

    res.json({
      status: 'success',
      message: `Modelo ${modelName} atualizado`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar modelo');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao atualizar modelo',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /multi-model/reset - Reset orchestration statistics
router.post('/reset', async (req: Request, res: Response) => {
  try {
    multiModelOrchestrationService.reset();

    res.json({
      status: 'success',
      message: 'Estatísticas resetadas',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao resetar estatísticas');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao resetar estatísticas',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /multi-model/optimize - Recommend optimal configuration
router.post('/optimize', async (req: Request, res: Response) => {
  try {
    const { taskType, averageQualityTarget, monthlyBudget } = req.body;

    const models = multiModelOrchestrationService.getAllModels();
    const stats = multiModelOrchestrationService.getStatistics();

    // Simple optimization logic
    const recommendations = models.map((model) => {
      const modelStats = stats[model.name];
      const successRate = parseFloat(modelStats?.successRate || '0');
      const costScore = (1 - model.costPerRequest / Math.max(...models.map((m) => m.costPerRequest))) * 100;
      const qualityScore = successRate;

      return {
        modelName: model.name,
        provider: model.provider,
        costScore: costScore.toFixed(2),
        qualityScore: qualityScore.toFixed(2),
        overallScore: ((costScore + qualityScore) / 2).toFixed(2),
        estimatedMonthlyCost: (model.costPerRequest * 1000).toFixed(2), // Assuming 1000 requests/month
        recommendation: costScore > 50 && qualityScore > 70 ? 'Recommended' : 'Alternative',
      };
    });

    recommendations.sort((a, b) => parseFloat(b.overallScore) - parseFloat(a.overallScore));

    res.json({
      status: 'success',
      data: {
        recommendations,
        optimalModel: recommendations[0]?.modelName,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao otimizar configuração');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao otimizar configuração',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
