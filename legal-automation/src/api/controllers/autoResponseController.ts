/**
 * Auto Response Controller
 * Endpoints for auto-generating responses to intimations
 */

import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { autoResponseService } from '@services/AutoResponseService';
import { auditLogService } from '@services/AuditLogService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * POST /api/v1/responses/process-intimation
 * Process single intimation and generate response
 */
router.post('/process-intimation', async (req: Request, res: Response) => {
  try {
    const { intimationId, caseId, caseNumber, type, subject, content, deadline, receivedAt, isUrgent } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!intimationId || !caseId || !content) {
      throw new AppError(400, 'Dados da intimação incompletos');
    }

    logger.info(
      { intimationId, caseId, type },
      'Processing intimation',
    );

    const response = await autoResponseService.processIntimation({
      id: intimationId,
      caseId,
      caseNumber,
      type: type || 'genérico',
      subject: subject || 'Intimação Processual',
      content,
      deadline: new Date(deadline),
      receivedAt: new Date(receivedAt),
      isUrgent: isUrgent || false,
    });

    await auditLogService.log({
      action: 'INTIMATION_PROCESSED',
      entityType: 'Response',
      entityId: response.id,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          type: response.type,
          confidence: response.confidenceScore,
          requiresReview: response.requiresReview,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to process intimation');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/responses/batch-process
 * Process multiple intimations in batch
 */
router.post('/batch-process', async (req: Request, res: Response) => {
  try {
    const { intimations } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!intimations || !Array.isArray(intimations) || intimations.length === 0) {
      throw new AppError(400, 'Array de intimações obrigatório');
    }

    logger.info(
      { count: intimations.length },
      'Batch processing intimations',
    );

    // Map to internal format
    const formattedIntimations = intimations.map((i: any) => ({
      id: i.intimationId || `int-${Date.now()}`,
      caseId: i.caseId,
      caseNumber: i.caseNumber,
      type: i.type || 'genérico',
      subject: i.subject || 'Intimação',
      content: i.content,
      deadline: new Date(i.deadline),
      receivedAt: new Date(i.receivedAt || Date.now()),
      isUrgent: i.isUrgent || false,
    }));

    const responses = await autoResponseService.processMultipleIntimations(
      formattedIntimations,
    );

    // Count statistics
    const stats = {
      total: responses.length,
      autoReady: responses.filter(r => !r.requiresReview).length,
      needsReview: responses.filter(r => r.requiresReview).length,
      avgConfidence: responses.reduce((sum, r) => sum + r.confidenceScore, 0) / responses.length,
    };

    await auditLogService.log({
      action: 'BATCH_INTIMATIONS_PROCESSED',
      entityType: 'Batch',
      entityId: `batch-${Date.now()}`,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: stats,
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: responses,
      stats,
    });
  } catch (error) {
    logger.error({ error }, 'Batch processing failed');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/responses/:responseId/export
 * Export response as document
 */
router.get('/:responseId/export', async (req: Request, res: Response) => {
  try {
    const { responseId } = req.params;
    const { format = 'pdf' } = req.query;

    logger.info(
      { responseId, format },
      'Exporting response',
    );

    // In production, would generate actual PDF/DOCX
    // For now, return HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="response-${responseId}.html"`);

    res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Resposta Processual ${responseId}</title>
  <style>
    body { font-family: 'Times New Roman', serif; margin: 2cm; line-height: 1.5; }
    h1 { text-align: center; }
  </style>
</head>
<body>
  <h1>Resposta Processual</h1>
  <p>ID da Resposta: ${responseId}</p>
  <p>Gerada em: ${new Date().toLocaleDateString('pt-BR')}</p>
  <p>Conteúdo da resposta seria exibido aqui.</p>
</body>
</html>
    `);
  } catch (error) {
    logger.error({ error }, 'Export failed');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/responses/statistics
 * Get response generation statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching response statistics');

    // In production, would aggregate from database
    const stats = {
      total_responses_generated: 1245,
      auto_ready_percentage: 85.4,
      average_confidence: 0.82,
      top_response_types: [
        { type: 'prazo_processual', count: 342 },
        { type: 'audiência_instrução', count: 287 },
        { type: 'prova_documental', count: 198 },
      ],
      average_processing_time_ms: 1240,
      timestamp: new Date(),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch statistics');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
