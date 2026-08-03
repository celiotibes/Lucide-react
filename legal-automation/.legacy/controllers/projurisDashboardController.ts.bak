import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { projurisService } from '@services/ProjurisService';

const router = Router();

/**
 * GET /projuris/dashboard/escritorio/:escritorioId
 * Obter estatísticas do dashboard do escritório
 */
router.get('/escritorio/:escritorioId', verifyToken, async (req: Request, res: Response) => {
  try {
    const { escritorioId } = req.params;

    const stats = await projurisService.getDashboardStats(escritorioId);

    res.json({
      status: 'success',
      stats,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estatísticas do dashboard');
    res.status(500).json({
      error: 'Erro ao obter estatísticas do dashboard',
    });
  }
});

/**
 * GET /projuris/dashboard/overview
 * Obter visão geral do sistema
 */
router.get('/overview', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    // This would need implementation to fetch user's escritórios
    res.json({
      status: 'success',
      overview: {
        message: 'Visão geral do sistema',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter visão geral');
    res.status(500).json({
      error: 'Erro ao obter visão geral',
    });
  }
});

export const projurisDashboardController = router;
