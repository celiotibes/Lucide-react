import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { kanbanService } from '@services/KanbanService';

const router = Router();

// Obter Kanban Board
router.get('/board', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { lawyerId, tribunal, priority, clientId } = req.query;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Obtendo Kanban board para usuário ${userId}`);

    const filters: any = {};
    if (lawyerId) filters.lawyerId = lawyerId;
    if (tribunal) filters.tribunal = tribunal;
    if (priority) filters.priority = priority;
    if (clientId) filters.clientId = clientId;

    const board = await kanbanService.getBoard(userId, filters);

    res.json({
      status: 'success',
      data: board,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter Kanban board');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Criar Tarefa
router.post('/tasks', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      caseId,
      title,
      description,
      columnId,
      lawyerId,
      clientId,
      priority,
      dueDate,
      assignedTo,
      tags,
      documentsNeeded,
      tribunal,
    } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!caseId || !title || !columnId) {
      throw new AppError(400, 'caseId, title e columnId são obrigatórios');
    }

    logger.info(`Criando tarefa Kanban para caso ${caseId}`);

    const task = await kanbanService.createTask(userId, {
      caseId,
      title,
      description,
      columnId,
      lawyerId: lawyerId || userId,
      clientId: clientId || '',
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      assignedTo: assignedTo || userId,
      tags: tags || [],
      documentsNeeded: documentsNeeded || 0,
      documentsReceived: 0,
      tribunal,
    });

    res.status(201).json({
      status: 'success',
      data: task,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar tarefa');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Mover Tarefa
router.put('/tasks/:taskId/move', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;
    const { columnId, position } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!columnId || position === undefined) {
      throw new AppError(400, 'columnId e position são obrigatórios');
    }

    logger.debug(`Movendo tarefa ${taskId} para coluna ${columnId}`);

    const task = await kanbanService.moveTask(userId, taskId, columnId, position);

    res.json({
      status: 'success',
      data: task,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao mover tarefa');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Atualizar Tarefa
router.put('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;
    const updates = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Atualizando tarefa ${taskId}`);

    const task = await kanbanService.updateTask(userId, taskId, updates);

    res.json({
      status: 'success',
      data: task,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar tarefa');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Deletar Tarefa
router.delete('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Deletando tarefa ${taskId}`);

    await kanbanService.deleteTask(userId, taskId);

    res.json({
      status: 'success',
      message: 'Tarefa deletada',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao deletar tarefa');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
