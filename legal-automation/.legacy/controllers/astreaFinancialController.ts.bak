import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { astreaService } from '@services/AstreaService';
import { CreateInvoiceRequest, UpdateInvoiceRequest, CreateCaseCostRequest } from '@/types/astrea';

const router = Router();

/**
 * POST /astrea/invoices
 * Criar nova fatura
 */
router.post('/invoices', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId, clientId, description, amount, dueDate, taxes, discounts, notes } = req.body;

    if (!caseId || !clientId || !description || !amount || !dueDate) {
      return res.status(400).json({
        error: 'caseId, clientId, description, amount e dueDate são obrigatórios',
      });
    }

    const request: CreateInvoiceRequest = {
      caseId,
      clientId,
      description,
      amount,
      dueDate,
      taxes,
      discounts,
      notes,
    };

    const invoice = await astreaService.createInvoice(userId, request);

    res.status(201).json({
      status: 'success',
      invoice,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar fatura');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao criar fatura',
    });
  }
});

/**
 * GET /astrea/invoices/:id
 * Obter fatura específica
 */
router.get('/invoices/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const invoice = await astreaService.getInvoice(id);

    if (!invoice) {
      return res.status(404).json({
        error: 'Fatura não encontrada',
      });
    }

    res.json({
      status: 'success',
      invoice,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter fatura');
    res.status(500).json({
      error: 'Erro ao obter fatura',
    });
  }
});

/**
 * GET /astrea/invoices
 * Listar faturas
 */
router.get('/invoices', verifyToken, async (req: Request, res: Response) => {
  try {
    const { caseId, status } = req.query;

    const invoices = await astreaService.listInvoices(
      caseId as string,
      status as string,
    );

    res.json({
      status: 'success',
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar faturas');
    res.status(500).json({
      error: 'Erro ao listar faturas',
    });
  }
});

/**
 * PUT /astrea/invoices/:id
 * Atualizar fatura
 */
router.put('/invoices/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { status, amount, dueDate, paidDate, notes } = req.body;

    const request: UpdateInvoiceRequest = {
      status,
      amount,
      dueDate,
      paidDate,
      notes,
    };

    const updated = await astreaService.updateInvoice(userId, id, request);

    if (!updated) {
      return res.status(404).json({
        error: 'Fatura não encontrada',
      });
    }

    res.json({
      status: 'success',
      invoice: updated,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao atualizar fatura');
    res.status(500).json({
      error: 'Erro ao atualizar fatura',
    });
  }
});

/**
 * POST /astrea/cases/:caseId/costs
 * Adicionar custo a um caso
 */
router.post('/cases/:caseId/costs', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { caseId } = req.params;
    const { description, category, amount, billable, date } = req.body;

    if (!description || !category || !amount) {
      return res.status(400).json({
        error: 'description, category e amount são obrigatórios',
      });
    }

    const request: CreateCaseCostRequest = {
      caseId,
      description,
      category,
      amount,
      billable,
      date,
    };

    const cost = await astreaService.addCaseCost(userId, request);

    res.json({
      status: 'success',
      cost,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao adicionar custo');
    res.status(500).json({
      error: 'Erro ao adicionar custo',
    });
  }
});

/**
 * GET /astrea/cases/:caseId/costs
 * Listar custos de um caso
 */
router.get('/cases/:caseId/costs', verifyToken, async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    const costs = await astreaService.getCaseCosts(caseId);

    res.json({
      status: 'success',
      count: costs.length,
      costs,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar custos');
    res.status(500).json({
      error: 'Erro ao listar custos',
    });
  }
});

/**
 * GET /astrea/cases/:caseId/financials
 * Obter financeiros de um caso
 */
router.get('/cases/:caseId/financials', verifyToken, async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    const financials = await astreaService.getCaseFinancials(caseId);

    res.json({
      status: 'success',
      financials,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter financeiros');
    res.status(500).json({
      error: 'Erro ao obter financeiros',
    });
  }
});

/**
 * GET /astrea/escritorio/:escritorioId/financials
 * Obter métricas financeiras do escritório
 */
router.get('/escritorio/:escritorioId/financials', verifyToken, async (req: Request, res: Response) => {
  try {
    const { escritorioId } = req.params;

    const metrics = await astreaService.getFinancialMetrics(escritorioId);

    res.json({
      status: 'success',
      metrics,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter métricas');
    res.status(500).json({
      error: 'Erro ao obter métricas',
    });
  }
});

export const astreaFinancialController = router;
