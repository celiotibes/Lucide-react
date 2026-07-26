// src/modules/portal/routes.ts
import express, { Router, Request, Response } from 'express';
import { Database } from '@/database';
import { PortalService } from './portal.service';

export function setupPortalRoutes(db: Database): Router {
  const router = express.Router();
  const portalService = new PortalService(db);

  /**
   * GET /portal/cases
   * Get client's accessible cases
   */
  router.get('/cases', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId',
        });
      }

      const cases = await portalService.getClientCases(clientId);

      res.json({
        success: true,
        data: cases,
      });
    } catch (error) {
      console.error('[Portal Routes] Error fetching cases:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch cases',
      });
    }
  });

  /**
   * GET /portal/cases/:caseId
   * Get case details
   */
  router.get('/cases/:caseId', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;
      const { caseId } = req.params;

      if (!clientId || !caseId) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId or caseId',
        });
      }

      const caseDetails = await portalService.getClientCaseDetails(caseId, clientId);

      if (!caseDetails) {
        return res.status(404).json({
          success: false,
          error: 'Case not found or access denied',
        });
      }

      res.json({
        success: true,
        data: caseDetails,
      });
    } catch (error) {
      console.error('[Portal Routes] Error fetching case details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch case details',
      });
    }
  });

  /**
   * GET /portal/cases/:caseId/documents
   * Get case documents
   */
  router.get('/cases/:caseId/documents', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;
      const { caseId } = req.params;

      if (!clientId || !caseId) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId or caseId',
        });
      }

      const documents = await portalService.getCaseDocuments(caseId, clientId);

      res.json({
        success: true,
        data: documents,
      });
    } catch (error) {
      console.error('[Portal Routes] Error fetching documents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch documents',
      });
    }
  });

  /**
   * GET /portal/cases/:caseId/timeline
   * Get case timeline
   */
  router.get('/cases/:caseId/timeline', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;
      const { caseId } = req.params;

      if (!clientId || !caseId) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId or caseId',
        });
      }

      const timeline = await portalService.getCaseTimeline(caseId);

      res.json({
        success: true,
        data: timeline,
      });
    } catch (error) {
      console.error('[Portal Routes] Error fetching timeline:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch timeline',
      });
    }
  });

  /**
   * GET /portal/billing
   * Get billing statements
   */
  router.get('/billing', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId',
        });
      }

      const statements = await portalService.getClientBillingStatements(clientId);

      res.json({
        success: true,
        data: statements,
      });
    } catch (error) {
      console.error('[Portal Routes] Error fetching billing:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch billing statements',
      });
    }
  });

  /**
   * GET /portal/billing/:invoiceId
   * Get billing statement details
   */
  router.get('/billing/:invoiceId', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;
      const { invoiceId } = req.params;

      if (!clientId || !invoiceId) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId or invoiceId',
        });
      }

      const statement = await portalService.getBillingStatementDetails(invoiceId, clientId);

      if (!statement) {
        return res.status(404).json({
          success: false,
          error: 'Invoice not found',
        });
      }

      res.json({
        success: true,
        data: statement,
      });
    } catch (error) {
      console.error('[Portal Routes] Error fetching invoice:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch invoice',
      });
    }
  });

  /**
   * GET /portal/notifications
   * Get client notifications
   */
  router.get('/notifications', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId',
        });
      }

      const notifications = await portalService.getClientNotifications(clientId);

      res.json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      console.error('[Portal Routes] Error fetching notifications:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch notifications',
      });
    }
  });

  /**
   * PUT /portal/notifications/:notificationId/read
   * Mark notification as read
   */
  router.put('/notifications/:notificationId/read', async (req: Request, res: Response) => {
    try {
      const { notificationId } = req.params;

      await portalService.markNotificationAsRead(notificationId);

      res.json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      console.error('[Portal Routes] Error marking notification as read:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read',
      });
    }
  });

  /**
   * POST /portal/messages
   * Send message to lawyer
   */
  router.post('/messages', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;
      const { lawyerId, caseId, subject, content, attachments } = req.body;

      if (!clientId || !lawyerId || !caseId || !subject || !content) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: lawyerId, caseId, subject, content',
        });
      }

      const message = await portalService.sendMessage(
        clientId,
        lawyerId,
        caseId,
        subject,
        content,
        attachments
      );

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      console.error('[Portal Routes] Error sending message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send message',
      });
    }
  });

  /**
   * GET /portal/messages
   * Get client messages
   */
  router.get('/messages', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId',
        });
      }

      const messages = await portalService.getClientMessages(clientId);

      res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      console.error('[Portal Routes] Error fetching messages:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch messages',
      });
    }
  });

  /**
   * POST /portal/invitations/accept
   * Accept portal invitation
   */
  router.post('/invitations/accept', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;
      const { token } = req.body;

      if (!clientId || !token) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId or token',
        });
      }

      const invitation = await portalService.acceptPortalInvitation(token, clientId);

      res.json({
        success: true,
        data: invitation,
        message: 'Invitation accepted successfully',
      });
    } catch (error) {
      console.error('[Portal Routes] Error accepting invitation:', error);
      res.status(400).json({
        success: false,
        error: 'Failed to accept invitation: ' + String(error),
      });
    }
  });

  /**
   * GET /portal/cases/:caseId/summary
   * Download case summary
   */
  router.get('/cases/:caseId/summary', async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-user-id']) as string;
      const { caseId } = req.params;

      if (!clientId || !caseId) {
        return res.status(400).json({
          success: false,
          error: 'Missing clientId or caseId',
        });
      }

      const summary = await portalService.generateCaseSummary(caseId, clientId);

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="case-${caseId}-summary.txt"`);
      res.send(summary);
    } catch (error) {
      console.error('[Portal Routes] Error generating summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate summary',
      });
    }
  });

  return router;
}
