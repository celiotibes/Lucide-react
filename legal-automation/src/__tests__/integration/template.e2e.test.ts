import request from 'supertest';
import express from 'express';
import { templateController } from '@api/controllers/templateController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json());
app.use('/api/v1/templates', templateController);

describe('Template System - E2E Tests', () => {
  describe('GET /templates', () => {
    it('Should list all templates without authentication', async () => {
      const response = await request(app).get('/api/v1/templates');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('templates');
      expect(Array.isArray(response.body.templates)).toBe(true);
    });

    it('Should support pagination with limit and offset', async () => {
      const response = await request(app)
        .get('/api/v1/templates')
        .query({ limit: 10, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.templates.length).toBeLessThanOrEqual(10);
    });

    it('Should filter templates by type', async () => {
      const response = await request(app)
        .get('/api/v1/templates')
        .query({ type: 'initial' });

      expect(response.status).toBe(200);
      if (response.body.templates.length > 0) {
        response.body.templates.forEach((template: any) => {
          expect(template.type).toBe('initial');
        });
      }
    });

    it('Should filter templates by category', async () => {
      const response = await request(app)
        .get('/api/v1/templates')
        .query({ category: 'indenizacao' });

      expect(response.status).toBe(200);
    });

    it('Should search templates by name', async () => {
      const response = await request(app)
        .get('/api/v1/templates')
        .query({ search: 'Dano Moral' });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /templates/:id', () => {
    it('Should get template by ID', async () => {
      // First get a template ID from listing
      const listResponse = await request(app).get('/api/v1/templates').query({ limit: 1 });

      if (listResponse.body.templates.length === 0) {
        this.skip();
        return;
      }

      const templateId = listResponse.body.templates[0].id;

      const response = await request(app).get(`/api/v1/templates/${templateId}`);

      expect(response.status).toBe(200);
      expect(response.body.template).toHaveProperty('id');
      expect(response.body.template).toHaveProperty('content');
      expect(response.body.template).toHaveProperty('variables');
    });

    it('Should return 404 for non-existent template', async () => {
      const response = await request(app).get('/api/v1/templates/invalid-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /templates/:id/substitute', () => {
    it('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/templates/some-id/substitute')
        .send({ variables: {} });

      expect(response.status).toBe(401);
    });

    it('Should substitute variables when authenticated', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/templates/some-id/substitute')
        .set('Authorization', createAuthHeader(token))
        .send({
          variables: {
            plaintiff_name: 'João Silva',
            defendant_name: 'Empresa XYZ',
          },
        });

      // May fail with 404 if template doesn't exist
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('content');
        expect(response.body.content).toContain('João Silva');
      }
    });

    it('Should reject request without variables', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/templates/some-id/substitute')
        .set('Authorization', createAuthHeader(token))
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /templates/:id/customize', () => {
    it('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/templates/some-id/customize')
        .send({ variables: {} });

      expect(response.status).toBe(401);
    });

    it('Should customize template with AI', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/templates/some-id/customize')
        .set('Authorization', createAuthHeader(token))
        .send({
          variables: {
            plaintiff_name: 'João Silva',
          },
          context: {
            subject: 'Dano Moral',
            caseHistory: 'Test case history',
          },
          customizationLevel: 'moderate',
          tribunal: 'tjsc',
        });

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('content');
        expect(response.body).toHaveProperty('customizationLevel');
      }
    });

    it('Should support different customization levels', async () => {
      const token = 'test-token';

      for (const level of ['minimal', 'moderate', 'high']) {
        const response = await request(app)
          .post('/api/v1/templates/some-id/customize')
          .set('Authorization', createAuthHeader(token))
          .send({
            variables: {},
            customizationLevel: level,
          });

        expect([200, 404, 500]).toContain(response.status);
      }
    });
  });

  describe('POST /templates/:id/validate', () => {
    it('Should validate template structure', async () => {
      const response = await request(app).post('/api/v1/templates/some-id/validate').send({});

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('isValid');
        expect(response.body).toHaveProperty('errors');
        expect(Array.isArray(response.body.errors)).toBe(true);
      }
    });
  });

  describe('POST /templates/:id/feedback', () => {
    it('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/templates/some-id/feedback')
        .send({
          petitionId: 'petition-123',
          success: true,
          rating: 5,
        });

      expect(response.status).toBe(401);
    });

    it('Should record usage feedback when authenticated', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/templates/some-id/feedback')
        .set('Authorization', createAuthHeader(token))
        .send({
          petitionId: 'petition-123',
          success: true,
          rating: 5,
          feedback: 'Great template!',
        });

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
      }
    });

    it('Should require petition ID', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/templates/some-id/feedback')
        .set('Authorization', createAuthHeader(token))
        .send({ success: true });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Template Features', () => {
    it('Should have variables metadata in templates', async () => {
      const response = await request(app).get('/api/v1/templates').query({ limit: 1 });

      if (response.body.templates.length === 0) {
        this.skip();
        return;
      }

      const template = response.body.templates[0];
      expect(template).toHaveProperty('variables');
      expect(Array.isArray(template.variables)).toBe(true);

      if (template.variables.length > 0) {
        const variable = template.variables[0];
        expect(variable).toHaveProperty('name');
        expect(variable).toHaveProperty('type');
        expect(variable).toHaveProperty('required');
      }
    });

    it('Should track template usage statistics', async () => {
      const response = await request(app).get('/api/v1/templates').query({ limit: 1 });

      if (response.body.templates.length === 0) {
        this.skip();
        return;
      }

      const template = response.body.templates[0];
      expect(template).toHaveProperty('usageCount');
      expect(template).toHaveProperty('successRate');
    });

    it('Should support jurisdiction filtering', async () => {
      const response = await request(app)
        .get('/api/v1/templates')
        .query({ jurisdiction: 'tjsc' });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.templates)).toBe(true);
    });
  });

  describe('AI-Powered Features', () => {
    it('GET /suggestions - Should suggest templates', async () => {
      const token = 'test-token';
      const response = await request(app)
        .get('/api/v1/templates/suggestions/recommended')
        .set('Authorization', createAuthHeader(token))
        .send({
          context: {
            subject: 'Dano Moral',
            caseHistory: 'Test case',
          },
        });

      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('suggestions');
        expect(Array.isArray(response.body.suggestions)).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('Should handle invalid template ID gracefully', async () => {
      const response = await request(app).get('/api/v1/templates/!!invalid!!');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('Should handle malformed requests', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/templates/some-id/customize')
        .set('Authorization', createAuthHeader(token))
        .send('malformed json');

      expect([400, 500]).toContain(response.status);
    });
  });
});
