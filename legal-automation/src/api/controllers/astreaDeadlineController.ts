import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { astreaService } from '@services/AstreaService';
import { CreateDeadlineRequest, UpdateDeadlineRequest } from '@/types/astrea';

const router = Router();

/**
 * POST /astrea/deadlines
 * Criar novo prazo
 */
router.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId, title, dueDate, type, priority, description, assignedTo, notificationDays } = req.body;

    if (!caseId || !title || !dueDate || !type || !priority) {
      return res.status(400).json({
        error: 'caseId, title, dueDate, type e priority são obrigatórios',
      });
    }

    const request: CreateDeadlineRequest = {
      caseId,
      title,
      dueDate,
      type,
      priority,
      description,
      assignedTo,
      notificationDays,
    };

    const deadline = await astreaService.createDeadline(userId, request);

    res.status(201).json({
      status: 'success',
      deadline,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar prazo');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao criar prazo',
    });
  }
});

/**
 * PUT /astrea/deadlines/:id
 * Atualizar prazo
 */
router.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { title, dueDate, status, priority, extendTo, extendReason } = req.body;

    const request: UpdateDeadlineRequest = {
      title,
      dueDate,
      status,
      priority,
      extendTo,
      extendReason,
    };

    const updated = await astreaService.updateDeadline(userId, id, request);

    if (!updated) {
      return res.status(404).json({
        error: 'Prazo não encontrado',
      });
    }

    res.json({
      status: 'success',
      deadline: updated,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar prazo');
    res.status(500).json({
      error: 'Erro ao atualizar prazo',
    });
  }
});

/**
 * GET /astrea/cases/:caseId/deadlines
 * Listar prazos de um caso
 */
router.get('/case/:caseId', verifyToken, async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    // This would need a new method in AstreaService
    res.json({
      status: 'success',
      deadlines: [],
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar prazos');
    res.status(500).json({
      error: 'Erro ao listar prazos',
    });
  }
});

/**
 * GET /astrea/cases/:caseId/deadlines/metrics
 * Obter métricas de prazos
 */
router.get('/case/:caseId/metrics', verifyToken, async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    const metrics = await astreaService.getDeadlineMetrics(caseId);

    res.json({
      status: 'success',
      metrics,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter métricas');
    res.status(500).json({
      error: 'Erro ao obter métricas',
    });
  }
});

export const astreaDeadlineController = router;
