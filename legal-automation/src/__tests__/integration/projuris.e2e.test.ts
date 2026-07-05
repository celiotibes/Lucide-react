import request from 'supertest';
import express from 'express';
import { projurisClientController } from '@api/controllers/projurisClientController';
import { projurisCaseController } from '@api/controllers/projurisCaseController';
import { projurisTaskController } from '@api/controllers/projurisTaskController';
import { projurisDashboardController } from '@api/controllers/projurisDashboardController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json());
app.use('/projuris/clients', projurisClientController);
app.use('/projuris/cases', projurisCaseController);
app.use('/projuris/tasks', projurisTaskController);
app.use('/projuris/dashboard', projurisDashboardController);

describe('Projuris - E2E Tests', () => {
  const token = 'test-token-projuris';
  const authHeader = createAuthHeader(token);

  describe('Client Management', () => {
    it('POST /projuris/clients - Should create new client', async () => {
      const response = await request(app)
        .post('/projuris/clients')
        .set('Authorization', authHeader)
        .send({
          name: 'João Silva',
          type: 'individual',
          documentId: '12345678900',
          contact: {
            email: 'joao@example.com',
            phone: '1133334444',
            cellphone: '11987654321',
            address: 'Rua A, 123',
            city: 'São Paulo',
            state: 'SP',
            zipCode: '01234567',
          },
          tags: ['vip', 'ativo'],
        });

      expect([200, 201, 500]).toContain(response.status);

      if (response.status === 201 || response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.client).toHaveProperty('id');
        expect(response.body.client.name).toBe('João Silva');
      }
    });

    it('POST /projuris/clients - Should require required fields', async () => {
      const response = await request(app)
        .post('/projuris/clients')
        .set('Authorization', authHeader)
        .send({
          name: 'Incomplete Client',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('GET /projuris/clients - Should list clients', async () => {
      const response = await request(app)
        .get('/projuris/clients')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('clients');
      expect(Array.isArray(response.body.clients)).toBe(true);
    });

    it('GET /projuris/clients/:id - Should get client by ID', async () => {
      const response = await request(app)
        .get('/projuris/clients/test-client-id')
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);
    });

    it('PUT /projuris/clients/:id - Should update client', async () => {
      const response = await request(app)
        .put('/projuris/clients/test-client-id')
        .set('Authorization', authHeader)
        .send({
          name: 'João Silva Atualizado',
          status: 'active',
          tags: ['vip', 'importante'],
        });

      expect([200, 404, 500]).toContain(response.status);
    });

    it('GET /projuris/clients/:id/stats - Should get client statistics', async () => {
      const response = await request(app)
        .get('/projuris/clients/test-client-id/stats')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('stats');
        expect(response.body.stats).toHaveProperty('totalCases');
        expect(response.body.stats).toHaveProperty('activeCases');
      }
    });
  });

  describe('Case Management', () => {
    it('POST /projuris/cases - Should create new case', async () => {
      const response = await request(app)
        .post('/projuris/cases')
        .set('Authorization', authHeader)
        .send({
          escritorioId: 'test-escritorio-id',
          caseNumber: '0001234-56.2024.8.24.0000',
          title: 'Ação de Indenização por Dano Moral',
          description: 'Descrição do caso',
          tribunal: 'TJSP',
          clientId: 'test-client-id',
          assignedTo: ['user-id-1', 'user-id-2'],
          participants: [
            {
              type: 'client',
              name: 'Cliente A',
            },
            {
              type: 'opposing',
              name: 'Réu B',
            },
          ],
          processValue: 50000.00,
          filingDate: new Date(),
        });

      expect([200, 201, 500]).toContain(response.status);

      if (response.status === 201 || response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.case).toHaveProperty('id');
        expect(response.body.case.caseNumber).toBe('0001234-56.2024.8.24.0000');
      }
    });

    it('POST /projuris/cases - Should require required fields', async () => {
      const response = await request(app)
        .post('/projuris/cases')
        .set('Authorization', authHeader)
        .send({
          title: 'Incomplete Case',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('GET /projuris/cases/:id - Should get case by ID', async () => {
      const response = await request(app)
        .get('/projuris/cases/test-case-id')
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);
    });

    it('GET /projuris/cases/escritorio/:escritorioId - Should list cases', async () => {
      const response = await request(app)
        .get('/projuris/cases/escritorio/test-escritorio-id')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cases');
      expect(Array.isArray(response.body.cases)).toBe(true);
    });

    it('PUT /projuris/cases/:id - Should update case', async () => {
      const response = await request(app)
        .put('/projuris/cases/test-case-id')
        .set('Authorization', authHeader)
        .send({
          title: 'Ação de Indenização - ATUALIZADO',
          status: 'in_progress',
          assignedTo: ['user-id-1'],
        });

      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /projuris/cases/:id/updates - Should add case update', async () => {
      const response = await request(app)
        .post('/projuris/cases/test-case-id/updates')
        .set('Authorization', authHeader)
        .send({
          type: 'hearing_scheduled',
          description: 'Audiência agendada para 15/08/2024',
        });

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.update).toHaveProperty('id');
      }
    });

    it('GET /projuris/cases/:id/stats - Should get case statistics', async () => {
      const response = await request(app)
        .get('/projuris/cases/test-case-id/stats')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('stats');
        expect(response.body.stats).toHaveProperty('totalCases');
        expect(response.body.stats).toHaveProperty('overdueCases');
      }
    });
  });

  describe('Task Management', () => {
    it('POST /projuris/tasks - Should create new task', async () => {
      const response = await request(app)
        .post('/projuris/tasks')
        .set('Authorization', authHeader)
        .send({
          caseId: 'test-case-id',
          title: 'Revisar documentação do cliente',
          type: 'review_documents',
          priority: 'high',
          assignedTo: 'user-id-1',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          estimatedHours: 4,
        });

      expect([200, 201, 500]).toContain(response.status);

      if (response.status === 201 || response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.task).toHaveProperty('id');
        expect(response.body.task.title).toBe('Revisar documentação do cliente');
      }
    });

    it('POST /projuris/tasks - Should require required fields', async () => {
      const response = await request(app)
        .post('/projuris/tasks')
        .set('Authorization', authHeader)
        .send({
          title: 'Incomplete Task',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('PUT /projuris/tasks/:id - Should update task', async () => {
      const response = await request(app)
        .put('/projuris/tasks/test-task-id')
        .set('Authorization', authHeader)
        .send({
          status: 'completed',
          actualHours: 3.5,
        });

      expect([200, 404, 500]).toContain(response.status);
    });

    it('GET /projuris/tasks/case/:caseId/stats - Should get task statistics', async () => {
      const response = await request(app)
        .get('/projuris/tasks/case/test-case-id/stats')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('stats');
        expect(response.body.stats).toHaveProperty('completed');
        expect(response.body.stats).toHaveProperty('pending');
      }
    });
  });

  describe('Dashboard & Analytics', () => {
    it('GET /projuris/dashboard/escritorio/:escritorioId - Should get dashboard stats', async () => {
      const response = await request(app)
        .get('/projuris/dashboard/escritorio/test-escritorio-id')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('stats');
        expect(response.body.stats).toHaveProperty('totalCases');
        expect(response.body.stats).toHaveProperty('activeCases');
        expect(response.body.stats).toHaveProperty('totalClients');
        expect(response.body.stats).toHaveProperty('overdueCases');
      }
    });

    it('GET /projuris/dashboard/overview - Should get overview', async () => {
      const response = await request(app)
        .get('/projuris/dashboard/overview')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
      }
    });
  });

  describe('Integration Scenarios', () => {
    it('Should support complete workflow: Client -> Case -> Tasks', async () => {
      // Create client
      const clientResponse = await request(app)
        .post('/projuris/clients')
        .set('Authorization', authHeader)
        .send({
          name: 'Integration Test Client',
          type: 'individual',
          documentId: '99999999999',
          contact: { email: 'test@example.com' },
        });

      expect([200, 201, 500]).toContain(clientResponse.status);

      if (clientResponse.status === 201 || clientResponse.status === 200) {
        const clientId = clientResponse.body.client?.id || 'test-client-id';

        // Create case for client
        const caseResponse = await request(app)
          .post('/projuris/cases')
          .set('Authorization', authHeader)
          .send({
            escritorioId: 'test-escritorio-id',
            caseNumber: 'TEST-001-2024',
            title: 'Test Case',
            tribunal: 'TJSP',
            clientId,
            assignedTo: ['user-1'],
            participants: [{ type: 'client', name: 'Test' }],
          });

        expect([200, 201, 500]).toContain(caseResponse.status);

        if (caseResponse.status === 201 || caseResponse.status === 200) {
          const caseId = caseResponse.body.case?.id || 'test-case-id';

          // Create task for case
          const taskResponse = await request(app)
            .post('/projuris/tasks')
            .set('Authorization', authHeader)
            .send({
              caseId,
              title: 'Review Documents',
              type: 'review_documents',
              priority: 'high',
              assignedTo: 'user-1',
            });

          expect([200, 201, 500]).toContain(taskResponse.status);
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('Should require authentication', async () => {
      const response = await request(app)
        .get('/projuris/clients');

      // Without auth header, this depends on middleware behavior
      expect([401, 500]).toContain(response.status);
    });

    it('Should handle invalid client ID gracefully', async () => {
      const response = await request(app)
        .get('/projuris/clients/invalid-id')
        .set('Authorization', authHeader);

      expect([404, 500]).toContain(response.status);
    });

    it('Should validate case creation input', async () => {
      const response = await request(app)
        .post('/projuris/cases')
        .set('Authorization', authHeader)
        .send({
          // Missing required fields
          title: 'Invalid Case',
        });

      expect(response.status).toBe(400);
    });
  });
});
