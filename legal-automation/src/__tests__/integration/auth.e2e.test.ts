import request from 'supertest';
import app from '@/index';
import { setupTestDatabase, cleanupTestDatabase, resetTestDatabase } from '../setup/testDatabase';
import { createTestUser, createAuthHeader } from '../setup/testHelpers';
import bcrypt from 'bcrypt';

describe('Authentication E2E Tests', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePassword123!',
          firstName: 'João',
          lastName: 'Silva',
          oabNumber: '123456',
          oabState: 'SP',
        })
        .expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('newuser@example.com');
    });

    it('should reject duplicate email', async () => {
      const user = await createTestUser();

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: user.email,
          password: 'AnotherPassword123!',
          firstName: 'Outro',
          lastName: 'User',
          oabNumber: '654321',
          oabState: 'RJ',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          firstName: 'João',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const user = await createTestUser({
        email: 'test@example.com',
        password: 'TestPassword123!',
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: user.password,
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.user).toBeDefined();
      expect(response.body.nextStep).toBe('2fa_required');
    });

    it('should reject invalid password', async () => {
      const user = await createTestUser();

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should reject nonexistent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/2fa/challenge', () => {
    it('should create 2FA challenge', async () => {
      const user = await createTestUser();

      const response = await request(app)
        .post('/api/v1/auth/2fa/challenge')
        .send({
          email: user.email,
          password: user.password,
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.challengeId).toBeDefined();
      expect(response.body.method).toBe('totp');
      expect(response.body.qrCode).toBeDefined();
    });

    it('should reject nonexistent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/challenge')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/2fa/verify', () => {
    it('should reject invalid challenge ID', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/verify')
        .send({
          challengeId: 'invalid-id',
          code: '123456',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/verify')
        .send({
          challengeId: 'some-id',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout with token', async () => {
      const user = await createTestUser();

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set(createAuthHeader(user.token))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Logout realizado');
    });

    it('should logout without token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(response.body.status).toBe('success');
    });
  });

  describe('GET /api/v1/auth/certificates', () => {
    it('should list certificates', async () => {
      const user = await createTestUser();

      const response = await request(app)
        .get('/api/v1/auth/certificates')
        .set(createAuthHeader(user.token))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.certificates)).toBe(true);
    });

    it('should return 401 without token', async () => {
      await request(app).get('/api/v1/auth/certificates').expect(401);
    });
  });

  describe('DELETE /api/v1/auth/certificates/:fingerprint', () => {
    it('should delete certificate', async () => {
      const user = await createTestUser();

      const response = await request(app)
        .delete('/api/v1/auth/certificates/test-fingerprint')
        .set(createAuthHeader(user.token))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Certificado removido');
    });

    it('should return 401 without token', async () => {
      await request(app).delete('/api/v1/auth/certificates/test-fingerprint').expect(401);
    });
  });
});
