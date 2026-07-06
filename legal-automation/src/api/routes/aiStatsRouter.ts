import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { llmPool } from '@ai/llmPool';

const router = Router();

// GET /ai/stats - Get LLM cost statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = llmPool.getStats();
    const budgetStatus = llmPool.getCostBudgetStatus();
    const poolStatus = llmPool.getStatus();

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      costs: {
        totalCost: stats.totalCost.toFixed(2),
        byProvider: Object.fromEntries(
          Object.entries(stats.byProvider).map(([k, v]) => [k, v.toFixed(2)])
        ),
        byTask: Object.fromEntries(
          Object.entries(stats.byTask).map(([k, v]) => [k, v.toFixed(2)])
        ),
      },
      budget: {
        used: budgetStatus.used.toFixed(2),
        budget: budgetStatus.budget.toFixed(2),
        percentageUsed: budgetStatus.percentageUsed.toFixed(1),
        status: budgetStatus.status,
      },
      pool: poolStatus,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estatísticas de IA');
    res.status(500).json({
      error: 'Erro ao obter estatísticas',
    });
  }
});

// GET /ai/status - Get LLM pool status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = llmPool.getStatus();

    res.json({
      status: 'success',
      pool: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter status da pool');
    res.status(500).json({
      error: 'Erro ao obter status',
    });
  }
});

// POST /ai/clear-cache - Clear cache
router.post('/clear-cache', async (req: Request, res: Response) => {
  try {
    llmPool.clearCache();

    res.json({
      status: 'success',
      message: 'Cache limpo com sucesso',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao limpar cache');
    res.status(500).json({
      error: 'Erro ao limpar cache',
    });
  }
});

export default router;
