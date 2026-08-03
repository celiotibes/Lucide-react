import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';
import { clientPortalService } from '@services/ClientPortalService';

const router = Router();

// Get My Cases
router.get('/cases', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Fetching cases for user ${userId}`);

    const cases = await clientPortalService.getClientCases(userId);

    res.json({
      status: 'success',
      data: cases,
      count: cases.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching client cases');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Case Updates
router.get('/cases/:caseId/updates', async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const { limit = 50 } = req.query;

    if (!caseId) {
      throw new AppError(400, 'caseId é obrigatório');
    }

    logger.debug(`Fetching updates for case ${caseId}`);

    const updates = await clientPortalService.getCaseUpdates(caseId, parseInt(limit as string) || 50);

    res.json({
      status: 'success',
      data: updates,
      count: updates.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching case updates');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Accessible Documents
router.get('/cases/:caseId/documents', async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const { limit = 100 } = req.query;

    if (!caseId) {
      throw new AppError(400, 'caseId é obrigatório');
    }

    logger.debug(`Fetching documents for case ${caseId}`);

    const documents = await clientPortalService.getAccessibleDocuments(
      caseId,
      parseInt(limit as string) || 100,
    );

    res.json({
      status: 'success',
      data: documents,
      count: documents.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching documents');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Case Milestones
router.get('/cases/:caseId/milestones', async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    if (!caseId) {
      throw new AppError(400, 'caseId é obrigatório');
    }

    logger.debug(`Fetching milestones for case ${caseId}`);

    const milestones = await clientPortalService.getCaseMilestones(caseId);

    res.json({
      status: 'success',
      data: milestones,
      count: milestones.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching milestones');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Case Timeline
router.get('/cases/:caseId/timeline', async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    if (!caseId) {
      throw new AppError(400, 'caseId é obrigatório');
    }

    logger.debug(`Fetching timeline for case ${caseId}`);

    const timeline = await clientPortalService.getCaseTimeline(caseId);

    res.json({
      status: 'success',
      data: timeline,
      count: timeline.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching timeline');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Case Messages
router.get('/cases/:caseId/messages', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!caseId) {
      throw new AppError(400, 'caseId é obrigatório');
    }

    logger.debug(`Fetching messages for case ${caseId}`);

    const messages = await clientPortalService.getMessages(
      caseId,
      userId,
      parseInt(limit as string) || 50,
      parseInt(offset as string) || 0,
    );

    res.json({
      status: 'success',
      data: messages,
      pagination: {
        limit: parseInt(limit as string) || 50,
        offset: parseInt(offset as string) || 0,
        total: messages.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching messages');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Send Message
router.post('/cases/:caseId/messages', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { caseId } = req.params;
    const { receiverId, messageType, subject, body, attachments } = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    if (!caseId || !receiverId || !messageType || !body) {
      throw new AppError(400, 'caseId, receiverId, messageType e body são obrigatórios');
    }

    logger.info(`Sending message for case ${caseId}`);

    const message = await clientPortalService.sendMessage(
      caseId,
      userId,
      receiverId,
      messageType,
      body,
      subject,
      attachments,
    );

    res.json({
      status: 'success',
      data: message,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error sending message');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Mark Message as Read
router.post('/messages/:messageId/read', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    if (!messageId) {
      throw new AppError(400, 'messageId é obrigatório');
    }

    logger.debug(`Marking message ${messageId} as read`);

    const message = await clientPortalService.markMessageAsRead(messageId);

    res.json({
      status: 'success',
      data: message,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error marking message as read');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Unread Message Count
router.get('/messages/unread/count', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Getting unread message count for user ${userId}`);

    const count = await clientPortalService.getUnreadMessageCount(userId);

    res.json({
      status: 'success',
      data: { unreadCount: count },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting unread count');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Case Billing History
router.get('/cases/:caseId/billing', async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const { limit = 100 } = req.query;

    if (!caseId) {
      throw new AppError(400, 'caseId é obrigatório');
    }

    logger.debug(`Fetching billing history for case ${caseId}`);

    const [history, total] = await Promise.all([
      clientPortalService.getCaseBillingHistory(caseId, parseInt(limit as string) || 100),
      clientPortalService.getCaseBillingTotal(caseId),
    ]);

    res.json({
      status: 'success',
      data: {
        history,
        total,
      },
      count: history.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching billing history');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Case Status History
router.get('/cases/:caseId/status-history', async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const { limit = 50 } = req.query;

    if (!caseId) {
      throw new AppError(400, 'caseId é obrigatório');
    }

    logger.debug(`Fetching status history for case ${caseId}`);

    const history = await clientPortalService.getCaseStatusHistory(
      caseId,
      parseInt(limit as string) || 50,
    );

    res.json({
      status: 'success',
      data: history,
      count: history.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching status history');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Get Preferences
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.debug(`Fetching preferences for user ${userId}`);

    const preferences = await clientPortalService.getClientPreferences(userId);

    res.json({
      status: 'success',
      data: preferences,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching preferences');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

// Update Preferences
router.put('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const preferences = req.body;

    if (!userId) {
      throw new AppError(401, 'Usuário não autenticado');
    }

    logger.info(`Updating preferences for user ${userId}`);

    const updated = await clientPortalService.updateClientPreferences(userId, preferences);

    res.json({
      status: 'success',
      data: updated,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating preferences');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
