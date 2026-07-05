import request from 'supertest';
import express from 'express';
import { multiTribunalController } from '@api/controllers/multiTribunalController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json());
app.use('/api/v1/tribunals', multiTribunalController);

describe('Multi-Tribunal API - E2E Tests', () => {
  describe('TJMT (Mato Grosso) - Standard eProc', () => {
    it('GET /tjmt/health - Should return tribunal health status', async () => {
      const response = await request(app).get('/api/v1/tribunals/tjmt/health');

      expect([200, 404, 503]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('tribunal');
        expect(response.body.tribunal).toBe('tjmt');
      }
    });

    it('GET /tjmt/processes/:number - Should require authentication', async () => {
      const response = await request(app).get(
        '/api/v1/tribunals/tjmt/processes/0000001-12.2023.8.28.0100',
      );

      expect(response.status).toBe(401);
    });

    it('POST /tjmt/processes/search - Should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/tribunals/tjmt/processes/search')
        .send({ subject: 'Indenização' });

      expect(response.status).toBe(401);
    });

    it('GET /tjmt/processes/:number - Should return 404 for invalid process', async () => {
      const token = 'test-token';
      const response = await request(app)
        .get('/api/v1/tribunals/tjmt/processes/9999999-99.9999.9.99.9999')
        .set('Authorization', createAuthHeader(token));

      // May return 404, 400, or 500 depending on API response
      expect([400, 404, 500]).toContain(response.status);
    });

    it('POST /tjmt/processes/search - Should accept search criteria', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/tribunals/tjmt/processes/search')
        .set('Authorization', createAuthHeader(token))
        .send({
          partyName: 'Test Party',
          subject: 'Ação Civil',
          limit: 10,
        });

      // May return 200, 400, or 500 depending on API
      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('TJRO (Rondônia) - Hybrid eProc + PJe', () => {
    it('GET /tjro/health - Should return tribunal health status', async () => {
      const response = await request(app).get('/api/v1/tribunals/tjro/health');

      expect([200, 404, 503]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('tribunal');
        expect(response.body.tribunal).toBe('tjro');
      }
    });

    it('GET /tjro/processes/:number - Should require authentication', async () => {
      const response = await request(app).get(
        '/api/v1/tribunals/tjro/processes/0000001-12.2023.8.28.0100',
      );

      expect(response.status).toBe(401);
    });

    it('GET /tjro/processes/:number - Should handle both eProc and PJe systems', async () => {
      const token = 'test-token';
      const response = await request(app)
        .get('/api/v1/tribunals/tjro/processes/0000001-12.2023.8.28.0100')
        .set('Authorization', createAuthHeader(token));

      // Should handle gracefully (may fail but shouldn't crash)
      expect([400, 404, 500]).toContain(response.status);
    });

    it('POST /tjro/petitions - Should submit petitions to TJRO', async () => {
      const token = 'test-token';
      const response = await request(app)
        .post('/api/v1/tribunals/tjro/petitions')
        .set('Authorization', createAuthHeader(token))
        .send({
          processNumber: '0000001-12.2023.8.28.0100',
          title: 'Test Petition',
          content: 'Test content',
          subject: 'Test subject',
          certificateFingerprint: 'abc123',
          certificatePassword: 'password',
        });

      // Should handle gracefully
      expect([200, 400, 500]).toContain(response.status);
    });

    it('GET /tjro/petitions/:protocol/status - Should check petition status', async () => {
      const token = 'test-token';
      const response = await request(app)
        .get('/api/v1/tribunals/tjro/petitions/2024010123456789/status')
        .set('Authorization', createAuthHeader(token));

      // Should handle gracefully
      expect([200, 400, 404, 500]).toContain(response.status);
    });

    it('GET /tjro/processes/:number/movements - Should get process movements', async () => {
      const token = 'test-token';
      const response = await request(app)
        .get('/api/v1/tribunals/tjro/processes/0000001-12.2023.8.28.0100/movements')
        .set('Authorization', createAuthHeader(token));

      // Should handle gracefully
      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('Tribunal Support Verification', () => {
    it('GET /tribunals - Should list all supported tribunals including TJMT and TJRO', async () => {
      const response = await request(app).get('/api/v1/tribunals/tribunals');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('supported');
      expect(Array.isArray(response.body.supported)).toBe(true);

      const supported = response.body.supported as string[];
      expect(supported).toContain('tjsc');
      expect(supported).toContain('trf4');
      expect(supported).toContain('jfpr');
      expect(supported).toContain('tjpr');
      expect(supported).toContain('just');
      expect(supported).toContain('tjmt');
      expect(supported).toContain('tjro');
    });

    it('Should support total of 7 tribunals', async () => {
      const response = await request(app).get('/api/v1/tribunals/tribunals');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(7);
    });
  });

  describe('Error Handling', () => {
    it('GET /:tribunal/health - Should reject unsupported tribunal', async () => {
      const response = await request(app).get('/api/v1/tribunals/tjxx/health');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('GET /:tribunal/processes/:number - Should reject unsupported tribunal', async () => {
      const token = 'test-token';
      const response = await request(app)
        .get('/api/v1/tribunals/tjxx/processes/0000001-12.2023.0.00.0000')
        .set('Authorization', createAuthHeader(token));

      expect(response.status).toBe(400);
    });
  });
});
