import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { projurisService } from '@services/ProjurisService';
import { CreateCaseTaskRequest, UpdateCaseTaskRequest } from '@/types/projuris';

const router = Router();

/**
 * POST /projuris/tasks
 * Criar nova tarefa de caso
 */
router.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId, title, type, priority, assignedTo, dueDate, estimatedHours } = req.body;

    if (!caseId || !title || !type || !priority || !assignedTo) {
      return res.status(400).json({
        error: 'caseId, title, type, priority e assignedTo são obrigatórios',
      });
    }

    const request: CreateCaseTaskRequest = {
      caseId,
      title,
      type,
      priority,
      assignedTo,
      dueDate,
      estimatedHours,
    };

    const task = await projurisService.createTask(userId, request);

    res.status(201).json({
      status: 'success',
      task,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar tarefa');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao criar tarefa',
    });
  }
});

/**
 * PUT /projuris/tasks/:id
 * Atualizar tarefa
 */
router.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { title, status, priority, assignedTo, dueDate, actualHours } = req.body;

    const request: UpdateCaseTaskRequest = {
      title,
      status,
      priority,
      assignedTo,
      dueDate,
      actualHours,
    };

    const updated = await projurisService.updateTask(userId, id, request);

    if (!updated) {
      return res.status(404).json({
        error: 'Tarefa não encontrada',
      });
    }

    res.json({
      status: 'success',
      task: updated,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar tarefa');
    res.status(500).json({
      error: 'Erro ao atualizar tarefa',
    });
  }
});

/**
 * GET /projuris/cases/:caseId/tasks
 * Listar tarefas de um caso
 */
router.get('/case/:caseId', verifyToken, async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    // This would need a new method in ProjurisService
    // For now, returning placeholder
    res.json({
      status: 'success',
      tasks: [],
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar tarefas');
    res.status(500).json({
      error: 'Erro ao listar tarefas',
    });
  }
});

/**
 * GET /projuris/cases/:caseId/stats
 * Obter estatísticas de tarefas do caso
 */
router.get('/case/:caseId/stats', verifyToken, async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    const stats = await projurisService.getTaskStats(caseId);

    res.json({
      status: 'success',
      stats,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estatísticas');
    res.status(500).json({
      error: 'Erro ao obter estatísticas',
    });
  }
});

export const projurisTaskController = router;
