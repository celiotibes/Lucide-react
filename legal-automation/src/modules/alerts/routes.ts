// src/modules/alerts/routes.ts
import express, { Router, Request, Response } from 'express';
import { Database } from '@/database';
import { AlertsService } from './alerts.service';
import { AlertType, AlertPriority, AlertChannel } from './types';

export function setupAlertsRoutes(db: Database): Router {
  const router = express.Router();
  const alertsService = new AlertsService(db);

  /**
   * POST /alerts/create
   * Create and send an alert
   */
  router.post('/create', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { type, priority, title, message, caseId, actionUrl, channels, metadata } = req.body;

      if (!userId || !type || !priority || !title || !message) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: type, priority, title, message',
        });
      }

      const alert = await alertsService.createAlert(userId, type, priority, title, message, {
        caseId,
        actionUrl,
        metadata,
        channels: channels || ['email', 'in_app'],
      });

      res.json({
        success: true,
        data: alert,
      });
    } catch (error) {
      console.error('[Alerts Routes] Error creating alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create alert',
      });
    }
  });

  /**
   * GET /alerts
   * Get user's alerts
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const limit = parseInt((req.query.limit as string) || '50');

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const alerts = await alertsService.getUserAlerts(userId, limit);
      const unreadCount = await alertsService.getUnreadAlertsCount(userId);

      res.json({
        success: true,
        data: {
          alerts,
          unreadCount,
        },
      });
    } catch (error) {
      console.error('[Alerts Routes] Error fetching alerts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch alerts',
      });
    }
  });

  /**
   * POST /alerts/deadline-alerts
   * Generate and send deadline alerts
   */
  router.post('/deadline-alerts', async (req: Request, res: Response) => {
    try {
      const deadlineAlerts = await alertsService.createDeadlineAlerts();

      res.json({
        success: true,
        message: `Created ${deadlineAlerts.length} deadline alerts`,
        data: deadlineAlerts,
      });
    } catch (error) {
      console.error('[Alerts Routes] Error creating deadline alerts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create deadline alerts',
      });
    }
  });

  /**
   * POST /alerts/predictive-alerts
   * Generate predictive alerts based on case analysis
   */
  router.post('/predictive-alerts', async (req: Request, res: Response) => {
    try {
      const predictiveAlerts = await alertsService.createPredictiveAlerts();

      res.json({
        success: true,
        message: `Created ${predictiveAlerts.length} predictive alerts`,
        data: predictiveAlerts,
      });
    } catch (error) {
      console.error('[Alerts Routes] Error creating predictive alerts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create predictive alerts',
      });
    }
  });

  /**
   * POST /alerts/rules
   * Create alert rule
   */
  router.post('/rules', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { name, type, priority, conditions, channels, notifyBefore } = req.body;

      if (!userId || !name || !type || !priority) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, type, priority',
        });
      }

      const rule = await alertsService.createAlertRule(
        userId,
        name,
        type as AlertType,
        priority as AlertPriority,
        conditions || [],
        (channels || ['email']) as AlertChannel[],
        notifyBefore || 7
      );

      res.json({
        success: true,
        data: rule,
      });
    } catch (error) {
      console.error('[Alerts Routes] Error creating alert rule:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create alert rule',
      });
    }
  });

  /**
   * GET /alerts/rules
   * Get user's alert rules
   */
  router.get('/rules', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const rules = await alertsService.getUserAlertRules(userId);

      res.json({
        success: true,
        data: rules,
      });
    } catch (error) {
      console.error('[Alerts Routes] Error fetching alert rules:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch alert rules',
      });
    }
  });

  /**
   * POST /alerts/preferences
   * Set alert preferences
   */
  router.post('/preferences', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { alertType, enabled, preferredChannels } = req.body;

      if (!userId || !alertType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: alertType',
        });
      }

      const preference = await alertsService.setAlertPreferences(
        userId,
        alertType as AlertType,
        enabled !== false,
        (preferredChannels || ['email']) as AlertChannel[]
      );

      res.json({
        success: true,
        data: preference,
      });
    } catch (error) {
      console.error('[Alerts Routes] Error setting alert preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to set alert preferences',
      });
    }
  });

  /**
   * GET /alerts/preferences
   * Get user's alert preferences
   */
  router.get('/preferences', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const preferences = await alertsService.getAlertPreferences(userId);

      res.json({
        success: true,
        data: preferences,
      });
    } catch (error) {
      console.error('[Alerts Routes] Error fetching alert preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch alert preferences',
      });
    }
  });

  /**
   * POST /alerts/process-scheduled
   * Process all scheduled alerts (can be called by cron job)
   */
  router.post('/process-scheduled', async (req: Request, res: Response) => {
    try {
      const processed = await alertsService.processScheduledAlerts();

      res.json({
        success: true,
        message: `Processed ${processed} scheduled alerts`,
      });
    } catch (error) {
      console.error('[Alerts Routes] Error processing scheduled alerts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process scheduled alerts',
      });
    }
  });

  return router;
}
