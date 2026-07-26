// src/modules/mobile/routes.ts
import express, { Router, Request, Response } from 'express';
import { Database } from '@/database';
import { MobileService } from './mobile.service';

export function setupMobileRoutes(db: Database): Router {
  const router = express.Router();
  const mobileService = new MobileService(db);

  /**
   * POST /mobile/auth/session
   * Create mobile session and get tokens
   */
  router.post('/auth/session', async (req: Request, res: Response) => {
    try {
      const { userId, deviceId, userAgent, ipAddress } = req.body;

      if (!userId || !deviceId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, deviceId',
        });
      }

      const session = await mobileService.createMobileSession(
        userId,
        deviceId,
        userAgent || '',
        ipAddress || ''
      );

      res.json({
        success: true,
        data: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: 86400, // 24 hours
        },
      });
    } catch (error) {
      console.error('[Mobile Routes] Error creating session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create session',
      });
    }
  });

  /**
   * POST /mobile/auth/refresh
   * Refresh mobile session tokens
   */
  router.post('/auth/refresh', async (req: Request, res: Response) => {
    try {
      const { userId, refreshToken } = req.body;

      if (!userId || !refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, refreshToken',
        });
      }

      const session = await mobileService.refreshMobileSession(userId, refreshToken);

      res.json({
        success: true,
        data: {
          accessToken: session.accessToken,
          expiresIn: 86400,
        },
      });
    } catch (error) {
      console.error('[Mobile Routes] Error refreshing session:', error);
      res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
      });
    }
  });

  /**
   * POST /mobile/device/register-token
   * Register device push notification token
   */
  router.post('/device/register-token', async (req: Request, res: Response) => {
    try {
      const { userId, deviceToken } = req.body;

      if (!userId || !deviceToken) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, deviceToken',
        });
      }

      await mobileService.registerDeviceToken(userId, deviceToken);

      res.json({
        success: true,
        message: 'Device token registered successfully',
      });
    } catch (error) {
      console.error('[Mobile Routes] Error registering device token:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register device token',
      });
    }
  });

  /**
   * GET /mobile/notifications
   * Get user's notifications
   */
  router.get('/notifications', async (req: Request, res: Response) => {
    try {
      const userId = (req.query.userId || req.headers['x-user-id']) as string;
      const limit = parseInt((req.query.limit as string) || '50');

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const notifications = await mobileService.getUserNotifications(userId, limit);

      res.json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      console.error('[Mobile Routes] Error fetching notifications:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch notifications',
      });
    }
  });

  /**
   * PUT /mobile/notifications/:notificationId/read
   * Mark notification as read
   */
  router.put('/notifications/:notificationId/read', async (req: Request, res: Response) => {
    try {
      const { notificationId } = req.params;

      await mobileService.markNotificationAsRead(notificationId);

      res.json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      console.error('[Mobile Routes] Error marking notification as read:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read',
      });
    }
  });

  /**
   * DELETE /mobile/notifications
   * Clear all notifications
   */
  router.delete('/notifications', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      await mobileService.clearNotifications(userId);

      res.json({
        success: true,
        message: 'All notifications cleared',
      });
    } catch (error) {
      console.error('[Mobile Routes] Error clearing notifications:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to clear notifications',
      });
    }
  });

  /**
   * GET /mobile/cases
   * Get user's cases list
   */
  router.get('/cases', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const cases = await mobileService.getMobileCasesList(userId);

      res.json({
        success: true,
        data: cases,
      });
    } catch (error) {
      console.error('[Mobile Routes] Error fetching cases:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch cases',
      });
    }
  });

  /**
   * GET /mobile/cases/:caseId
   * Get case details with updates feed
   */
  router.get('/cases/:caseId', async (req: Request, res: Response) => {
    try {
      const { caseId } = req.params;
      const userId = (req.headers['x-user-id']) as string;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const caseDetails = await mobileService.getMobileCaseDetails(caseId, userId);

      if (!caseDetails) {
        return res.status(404).json({
          success: false,
          error: 'Case not found',
        });
      }

      const updates = await mobileService.getCaseUpdatesFeed(caseId);

      res.json({
        success: true,
        data: {
          case: caseDetails,
          updates,
        },
      });
    } catch (error) {
      console.error('[Mobile Routes] Error fetching case details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch case details',
      });
    }
  });

  /**
   * GET /mobile/deadlines
   * Get upcoming deadlines
   */
  router.get('/deadlines', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const daysAhead = parseInt((req.query.daysAhead as string) || '30');

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const deadlines = await mobileService.getUpcomingDeadlines(userId, daysAhead);

      res.json({
        success: true,
        data: deadlines,
      });
    } catch (error) {
      console.error('[Mobile Routes] Error fetching deadlines:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch deadlines',
      });
    }
  });

  /**
   * GET /mobile/config
   * Get mobile app configuration
   */
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const config = await mobileService.getAppConfig();

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error('[Mobile Routes] Error fetching config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch app configuration',
      });
    }
  });

  return router;
}
