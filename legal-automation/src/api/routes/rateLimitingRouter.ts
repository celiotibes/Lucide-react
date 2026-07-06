import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { rateLimitingService } from '@services/RateLimitingService';

const router = Router();

// GET /rate-limit/status/:userId - Get user quota status
router.get('/status/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const status = rateLimitingService.getQuotaStatus(userId);

    if (!status) {
      return res.status(404).json({
        status: 'error',
        message: `Usuário não encontrado: ${userId}`,
      });
    }

    res.json({
      status: 'success',
      data: {
        userId: status.userId,
        tier: status.tier,
        isActive: status.isActive,
        usage: {
          daily: {
            used: status.dailyRequests,
            resetAt: status.resetAt,
          },
          hourly: {
            used: status.hourlyRequests,
            resetAt: status.hourResetAt,
          },
          minutely: {
            used: status.minuteRequests,
            resetAt: status.minuteResetAt,
          },
          byTask: status.taskQuotas,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter status de rate limit');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter status de rate limit',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /rate-limit/check/:userId - Check if user can make request
router.get('/check/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const taskType = req.query.taskType as string | undefined || 'analyze';
    const tier = (req.query.tier as 'free' | 'standard' | 'premium') || 'standard';

    const result = rateLimitingService.checkAndConsume(userId, taskType, tier);

    res.status(result.allowed ? 200 : 429).json({
      status: result.allowed ? 'allowed' : 'blocked',
      allowed: result.allowed,
      remaining: result.remaining,
      resetAt: result.resetAt,
      retryAfter: result.retryAfter,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao verificar rate limit');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao verificar rate limit',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /rate-limit/reset/:userId - Reset user quota
router.post('/reset/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const success = rateLimitingService.resetQuota(userId);

    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: `Usuário não encontrado: ${userId}`,
      });
    }

    res.json({
      status: 'success',
      message: `Quota resetada para ${userId}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao resetar quota');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao resetar quota',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// PUT /rate-limit/tier/:userId - Set user tier
router.put('/tier/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const { tier } = req.body;

    if (!tier || !['free', 'standard', 'premium'].includes(tier)) {
      return res.status(400).json({
        status: 'error',
        message: 'Tier inválido. Aceita: free, standard, premium',
      });
    }

    const success = rateLimitingService.setUserTier(userId, tier as 'free' | 'standard' | 'premium');

    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: `Usuário não encontrado: ${userId}`,
      });
    }

    res.json({
      status: 'success',
      message: `Tier do usuário atualizado para ${tier}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao definir tier');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao definir tier',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /rate-limit/deactivate/:userId - Deactivate user
router.post('/deactivate/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const success = rateLimitingService.deactivateUser(userId);

    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: `Usuário não encontrado: ${userId}`,
      });
    }

    res.json({
      status: 'success',
      message: `Usuário ${userId} desativado`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao desativar usuário');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao desativar usuário',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /rate-limit/activate/:userId - Activate user
router.post('/activate/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const success = rateLimitingService.activateUser(userId);

    if (!success) {
      return res.status(404).json({
        status: 'error',
        message: `Usuário não encontrado: ${userId}`,
      });
    }

    res.json({
      status: 'success',
      message: `Usuário ${userId} ativado`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao ativar usuário');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao ativar usuário',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /rate-limit/statistics - Get global statistics
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const stats = rateLimitingService.getStatistics();

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

export default router;
