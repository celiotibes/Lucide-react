import request from 'supertest';
import app from '@/index';
import { setupTestDatabase, cleanupTestDatabase, resetTestDatabase } from '../setup/testDatabase';
import { createTestUser, createTestProcess, createAuthHeader } from '../setup/testHelpers';

describe('Process E2E Tests', () => {
  let testUser: any;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    testUser = await createTestUser();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('GET /api/v1/processes/search/:number', () => {
    it('should search process by number', async () => {
      const testProcess = await createTestProcess({
        processNumber: '0000001-12.2023.8.26.0100',
      });

      const response = await request(app)
        .get('/api/v1/processes/search/0000001-12.2023.8.26.0100')
        .set(createAuthHeader(testUser.token))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.process).toBeDefined();
      expect(response.body.process.processNumber).toBe('0000001-12.2023.8.26.0100');
    });

    it('should return 404 for nonexistent process', async () => {
      const response = await request(app)
        .get('/api/v1/processes/search/9999999-99.9999.9.99.9999')
        .set(createAuthHeader(testUser.token))
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 without token', async () => {
      await request(app)
        .get('/api/v1/processes/search/0000001-12.2023.8.26.0100')
        .expect(401);
    });
  });

  describe('GET /api/v1/processes/search-party', () => {
    it('should search processes by party name', async () => {
      await createTestProcess({
        plaintiff: 'João Silva',
        defendant: 'Empresa XYZ',
      });

      const response = await request(app)
        .get('/api/v1/processes/search-party')
        .set(createAuthHeader(testUser.token))
        .query({ partyName: 'João Silva' })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.processes)).toBe(true);
    });

    it('should support date filters', async () => {
      const response = await request(app)
        .get('/api/v1/processes/search-party')
        .set(createAuthHeader(testUser.token))
        .query({
          partyName: 'João Silva',
          dateStart: '2024-01-01',
          dateEnd: '2024-12-31',
        })
        .expect(200);

      expect(response.body.status).toBe('success');
    });

    it('should return 400 without party name', async () => {
      const response = await request(app)
        .get('/api/v1/processes/search-party')
        .set(createAuthHeader(testUser.token))
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/v1/processes/search-subject', () => {
    it('should search processes by subject', async () => {
      await createTestProcess({
        subject: 'Ação de Indenização',
      });

      const response = await request(app)
        .get('/api/v1/processes/search-subject')
        .set(createAuthHeader(testUser.token))
        .query({ subject: 'Indenização' })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.processes)).toBe(true);
    });

    it('should support tribunal filter', async () => {
      const response = await request(app)
        .get('/api/v1/processes/search-subject')
        .set(createAuthHeader(testUser.token))
        .query({
          subject: 'Indenização',
          tribunal: 'tjsc',
        })
        .expect(200);

      expect(response.body.status).toBe('success');
    });

    it('should return 400 without subject', async () => {
      const response = await request(app)
        .get('/api/v1/processes/search-subject')
        .set(createAuthHeader(testUser.token))
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/v1/processes/:number/movements', () => {
    it('should get process movements', async () => {
      const testProcess = await createTestProcess();

      const response = await request(app)
        .get(`/api/v1/processes/${testProcess.process_number}/movements`)
        .set(createAuthHeader(testUser.token))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.movements)).toBe(true);
    });

    it('should return 404 for nonexistent process', async () => {
      const response = await request(app)
        .get('/api/v1/processes/9999999-99.9999.9.99.9999/movements')
        .set(createAuthHeader(testUser.token))
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 without token', async () => {
      await request(app)
        .get('/api/v1/processes/0000001-12.2023.8.26.0100/movements')
        .expect(401);
    });
  });

  describe('POST /api/v1/processes/:number/analyze-movements', () => {
    it('should analyze process movements with AI', async () => {
      const testProcess = await createTestProcess();

      const response = await request(app)
        .post(`/api/v1/processes/${testProcess.process_number}/analyze-movements`)
        .set(createAuthHeader(testUser.token))
        .send({})
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.analysis).toBeDefined();
      expect(response.body.analysis.risk).toBeDefined();
      expect(response.body.analysis.recommendations).toBeDefined();
    });

    it('should return risk assessment', async () => {
      const testProcess = await createTestProcess();

      const response = await request(app)
        .post(`/api/v1/processes/${testProcess.process_number}/analyze-movements`)
        .set(createAuthHeader(testUser.token))
        .send({})
        .expect(200);

      expect(['low', 'medium', 'high']).toContain(response.body.analysis.risk);
    });

    it('should return 404 for nonexistent process', async () => {
      const response = await request(app)
        .post('/api/v1/processes/9999999-99.9999.9.99.9999/analyze-movements')
        .set(createAuthHeader(testUser.token))
        .send({})
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });
});
