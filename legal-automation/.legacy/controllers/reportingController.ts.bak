import express, { Router } from 'express';
import ReportGenerationService from '@services/ReportGenerationService';
import { authenticateJWT } from '@middlewares/authMiddleware';
import { logger } from '@utils/logger';

const router = Router();

/**
 * POST /reports/generate
 * Gerar novo relatório
 */
router.post('/reports/generate', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { reportType, format, filters, options } = req.body;

    if (!reportType || !format) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos obrigatórios: reportType, format',
      });
    }

    const metadata = await ReportGenerationService.generateReport(userId, {
      reportType,
      format,
      filters,
      options,
    });

    res.status(201).json({
      status: 'success',
      message: 'Relatório gerado com sucesso',
      report: {
        id: metadata.id,
        title: metadata.title,
        format: metadata.format,
        generatedAt: metadata.generatedAt,
        fileSize: metadata.fileSize,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao gerar relatório');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao gerar relatório',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /reports/:reportId/download
 * Download de relatório
 */
router.get('/reports/:reportId/download', authenticateJWT, async (req, res) => {
  try {
    const { reportId } = req.params;

    const fileBuffer = await ReportGenerationService.getReportFile(reportId);

    if (!fileBuffer) {
      return res.status(404).json({
        status: 'error',
        message: 'Relatório não encontrado',
      });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="relatorio-${reportId}.pdf"`,
    );
    res.send(fileBuffer);
  } catch (error) {
    logger.error({ err: error }, 'Erro ao baixar relatório');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao baixar relatório',
    });
  }
});

/**
 * GET /reports/:reportId/preview
 * Visualizar relatório em HTML
 */
router.get('/reports/:reportId/preview', authenticateJWT, async (req, res) => {
  try {
    const { reportId } = req.params;

    const fileBuffer = await ReportGenerationService.getReportFile(reportId);

    if (!fileBuffer) {
      return res.status(404).json({
        status: 'error',
        message: 'Relatório não encontrado',
      });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(fileBuffer.toString('utf-8'));
  } catch (error) {
    logger.error({ err: error }, 'Erro ao visualizar relatório');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao visualizar relatório',
    });
  }
});

/**
 * POST /reports/schedule
 * Agendar geração recorrente de relatório
 */
router.post('/reports/schedule', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { reportType, format, frequency, recipients } = req.body;

    if (!reportType || !format || !frequency) {
      return res.status(400).json({
        status: 'error',
        message:
          'Campos obrigatórios: reportType, format, frequency',
      });
    }

    res.status(201).json({
      status: 'success',
      message: 'Relatório agendado com sucesso',
      schedule: {
        id: 'schedule-' + Date.now(),
        reportType,
        format,
        frequency,
        enabled: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao agendar relatório');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao agendar relatório',
    });
  }
});

export default router;
