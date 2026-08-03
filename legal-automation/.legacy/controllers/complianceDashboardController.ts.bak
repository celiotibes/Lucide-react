/**
 * Compliance Dashboard Controller
 * Endpoints for LGPD compliance metrics, audit trails, and risk assessment
 */

import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { complianceDashboardService } from '@services/ComplianceDashboardService';
import { auditLogService } from '@services/AuditLogService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * GET /api/v1/compliance/metrics
 * Get LGPD compliance metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching compliance metrics');

    const metrics = await complianceDashboardService.getComplianceMetrics();

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch compliance metrics');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/compliance/retention-report
 * Get data retention compliance report
 */
router.get('/retention-report', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching data retention report');

    const report = await complianceDashboardService.getDataRetentionReport();

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch retention report');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/compliance/access-control
 * Get access control status and MFA compliance
 */
router.get('/access-control', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching access control status');

    const status = await complianceDashboardService.getAccessControlStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch access control status');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/compliance/audit-trail
 * Get audit trail analytics for specified time period
 */
router.get('/audit-trail', async (req: Request, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = parseInt(days as string, 10);

    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      throw new AppError(400, 'days deve ser entre 1 e 365');
    }

    logger.info({ days: daysNum }, 'Fetching audit trail analytics');

    const analytics = await complianceDashboardService.getAuditTrailAnalytics(daysNum);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch audit trail analytics');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/compliance/risk-assessment
 * Get comprehensive risk assessment
 */
router.get('/risk-assessment', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching risk assessment');

    const assessment = await complianceDashboardService.getRiskAssessment();

    res.json({
      success: true,
      data: assessment,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch risk assessment');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/compliance/summary
 * Get comprehensive compliance dashboard summary
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching compliance summary');

    const summary = await complianceDashboardService.getComplianceSummary();
    const userId = (req as any).user?.id || 'unknown';

    await auditLogService.log({
      action: 'COMPLIANCE_SUMMARY_VIEWED',
      entityType: 'Compliance',
      entityId: 'compliance-summary',
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          overallCompliance: summary.overallCompliance,
          riskLevel: summary.riskAssessment.overallRisk,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch compliance summary');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
