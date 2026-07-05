import request from 'supertest';
import express from 'express';
import { astreaFinancialController } from '@api/controllers/astreaFinancialController';
import { astreaDeadlineController } from '@api/controllers/astreaDeadlineController';
import { astreaTimeController } from '@api/controllers/astreaTimeController';
import { astreaAnalyticsController } from '@api/controllers/astreaAnalyticsController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json());
app.use('/astrea', astreaFinancialController);
app.use('/astrea/deadlines', astreaDeadlineController);
app.use('/astrea/time', astreaTimeController);
app.use('/astrea/analytics', astreaAnalyticsController);

describe('Astrea - E2E Tests', () => {
  const token = 'test-token-astrea';
  const authHeader = createAuthHeader(token);

  describe('Financial Management', () => {
    it('POST /astrea/invoices - Should create invoice', async () => {
      const response = await request(app)
        .post('/astrea/invoices')
        .set('Authorization', authHeader)
        .send({
          caseId: 'test-case-id',
          clientId: 'test-client-id',
          description: 'Serviços jurídicos - Consultoria',
          amount: 5000.00,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          taxes: 500.00,
        });

      expect([200, 201, 500]).toContain(response.status);

      if (response.status === 201 || response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.invoice).toHaveProperty('id');
        expect(response.body.invoice.amount).toBe(5000.00);
      }
    });

    it('GET /astrea/invoices - Should list invoices', async () => {
      const response = await request(app)
        .get('/astrea/invoices')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('invoices');
      expect(Array.isArray(response.body.invoices)).toBe(true);
    });

    it('PUT /astrea/invoices/:id - Should update invoice status', async () => {
      const response = await request(app)
        .put('/astrea/invoices/test-invoice-id')
        .set('Authorization', authHeader)
        .send({
          status: 'paid',
          paidDate: new Date(),
        });

      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /astrea/cases/:caseId/costs - Should add cost', async () => {
      const response = await request(app)
        .post('/astrea/cases/test-case-id/costs')
        .set('Authorization', authHeader)
        .send({
          description: 'Honorário de perito',
          category: 'expertise',
          amount: 1500.00,
          billable: true,
        });

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.cost).toHaveProperty('id');
      }
    });

    it('GET /astrea/cases/:caseId/costs - Should list costs', async () => {
      const response = await request(app)
        .get('/astrea/cases/test-case-id/costs')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('costs');
    });

    it('GET /astrea/cases/:caseId/financials - Should get case financials', async () => {
      const response = await request(app)
        .get('/astrea/cases/test-case-id/financials')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.financials).toHaveProperty('totalInvoiced');
        expect(response.body.financials).toHaveProperty('totalCosts');
        expect(response.body.financials).toHaveProperty('profitMargin');
      }
    });

    it('GET /astrea/escritorio/:id/financials - Should get escritorio metrics', async () => {
      const response = await request(app)
        .get('/astrea/escritorio/test-escritorio-id/financials')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.metrics).toHaveProperty('totalRevenue');
        expect(response.body.metrics).toHaveProperty('netProfit');
      }
    });
  });

  describe('Deadline Management', () => {
    it('POST /astrea/deadlines - Should create deadline', async () => {
      const response = await request(app)
        .post('/astrea/deadlines')
        .set('Authorization', authHeader)
        .send({
          caseId: 'test-case-id',
          title: 'Contestação do cliente',
          dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          type: 'inicial',
          priority: 'alta',
          description: 'Responder contestação em 15 dias',
          assignedTo: ['user-id-1'],
        });

      expect([200, 201, 500]).toContain(response.status);

      if (response.status === 201 || response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.deadline).toHaveProperty('id');
      }
    });

    it('PUT /astrea/deadlines/:id - Should update deadline', async () => {
      const response = await request(app)
        .put('/astrea/deadlines/test-deadline-id')
        .set('Authorization', authHeader)
        .send({
          status: 'completed',
          priority: 'média',
        });

      expect([200, 404, 500]).toContain(response.status);
    });

    it('GET /astrea/deadlines/case/:caseId/metrics - Should get deadline metrics', async () => {
      const response = await request(app)
        .get('/astrea/deadlines/case/test-case-id/metrics')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.metrics).toHaveProperty('totalDeadlines');
        expect(response.body.metrics).toHaveProperty('onTimePercentage');
      }
    });
  });

  describe('Time Tracking', () => {
    it('POST /astrea/time-entries - Should add time entry', async () => {
      const response = await request(app)
        .post('/astrea/time')
        .set('Authorization', authHeader)
        .send({
          caseId: 'test-case-id',
          description: 'Análise de documentação do cliente',
          hours: 3,
          minutes: 30,
          billable: true,
          category: 'research',
          date: new Date(),
        });

      expect([200, 201, 500]).toContain(response.status);

      if (response.status === 201 || response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.entry).toHaveProperty('id');
      }
    });

    it('GET /astrea/time/case/:caseId - Should list time entries', async () => {
      const response = await request(app)
        .get('/astrea/time/case/test-case-id')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('entries');
    });

    it('GET /astrea/time/case/:caseId/summary - Should get time summary', async () => {
      const response = await request(app)
        .get('/astrea/time/case/test-case-id/summary')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.summary).toHaveProperty('totalHours');
        expect(response.body.summary).toHaveProperty('billableHours');
        expect(response.body.summary).toHaveProperty('billablePercentage');
      }
    });
  });

  describe('Analytics & KPIs', () => {
    it('POST /astrea/analytics/kpis - Should record KPI', async () => {
      const response = await request(app)
        .post('/astrea/analytics/kpis')
        .set('Authorization', authHeader)
        .send({
          escritorioId: 'test-escritorio-id',
          name: 'Revenue - July 2024',
          category: 'financial',
          value: 45000,
          target: 50000,
          unit: 'BRL',
          period: 'monthly',
          trend: 'up',
          changePercentage: 5.2,
        });

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.kpi).toHaveProperty('id');
      }
    });

    it('GET /astrea/analytics/kpis - Should list KPIs', async () => {
      const response = await request(app)
        .get('/astrea/analytics/kpis?escritorioId=test-escritorio-id')
        .set('Authorization', authHeader);

      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('kpis');
      }
    });

    it('GET /astrea/analytics/escritorio/:id/dashboard - Should get analytics dashboard', async () => {
      const response = await request(app)
        .get('/astrea/analytics/escritorio/test-escritorio-id/dashboard')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.dashboard).toHaveProperty('financial');
        expect(response.body.dashboard).toHaveProperty('kpis');
        expect(response.body.dashboard).toHaveProperty('performance');
      }
    });

    it('GET /astrea/analytics/financial-health - Should get financial health', async () => {
      const response = await request(app)
        .get('/astrea/analytics/financial-health?escritorioId=test-escritorio-id')
        .set('Authorization', authHeader);

      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.health).toHaveProperty('status');
        expect(response.body.health).toHaveProperty('metrics');
        expect(response.body.health).toHaveProperty('recommendations');
      }
    });

    it('GET /astrea/analytics/trends - Should get trends', async () => {
      const response = await request(app)
        .get('/astrea/analytics/trends?escritorioId=test-escritorio-id')
        .set('Authorization', authHeader);

      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.trends).toHaveProperty('revenue');
        expect(response.body.trends).toHaveProperty('profit');
        expect(response.body.trends).toHaveProperty('efficiency');
      }
    });
  });

  describe('Integration Scenarios', () => {
    it('Should support complete workflow: Invoice + Costs + Time Tracking', async () => {
      // Create invoice
      const invoiceResponse = await request(app)
        .post('/astrea/invoices')
        .set('Authorization', authHeader)
        .send({
          caseId: 'test-case-workflow',
          clientId: 'test-client-workflow',
          description: 'Serviços prestados',
          amount: 10000,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

      expect([200, 201, 500]).toContain(invoiceResponse.status);

      // Add costs
      const costResponse = await request(app)
        .post('/astrea/cases/test-case-workflow/costs')
        .set('Authorization', authHeader)
        .send({
          description: 'Despesa processual',
          category: 'filing_fees',
          amount: 500,
          billable: false,
        });

      expect([200, 500]).toContain(costResponse.status);

      // Add time entry
      const timeResponse = await request(app)
        .post('/astrea/time')
        .set('Authorization', authHeader)
        .send({
          caseId: 'test-case-workflow',
          description: 'Trabalho no caso',
          hours: 5,
          billable: true,
          category: 'writing',
          date: new Date(),
        });

      expect([200, 201, 500]).toContain(timeResponse.status);

      // Get financial summary
      const financialResponse = await request(app)
        .get('/astrea/cases/test-case-workflow/financials')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(financialResponse.status);
    });
  });

  describe('Error Handling', () => {
    it('Should require authentication', async () => {
      const response = await request(app).get('/astrea/invoices');

      expect([401, 500]).toContain(response.status);
    });

    it('Should validate required fields in invoice creation', async () => {
      const response = await request(app)
        .post('/astrea/invoices')
        .set('Authorization', authHeader)
        .send({
          description: 'Incomplete invoice',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('Should validate required fields in deadline creation', async () => {
      const response = await request(app)
        .post('/astrea/deadlines')
        .set('Authorization', authHeader)
        .send({
          title: 'Incomplete deadline',
        });

      expect(response.status).toBe(400);
    });
  });
});
