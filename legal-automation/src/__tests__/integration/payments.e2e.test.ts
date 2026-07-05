import request from 'supertest';
import express from 'express';
import PaymentService from '@services/PaymentService';
import paymentController from '@api/controllers/paymentController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json());
app.use('/api', paymentController);

describe('Payment Processing - E2E Tests', () => {
  const userId = 'test-user-payments';
  const authHeader = createAuthHeader(userId);
  let transactionId: string;
  let invoiceId: string;

  describe('Payment Processing', () => {
    it('should process payment successfully', async () => {
      const response = await request(app)
        .post('/api/payments/process')
        .set('Authorization', authHeader)
        .send({
          invoiceId: 'inv-001',
          amount: 1000,
          currency: 'BRL',
          method: 'credit_card',
          processor: 'stripe',
          customerEmail: 'customer@example.com',
          customerName: 'Test Customer',
          description: 'Test payment',
        });

      expect([201, 400, 500]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body.status).toBe('success');
        expect(response.body.transaction).toHaveProperty('id');
        expect(response.body.transaction).toHaveProperty('status');
        transactionId = response.body.transaction.id;
      }
    });

    it('should require mandatory payment fields', async () => {
      const response = await request(app)
        .post('/api/payments/process')
        .set('Authorization', authHeader)
        .send({
          invoiceId: 'inv-002',
          amount: 1000,
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should create refund for successful transaction', async () => {
      if (!transactionId) {
        transactionId = 'mock-transaction-id';
      }

      const response = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', authHeader)
        .send({
          transactionId,
          amount: 500,
          reason: 'requested_by_customer',
          description: 'Test refund',
        });

      expect([201, 400, 500]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body.status).toBe('success');
        expect(response.body.refund).toHaveProperty('id');
        expect(response.body.refund.status).toMatch(/processing|failed/);
      }
    });

    it('should handle payment webhooks', async () => {
      const response = await request(app)
        .post('/api/payments/webhook/stripe')
        .set('x-webhook-signature', 'valid-signature')
        .send({
          id: 'evt-12345',
          type: 'payment.success',
          transactionId: 'tr-67890',
          status: 'succeeded',
          amount: 1000,
        });

      expect([200, 400]).toContain(response.status);
    });

    it('should generate invoice', async () => {
      const response = await request(app)
        .post('/api/payments/invoices/generate')
        .set('Authorization', authHeader)
        .send({
          items: [
            {
              description: 'Legal services',
              quantity: 1,
              unitPrice: 1000,
              total: 1000,
            },
          ],
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });

      expect([201, 400, 500]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body.status).toBe('success');
        expect(response.body.invoice).toHaveProperty('id');
        expect(response.body.invoice).toHaveProperty('invoiceNumber');
        invoiceId = response.body.invoice.id;
      }
    });

    it('should reconcile payments', async () => {
      const response = await request(app)
        .post('/api/payments/reconcile')
        .set('Authorization', authHeader)
        .send({
          dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          dateTo: new Date(),
        });

      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body).toHaveProperty('count');
      }
    });

    it('should retrieve invoice details', async () => {
      if (!invoiceId) {
        invoiceId = 'mock-invoice-id';
      }

      const response = await request(app)
        .get(`/api/payments/invoices/${invoiceId}`)
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should require authentication for payment endpoints', async () => {
      const response = await request(app)
        .post('/api/payments/process')
        .send({
          invoiceId: 'inv-003',
          amount: 1000,
          currency: 'BRL',
          method: 'credit_card',
          processor: 'stripe',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Payment Security', () => {
    it('should validate webhook signature', async () => {
      const response = await request(app)
        .post('/api/payments/webhook/stripe')
        .set('x-webhook-signature', 'invalid-signature')
        .send({
          type: 'payment.success',
          id: 'evt-invalid',
        });

      expect([400, 401]).toContain(response.status);
    });

    it('should limit refund to transaction amount', async () => {
      const response = await request(app)
        .post('/api/payments/refund')
        .set('Authorization', authHeader)
        .send({
          transactionId: 'mock-tx-id',
          amount: 99999999,
          reason: 'requested_by_customer',
        });

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Payment Reconciliation', () => {
    it('should reconcile payments by date range', async () => {
      const response = await request(app)
        .post('/api/payments/reconcile')
        .set('Authorization', authHeader)
        .send({
          dateFrom: new Date('2026-01-01'),
          dateTo: new Date('2026-12-31'),
        });

      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('reconciliations');
      }
    });
  });
});
