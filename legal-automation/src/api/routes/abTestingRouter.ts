import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { abTestingService, ABTestConfig, ABTestResult } from '@services/ABTestingService';

const router = Router();

// POST /ab-test/run - Run a single A/B test
router.post('/run', async (req: Request, res: Response) => {
  try {
    const config: ABTestConfig = req.body;

    // Validate required fields
    if (!config.modelA || !config.modelB || !config.taskType || !config.prompt) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: modelA, modelB, taskType, prompt',
      });
    }

    logger.info(`Starting A/B test: ${config.modelA} vs ${config.modelB}`);
    const result = await abTestingService.runTest(config);

    res.json({
      status: 'success',
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao executar teste A/B');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao executar teste A/B',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /ab-test/multiple - Run multiple A/B tests
router.post('/multiple', async (req: Request, res: Response) => {
  try {
    const config: ABTestConfig = req.body;

    // Validate required fields
    if (!config.modelA || !config.modelB || !config.taskType || !config.prompt) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: modelA, modelB, taskType, prompt',
      });
    }

    const iterations = config.iterations || 5;
    logger.info(
      `Starting ${iterations} A/B tests: ${config.modelA} vs ${config.modelB}`
    );

    const results = await abTestingService.runMultipleTests(config);

    res.json({
      status: 'success',
      data: {
        totalTests: results.length,
        results,
        summary: {
          aWins: results.filter((r) => r.winner === 'a').length,
          bWins: results.filter((r) => r.winner === 'b').length,
          ties: results.filter((r) => r.winner === 'tie').length,
          avgConfidence:
            results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao executar múltiplos testes A/B');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao executar múltiplos testes A/B',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /ab-test/results - Get A/B test results with optional filtering
router.get('/results', async (req: Request, res: Response) => {
  try {
    const filters = {
      modelA: req.query.modelA as string | undefined,
      modelB: req.query.modelB as string | undefined,
      taskType: req.query.taskType as string | undefined,
      winner: (req.query.winner as 'a' | 'b' | 'tie' | undefined) || undefined,
      minConfidence: req.query.minConfidence
        ? parseFloat(req.query.minConfidence as string)
        : undefined,
    };

    const results = abTestingService.getResults(filters);

    res.json({
      status: 'success',
      data: {
        total: results.length,
        results,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter resultados de testes A/B');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter resultados de testes A/B',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /ab-test/metrics/:model - Get performance metrics for a model
router.get('/metrics/:model', async (req: Request, res: Response) => {
  try {
    const model = req.params.model;
    const taskType = req.query.taskType as string | undefined;

    const metrics = abTestingService.getModelMetrics(model, taskType);

    if (!metrics) {
      return res.status(404).json({
        status: 'error',
        message: `Métricas não encontradas para o modelo: ${model}`,
      });
    }

    res.json({
      status: 'success',
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter métricas do modelo');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter métricas do modelo',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /ab-test/best-model/:taskType - Get best model for a task type
router.get('/best-model/:taskType', async (req: Request, res: Response) => {
  try {
    const taskType = req.params.taskType;
    const best = abTestingService.getBestModel(taskType);

    if (!best) {
      return res.status(404).json({
        status: 'error',
        message: `Nenhum modelo testado para tarefa: ${taskType}`,
      });
    }

    const metrics = abTestingService.getModelMetrics(best, taskType);

    res.json({
      status: 'success',
      data: {
        model: best,
        taskType,
        metrics,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter melhor modelo');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter melhor modelo',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /ab-test/recommendation/:taskType - Get recommendation for a task type
router.get('/recommendation/:taskType', async (req: Request, res: Response) => {
  try {
    const taskType = req.params.taskType;
    const recommendation = abTestingService.getRecommendation(taskType);

    if (!recommendation) {
      return res.status(404).json({
        status: 'error',
        message: `Nenhuma recomendação disponível para tarefa: ${taskType}`,
      });
    }

    res.json({
      status: 'success',
      data: recommendation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter recomendação');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter recomendação',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
