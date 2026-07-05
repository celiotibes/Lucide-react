import request from 'supertest';
import app from '@/index';
import { setupTestDatabase, cleanupTestDatabase, resetTestDatabase } from '../setup/testDatabase';
import { createTestUser, createTestPetition, createAuthHeader } from '../setup/testHelpers';

describe('Petition E2E Tests', () => {
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

  describe('GET /api/v1/petitions', () => {
    it('should list user petitions', async () => {
      const petition = await createTestPetition(testUser.id);

      const response = await request(app)
        .get('/api/v1/petitions')
        .set(createAuthHeader(testUser.token))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.petitions)).toBe(true);
      expect(response.body.petitions.length).toBeGreaterThanOrEqual(0);
    });

    it('should return 401 without token', async () => {
      await request(app).get('/api/v1/petitions').expect(401);
    });
  });

  describe('POST /api/v1/petitions', () => {
    it('should create a new petition draft', async () => {
      const response = await request(app)
        .post('/api/v1/petitions')
        .set(createAuthHeader(testUser.token))
        .send({
          processNumber: '0000001-12.2023.8.26.0100',
          tribunal: 'tjsc',
          title: 'Test Petition',
          content: 'Test content',
        })
        .expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.petition).toBeDefined();
      expect(response.body.petition.status).toBe('draft');
      expect(response.body.petition.title).toBe('Test Petition');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/petitions')
        .set(createAuthHeader(testUser.token))
        .send({
          title: 'Test Petition',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 without token', async () => {
      await request(app)
        .post('/api/v1/petitions')
        .send({
          processNumber: '0000001-12.2023.8.26.0100',
          tribunal: 'tjsc',
          title: 'Test Petition',
          content: 'Test content',
        })
        .expect(401);
    });
  });

  describe('POST /api/v1/petitions/:id/generate', () => {
    it('should generate petition with AI', async () => {
      const petition = await createTestPetition(testUser.id);

      const response = await request(app)
        .post(`/api/v1/petitions/${petition.id}/generate`)
        .set(createAuthHeader(testUser.token))
        .send({
          context: 'Ação de indenização por dano moral',
          parties: 'João Silva vs Empresa XYZ',
          facts: 'Descrição dos fatos do caso',
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.petition).toBeDefined();
      expect(response.body.petition.content).toBeDefined();
    });

    it('should handle missing petition', async () => {
      const response = await request(app)
        .post('/api/v1/petitions/nonexistent-id/generate')
        .set(createAuthHeader(testUser.token))
        .send({
          context: 'Test',
          parties: 'Test',
          facts: 'Test',
        })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/petitions/:id/validate', () => {
    it('should validate petition content', async () => {
      const petition = await createTestPetition(testUser.id, { status: 'generated' });

      const response = await request(app)
        .post(`/api/v1/petitions/${petition.id}/validate`)
        .set(createAuthHeader(testUser.token))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.validation).toBeDefined();
      expect(response.body.validation.score).toBeDefined();
    });

    it('should return score and issues', async () => {
      const petition = await createTestPetition(testUser.id, {
        status: 'generated',
        content: 'Test content',
      });

      const response = await request(app)
        .post(`/api/v1/petitions/${petition.id}/validate`)
        .set(createAuthHeader(testUser.token))
        .expect(200);

      expect(response.body.validation.score).toBeGreaterThanOrEqual(0);
      expect(response.body.validation.score).toBeLessThanOrEqual(100);
    });
  });

  describe('POST /api/v1/petitions/:id/sign', () => {
    it('should reject if certificate not found', async () => {
      const petition = await createTestPetition(testUser.id, { status: 'validated' });

      const response = await request(app)
        .post(`/api/v1/petitions/${petition.id}/sign`)
        .set(createAuthHeader(testUser.token))
        .send({
          certificateFingerprint: 'nonexistent-fingerprint',
          certificatePassword: 'password',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for nonexistent petition', async () => {
      const response = await request(app)
        .post('/api/v1/petitions/nonexistent-id/sign')
        .set(createAuthHeader(testUser.token))
        .send({
          certificateFingerprint: 'test-fingerprint',
          certificatePassword: 'password',
        })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/petitions/:id/submit', () => {
    it('should reject if petition not signed', async () => {
      const petition = await createTestPetition(testUser.id, { status: 'validated' });

      const response = await request(app)
        .post(`/api/v1/petitions/${petition.id}/submit`)
        .set(createAuthHeader(testUser.token))
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 404 for nonexistent petition', async () => {
      const response = await request(app)
        .post('/api/v1/petitions/nonexistent-id/submit')
        .set(createAuthHeader(testUser.token))
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });
});
