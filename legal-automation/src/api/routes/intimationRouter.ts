import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { intimationCaptureService } from '@services/IntimationCaptureService';
import { AppError } from '@utils/errors';

// ============================================================================
// INTIMATION CAPTURE ROUTER - Phase 2 - Legal Document & Deadline Processing
// ============================================================================

const router = Router();

/**
 * POST /documents - Process and upload legal document
 */
router.post('/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId, documentUrl, documentType, source } = req.body;

    if (!clientId || !documentUrl || !documentType) {
      throw new AppError(
        'clientId, documentUrl e documentType são obrigatórios',
        400,
        'VALIDATION_ERROR',
      );
    }

    const validTypes = ['citação', 'intimação', 'notificação', 'mandado', 'sentença', 'acórdão', 'outro'];
    if (!validTypes.includes(documentType)) {
      throw new AppError('Tipo de documento inválido', 400, 'INVALID_TYPE');
    }

    const document = await intimationCaptureService.processDocument(
      clientId,
      documentUrl,
      documentType,
      source || 'upload',
    );

    res.status(201).json({
      statusCode: 201,
      data: document,
      message: 'Documento processado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /documents/:documentId - Get document details
 */
router.get('/documents/:documentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { documentId } = req.params;

    const document = await intimationCaptureService.getDocument(documentId);
    if (!document) {
      throw new AppError('Documento não encontrado', 404, 'DOCUMENT_NOT_FOUND');
    }

    res.json({
      statusCode: 200,
      data: document,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /clients/:clientId/documents - Get all documents for client
 */
router.get(
  '/clients/:clientId/documents',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientId } = req.params;

      const documents = await intimationCaptureService.getClientDocuments(clientId);

      res.json({
        statusCode: 200,
        data: documents,
        total: documents.length,
        message: 'Documentos do cliente obtidos com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /deadlines/upcoming - Get upcoming deadlines
 */
router.get('/deadlines/upcoming', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { days = '30' } = req.query;
    const daysAhead = parseInt(days as string);

    if (isNaN(daysAhead) || daysAhead < 1) {
      throw new AppError('Dias deve ser um número maior que 0', 400, 'INVALID_PARAM');
    }

    const deadlines = await intimationCaptureService.getUpcomingDeadlines(daysAhead);

    res.json({
      statusCode: 200,
      data: deadlines,
      total: deadlines.length,
      daysAhead,
      message: `${deadlines.length} prazos próximos encontrados`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /deadlines/overdue - Get overdue deadlines
 */
router.get('/deadlines/overdue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deadlines = await intimationCaptureService.getOverdueDeadlines();

    res.json({
      statusCode: 200,
      data: deadlines,
      total: deadlines.length,
      message: `${deadlines.length} prazos vencidos encontrados`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /clients/:clientId/deadlines - Get all deadlines for client
 */
router.get(
  '/clients/:clientId/deadlines',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientId } = req.params;

      const deadlines = await intimationCaptureService.getClientDeadlines(clientId);

      res.json({
        statusCode: 200,
        data: deadlines,
        total: deadlines.length,
        message: 'Prazos do cliente obtidos com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /deadlines/:deadlineId/status - Update deadline status
 */
router.put(
  '/deadlines/:deadlineId/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { deadlineId } = req.params;
      const { status, completionNotes } = req.body;

      if (!status) {
        throw new AppError('Status é obrigatório', 400, 'VALIDATION_ERROR');
      }

      const validStatuses = ['pending', 'in_progress', 'completed', 'missed', 'extended'];
      if (!validStatuses.includes(status)) {
        throw new AppError('Status inválido', 400, 'INVALID_STATUS');
      }

      const deadline = await intimationCaptureService.updateDeadlineStatus(
        deadlineId,
        status,
        completionNotes,
      );

      res.json({
        statusCode: 200,
        data: deadline,
        message: `Prazo atualizado para ${status}`,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /deadlines/:deadlineId/notify - Send notification for deadline
 */
router.post(
  '/deadlines/:deadlineId/notify',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { deadlineId } = req.params;
      const { recipientPhone, type = 'whatsapp' } = req.body;

      if (!recipientPhone) {
        throw new AppError('Telefone do destinatário é obrigatório', 400, 'VALIDATION_ERROR');
      }

      const validTypes = ['email', 'sms', 'whatsapp', 'push'];
      if (!validTypes.includes(type)) {
        throw new AppError('Tipo de notificação inválido', 400, 'INVALID_TYPE');
      }

      const notification = await intimationCaptureService.sendDeadlineNotification(
        deadlineId,
        recipientPhone,
        type,
      );

      res.status(201).json({
        statusCode: 201,
        data: notification,
        message: 'Notificação enviada com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /statistics - Get intimation capture statistics
 */
router.get('/statistics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = intimationCaptureService.getStatistics();

    res.json({
      statusCode: 200,
      data: stats,
      message: 'Estatísticas obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /documents/batch - Process multiple documents at once
 */
router.post('/documents/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { documents } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new AppError('Array de documentos é obrigatório', 400, 'VALIDATION_ERROR');
    }

    const results = [];

    for (const doc of documents) {
      try {
        const processed = await intimationCaptureService.processDocument(
          doc.clientId,
          doc.documentUrl,
          doc.documentType,
          doc.source || 'upload',
        );

        results.push({
          success: true,
          document: processed,
        });
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    res.status(201).json({
      statusCode: 201,
      data: results,
      total: documents.length,
      successCount: results.filter((r) => r.success).length,
      message: 'Processamento em lote concluído',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /deadlines/summary - Get summary of all deadlines
 */
router.get('/deadlines/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const upcomingDeadlines = await intimationCaptureService.getUpcomingDeadlines(30);
    const overdueDeadlines = await intimationCaptureService.getOverdueDeadlines();
    const stats = intimationCaptureService.getStatistics();

    res.json({
      statusCode: 200,
      data: {
        statistics: stats,
        upcomingCount: upcomingDeadlines.length,
        overdueCount: overdueDeadlines.length,
        upcomingDeadlines: upcomingDeadlines.slice(0, 10),
        overdueDeadlines: overdueDeadlines.slice(0, 10),
      },
      message: 'Sumário de prazos obtido com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /reset - Reset service data (testing only)
 */
router.post('/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { confirmReset } = req.body;

    if (!confirmReset) {
      throw new AppError('Confirmação de reset é obrigatória', 400, 'VALIDATION_ERROR');
    }

    intimationCaptureService.reset();

    res.json({
      statusCode: 200,
      message: 'Intimation Capture Service resetado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
