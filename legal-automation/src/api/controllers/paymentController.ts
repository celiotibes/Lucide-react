import express, { Router } from 'express';
import PaymentService from '@services/PaymentService';
import { authenticateJWT } from '@middlewares/authMiddleware';
import { logger } from '@utils/logger';

const router = Router();

/**
 * POST /payments/process
 * Processar pagamento
 */
router.post('/payments/process', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const {
      invoiceId,
      amount,
      currency,
      method,
      processor,
      customerEmail,
      customerName,
      description,
    } = req.body;

    if (!invoiceId || !amount || !method || !processor) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos obrigatórios: invoiceId, amount, method, processor',
      });
    }

    const transaction = await PaymentService.processPayment({
      invoiceId,
      amount,
      currency: currency || 'BRL',
      method,
      processor,
      customerEmail: customerEmail || userId,
      customerName: customerName || 'Cliente',
      description,
      metadata: {
        userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Pagamento processado com sucesso',
      transaction: {
        id: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        processor: transaction.processor,
        paidAt: transaction.paidAt,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao processar pagamento');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao processar pagamento',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /payments/refund
 * Criar reembolso
 */
router.post('/payments/refund', authenticateJWT, async (req, res) => {
  try {
    const { transactionId, amount, reason, description } = req.body;

    if (!transactionId || !amount || !reason) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos obrigatórios: transactionId, amount, reason',
      });
    }

    const refund = await PaymentService.createRefund(
      transactionId,
      amount,
      reason,
      description
    );

    res.status(201).json({
      status: 'success',
      message: 'Reembolso solicitado com sucesso',
      refund: {
        id: refund.id,
        status: refund.status,
        amount: refund.amount,
        reason: refund.reason,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao criar reembolso');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao criar reembolso',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /payments/webhook/:processor
 * Receber webhooks de pagamento
 */
router.post('/payments/webhook/:processor', async (req, res) => {
  try {
    const { processor } = req.params;
    const signature = req.get('x-webhook-signature') || '';
    const payload = req.body;

    await PaymentService.handleWebhook(processor, payload, signature);

    res.status(200).json({
      status: 'success',
      message: 'Webhook processado com sucesso',
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao processar webhook');
    res.status(400).json({
      status: 'error',
      message: 'Erro ao processar webhook',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /payments/reconcile
 * Reconciliar pagamentos
 */
router.post('/payments/reconcile', authenticateJWT, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.body;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos obrigatórios: dateFrom, dateTo',
      });
    }

    const reconciliations = await PaymentService.reconcilePayments(
      new Date(dateFrom),
      new Date(dateTo)
    );

    res.status(200).json({
      status: 'success',
      message: 'Reconciliação concluída',
      count: reconciliations.length,
      reconciliations,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao reconciliar pagamentos');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao reconciliar pagamentos',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /payments/invoices/:invoiceId
 * Obter fatura
 */
router.get('/payments/invoices/:invoiceId', authenticateJWT, async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await PaymentService.getInvoice(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        status: 'error',
        message: 'Fatura não encontrada',
      });
    }

    res.status(200).json({
      status: 'success',
      invoice,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter fatura');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter fatura',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /payments/invoices/generate
 * Gerar fatura
 */
router.post('/payments/invoices/generate', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { items, dueDate } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos obrigatórios: items (array)',
      });
    }

    const invoice = await PaymentService.generateInvoice(
      userId,
      items,
      new Date(dueDate || Date.now() + 30 * 24 * 60 * 60 * 1000)
    );

    res.status(201).json({
      status: 'success',
      message: 'Fatura gerada com sucesso',
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        status: invoice.status,
        dueDate: invoice.dueDate,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao gerar fatura');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao gerar fatura',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;
