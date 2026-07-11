import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { financialService } from '@services/FinancialService';
import { AppError } from '@utils/errors';

// ============================================================================
// FINANCIAL ROUTER - Phase 3 - Invoicing & Payment Management
// ============================================================================

const router = Router();

/**
 * POST /invoices - Create invoice
 */
router.post('/invoices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId, description, items, dueDate, notes } = req.body;

    if (!clientId || !description || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        'clientId, description e items (array) são obrigatórios',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (!dueDate) {
      throw new AppError('dueDate é obrigatório', 400, 'VALIDATION_ERROR');
    }

    const invoice = await financialService.createInvoice(
      clientId,
      description,
      items,
      new Date(dueDate),
      notes,
    );

    res.status(201).json({
      statusCode: 201,
      data: invoice,
      message: 'Fatura criada com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /invoices/:invoiceId - Get invoice
 */
router.get('/invoices/:invoiceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await financialService.getInvoice(invoiceId);
    if (!invoice) {
      throw new AppError('Fatura não encontrada', 404, 'INVOICE_NOT_FOUND');
    }

    res.json({
      statusCode: 200,
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /invoices/client/:clientId - Get client invoices
 */
router.get(
  '/invoices/client/:clientId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientId } = req.params;

      const invoices = await financialService.getClientInvoices(clientId);

      res.json({
        statusCode: 200,
        data: invoices,
        total: invoices.length,
        message: 'Faturas do cliente obtidas com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /invoices/:invoiceId/status - Update invoice status
 */
router.put(
  '/invoices/:invoiceId/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { invoiceId } = req.params;
      const { status } = req.body;

      if (!status) {
        throw new AppError('Status é obrigatório', 400, 'VALIDATION_ERROR');
      }

      const validStatuses = ['draft', 'issued', 'sent', 'paid', 'overdue', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new AppError('Status inválido', 400, 'INVALID_STATUS');
      }

      const invoice = await financialService.updateInvoiceStatus(invoiceId, status);

      res.json({
        statusCode: 200,
        data: invoice,
        message: `Fatura atualizada para ${status}`,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /invoices/:invoiceId/send - Send invoice to client
 */
router.post(
  '/invoices/:invoiceId/send',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { invoiceId } = req.params;
      const { recipientEmail } = req.body;

      if (!recipientEmail) {
        throw new AppError('E-mail do destinatário é obrigatório', 400, 'VALIDATION_ERROR');
      }

      const invoice = await financialService.sendInvoice(invoiceId, recipientEmail);

      res.json({
        statusCode: 200,
        data: invoice,
        message: 'Fatura enviada com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /payments - Record payment
 */
router.post('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { invoiceId, amount, method } = req.body;

    if (!invoiceId || !amount || !method) {
      throw new AppError('invoiceId, amount e method são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const validMethods = ['pix', 'boleto', 'credit_card', 'wire_transfer'];
    if (!validMethods.includes(method)) {
      throw new AppError('Método de pagamento inválido', 400, 'INVALID_METHOD');
    }

    const payment = await financialService.recordPayment(invoiceId, amount, method);

    res.status(201).json({
      statusCode: 201,
      data: payment,
      message: 'Pagamento registrado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /payments/:invoiceId - Get payments for invoice
 */
router.get('/payments/:invoiceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { invoiceId } = req.params;

    const payments = await financialService.getPayments(invoiceId);

    res.json({
      statusCode: 200,
      data: payments,
      total: payments.length,
      message: 'Pagamentos obtidos com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /invoices/:invoiceId/payment-link - Generate payment link
 */
router.post(
  '/invoices/:invoiceId/payment-link',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { invoiceId } = req.params;
      const { method = 'pix' } = req.body;

      const validMethods = ['pix', 'boleto'];
      if (!validMethods.includes(method)) {
        throw new AppError('Método deve ser pix ou boleto', 400, 'INVALID_METHOD');
      }

      const link = await financialService.generatePaymentLink(invoiceId, method);

      res.json({
        statusCode: 200,
        data: link,
        message: 'Link de pagamento gerado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /expenses - Record expense
 */
router.post('/expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { description, amount, category, paymentMethod, taxDeductible, vendor, receiptUrl } =
      req.body;

    if (!description || !amount || !category || !paymentMethod) {
      throw new AppError(
        'description, amount, category e paymentMethod são obrigatórios',
        400,
        'VALIDATION_ERROR',
      );
    }

    const validCategories = [
      'office',
      'software',
      'professional_services',
      'court_fees',
      'other',
    ];
    if (!validCategories.includes(category)) {
      throw new AppError('Categoria de despesa inválida', 400, 'INVALID_CATEGORY');
    }

    const expense = await financialService.recordExpense(
      description,
      amount,
      category,
      paymentMethod,
      taxDeductible !== false,
      vendor,
      receiptUrl,
    );

    res.status(201).json({
      statusCode: 201,
      data: expense,
      message: 'Despesa registrada com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /expenses/category/:category - Get expenses by category
 */
router.get(
  '/expenses/category/:category',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category } = req.params;

      const validCategories = [
        'office',
        'software',
        'professional_services',
        'court_fees',
        'other',
      ];
      if (!validCategories.includes(category)) {
        throw new AppError('Categoria inválida', 400, 'INVALID_CATEGORY');
      }

      const expenses = await financialService.getExpensesByCategory(
        category as
          | 'office'
          | 'software'
          | 'professional_services'
          | 'court_fees'
          | 'other',
      );

      res.json({
        statusCode: 200,
        data: expenses,
        total: expenses.length,
        message: `Despesas da categoria ${category} obtidas com sucesso`,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /invoices/status/pending - Get pending invoices
 */
router.get('/invoices/status/pending', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoices = await financialService.getPendingInvoices();

    res.json({
      statusCode: 200,
      data: invoices,
      total: invoices.length,
      message: 'Faturas pendentes obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /invoices/status/overdue - Get overdue invoices
 */
router.get('/invoices/status/overdue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoices = await financialService.getOverdueInvoices();

    res.json({
      statusCode: 200,
      data: invoices,
      total: invoices.length,
      message: 'Faturas vencidas obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reports/financial - Generate financial report
 */
router.get('/reports/financial', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new AppError('startDate e endDate são obrigatórios', 400, 'VALIDATION_ERROR');
    }

    const report = await financialService.generateFinancialReport(
      new Date(startDate as string),
      new Date(endDate as string),
    );

    res.json({
      statusCode: 200,
      data: report,
      message: 'Relatório financeiro gerado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /statistics - Get financial statistics
 */
router.get('/statistics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = financialService.getStatistics();

    res.json({
      statusCode: 200,
      data: stats,
      message: 'Estatísticas financeiras obtidas com sucesso',
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

    financialService.reset();

    res.json({
      statusCode: 200,
      message: 'Financial Service resetado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
