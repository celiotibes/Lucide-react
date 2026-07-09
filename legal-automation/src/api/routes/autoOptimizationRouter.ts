import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { autoOptimizationService } from '@services/AutoOptimizationService';

const router = Router();

// GET /auto-optimize/strategy/:taskType - Get optimization strategy for task
router.get('/strategy/:taskType', async (req: Request, res: Response) => {
  try {
    const taskType = req.params.taskType;
    const strategy = autoOptimizationService.getStrategy(taskType);

    if (!strategy) {
      return res.status(404).json({
        status: 'error',
        message: `Nenhuma estratégia de otimização disponível para tarefa: ${taskType}`,
      });
    }

    res.json({
      status: 'success',
      data: strategy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estratégia de otimização');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter estratégia de otimização',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /auto-optimize/optimal-model/:taskType - Get optimal model for task
router.get('/optimal-model/:taskType', async (req: Request, res: Response) => {
  try {
    const taskType = req.params.taskType;
    const selection = autoOptimizationService.getOptimalModel(taskType);

    if (!selection) {
      return res.status(404).json({
        status: 'error',
        message: `Nenhum modelo otimizado disponível para tarefa: ${taskType}`,
      });
    }

    res.json({
      status: 'success',
      data: selection,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter modelo otimizado');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter modelo otimizado',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /auto-optimize/generate-strategy/:taskType - Generate optimization strategy
router.post('/generate-strategy/:taskType', async (req: Request, res: Response) => {
  try {
    const taskType = req.params.taskType;
    const strategy = autoOptimizationService.generateStrategy(taskType);

    if (!strategy) {
      return res.status(400).json({
        status: 'error',
        message: `Não foi possível gerar estratégia para ${taskType}. Dados de A/B testing insuficientes.`,
      });
    }

    res.json({
      status: 'success',
      data: strategy,
      message: `Estratégia de otimização gerada para ${taskType}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao gerar estratégia de otimização');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao gerar estratégia de otimização',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /auto-optimize/optimize-all - Optimize all task types
router.post('/optimize-all', async (req: Request, res: Response) => {
  try {
    logger.info('Iniciando otimização de todas as tarefas');
    const report = autoOptimizationService.optimizeAll();

    res.json({
      status: 'success',
      data: report,
      message: `${report.optimizedTaskTypes} tarefas otimizadas de ${report.totalTaskTypes} total`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao otimizar todas as tarefas');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao otimizar todas as tarefas',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// PUT /auto-optimize/update-strategy/:taskType - Update optimization strategy
router.put('/update-strategy/:taskType', async (req: Request, res: Response) => {
  try {
    const taskType = req.params.taskType;
    const updated = autoOptimizationService.updateStrategy(taskType);

    if (!updated) {
      return res.status(400).json({
        status: 'error',
        message: `Não foi possível atualizar estratégia para ${taskType}. Dados de A/B testing insuficientes.`,
      });
    }

    res.json({
      status: 'success',
      data: updated,
      message: `Estratégia de otimização atualizada para ${taskType}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar estratégia de otimização');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao atualizar estratégia de otimização',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /auto-optimize/all-strategies - Get all optimization strategies
router.get('/all-strategies', async (req: Request, res: Response) => {
  try {
    const strategies = autoOptimizationService.getAllStrategies();

    res.json({
      status: 'success',
      data: {
        total: strategies.length,
        strategies,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estratégias de otimização');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter estratégias de otimização',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /auto-optimize/recommended-models - Get recommended models for all tasks
router.get('/recommended-models', async (req: Request, res: Response) => {
  try {
    const models = autoOptimizationService.getRecommendedModels();

    res.json({
      status: 'success',
      data: models,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter modelos recomendados');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter modelos recomendados',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /auto-optimize/calculate-savings - Calculate potential savings
router.post('/calculate-savings', async (req: Request, res: Response) => {
  try {
    const volume = req.body.volume;
    const savings = autoOptimizationService.calculatePotentialSavings(volume);

    res.json({
      status: 'success',
      data: savings,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao calcular economia potencial');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao calcular economia potencial',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /auto-optimize/metrics - Get optimization metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = autoOptimizationService.getMetrics();

    res.json({
      status: 'success',
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter métricas de otimização');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter métricas de otimização',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /auto-optimize/history - Get optimization history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const history = autoOptimizationService.getHistory();

    res.json({
      status: 'success',
      data: {
        total: history.length,
        history,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter histórico de otimização');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter histórico de otimização',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
