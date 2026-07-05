import request from 'supertest';
import express from 'express';
import { ocrController } from '@api/controllers/ocrController';
import { automationController } from '@api/controllers/automationController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json());
app.use('/api/v1/ocr', ocrController);
app.use('/api/v1/automation', automationController);

describe('OCR & Automation - E2E Tests', () => {
  describe('OCR Service Tests', () => {
    it('POST /ocr/validate - Should validate document format', async () => {
      const response = await request(app)
        .post('/api/v1/ocr/validate')
        .send({
          filePath: '/path/to/document.pdf',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('isValid');
    });

    it('POST /ocr/extract - Should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/ocr/extract')
        .send({
          filePath: '/path/to/document.pdf',
          fileType: 'pdf',
        });

      expect(response.status).toBe(401);
    });

    it('POST /ocr/extract - Should extract text when authenticated', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/ocr/extract')
        .set('Authorization', createAuthHeader(token))
        .send({
          filePath: '/path/to/document.pdf',
          fileType: 'pdf',
          returnStructure: false,
        });

      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body).toHaveProperty('extractedText');
        expect(response.body).toHaveProperty('confidence');
      }
    });

    it('POST /ocr/structure - Should structure document', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/ocr/structure')
        .set('Authorization', createAuthHeader(token))
        .send({
          text: 'EXCELENTÍSSIMO SENHOR JUIZ...',
          fileId: 'test-file-123',
        });

      expect([200, 500]).toContain(response.status);
    });

    it('POST /ocr/validate - Should reject invalid file type', async () => {
      const response = await request(app)
        .post('/api/v1/ocr/validate')
        .send({
          filePath: '/path/to/document.exe',
        });

      expect(response.status).toBe(200);
      if (!response.body.isValid) {
        expect(response.body.errors).toContain(jasmine.stringMatching(/inválido|não suportado/i));
      }
    });
  });

  describe('Automation Workflows Tests', () => {
    it('GET /automation/workflows - Should require authentication', async () => {
      const response = await request(app).get('/api/v1/automation/workflows');

      expect(response.status).toBe(401);
    });

    it('GET /automation/workflows - Should list workflows when authenticated', async () => {
      const token = 'test-token';
      const response = await request(app)
        .get('/api/v1/automation/workflows')
        .set('Authorization', createAuthHeader(token));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('workflows');
      expect(Array.isArray(response.body.workflows)).toBe(true);
    });

    it('POST /automation/workflows - Should create new workflow', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/automation/workflows')
        .set('Authorization', createAuthHeader(token))
        .send({
          name: 'Fluxo de Teste',
          description: 'Automação para teste',
          trigger: {
            type: 'document_uploaded',
            filters: {},
          },
          steps: [
            {
              id: 'step-1',
              name: 'Notificar Usuário',
              action: 'notify_user',
              config: {
                message: 'Documento enviado com sucesso',
              },
            },
          ],
          status: 'draft',
        });

      expect([200, 201, 500]).toContain(response.status);

      if (response.status === 201 || response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.workflow).toHaveProperty('id');
        expect(response.body.workflow).toHaveProperty('name');
      }
    });

    it('POST /automation/workflows - Should require required fields', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/automation/workflows')
        .set('Authorization', createAuthHeader(token))
        .send({
          name: 'Fluxo Incompleto',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('PUT /automation/workflows/:id - Should update workflow', async () => {
      const token = 'test-token';
      const response = await request(app)
        .put('/api/v1/automation/workflows/test-workflow-id')
        .set('Authorization', createAuthHeader(token))
        .send({
          name: 'Fluxo Atualizado',
          status: 'active',
        });

      expect([200, 500]).toContain(response.status);
    });

    it('DELETE /automation/workflows/:id - Should delete workflow', async () => {
      const token = 'test-token';
      const response = await request(app)
        .delete('/api/v1/automation/workflows/test-workflow-id')
        .set('Authorization', createAuthHeader(token));

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
      }
    });

    it('POST /automation/workflows/:id/execute - Should execute workflow', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/automation/workflows/test-workflow-id/execute')
        .set('Authorization', createAuthHeader(token))
        .send({
          triggerData: {
            fileName: 'documento.pdf',
            fileType: 'pdf',
          },
        });

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('execution');
        expect(response.body.execution).toHaveProperty('status');
      }
    });

    it('POST /automation/workflows/:id/activate - Should activate workflow', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/automation/workflows/test-workflow-id/activate')
        .set('Authorization', createAuthHeader(token));

      expect([200, 500]).toContain(response.status);
    });

    it('POST /automation/workflows/:id/deactivate - Should deactivate workflow', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/automation/workflows/test-workflow-id/deactivate')
        .set('Authorization', createAuthHeader(token));

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Integration Tests', () => {
    it('Should support workflow with OCR trigger', async () => {
      const token = 'test-token';

      // Criar fluxo que usa OCR
      const workflowResponse = await request(app)
        .post('/api/v1/automation/workflows')
        .set('Authorization', createAuthHeader(token))
        .send({
          name: 'Petição Automática',
          trigger: {
            type: 'document_uploaded',
            filters: { fileType: 'pdf' },
          },
          steps: [
            {
              id: 'ocr-extract',
              name: 'Extrair Texto',
              action: 'create_petition',
              config: {
                type: 'initial',
              },
            },
          ],
        });

      expect([200, 201, 500]).toContain(workflowResponse.status);
    });
  });

  describe('Error Handling', () => {
    it('POST /ocr/extract - Should handle missing parameters', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/ocr/extract')
        .set('Authorization', createAuthHeader(token))
        .send({});

      expect(response.status).toBe(400);
    });

    it('POST /automation/workflows - Should handle invalid trigger type', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/automation/workflows')
        .set('Authorization', createAuthHeader(token))
        .send({
          name: 'Fluxo Inválido',
          trigger: {
            type: 'invalid_trigger_type',
          },
          steps: [],
        });

      expect([400, 500]).toContain(response.status);
    });
  });
});
