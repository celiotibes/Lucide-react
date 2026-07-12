import { Router, Request, Response, NextFunction } from 'express';
import { webSocketManager } from '@services/WebSocketManager';
import { webSocketEventService } from '@services/WebSocketEventService';
import { logger } from '@utils/logger';

const router = Router();

/**
 * GET /ws/stats - Connection statistics
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = webSocketManager.getConnectionStats();

    res.json({
      statusCode: 200,
      data: {
        ...stats,
        timestamp: new Date().toISOString(),
      },
      message: 'WebSocket connection statistics',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ws/health - WebSocket service health check
 */
router.get('/health', (req: Request, res: Response) => {
  const stats = webSocketManager.getConnectionStats();
  const isHealthy = stats.totalConnections >= 0;

  res.status(isHealthy ? 200 : 503).json({
    statusCode: isHealthy ? 200 : 503,
    data: {
      status: isHealthy ? 'healthy' : 'degraded',
      ...stats,
    },
  });
});

/**
 * POST /ws/broadcast - Broadcast message to all connected users
 */
router.post('/broadcast', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, message, severity } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'title and message are required',
      });
    }

    webSocketEventService.broadcastSystemNotification(
      title,
      message,
      severity || 'info'
    );

    res.json({
      statusCode: 200,
      message: 'Broadcast message sent',
      data: {
        sentAt: new Date().toISOString(),
        connectedUsers: webSocketManager.getConnectionStats().totalUsers,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ws/notify/:userId - Send notification to specific user
 */
router.post('/notify/:userId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const { type, data } = req.body;

    if (!type || !data) {
      return res.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'type and data are required',
      });
    }

    webSocketEventService.notifyUser(userId, {
      type,
      data,
      timestamp: new Date().toISOString(),
    });

    res.json({
      statusCode: 200,
      message: 'Notification sent to user',
      data: { userId, type },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ws/active-users - List active users
 */
router.get('/active-users', (req: Request, res: Response) => {
  const stats = webSocketManager.getConnectionStats();

  res.json({
    statusCode: 200,
    data: {
      activeUsers: Object.keys(stats.userConnectionCounts),
      userConnectionCounts: stats.userConnectionCounts,
      totalUsers: stats.totalUsers,
      totalConnections: stats.totalConnections,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /ws/send-case-update - Notify about case update
 */
router.post('/send-case-update', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, caseId, updates } = req.body;

    if (!userId || !caseId) {
      return res.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'userId and caseId are required',
      });
    }

    webSocketEventService.notifyCaseUpdate(userId, caseId, updates);

    res.json({
      statusCode: 200,
      message: 'Case update notification sent',
      data: { userId, caseId },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ws/send-contract-update - Notify about contract update
 */
router.post('/send-contract-update', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, contractId, status } = req.body;

    if (!userId || !contractId || !status) {
      return res.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'userId, contractId, and status are required',
      });
    }

    webSocketEventService.notifyContractUpdate(userId, contractId, status);

    res.json({
      statusCode: 200,
      message: 'Contract update notification sent',
      data: { userId, contractId, status },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ws/send-deadline-alert - Notify about approaching deadline
 */
router.post('/send-deadline-alert', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, caseId, daysRemaining } = req.body;

    if (!userId || !caseId || typeof daysRemaining !== 'number') {
      return res.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'userId, caseId, and daysRemaining (number) are required',
      });
    }

    webSocketEventService.notifyDeadlineApproaching(userId, caseId, daysRemaining);

    res.json({
      statusCode: 200,
      message: 'Deadline alert sent',
      data: { userId, caseId, daysRemaining },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ws/send-payment-notification - Notify about payment received
 */
router.post('/send-payment-notification', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, invoiceId, amount } = req.body;

    if (!userId || !invoiceId || typeof amount !== 'number') {
      return res.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'userId, invoiceId, and amount (number) are required',
      });
    }

    webSocketEventService.notifyPaymentReceived(userId, invoiceId, amount);

    res.json({
      statusCode: 200,
      message: 'Payment notification sent',
      data: { userId, invoiceId, amount },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ws/send-task-assignment - Notify about task assignment
 */
router.post('/send-task-assignment', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, taskId, taskDetails } = req.body;

    if (!userId || !taskId) {
      return res.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'userId and taskId are required',
      });
    }

    webSocketEventService.notifyTaskAssigned(userId, taskId, taskDetails || {});

    res.json({
      statusCode: 200,
      message: 'Task assignment notification sent',
      data: { userId, taskId },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
