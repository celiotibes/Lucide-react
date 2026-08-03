import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { workflowService } from '@services/WorkflowService';

const router = Router();

// Create Workflow Template
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { name, triggerType, description } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!name || !triggerType) {
      throw new AppError(400, 'name e triggerType são obrigatórios');
    }

    logger.info(`Creating workflow template "${name}"`);

    const template = await workflowService.createTemplate(userId, name, triggerType, description);

    res.json({
      status: 'success',
      data: template,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating template');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get User Templates
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Fetching templates for user ${userId}`);

    const templates = await workflowService.getTemplatesByUser(userId);

    res.json({
      status: 'success',
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching templates');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Template Details
router.get('/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    if (!templateId) {
      throw new AppError(400, 'templateId é obrigatório');
    }

    logger.debug(`Fetching template ${templateId}`);

    const template = await workflowService.getTemplate(templateId);

    res.json({
      status: 'success',
      data: template,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching template');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Update Template
router.put('/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { templateId } = req.params;
    const { name, description, isActive } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.info(`Updating template ${templateId}`);

    const template = await workflowService.updateTemplate(templateId, userId, {
      name,
      description,
      isActive,
    });

    res.json({
      status: 'success',
      data: template,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating template');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Add Step to Template
router.post('/templates/:templateId/steps', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const {
      stepOrder,
      stepType,
      title,
      approverId,
      approverRole,
      timeoutDays,
      description,
      conditions,
      actions,
    } = req.body;

    if (!templateId || stepOrder === undefined || !stepType || !title) {
      throw new AppError(400, 'templateId, stepOrder, stepType e title são obrigatórios');
    }

    logger.info(`Adding step to template ${templateId}`);

    const step = await workflowService.addStep(
      templateId,
      stepOrder,
      stepType,
      title,
      approverId,
      approverRole,
      timeoutDays,
      description,
      conditions,
      actions,
    );

    res.json({
      status: 'success',
      data: step,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error adding step');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Start Workflow Instance
router.post('/instances', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { templateId, caseId, metadata } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!templateId || !caseId) {
      throw new AppError(400, 'templateId e caseId são obrigatórios');
    }

    logger.info(`Starting workflow for case ${caseId}`);

    const instance = await workflowService.startWorkflow(templateId, caseId, userId, metadata);

    res.json({
      status: 'success',
      data: instance,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error starting workflow');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Workflow Status
router.get('/instances/:instanceId', async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;

    if (!instanceId) {
      throw new AppError(400, 'instanceId é obrigatório');
    }

    logger.debug(`Fetching workflow status for instance ${instanceId}`);

    const status = await workflowService.getWorkflowStatus(instanceId);

    res.json({
      status: 'success',
      data: status,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching workflow status');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Approve Step
router.post('/approvals/:approvalId/approve', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { approvalId } = req.params;
    const { instanceId, comment } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!instanceId) {
      throw new AppError(400, 'instanceId é obrigatório');
    }

    logger.info(`Approving step for workflow ${instanceId}`);

    const approval = await workflowService.approveStep(instanceId, userId, comment);

    res.json({
      status: 'success',
      data: approval,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error approving step');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Reject Workflow
router.post('/instances/:instanceId/reject', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { instanceId } = req.params;
    const { rejectionReason } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!rejectionReason) {
      throw new AppError(400, 'rejectionReason é obrigatório');
    }

    logger.info(`Rejecting workflow ${instanceId}`);

    const instance = await workflowService.rejectWorkflow(instanceId, rejectionReason, userId);

    res.json({
      status: 'success',
      data: instance,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error rejecting workflow');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Escalate Step
router.post('/instances/:instanceId/escalate', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { instanceId } = req.params;
    const { stepId, escalatedToId, reason } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!stepId || !escalatedToId || !reason) {
      throw new AppError(400, 'stepId, escalatedToId e reason são obrigatórios');
    }

    logger.info(`Escalating step in workflow ${instanceId}`);

    const escalation = await workflowService.escalateStep(instanceId, stepId, escalatedToId, reason);

    res.json({
      status: 'success',
      data: escalation,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error escalating step');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Pending Approvals
router.get('/approvals/pending', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Fetching pending approvals for user ${userId}`);

    const approvals = await workflowService.getPendingApprovals(userId);

    res.json({
      status: 'success',
      data: approvals,
      count: approvals.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching pending approvals');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
