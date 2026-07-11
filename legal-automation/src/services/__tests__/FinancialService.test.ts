import { financialService } from '@services/FinancialService';
import { crmService } from '@services/CRMService';

describe('FinancialService', () => {
  beforeEach(() => {
    financialService.reset();
    crmService.reset();
  });

  describe('createInvoice', () => {
    test('should create invoice for valid client', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente Teste',
        email: 'cliente@example.com',
        phone: '11999999999',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Consulta Jurídica',
        [{ description: 'Parecer jurídico', quantity: 1, unitPrice: 500 }],
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        'Pagamento à vista',
      );

      expect(invoice.clientId).toBe(client.id);
      expect(invoice.status).toBe('draft');
      expect(invoice.amount).toBe(500);
      expect(invoice.totalAmount).toBeGreaterThan(500); // includes tax
      expect(invoice.items.length).toBe(1);
    });

    test('should calculate tax correctly', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente Teste',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Serviço', quantity: 1, unitPrice: 1000 }],
        new Date(),
      );

      const expectedTax = 1000 * 0.15; // 15% tax rate
      expect(invoice.totalTax).toBe(expectedTax);
      expect(invoice.totalAmount).toBe(1000 + expectedTax);
    });

    test('should generate invoice number', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice1 = await financialService.createInvoice(
        client.id,
        'Serviço 1',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      const invoice2 = await financialService.createInvoice(
        client.id,
        'Serviço 2',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      expect(invoice1.invoiceNumber).toMatch(/^NF-/);
      expect(invoice2.invoiceNumber).not.toBe(invoice1.invoiceNumber);
    });

    test('should handle multiple items', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço Completo',
        [
          { description: 'Item 1', quantity: 2, unitPrice: 100 },
          { description: 'Item 2', quantity: 3, unitPrice: 200 },
          { description: 'Item 3', quantity: 1, unitPrice: 500 },
        ],
        new Date(),
      );

      expect(invoice.items.length).toBe(3);
      expect(invoice.amount).toBe(2 * 100 + 3 * 200 + 500); // 1400
    });

    test('should throw error for non-existent client', async () => {
      await expect(
        financialService.createInvoice(
          'non-existent',
          'Serviço',
          [{ description: 'Item', quantity: 1, unitPrice: 100 }],
          new Date(),
        ),
      ).rejects.toThrow();
    });
  });

  describe('updateInvoiceStatus', () => {
    test('should update invoice status', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      const updated = await financialService.updateInvoiceStatus(invoice.id, 'sent');

      expect(updated.status).toBe('sent');
    });

    test('should mark as overdue if due date passed', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        pastDate,
      );

      // Manually set to sent to avoid auto-overdue on creation
      invoice.status = 'sent';

      const updated = await financialService.updateInvoiceStatus(invoice.id, 'sent');

      expect(updated.status).toBe('overdue');
    });
  });

  describe('sendInvoice', () => {
    test('should send invoice and update status', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      const sent = await financialService.sendInvoice(invoice.id, 'cliente@example.com');

      expect(sent.status).toBe('sent');
    });

    test('should update from draft to sent', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      expect(invoice.status).toBe('draft');

      const sent = await financialService.sendInvoice(invoice.id, 'email@example.com');

      expect(sent.status).toBe('sent');
    });
  });

  describe('recordPayment', () => {
    test('should record payment for invoice', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      const payment = await financialService.recordPayment(invoice.id, invoice.totalAmount, 'pix');

      expect(payment.status).toBe('completed');
      expect(payment.invoiceId).toBe(invoice.id);
      expect(payment.amount).toBe(invoice.totalAmount);
      expect(payment.paymentDate).toBeDefined();
    });

    test('should update invoice status to paid', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      await financialService.recordPayment(invoice.id, invoice.totalAmount, 'pix');

      const updated = await financialService.getInvoice(invoice.id);

      expect(updated?.status).toBe('paid');
      expect(updated?.paidDate).toBeDefined();
      expect(updated?.paymentMethod).toBe('pix');
    });

    test('should handle different payment methods', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const methods: Array<'pix' | 'boleto' | 'credit_card' | 'wire_transfer'> = [
        'pix',
        'boleto',
        'credit_card',
        'wire_transfer',
      ];

      for (const method of methods) {
        const invoice = await financialService.createInvoice(
          client.id,
          'Serviço',
          [{ description: 'Item', quantity: 1, unitPrice: 100 }],
          new Date(),
        );

        const payment = await financialService.recordPayment(invoice.id, invoice.totalAmount, method);

        expect(payment.method).toBe(method);
      }
    });
  });

  describe('generatePaymentLink', () => {
    test('should generate Pix payment link', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      const link = await financialService.generatePaymentLink(invoice.id, 'pix');

      expect(link.url).toContain('pix');
      expect(link.qrCode).toBeDefined();
    });

    test('should generate Boleto payment link', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      const link = await financialService.generatePaymentLink(invoice.id, 'boleto');

      expect(link.url).toContain('boleto');
    });
  });

  describe('recordExpense', () => {
    test('should record expense', async () => {
      const expense = await financialService.recordExpense(
        'Software subscription',
        299.9,
        'software',
        'credit_card',
        true,
        'Stripe Inc.',
      );

      expect(expense.description).toBe('Software subscription');
      expect(expense.amount).toBe(299.9);
      expect(expense.category).toBe('software');
      expect(expense.taxDeductible).toBe(true);
    });

    test('should handle all expense categories', async () => {
      const categories = ['office', 'software', 'professional_services', 'court_fees', 'other'] as const;

      for (const category of categories) {
        const expense = await financialService.recordExpense(
          'Test expense',
          100,
          category,
          'cash',
        );

        expect(expense.category).toBe(category);
      }
    });
  });

  describe('getInvoice', () => {
    test('should retrieve invoice by ID', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const created = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      const retrieved = await financialService.getInvoice(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
    });

    test('should return null for non-existent invoice', async () => {
      const invoice = await financialService.getInvoice('non-existent');

      expect(invoice).toBeNull();
    });
  });

  describe('getClientInvoices', () => {
    test('should retrieve all invoices for client', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      for (let i = 0; i < 3; i++) {
        await financialService.createInvoice(
          client.id,
          `Serviço ${i}`,
          [{ description: 'Item', quantity: 1, unitPrice: 100 * (i + 1) }],
          new Date(),
        );
      }

      const invoices = await financialService.getClientInvoices(client.id);

      expect(invoices.length).toBe(3);
      expect(invoices.every((inv) => inv.clientId === client.id)).toBe(true);
    });
  });

  describe('getPendingInvoices', () => {
    test('should return sent and overdue invoices', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice1 = await financialService.createInvoice(
        client.id,
        'Serviço 1',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      await financialService.sendInvoice(invoice1.id, 'cliente@example.com');

      const pending = await financialService.getPendingInvoices();

      expect(pending.length).toBeGreaterThan(0);
      expect(pending.some((inv) => inv.id === invoice1.id)).toBe(true);
    });
  });

  describe('getOverdueInvoices', () => {
    test('should identify overdue invoices', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        pastDate,
      );

      // Send but don't pay
      await financialService.updateInvoiceStatus(invoice.id, 'sent');

      const overdue = await financialService.getOverdueInvoices();

      expect(overdue.some((inv) => inv.id === invoice.id)).toBe(true);
    });
  });

  describe('recordExpense and getExpensesByCategory', () => {
    test('should retrieve expenses by category', async () => {
      await financialService.recordExpense('Software', 100, 'software', 'card');
      await financialService.recordExpense('Office rent', 2000, 'office', 'wire');
      await financialService.recordExpense('Court fee', 500, 'court_fees', 'card');

      const softwareExpenses = await financialService.getExpensesByCategory('software');
      const officeExpenses = await financialService.getExpensesByCategory('office');

      expect(softwareExpenses.length).toBe(1);
      expect(officeExpenses.length).toBe(1);
      expect(softwareExpenses[0].category).toBe('software');
      expect(officeExpenses[0].category).toBe('office');
    });
  });

  describe('generateFinancialReport', () => {
    test('should generate financial report', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 1000 }],
        new Date(),
      );

      await financialService.sendInvoice(invoice.id, 'cliente@example.com');
      await financialService.recordPayment(invoice.id, invoice.totalAmount, 'pix');
      await financialService.recordExpense('Office rent', 500, 'office', 'wire');

      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const report = await financialService.generateFinancialReport(startDate, endDate);

      expect(report.totalInvoiced).toBeGreaterThan(0);
      expect(report.totalPaid).toBeGreaterThan(0);
      expect(report.totalExpenses).toBe(500);
      expect(report.invoiceCount).toBe(1);
      expect(report.paymentCount).toBe(1);
      expect(report.netRevenue).toBe(report.totalPaid - 500);
    });

    test('should calculate payment rate correctly', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice1 = await financialService.createInvoice(
        client.id,
        'Serviço 1',
        [{ description: 'Item', quantity: 1, unitPrice: 1000 }],
        new Date(),
      );

      const invoice2 = await financialService.createInvoice(
        client.id,
        'Serviço 2',
        [{ description: 'Item', quantity: 1, unitPrice: 1000 }],
        new Date(),
      );

      // Pay only first invoice
      await financialService.recordPayment(invoice1.id, invoice1.totalAmount, 'pix');

      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const report = await financialService.generateFinancialReport(startDate, endDate);

      expect(report.paymentRate).toBeLessThan(100);
      expect(report.paymentRate).toBeGreaterThan(0);
    });
  });

  describe('getStatistics', () => {
    test('should calculate statistics', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 1000 }],
        new Date(),
      );

      await financialService.sendInvoice(invoice.id, 'cliente@example.com');
      await financialService.recordPayment(invoice.id, invoice.totalAmount, 'pix');
      await financialService.recordExpense('Test', 100, 'office', 'wire');

      const stats = financialService.getStatistics();

      expect(stats.totalInvoices).toBe(1);
      expect(stats.invoicesSent).toBe(1);
      expect(stats.invoicesPaid).toBe(1);
      expect(stats.totalPayments).toBe(1);
      expect(stats.totalExpenses).toBe(1);
      expect(stats.totalExpensesAmount).toBe(100);
    });
  });

  describe('reset', () => {
    test('should clear all data', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const invoice = await financialService.createInvoice(
        client.id,
        'Serviço',
        [{ description: 'Item', quantity: 1, unitPrice: 100 }],
        new Date(),
      );

      await financialService.recordExpense('Test', 100, 'office', 'wire');

      financialService.reset();

      const stats = financialService.getStatistics();

      expect(stats.totalInvoices).toBe(0);
      expect(stats.totalExpenses).toBe(0);
    });
  });
});
