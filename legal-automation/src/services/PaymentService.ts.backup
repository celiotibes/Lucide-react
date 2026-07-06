import db from '@db/connection';
import { logger } from '@utils/logger';
import crypto from 'crypto';
import {
  PaymentRequest,
  PaymentTransaction,
  PaymentCard,
  Refund,
  PaymentWebhook,
  PaymentReconciliation,
  Invoice,
  PaymentStatus,
  PaymentError,
  PaymentProcessingError,
  WebhookVerificationError,
  RefundError,
} from '@types/payments';

export class PaymentService {
  async processPayment(request: PaymentRequest): Promise<PaymentTransaction> {
    try {
      logger.info(`Processando pagamento para fatura ${request.invoiceId}`);

      const transactionId = crypto.randomUUID();
      const processorResponse = await this.callPaymentProcessor(request);

      if (!processorResponse.success) {
        throw new PaymentProcessingError(
          processorResponse.message || 'Falha ao processar pagamento'
        );
      }

      const transaction: PaymentTransaction = {
        id: transactionId,
        invoiceId: request.invoiceId,
        userId: request.customerEmail,
        amount: request.amount,
        currency: request.currency,
        method: request.method,
        processor: request.processor,
        processorTransactionId: processorResponse.transactionId,
        status: processorResponse.status as PaymentStatus,
        processorResponse,
        paidAt: processorResponse.status === 'succeeded' ? new Date() : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: request.metadata,
        ipAddress: request.metadata?.ipAddress,
        userAgent: request.metadata?.userAgent,
      };

      this.storeTransaction(transaction);
      await this.updateInvoiceStatus(request.invoiceId, transaction.status);

      logger.info(
        `✓ Pagamento ${transactionId} processado com sucesso (Status: ${transaction.status})`
      );

      return transaction;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao processar pagamento');
      throw error;
    }
  }

  async createRefund(
    transactionId: string,
    amount: number,
    reason: string,
    description?: string
  ): Promise<Refund> {
    try {
      const transaction = this.getTransaction(transactionId);
      if (!transaction) {
        throw new RefundError('Transação não encontrada');
      }

      if (transaction.status !== 'succeeded') {
        throw new RefundError('Apenas transações aprovadas podem ser reembolsadas');
      }

      if (amount > transaction.amount) {
        throw new RefundError('Valor do reembolso não pode ser maior que o pagamento');
      }

      const refundId = crypto.randomUUID();
      const processorRefund = await this.callRefundProcessor(
        transaction.processorTransactionId,
        amount,
        transaction.processor
      );

      const refund: Refund = {
        id: refundId,
        transactionId,
        amount,
        reason: reason as any,
        status: processorRefund.success ? 'processing' : 'failed',
        processorRefundId: processorRefund.refundId,
        description,
        requestedAt: new Date(),
        processedAt: processorRefund.success ? new Date() : undefined,
        updatedAt: new Date(),
      };

      this.storeRefund(refund);
      logger.info(`✓ Reembolso ${refundId} iniciado (Valor: ${amount})`);

      return refund;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar reembolso');
      throw error;
    }
  }

  async savePaymentCard(
    userId: string,
    cardData: any
  ): Promise<PaymentCard> {
    try {
      const cardId = crypto.randomUUID();
      const lastFour = cardData.cardNumber.slice(-4);

      const card: PaymentCard = {
        id: cardId,
        userId,
        cardholderName: cardData.cardholderName,
        last4: lastFour,
        brand: cardData.brand,
        expiryMonth: cardData.expiryMonth,
        expiryYear: cardData.expiryYear,
        processorCardId: cardData.processorCardId,
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.storePaymentCard(card);
      logger.info(`✓ Cartão ${lastFour} salvo para usuário ${userId}`);

      return card;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao salvar cartão de pagamento');
      throw error;
    }
  }

  async handleWebhook(
    processor: string,
    payload: any,
    signature: string
  ): Promise<boolean> {
    try {
      if (!this.verifyWebhookSignature(processor, payload, signature)) {
        throw new WebhookVerificationError('Assinatura de webhook inválida');
      }

      const webhook: PaymentWebhook = {
        id: crypto.randomUUID(),
        processor: processor as any,
        type: payload.type,
        data: payload,
        processorEventId: payload.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.storeWebhook(webhook);
      await this.processWebhookEvent(webhook);

      logger.info(`✓ Webhook ${webhook.id} processado com sucesso`);
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao processar webhook de pagamento');
      throw error;
    }
  }

  async reconcilePayments(dateFrom: Date, dateTo: Date): Promise<PaymentReconciliation[]> {
    try {
      logger.info(`Iniciando reconciliação de pagamentos (${dateFrom} a ${dateTo})`);

      const transactions = this.getTransactionsByDateRange(dateFrom, dateTo);
      const reconciliations: PaymentReconciliation[] = [];

      for (const transaction of transactions) {
        const reconciliation: PaymentReconciliation = {
          id: crypto.randomUUID(),
          transactionId: transaction.id,
          invoiceId: transaction.invoiceId,
          processedAt: new Date(),
          status: 'reconciled',
          createdAt: new Date(),
        };

        this.storeReconciliation(reconciliation);
        reconciliations.push(reconciliation);
      }

      logger.info(`✓ ${reconciliations.length} pagamentos reconciliados`);
      return reconciliations;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao reconciliar pagamentos');
      throw error;
    }
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    try {
      const stmt = db.prepare(`
        SELECT * FROM invoices WHERE id = ?
      `);
      return stmt.get(invoiceId) as Invoice | null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter fatura ${invoiceId}`);
      return null;
    }
  }

  async generateInvoice(userId: string, items: any[], dueDate: Date): Promise<Invoice> {
    try {
      const invoiceId = crypto.randomUUID();
      const invoiceNumber = `INV-${Date.now()}`;
      const total = items.reduce((sum, item) => sum + item.total, 0);

      const invoice: Invoice = {
        id: invoiceId,
        invoiceNumber,
        userId,
        amount: total,
        currency: 'BRL',
        status: 'pending',
        dueDate,
        items,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.storeInvoice(invoice);
      logger.info(`✓ Fatura ${invoiceNumber} gerada para usuário ${userId}`);

      return invoice;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar fatura');
      throw error;
    }
  }

  // Private methods
  private async callPaymentProcessor(request: PaymentRequest): Promise<any> {
    switch (request.processor) {
      case 'stripe':
        return this.stripeProcessPayment(request);
      case 'paypal':
        return this.paypalProcessPayment(request);
      case 'mercado_pago':
        return this.mercadoPagoProcessPayment(request);
      default:
        throw new PaymentError('UNKNOWN_PROCESSOR', 'Processador desconhecido');
    }
  }

  private async stripeProcessPayment(request: PaymentRequest): Promise<any> {
    // Stripe API call simulation
    return {
      success: true,
      transactionId: `stripe_${crypto.randomUUID()}`,
      status: 'succeeded',
      timestamp: new Date().toISOString(),
    };
  }

  private async paypalProcessPayment(request: PaymentRequest): Promise<any> {
    // PayPal API call simulation
    return {
      success: true,
      transactionId: `paypal_${crypto.randomUUID()}`,
      status: 'succeeded',
      timestamp: new Date().toISOString(),
    };
  }

  private async mercadoPagoProcessPayment(request: PaymentRequest): Promise<any> {
    // Mercado Pago API call simulation
    return {
      success: true,
      transactionId: `mercadopago_${crypto.randomUUID()}`,
      status: 'succeeded',
      timestamp: new Date().toISOString(),
    };
  }

  private async callRefundProcessor(
    processorTransactionId: string,
    amount: number,
    processor: string
  ): Promise<any> {
    return {
      success: true,
      refundId: `refund_${crypto.randomUUID()}`,
      status: 'processing',
    };
  }

  private verifyWebhookSignature(
    processor: string,
    payload: any,
    signature: string
  ): boolean {
    // Simplified webhook verification
    return signature && signature.length > 0;
  }

  private async processWebhookEvent(webhook: PaymentWebhook): Promise<void> {
    switch (webhook.type) {
      case 'payment.success':
        await this.handlePaymentSuccess(webhook.data);
        break;
      case 'payment.failed':
        await this.handlePaymentFailed(webhook.data);
        break;
      case 'refund.completed':
        await this.handleRefundCompleted(webhook.data);
        break;
    }
  }

  private async handlePaymentSuccess(data: any): Promise<void> {
    logger.info(`Webhook: Pagamento bem-sucedido - ${data.transactionId}`);
  }

  private async handlePaymentFailed(data: any): Promise<void> {
    logger.error(`Webhook: Pagamento falhou - ${data.transactionId}`);
  }

  private async handleRefundCompleted(data: any): Promise<void> {
    logger.info(`Webhook: Reembolso concluído - ${data.refundId}`);
  }

  private storeTransaction(transaction: PaymentTransaction): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO payment_transactions
        (id, invoice_id, user_id, amount, currency, method, processor, processor_transaction_id, status, processor_response, paid_at, created_at, updated_at, metadata, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        transaction.id,
        transaction.invoiceId,
        transaction.userId,
        transaction.amount,
        transaction.currency,
        transaction.method,
        transaction.processor,
        transaction.processorTransactionId,
        transaction.status,
        JSON.stringify(transaction.processorResponse),
        transaction.paidAt?.toISOString(),
        transaction.createdAt.toISOString(),
        transaction.updatedAt.toISOString(),
        JSON.stringify(transaction.metadata || {}),
        transaction.ipAddress,
        transaction.userAgent
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar transação');
    }
  }

  private getTransaction(transactionId: string): PaymentTransaction | null {
    try {
      const stmt = db.prepare('SELECT * FROM payment_transactions WHERE id = ?');
      return stmt.get(transactionId) as PaymentTransaction | null;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter transação');
      return null;
    }
  }

  private storeRefund(refund: Refund): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO refunds
        (id, transaction_id, amount, reason, status, processor_refund_id, description, requested_at, processed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        refund.id,
        refund.transactionId,
        refund.amount,
        refund.reason,
        refund.status,
        refund.processorRefundId,
        refund.description,
        refund.requestedAt.toISOString(),
        refund.processedAt?.toISOString(),
        refund.updatedAt.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar reembolso');
    }
  }

  private storePaymentCard(card: PaymentCard): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO payment_cards
        (id, user_id, cardholder_name, last4, brand, expiry_month, expiry_year, processor_card_id, is_default, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        card.id,
        card.userId,
        card.cardholderName,
        card.last4,
        card.brand,
        card.expiryMonth,
        card.expiryYear,
        card.processorCardId,
        card.isDefault ? 1 : 0,
        card.isActive ? 1 : 0,
        card.createdAt.toISOString(),
        card.updatedAt.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar cartão de pagamento');
    }
  }

  private storeWebhook(webhook: PaymentWebhook): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO payment_webhooks
        (id, processor, type, data, processor_event_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        webhook.id,
        webhook.processor,
        webhook.type,
        JSON.stringify(webhook.data),
        webhook.processorEventId,
        webhook.createdAt.toISOString(),
        webhook.updatedAt.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar webhook');
    }
  }

  private storeReconciliation(reconciliation: PaymentReconciliation): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO payment_reconciliations
        (id, transaction_id, invoice_id, processed_at, status, discrepancy_reason, discrepancy_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        reconciliation.id,
        reconciliation.transactionId,
        reconciliation.invoiceId,
        reconciliation.processedAt.toISOString(),
        reconciliation.status,
        reconciliation.discrepancyReason,
        reconciliation.discrepancyAmount,
        reconciliation.createdAt.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar reconciliação');
    }
  }

  private getTransactionsByDateRange(dateFrom: Date, dateTo: Date): PaymentTransaction[] {
    try {
      const stmt = db.prepare(`
        SELECT * FROM payment_transactions
        WHERE created_at >= ? AND created_at <= ?
        ORDER BY created_at DESC
      `);
      return stmt.all(dateFrom.toISOString(), dateTo.toISOString()) as PaymentTransaction[];
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter transações por período');
      return [];
    }
  }

  private storeInvoice(invoice: Invoice): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO invoices
        (id, invoice_number, user_id, amount, currency, status, due_date, description, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        invoice.id,
        invoice.invoiceNumber,
        invoice.userId,
        invoice.amount,
        invoice.currency,
        invoice.status,
        invoice.dueDate.toISOString(),
        invoice.items,
        invoice.notes,
        invoice.createdAt.toISOString(),
        invoice.updatedAt.toISOString()
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar fatura');
    }
  }

  private async updateInvoiceStatus(invoiceId: string, status: PaymentStatus): Promise<void> {
    try {
      const stmt = db.prepare(`
        UPDATE invoices
        SET status = ?, paid_at = ?, updated_at = ?
        WHERE id = ?
      `);

      const invoiceStatus = status === 'succeeded' ? 'paid' : 'pending';
      const paidAt = status === 'succeeded' ? new Date().toISOString() : null;

      stmt.run(invoiceStatus, paidAt, new Date().toISOString(), invoiceId);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao atualizar status da fatura');
    }
  }
}

export default new PaymentService();
