/**
 * Auto Report Controller
 * Endpoints for auto-generated legal reports
 */

import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { autoReportService } from '@services/AutoReportService';
import { auditLogService } from '@services/AuditLogService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * POST /api/v1/reports/generate/summary
 * Generate case summary
 */
router.post('/generate/summary', async (req: Request, res: Response) => {
  try {
    const { caseId, caseNumber, caseType, subject, tribunal, clientName, clientCPF, defendants, claimAmount, filingDate, description, lawyerName, lawyerOAB } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!caseId || !caseNumber) {
      throw new AppError(400, 'Identificação do caso obrigatória');
    }

    logger.info({ caseId, caseNumber }, 'Generating case summary');

    const report = await autoReportService.generateCaseSummary({
      id: caseId,
      caseNumber,
      caseType,
      subject,
      tribunal,
      clientName,
      clientCPF,
      defendants: defendants || [],
      claimAmount,
      filingDate: new Date(filingDate),
      description,
      lawyerName,
      lawyerOAB,
    });

    await auditLogService.log({
      action: 'REPORT_GENERATED',
      entityType: 'Report',
      entityId: report.id,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          type: 'case_summary',
          wordCount: report.metadata.wordCount,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate case summary');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/reports/generate/motion
 * Generate legal motion
 */
router.post('/generate/motion', async (req: Request, res: Response) => {
  try {
    const { caseId, caseNumber, motionType, basis, facts, legal_arguments, lawyerName, lawyerOAB, tribunal, subject, clientName, clientCPF, defendants } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!caseId || !motionType) {
      throw new AppError(400, 'Tipo de moção obrigatório');
    }

    logger.info({ caseId, motionType }, 'Generating motion');

    const report = await autoReportService.generateMotion(
      {
        caseId,
        motionType,
        basis: basis || [],
        facts: facts || '',
        legal_arguments: legal_arguments || '',
      },
      {
        id: caseId,
        caseNumber,
        caseType: '',
        subject,
        tribunal,
        clientName,
        clientCPF,
        defendants: defendants || [],
        filingDate: new Date(),
        description: facts || '',
        lawyerName,
        lawyerOAB,
      },
    );

    await auditLogService.log({
      action: 'MOTION_GENERATED',
      entityType: 'Report',
      entityId: report.id,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          type: motionType,
          wordCount: report.metadata.wordCount,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate motion');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/reports/generate/checklist
 * Generate procedural checklist
 */
router.post('/generate/checklist', async (req: Request, res: Response) => {
  try {
    const { caseId, caseNumber, caseType, subject, tribunal, clientName, clientCPF, defendants, filingDate, description, lawyerName, lawyerOAB } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!caseId || !caseNumber) {
      throw new AppError(400, 'Identificação do caso obrigatória');
    }

    logger.info({ caseId, caseNumber }, 'Generating procedural checklist');

    const checklist = await autoReportService.generateProceduralChecklist({
      id: caseId,
      caseNumber,
      caseType,
      subject,
      tribunal,
      clientName,
      clientCPF,
      defendants: defendants || [],
      filingDate: new Date(filingDate),
      description,
      lawyerName,
      lawyerOAB,
    });

    await auditLogService.log({
      action: 'CHECKLIST_GENERATED',
      entityType: 'Checklist',
      entityId: caseId,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          stepsCount: checklist.steps.length,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: checklist,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate checklist');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/reports/generate/opinion
 * Generate legal opinion
 */
router.post('/generate/opinion', async (req: Request, res: Response) => {
  try {
    const { caseId, caseNumber, caseType, subject, tribunal, clientName, clientCPF, defendants, claimAmount, filingDate, description, lawyerName, lawyerOAB } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!caseId || !caseNumber) {
      throw new AppError(400, 'Identificação do caso obrigatória');
    }

    logger.info({ caseId, caseNumber }, 'Generating legal opinion');

    const report = await autoReportService.generateLegalOpinion({
      id: caseId,
      caseNumber,
      caseType,
      subject,
      tribunal,
      clientName,
      clientCPF,
      defendants: defendants || [],
      claimAmount,
      filingDate: new Date(filingDate),
      description,
      lawyerName,
      lawyerOAB,
    });

    await auditLogService.log({
      action: 'OPINION_GENERATED',
      entityType: 'Report',
      entityId: report.id,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          type: 'legal_opinion',
          wordCount: report.metadata.wordCount,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate legal opinion');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
