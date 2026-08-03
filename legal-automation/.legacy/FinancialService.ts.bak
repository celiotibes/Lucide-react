import { logger } from '@utils/logger';
import { crmService } from '@services/CRMService';

// ============================================================================
// FINANCIAL SERVICE - Phase 3 - Invoicing & Payment Management
// ============================================================================

export interface Invoice {
  id: string;
  clientId: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  currency: 'BRL' | 'USD' | 'EUR';
  status: 'draft' | 'issued' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: Date;
  dueDate: Date;
  items: InvoiceItem[];
  taxRate: number;
  totalTax: number;
  totalAmount: number;
  paymentMethod?: 'pix' | 'boleto' | 'credit_card' | 'wire_transfer';
  paymentId?: string;
  paidDate?: Date;
  paidAmount?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxable: boolean;
}

export interface Payment {
  id: string;
  invoiceId: string;
  clientId: string;
  amount: number;
  method: 'pix' | 'boleto' | 'credit_card' | 'wire_transfer';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  transactionId?: string;
  pixQrCode?: string;
  boletoUrl?: string;
  paymentDate?: Date;
  confirmationDate?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Expense {
  id: string;
  description: string;
  category: 'office' | 'software' | 'professional_services' | 'court_fees' | 'other';
  amount: number;
  date: Date;
  paymentMethod: string;
  vendor?: string;
  receiptUrl?: string;
  taxDeductible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancialReport {
  period: string;
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  totalExpenses: number;
  netRevenue: number;
  invoiceCount: number;
  paymentCount: number;
  expenseCount: number;
  averageInvoiceValue: number;
  paymentRate: number; // percentage
  taxAmount: number;
}

export class FinancialService {
  private invoices: Map<string, Invoice> = new Map();
  private payments: Map<string, Payment> = new Map();
  private expenses: Map<string, Expense> = new Map();
  private invoiceCounter: number = 1000;
  private readonly TAX_RATE = 0.15; // 15% tax rate (simplified)

  /**
   * Create invoice
   */
  async createInvoice(
    clientId: string,
    description: string,
    items: Array<{ description: string; quantity: number; unitPrice: number }>,
    dueDate: Date,
    notes?: string,
  ): Promise<Invoice> {
    try {
      const client = await crmService.getClientById(clientId);
      if (!client) {
        throw new Error(`Cliente ${clientId} não encontrado`);
      }

      const invoiceId = `inv-${Date.now()}`;
      this.invoiceCounter++;
      const invoiceNumber = `NF-${this.invoiceCounter}`;

      const invoiceItems: InvoiceItem[] = items.map((item) => ({
        id: `item-${Date.now()}-${Math.random()}`,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
        taxable: true,
      }));

      const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
      const totalTax = subtotal * this.TAX_RATE;
      const totalAmount = subtotal + totalTax;

      const invoice: Invoice = {
        id: invoiceId,
        clientId,
        invoiceNumber,
        description,
        amount: subtotal,
        currency: 'BRL',
        status: 'draft',
        issueDate: new Date(),
        dueDate,
        items: invoiceItems,
        taxRate: this.TAX_RATE,
        totalTax,
        totalAmount,
        notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.invoices.set(invoiceId, invoice);

      logger.info(`Fatura ${invoiceNumber} criada para cliente ${clientId}`);
      return invoice;
    } catch (error) {
      logger.error({ err: error }, `Erro ao criar fatura para cliente ${clientId}`);
      throw error;
    }
  }

  /**
   * Update invoice status
   */
  async updateInvoiceStatus(
    invoiceId: string,
    status: 'draft' | 'issued' | 'sent' | 'paid' | 'overdue' | 'cancelled',
  ): Promise<Invoice> {
    try {
      const invoice = this.invoices.get(invoiceId);
      if (!invoice) {
        throw new Error(`Fatura ${invoiceId} não encontrada`);
      }

      invoice.status = status;
      invoice.updatedAt = new Date();

      // Auto-update overdue status if due date passed
      if (status !== 'paid' && status !== 'cancelled' && invoice.dueDate < new Date()) {
        invoice.status = 'overdue';
      }

      this.invoices.set(invoiceId, invoice);

      logger.info(`Fatura ${invoiceId} atualizada para ${status}`);
      return invoice;
    } catch (error) {
      logger.error({ err: error }, `Erro ao atualizar fatura ${invoiceId}`);
      throw error;
    }
  }

  /**
   * Send invoice to client
   */
  async sendInvoice(invoiceId: string, recipientEmail: string): Promise<Invoice> {
    try {
      const invoice = this.invoices.get(invoiceId);
      if (!invoice) {
        throw new Error(`Fatura ${invoiceId} não encontrada`);
      }

      if (invoice.status === 'draft') {
        invoice.status = 'issued';
      }

      invoice.status = 'sent';
      invoice.updatedAt = new Date();
      this.invoices.set(invoiceId, invoice);

      logger.info(`Fatura ${invoiceId} enviada para ${recipientEmail}`);
      return invoice;
    } catch (error) {
      logger.error({ err: error }, `Erro ao enviar fatura ${invoiceId}`);
      throw error;
    }
  }

  /**
   * Record payment for invoice
   */
  async recordPayment(
    invoiceId: string,
    amount: number,
    method: 'pix' | 'boleto' | 'credit_card' | 'wire_transfer',
  ): Promise<Payment> {
    try {
      const invoice = this.invoices.get(invoiceId);
      if (!invoice) {
        throw new Error(`Fatura ${invoiceId} não encontrada`);
      }

      const paymentId = `pay-${Date.now()}`;
      const transactionId = `txn-${Math.random().toString(36).substr(2, 9)}`;

      const payment: Payment = {
        id: paymentId,
        invoiceId,
        clientId: invoice.clientId,
        amount,
        method,
        status: 'completed',
        transactionId,
        paymentDate: new Date(),
        confirmationDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.payments.set(paymentId, payment);

      // Update invoice
      invoice.status = 'paid';
      invoice.paymentMethod = method;
      invoice.paymentId = paymentId;
      invoice.paidDate = new Date();
      invoice.paidAmount = amount;
      invoice.updatedAt = new Date();
      this.invoices.set(invoiceId, invoice);

      logger.info(`Pagamento ${paymentId} registrado para fatura ${invoiceId}`);
      return payment;
    } catch (error) {
      logger.error({ err: error }, `Erro ao registrar pagamento para fatura ${invoiceId}`);
      throw error;
    }
  }

  /**
   * Generate payment link for invoice
   */
  async generatePaymentLink(
    invoiceId: string,
    method: 'pix' | 'boleto' = 'pix',
  ): Promise<{ url: string; qrCode?: string }> {
    try {
      const invoice = this.invoices.get(invoiceId);
      if (!invoice) {
        throw new Error(`Fatura ${invoiceId} não encontrada`);
      }

      // Placeholder: Real implementation would integrate with Stripe, Banco24h, etc.
      if (method === 'pix') {
        const qrCode = `PIX-${invoiceId}-${Math.random().toString(36).substr(2, 9)}`;
        return {
          url: `https://payment.legaltool.com/pix/${invoiceId}`,
          qrCode,
        };
      } else {
        return {
          url: `https://payment.legaltool.com/boleto/${invoiceId}`,
        };
      }
    } catch (error) {
      logger.error({ err: error }, `Erro ao gerar link de pagamento para fatura ${invoiceId}`);
      throw error;
    }
  }

  /**
   * Record expense
   */
  async recordExpense(
    description: string,
    amount: number,
    category: 'office' | 'software' | 'professional_services' | 'court_fees' | 'other',
    paymentMethod: string,
    taxDeductible: boolean = true,
    vendor?: string,
    receiptUrl?: string,
  ): Promise<Expense> {
    try {
      const expenseId = `exp-${Date.now()}`;

      const expense: Expense = {
        id: expenseId,
        description,
        category,
        amount,
        date: new Date(),
        paymentMethod,
        vendor,
        receiptUrl,
        taxDeductible,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.expenses.set(expenseId, expense);

      logger.info(`Despesa ${expenseId} registrada: ${description}`);
      return expense;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao registrar despesa');
      throw error;
    }
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    try {
      return this.invoices.get(invoiceId) || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter fatura ${invoiceId}`);
      throw error;
    }
  }

  /**
   * Get all invoices for client
   */
  async getClientInvoices(clientId: string): Promise<Invoice[]> {
    try {
      return Array.from(this.invoices.values()).filter((inv) => inv.clientId === clientId);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter faturas do cliente ${clientId}`);
      throw error;
    }
  }

  /**
   * Get pending invoices
   */
  async getPendingInvoices(): Promise<Invoice[]> {
    try {
      return Array.from(this.invoices.values()).filter(
        (inv) => inv.status === 'sent' || inv.status === 'overdue',
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter faturas pendentes');
      throw error;
    }
  }

  /**
   * Get overdue invoices
   */
  async getOverdueInvoices(): Promise<Invoice[]> {
    try {
      const now = new Date();
      return Array.from(this.invoices.values()).filter(
        (inv) => inv.status !== 'paid' && inv.status !== 'cancelled' && inv.dueDate < now,
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter faturas vencidas');
      throw error;
    }
  }

  /**
   * Get all payments
   */
  async getPayments(invoiceId?: string): Promise<Payment[]> {
    try {
      if (invoiceId) {
        return Array.from(this.payments.values()).filter((p) => p.invoiceId === invoiceId);
      }
      return Array.from(this.payments.values());
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter pagamentos');
      throw error;
    }
  }

  /**
   * Get expenses by category
   */
  async getExpensesByCategory(
    category: 'office' | 'software' | 'professional_services' | 'court_fees' | 'other',
  ): Promise<Expense[]> {
    try {
      return Array.from(this.expenses.values()).filter((exp) => exp.category === category);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter despesas da categoria ${category}`);
      throw error;
    }
  }

  /**
   * Generate financial report
   */
  async generateFinancialReport(startDate: Date, endDate: Date): Promise<FinancialReport> {
    try {
      const periodInvoices = Array.from(this.invoices.values()).filter(
        (inv) => inv.issueDate >= startDate && inv.issueDate <= endDate,
      );

      const periodPayments = Array.from(this.payments.values()).filter(
        (pay) => pay.paymentDate && pay.paymentDate >= startDate && pay.paymentDate <= endDate,
      );

      const periodExpenses = Array.from(this.expenses.values()).filter(
        (exp) => exp.date >= startDate && exp.date <= endDate,
      );

      const totalInvoiced = periodInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const totalPaid = periodInvoices
        .filter((inv) => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.totalAmount, 0);
      const totalPending = periodInvoices
        .filter((inv) => inv.status === 'sent')
        .reduce((sum, inv) => sum + inv.totalAmount, 0);
      const totalOverdue = periodInvoices
        .filter((inv) => inv.status === 'overdue')
        .reduce((sum, inv) => sum + inv.totalAmount, 0);
      const totalExpenses = periodExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      const totalTaxAmount = periodInvoices.reduce((sum, inv) => sum + inv.totalTax, 0);

      return {
        period: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
        totalInvoiced,
        totalPaid,
        totalPending,
        totalOverdue,
        totalExpenses,
        netRevenue: totalPaid - totalExpenses,
        invoiceCount: periodInvoices.length,
        paymentCount: periodPayments.length,
        expenseCount: periodExpenses.length,
        averageInvoiceValue: periodInvoices.length > 0 ? totalInvoiced / periodInvoices.length : 0,
        paymentRate: totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0,
        taxAmount: totalTaxAmount,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar relatório financeiro');
      throw error;
    }
  }

  /**
   * Get financial statistics
   */
  getStatistics(): {
    totalInvoices: number;
    totalPayments: number;
    totalExpenses: number;
    invoicesSent: number;
    invoicesPaid: number;
    invoicesOverdue: number;
    totalInvoiced: number;
    totalPaid: number;
    totalExpensesAmount: number;
  } {
    const invoiceArray = Array.from(this.invoices.values());
    const paymentArray = Array.from(this.payments.values());
    const expenseArray = Array.from(this.expenses.values());

    return {
      totalInvoices: invoiceArray.length,
      totalPayments: paymentArray.length,
      totalExpenses: expenseArray.length,
      invoicesSent: invoiceArray.filter((inv) => inv.status === 'sent').length,
      invoicesPaid: invoiceArray.filter((inv) => inv.status === 'paid').length,
      invoicesOverdue: invoiceArray.filter((inv) => inv.status === 'overdue').length,
      totalInvoiced: invoiceArray.reduce((sum, inv) => sum + inv.totalAmount, 0),
      totalPaid: paymentArray
        .filter((pay) => pay.status === 'completed')
        .reduce((sum, pay) => sum + pay.amount, 0),
      totalExpensesAmount: expenseArray.reduce((sum, exp) => sum + exp.amount, 0),
    };
  }

  /**
   * Reset data (for testing)
   */
  reset(): void {
    this.invoices.clear();
    this.payments.clear();
    this.expenses.clear();
    this.invoiceCounter = 1000;
    logger.info('Financial Service resetado');
  }
}

export const financialService = new FinancialService();
