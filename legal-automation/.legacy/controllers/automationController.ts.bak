import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { automationService } from '@services/AutomationService';
import { AutomationWorkflow } from '@services/AutomationService';

const router = Router();

/**
 * GET /automation/workflows
 * Listar fluxos de automação do usuário
 * Requer autenticação
 */
router.get('/workflows', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não identificado' });
    }

    const workflows = await automationService.listWorkflows(userId);

    res.json({
      status: 'success',
      count: workflows.length,
      workflows,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar fluxos');
    res.status(500).json({
      error: 'Erro ao listar fluxos de automação',
    });
  }
});

/**
 * POST /automation/workflows
 * Criar novo fluxo de automação
 * Requer autenticação
 */
router.post('/workflows', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { name, description, trigger, steps, status } = req.body;

    if (!name || !trigger || !steps) {
      return res.status(400).json({
        error: 'name, trigger e steps são obrigatórios',
      });
    }

    const workflow: Partial<AutomationWorkflow> = {
      name,
      description,
      trigger,
      steps,
      status: status || 'draft',
      createdBy: userId,
    };

    const created = await automationService.createWorkflow(workflow);

    res.status(201).json({
      status: 'success',
      workflow: created,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar fluxo');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao criar fluxo',
    });
  }
});

/**
 * PUT /automation/workflows/:id
 * Atualizar fluxo de automação
 * Requer autenticação
 */
router.put('/workflows/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updated = await automationService.updateWorkflow(id, updates);

    res.json({
      status: 'success',
      workflow: updated,
    });
  } catch (error) {
    logger.error({ err: error }, `Erro ao atualizar fluxo ${req.params.id}`);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao atualizar fluxo',
    });
  }
});

/**
 * DELETE /automation/workflows/:id
 * Deletar fluxo de automação
 * Requer autenticação
 */
router.delete('/workflows/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await automationService.deleteWorkflow(id);

    res.json({
      status: 'success',
      message: 'Fluxo deletado com sucesso',
    });
  } catch (error) {
    logger.error({ err: error }, `Erro ao deletar fluxo ${req.params.id}`);
    res.status(500).json({
      error: 'Erro ao deletar fluxo',
    });
  }
});

/**
 * POST /automation/workflows/:id/execute
 * Executar fluxo de automação
 * Requer autenticação
 */
router.post('/workflows/:id/execute', verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { triggerData } = req.body;
    const userId = (req as any).user?.userId;

    if (!triggerData) {
      return res.status(400).json({
        error: 'triggerData é obrigatório',
      });
    }

    const result = await automationService.executeWorkflow(id, triggerData, userId);

    res.json({
      status: 'success',
      execution: result,
    });
  } catch (error) {
    logger.error({ err: error }, `Erro ao executar fluxo ${req.params.id}`);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao executar fluxo',
    });
  }
});

/**
 * POST /automation/workflows/:id/activate
 * Ativar fluxo de automação
 * Requer autenticação
 */
router.post('/workflows/:id/activate', verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const updated = await automationService.updateWorkflow(id, {
      status: 'active',
    });

    res.json({
      status: 'success',
      message: 'Fluxo ativado com sucesso',
      workflow: updated,
    });
  } catch (error) {
    logger.error({ err: error }, `Erro ao ativar fluxo ${req.params.id}`);
    res.status(500).json({
      error: 'Erro ao ativar fluxo',
    });
  }
});

/**
 * POST /automation/workflows/:id/deactivate
 * Desativar fluxo de automação
 * Requer autenticação
 */
router.post('/workflows/:id/deactivate', verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const updated = await automationService.updateWorkflow(id, {
      status: 'inactive',
    });

    res.json({
      status: 'success',
      message: 'Fluxo desativado com sucesso',
      workflow: updated,
    });
  } catch (error) {
    logger.error({ err: error }, `Erro ao desativar fluxo ${req.params.id}`);
    res.status(500).json({
      error: 'Erro ao desativar fluxo',
    });
  }
});

export const automationController = router;
