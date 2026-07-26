// src/modules/calendar/routes.ts
import express, { Router, Request, Response } from 'express';
import { Database } from '@/database';
import { CalendarService } from './calendar.service';
import { CalendarProvider, EventType } from './types';

export function setupCalendarRoutes(db: Database): Router {
  const router = express.Router();
  const calendarService = new CalendarService(db);

  /**
   * POST /calendar/connect
   * Connect calendar provider (Google/Outlook)
   */
  router.post('/connect', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { provider, accessToken, expiresAt, refreshToken, calendarId, email } = req.body;

      if (!userId || !provider || !accessToken || !expiresAt) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: provider, accessToken, expiresAt',
        });
      }

      const credential = await calendarService.connectCalendarProvider(
        userId,
        provider as CalendarProvider,
        accessToken,
        new Date(expiresAt),
        { refreshToken, calendarId, email }
      );

      res.json({
        success: true,
        data: credential,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error connecting provider:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to connect calendar provider',
      });
    }
  });

  /**
   * GET /calendar/credentials
   * Get user's calendar credentials
   */
  router.get('/credentials', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const credentials = await calendarService.getUserCalendarCredentials(userId);

      res.json({
        success: true,
        data: credentials,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error fetching credentials:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch credentials',
      });
    }
  });

  /**
   * DELETE /calendar/disconnect/:provider
   * Disconnect calendar provider
   */
  router.delete('/disconnect/:provider', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { provider } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      await calendarService.disconnectCalendarProvider(userId, provider as CalendarProvider);

      res.json({
        success: true,
        message: `Disconnected ${provider}`,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error disconnecting provider:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect provider',
      });
    }
  });

  /**
   * POST /calendar/events
   * Create calendar event
   */
  router.post('/events', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const {
        caseId,
        type,
        title,
        description,
        startDate,
        endDate,
        location,
        reminders,
        attendees,
        provider,
      } = req.body;

      if (!userId || !type || !title || !startDate || !endDate || !provider) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: type, title, startDate, endDate, provider',
        });
      }

      const event = await calendarService.createCalendarEvent(userId, {
        caseId,
        type: type as EventType,
        title,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        location,
        reminders,
        attendees,
        provider: provider as CalendarProvider,
      });

      res.json({
        success: true,
        data: event,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error creating event:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create event',
      });
    }
  });

  /**
   * GET /calendar/events
   * Get user's calendar events
   */
  router.get('/events', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const fromDate = new Date(req.query.fromDate as string);
      const toDate = new Date(req.query.toDate as string);

      if (!userId || !fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: fromDate, toDate',
        });
      }

      const events = await calendarService.getUserCalendarEvents(userId, fromDate, toDate);

      res.json({
        success: true,
        data: events,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error fetching events:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch events',
      });
    }
  });

  /**
   * GET /calendar/cases/:caseId/events
   * Get case-related events
   */
  router.get('/cases/:caseId/events', async (req: Request, res: Response) => {
    try {
      const { caseId } = req.params;

      if (!caseId) {
        return res.status(400).json({
          success: false,
          error: 'Missing caseId',
        });
      }

      const events = await calendarService.getCaseCalendarEvents(caseId);

      res.json({
        success: true,
        data: events,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error fetching case events:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch case events',
      });
    }
  });

  /**
   * POST /calendar/sync/:provider
   * Sync calendar with provider
   */
  router.post('/sync/:provider', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { provider } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const sync = await calendarService.syncCalendarWithProvider(
        userId,
        provider as CalendarProvider
      );

      res.json({
        success: true,
        data: sync,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error syncing calendar:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to sync calendar',
      });
    }
  });

  /**
   * GET /calendar/availability
   * Find available time slots
   */
  router.get('/availability', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const fromDate = new Date(req.query.fromDate as string);
      const toDate = new Date(req.query.toDate as string);
      const duration = parseInt((req.query.duration as string) || '60');

      if (!userId || !fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: fromDate, toDate',
        });
      }

      const slots = await calendarService.findAvailableTimeSlots(
        userId,
        fromDate,
        toDate,
        duration
      );

      res.json({
        success: true,
        data: {
          slots,
          totalSlots: slots.length,
        },
      });
    } catch (error) {
      console.error('[Calendar Routes] Error finding availability:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to find available slots',
      });
    }
  });

  /**
   * GET /calendar/availability/:date
   * Get availability for specific date
   */
  router.get('/availability/:date', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { date } = req.params;

      if (!userId || !date) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId or date',
        });
      }

      const availability = await calendarService.getCalendarAvailability(
        userId,
        new Date(date)
      );

      res.json({
        success: true,
        data: availability,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error fetching availability:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch availability',
      });
    }
  });

  /**
   * POST /calendar/meeting-requests
   * Create meeting request
   */
  router.post('/meeting-requests', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { caseId, requestedWith, suggestedDate, duration, type, purpose } = req.body;

      if (!userId || !caseId || !requestedWith || !type || !purpose) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: caseId, requestedWith, type, purpose',
        });
      }

      const request = await calendarService.createMeetingRequest(caseId, userId, requestedWith, {
        suggestedDate: suggestedDate ? new Date(suggestedDate) : undefined,
        duration,
        type,
        purpose,
      });

      res.json({
        success: true,
        data: request,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error creating meeting request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create meeting request',
      });
    }
  });

  /**
   * GET /calendar/meeting-requests
   * Get pending meeting requests
   */
  router.get('/meeting-requests', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const requests = await calendarService.getPendingMeetingRequests(userId);

      res.json({
        success: true,
        data: requests,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error fetching meeting requests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch meeting requests',
      });
    }
  });

  /**
   * POST /calendar/meeting-requests/:requestId/confirm
   * Confirm meeting request
   */
  router.post('/meeting-requests/:requestId/confirm', async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const { scheduledDate } = req.body;

      if (!requestId || !scheduledDate) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: scheduledDate',
        });
      }

      const result = await calendarService.confirmMeetingRequest(
        requestId,
        new Date(scheduledDate)
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[Calendar Routes] Error confirming meeting request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to confirm meeting request',
      });
    }
  });

  return router;
}
