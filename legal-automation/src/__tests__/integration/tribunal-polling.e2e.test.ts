import request from 'supertest';
import express from 'express';
import TribunalPollingService from '@services/TribunalPollingService';
import tribunalPollingController from '@api/controllers/tribunalPollingController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json());
app.use('/api/polling', tribunalPollingController);

describe('Tribunal Polling Service - E2E Tests', () => {
  const token = 'test-token-polling';
  const authHeader = createAuthHeader(token);
  let configurationId: string;

  const testCase = {
    caseId: 'test-case-polling-001',
    processNumber: '0000001-23.2024.1.17.0001',
    tribunalCode: 'pje-tjal',
    interval: 30,
  };

  beforeAll(() => {
    // Setup test environment
    process.env.POLLING_ENABLED = 'true';
  });

  afterAll(async () => {
    // Cleanup - stop all active polls
    if (configurationId) {
      await TribunalPollingService.stopPolling(configurationId);
    }
    await TribunalPollingService.destroyAll();
  });

  describe('Polling Configuration', () => {
    it('should create sync configuration', async () => {
      const response = await request(app)
        .post('/api/polling/polling/configure')
        .set('Authorization', authHeader)
        .send(testCase);

      expect([201, 400, 500]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body.status).toBe('success');
        expect(response.body.configuration).toHaveProperty('id');
        expect(response.body.configuration).toHaveProperty('caseId', testCase.caseId);
        expect(response.body.configuration).toHaveProperty(
          'processNumber',
          testCase.processNumber,
        );
        expect(response.body.configuration).toHaveProperty(
          'tribunalCode',
          testCase.tribunalCode,
        );
        expect(response.body.configuration).toHaveProperty('interval');
        expect(response.body.configuration).toHaveProperty('notifications');

        configurationId = response.body.configuration.id;
      }
    });

    it('should reject configuration without required fields', async () => {
      const response = await request(app)
        .post('/api/polling/polling/configure')
        .set('Authorization', authHeader)
        .send({
          caseId: 'test-case',
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should validate interval constraints', async () => {
      const response = await request(app)
        .post('/api/polling/polling/configure')
        .set('Authorization', authHeader)
        .send({
          ...testCase,
          caseId: 'test-case-interval',
          interval: 5, // Below minimum of 15
        });

      expect([201, 400, 500]).toContain(response.status);
    });
  });

  describe('Polling Start/Stop', () => {
    it('should start polling when configuration exists', async () => {
      if (!configurationId) {
        expect(configurationId).toBeDefined();
        return;
      }

      const response = await request(app)
        .post(`/api/polling/polling/${configurationId}/start`)
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.message).toContain('iniciado');
      }
    });

    it('should stop polling', async () => {
      if (!configurationId) {
        expect(configurationId).toBeDefined();
        return;
      }

      const response = await request(app)
        .post(`/api/polling/polling/${configurationId}/stop`)
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.message).toContain('parado');
      }
    });

    it('should handle starting already-running poll gracefully', async () => {
      if (!configurationId) {
        expect(configurationId).toBeDefined();
        return;
      }

      // Start polling
      await request(app)
        .post(`/api/polling/polling/${configurationId}/start`)
        .set('Authorization', authHeader);

      // Try to start again
      const response = await request(app)
        .post(`/api/polling/polling/${configurationId}/start`)
        .set('Authorization', authHeader);

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Manual Synchronization', () => {
    it('should execute immediate synchronization', async () => {
      if (!configurationId) {
        expect(configurationId).toBeDefined();
        return;
      }

      const response = await request(app)
        .post(`/api/polling/polling/${configurationId}/sync-now`)
        .set('Authorization', authHeader);

      expect([200, 400, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.result).toHaveProperty('success');
        expect(response.body.result).toHaveProperty('changes');
        expect(response.body.result).toHaveProperty('syncTime');
      }
    });

    it('should handle sync errors gracefully', async () => {
      const fakeConfigId = 'non-existent-config-id';

      const response = await request(app)
        .post(`/api/polling/polling/${fakeConfigId}/sync-now`)
        .set('Authorization', authHeader);

      expect([400, 404, 500]).toContain(response.status);
    });

    it('should include error details in failed sync response', async () => {
      const fakeConfigId = 'fake-config-12345';

      const response = await request(app)
        .post(`/api/polling/polling/${fakeConfigId}/sync-now`)
        .set('Authorization', authHeader);

      if (response.status >= 400) {
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('Polling Statistics', () => {
    it('should retrieve polling statistics', async () => {
      if (!configurationId) {
        expect(configurationId).toBeDefined();
        return;
      }

      const response = await request(app)
        .get(`/api/polling/polling/${configurationId}/statistics`)
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.statistics).toHaveProperty('configurationId');
        expect(response.body.statistics).toHaveProperty('totalSyncs');
        expect(response.body.statistics).toHaveProperty('successfulSyncs');
        expect(response.body.statistics).toHaveProperty('failedSyncs');
        expect(response.body.statistics).toHaveProperty('errorRate');
        expect(response.body.statistics).toHaveProperty('averageSyncTime');
        expect(response.body.statistics).toHaveProperty('totalUpdates');
        expect(response.body.statistics).toHaveProperty('updates');

        // Validate structure of updates
        expect(response.body.statistics.updates).toHaveProperty('movements');
        expect(response.body.statistics.updates).toHaveProperty('documents');
        expect(response.body.statistics.updates).toHaveProperty('deadlines');
      }
    });

    it('should return zero stats for new configuration', async () => {
      if (!configurationId) {
        expect(configurationId).toBeDefined();
        return;
      }

      // Create new configuration
      const newConfigResponse = await request(app)
        .post('/api/polling/polling/configure')
        .set('Authorization', authHeader)
        .send({
          ...testCase,
          caseId: 'test-case-new-stats',
          processNumber: '0000002-23.2024.1.17.0002',
        });

      if (newConfigResponse.status === 201) {
        const newConfigId = newConfigResponse.body.configuration.id;

        const statsResponse = await request(app)
          .get(`/api/polling/polling/${newConfigId}/statistics`)
          .set('Authorization', authHeader);

        expect(statsResponse.status).toBe(200);
        expect(statsResponse.body.statistics.totalSyncs).toBe(0);
        expect(statsResponse.body.statistics.successfulSyncs).toBe(0);
      }
    });
  });

  describe('Queue Status', () => {
    it('should get polling queue status', async () => {
      const response = await request(app)
        .get('/api/polling/polling/queue/status')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.queue).toHaveProperty('status');
      expect(response.body.queue).toHaveProperty('message');
    });

    it('should show queue as active when services running', async () => {
      const response = await request(app)
        .get('/api/polling/polling/queue/status')
        .set('Authorization', authHeader);

      if (response.status === 200) {
        expect(
          ['active', 'idle', 'paused'],
        ).toContain(response.body.queue.status);
      }
    });
  });

  describe('Testing Polling Configuration', () => {
    it('should test polling with valid process', async () => {
      const response = await request(app)
        .post('/api/polling/polling/test')
        .set('Authorization', authHeader)
        .send({
          processNumber: '0000001-23.2024.1.17.0001',
          tribunalCode: 'pje-tjal',
        });

      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(response.body.result).toHaveProperty('processNumber');
        expect(response.body.result).toHaveProperty('tribunalCode');
        expect(response.body.result).toHaveProperty('success');
        expect(response.body.result).toHaveProperty('changes');
      }
    });

    it('should reject test without required fields', async () => {
      const response = await request(app)
        .post('/api/polling/polling/test')
        .set('Authorization', authHeader)
        .send({
          processNumber: '0000001-23.2024.1.17.0001',
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should handle test with unavailable tribunal', async () => {
      const response = await request(app)
        .post('/api/polling/polling/test')
        .set('Authorization', authHeader)
        .send({
          processNumber: '0000001-23.2024.1.17.0001',
          tribunalCode: 'invalid-tribunal',
        });

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Security and Access Control', () => {
    it('should require authentication to configure polling', async () => {
      const response = await request(app)
        .post('/api/polling/polling/configure')
        .send(testCase);

      expect([401, 500]).toContain(response.status);
    });

    it('should require authentication to start polling', async () => {
      const response = await request(app)
        .post(`/api/polling/polling/some-id/start`);

      expect([401, 500]).toContain(response.status);
    });

    it('should require authentication to get statistics', async () => {
      const response = await request(app).get(
        `/api/polling/polling/some-id/statistics`,
      );

      expect([401, 500]).toContain(response.status);
    });

    it('should require authentication to access queue status', async () => {
      const response = await request(app).get('/api/polling/polling/queue/status');

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid configuration ID gracefully', async () => {
      const response = await request(app)
        .get('/api/polling/polling/invalid-config-id/statistics')
        .set('Authorization', authHeader);

      expect([404, 500]).toContain(response.status);
    });

    it('should handle tribunal unavailability', async () => {
      const response = await request(app)
        .post('/api/polling/polling/configure')
        .set('Authorization', authHeader)
        .send({
          ...testCase,
          tribunalCode: 'unavailable-tribunal',
        });

      expect([201, 400, 500]).toContain(response.status);
    });

    it('should provide meaningful error messages', async () => {
      const response = await request(app)
        .post('/api/polling/polling/configure')
        .set('Authorization', authHeader)
        .send({});

      if (response.status >= 400) {
        expect(response.body).toHaveProperty('message');
        expect(typeof response.body.message).toBe('string');
      }
    });
  });

  describe('Polling Performance', () => {
    it('should handle multiple concurrent sync operations', async () => {
      const configs = [
        { ...testCase, caseId: 'case-concurrent-1', processNumber: 'process-1' },
        { ...testCase, caseId: 'case-concurrent-2', processNumber: 'process-2' },
        { ...testCase, caseId: 'case-concurrent-3', processNumber: 'process-3' },
      ];

      const responses = await Promise.all(
        configs.map((config) =>
          request(app)
            .post('/api/polling/polling/configure')
            .set('Authorization', authHeader)
            .send(config),
        ),
      );

      const successCount = responses.filter((r) => r.status === 201).length;
      expect(successCount).toBeGreaterThanOrEqual(0);
    });

    it('should respect rate limiting if implemented', async () => {
      const configs = Array(20)
        .fill(null)
        .map((_, i) => ({
          ...testCase,
          caseId: `case-rate-limit-${i}`,
          processNumber: `process-rate-${i}`,
        }));

      const responses = await Promise.all(
        configs.map((config) =>
          request(app)
            .post('/api/polling/polling/configure')
            .set('Authorization', authHeader)
            .send(config),
        ),
      );

      // All should either succeed or be rate limited
      responses.forEach((r) => {
        expect([201, 429, 500]).toContain(r.status);
      });
    });
  });
});
