// src/modules/reports/routes.ts
import express, { Router, Request, Response } from 'express';
import { Database } from '@/database';
import { ReportsService } from './reports.service';

export function setupReportsRoutes(db: Database): Router {
  const router = express.Router();
  const reportsService = new ReportsService(db);

  /**
   * GET /reports/case-analytics
   * Generate case analytics report
   */
  router.get('/case-analytics', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
      const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const analytics = await reportsService.generateCaseAnalytics(userId, fromDate, toDate);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error('[Reports Routes] Error generating case analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate case analytics',
      });
    }
  });

  /**
   * GET /reports/financial-analytics
   * Generate financial analytics report
   */
  router.get('/financial-analytics', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
      const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const analytics = await reportsService.generateFinancialAnalytics(userId, fromDate, toDate);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error('[Reports Routes] Error generating financial analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate financial analytics',
      });
    }
  });

  /**
   * GET /reports/performance/:lawyerId
   * Generate performance metrics
   */
  router.get('/performance/:lawyerId', async (req: Request, res: Response) => {
    try {
      const { lawyerId } = req.params;
      const fromDate = new Date(req.query.fromDate as string);
      const toDate = new Date(req.query.toDate as string);

      if (!lawyerId || !fromDate || !toDate) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: lawyerId, fromDate, toDate',
        });
      }

      const metrics = await reportsService.generatePerformanceMetrics(lawyerId, fromDate, toDate);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      console.error('[Reports Routes] Error generating performance metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate performance metrics',
      });
    }
  });

  /**
   * GET /reports/case-timeline/:caseId
   * Generate case timeline
   */
  router.get('/case-timeline/:caseId', async (req: Request, res: Response) => {
    try {
      const { caseId } = req.params;

      if (!caseId) {
        return res.status(400).json({
          success: false,
          error: 'Missing caseId',
        });
      }

      const timeline = await reportsService.generateCaseTimeline(caseId);

      res.json({
        success: true,
        data: timeline,
      });
    } catch (error) {
      console.error('[Reports Routes] Error generating timeline:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate timeline',
      });
    }
  });

  /**
   * POST /reports
   * Create and save report
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { name, type, format, data } = req.body;

      if (!userId || !name || !type || !format || !data) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, type, format, data',
        });
      }

      const report = await reportsService.createReport(userId, name, type, format, data);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      console.error('[Reports Routes] Error creating report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create report',
      });
    }
  });

  /**
   * GET /reports
   * Get user reports
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

      const reports = await reportsService.getUserReports(userId, limit);

      res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      console.error('[Reports Routes] Error fetching reports:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch reports',
      });
    }
  });

  /**
   * POST /reports/dashboards
   * Create dashboard
   */
  router.post('/dashboards', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;
      const { name, widgets } = req.body;

      if (!userId || !name || !widgets) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, widgets',
        });
      }

      const dashboard = await reportsService.createDashboard(userId, name, widgets);

      res.json({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      console.error('[Reports Routes] Error creating dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create dashboard',
      });
    }
  });

  /**
   * GET /reports/dashboards
   * Get user dashboards
   */
  router.get('/dashboards', async (req: Request, res: Response) => {
    try {
      const userId = (req.headers['x-user-id']) as string;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing userId',
        });
      }

      const dashboards = await reportsService.getUserDashboards(userId);

      res.json({
        success: true,
        data: dashboards,
      });
    } catch (error) {
      console.error('[Reports Routes] Error fetching dashboards:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dashboards',
      });
    }
  });

  return router;
}
