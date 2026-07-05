import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { astreaService } from '@services/AstreaService';
import { CreateTimeEntryRequest } from '@types/astrea';

const router = Router();

/**
 * POST /astrea/time-entries
 * Adicionar registro de tempo
 */
router.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId, description, hours, minutes, date, billable, category } = req.body;

    if (!caseId || !description || hours === undefined || !category) {
      return res.status(400).json({
        error: 'caseId, description, hours e category são obrigatórios',
      });
    }

    const request: CreateTimeEntryRequest = {
      caseId,
      description,
      hours,
      minutes,
      date,
      billable,
      category,
    };

    const entry = await astreaService.addTimeEntry(userId, request);

    res.status(201).json({
      status: 'success',
      entry,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao adicionar registro de tempo');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao adicionar registro',
    });
  }
});

/**
 * GET /astrea/cases/:caseId/time-entries
 * Listar registros de tempo de um caso
 */
router.get('/case/:caseId', verifyToken, async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const { billableOnly } = req.query;

    const entries = await astreaService.getTimeEntries(
      caseId,
      billableOnly === 'true',
    );

    res.json({
      status: 'success',
      count: entries.length,
      entries,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar registros');
    res.status(500).json({
      error: 'Erro ao listar registros',
    });
  }
});

/**
 * GET /astrea/cases/:caseId/time-entries/summary
 * Obter resumo de horas de um caso
 */
router.get('/case/:caseId/summary', verifyToken, async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    const entries = await astreaService.getTimeEntries(caseId);

    const billableHours = entries
      .filter(e => e.billable)
      .reduce((total, e) => total + (e.hours + e.minutes / 60), 0);

    const totalHours = entries.reduce((total, e) => total + (e.hours + e.minutes / 60), 0);

    res.json({
      status: 'success',
      summary: {
        totalHours: parseFloat(totalHours.toFixed(2)),
        billableHours: parseFloat(billableHours.toFixed(2)),
        billablePercentage: totalHours > 0 ? parseFloat(((billableHours / totalHours) * 100).toFixed(2)) : 0,
        entriesCount: entries.length,
        categoryBreakdown: entries.reduce((acc, e) => {
          acc[e.category] = (acc[e.category] || 0) + (e.hours + e.minutes / 60);
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter resumo');
    res.status(500).json({
      error: 'Erro ao obter resumo',
    });
  }
});

export const astreaTimeController = router;
