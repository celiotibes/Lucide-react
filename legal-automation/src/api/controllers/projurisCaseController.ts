import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { projurisService } from '@services/ProjurisService';
import { CreateCaseRequest, UpdateCaseRequest } from '@/types/projuris';

const router = Router();

/**
 * POST /projuris/cases
 * Criar novo caso
 */
router.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { escritorioId } = req.body;
    const {
      caseNumber,
      title,
      description,
      tribunal,
      clientId,
      departmentId,
      assignedTo,
      participants,
      processValue,
      filingDate,
    } = req.body;

    if (!caseNumber || !title || !tribunal || !clientId || !assignedTo) {
      return res.status(400).json({
        error: 'caseNumber, title, tribunal, clientId e assignedTo são obrigatórios',
      });
    }

    const request: CreateCaseRequest = {
      caseNumber,
      title,
      description,
      tribunal,
      clientId,
      departmentId,
      assignedTo,
      participants: participants || [],
      processValue,
      filingDate,
    };

    const newCase = await projurisService.createCase(userId, escritorioId, request);

    res.status(201).json({
      status: 'success',
      case: newCase,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar caso');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao criar caso',
    });
  }
});

/**
 * GET /projuris/cases/:id
 * Obter caso específico
 */
router.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;

    const caseData = await projurisService.getCase(userId, id);

    if (!caseData) {
      return res.status(404).json({
        error: 'Caso não encontrado',
      });
    }

    res.json({
      status: 'success',
      case: caseData,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter caso');
    res.status(500).json({
      error: 'Erro ao obter caso',
    });
  }
});

/**
 * GET /projuris/escritorios/:escritorioId/cases
 * Listar casos de um escritório
 */
router.get('/escritorio/:escritorioId', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { escritorioId } = req.params;
    const { status, clientId } = req.query;

    const cases = await projurisService.listCases(userId, escritorioId, {
      status: status as string,
      clientId: clientId as string,
    });

    res.json({
      status: 'success',
      count: cases.length,
      cases,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar casos');
    res.status(500).json({
      error: 'Erro ao listar casos',
    });
  }
});

/**
 * PUT /projuris/cases/:id
 * Atualizar caso
 */
router.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { title, status, assignedTo, participants, expectedClosingDate, tags } = req.body;

    const request: UpdateCaseRequest = {
      title,
      status,
      assignedTo,
      participants,
      expectedClosingDate,
      tags,
    };

    const updated = await projurisService.updateCase(userId, id, request);

    if (!updated) {
      return res.status(404).json({
        error: 'Caso não encontrado',
      });
    }

    res.json({
      status: 'success',
      case: updated,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar caso');
    res.status(500).json({
      error: 'Erro ao atualizar caso',
    });
  }
});

/**
 * POST /projuris/cases/:id/updates
 * Adicionar atualização de caso
 */
router.post('/:id/updates', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { type, description, documentId } = req.body;

    if (!type || !description) {
      return res.status(400).json({
        error: 'type e description são obrigatórios',
      });
    }

    const update = await projurisService.addCaseUpdate(userId, id, type, description, documentId);

    res.json({
      status: 'success',
      update,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao adicionar atualização');
    res.status(500).json({
      error: 'Erro ao adicionar atualização',
    });
  }
});

/**
 * GET /projuris/cases/:id/stats
 * Obter estatísticas do caso
 */
router.get('/:id/stats', verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const stats = await projurisService.getCaseStats(id);

    res.json({
      status: 'success',
      stats,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter estatísticas');
    res.status(500).json({
      error: 'Erro ao obter estatísticas',
    });
  }
});

export const projurisCaseController = router;
