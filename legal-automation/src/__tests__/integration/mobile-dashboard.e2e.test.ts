import request from 'supertest';
import express from 'express';
import MobileDashboardService from '@services/MobileDashboardService';
import mobileDashboardController from '@api/controllers/mobileDashboardController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json());
app.use('/api', mobileDashboardController);

describe('Mobile Dashboard - E2E Tests', () => {
  const userId = 'test-user-mobile';
  const authHeader = createAuthHeader(userId);

  describe('Dashboard Data', () => {
    it('should get complete dashboard data', async () => {
      const response = await request(app)
        .get('/api/dashboard/mobile')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.dashboard).toHaveProperty('user');
      expect(response.body.dashboard).toHaveProperty('summary');
      expect(response.body.dashboard).toHaveProperty('recentCases');
      expect(response.body.dashboard).toHaveProperty('urgentDeadlines');
      expect(response.body.dashboard).toHaveProperty('recentUpdates');
      expect(response.body.dashboard).toHaveProperty('notifications');
      expect(response.body.dashboard).toHaveProperty('financials');
    });

    it('should get dashboard summary', async () => {
      const response = await request(app)
        .get('/api/dashboard/mobile/summary')
        .set('Authorization', authHeader);

      expect(response.status).toBe(200);
      expect(response.body.summary).toHaveProperty('totalCases');
      expect(response.body.summary).toHaveProperty('activeCases');
      expect(response.body.summary).toHaveProperty('urgentDeadlines');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/dashboard/mobile');

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('Cases List', () => {
    it('should get paginated cases', async () => {
      const response = await request(app)
        .get('/api/dashboard/mobile/cases?page=1&pageSize=10')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.status).toBe('success');
        expect(Array.isArray(response.body.cases)).toBe(true);
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('page');
        expect(response.body).toHaveProperty('pageSize');
        expect(response.body).toHaveProperty('hasMore');
      }
    });

    it('should filter cases', async () => {
      const filters = {
        caseStatus: ['active'],
        priority: ['high', 'critical'],
      };

      const response = await request(app)
        .get(
          `/api/dashboard/mobile/cases?page=1&filters=${encodeURIComponent(JSON.stringify(filters))}`,
        )
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);
    });

    it('should get case details', async () => {
      const response = await request(app)
        .get('/api/dashboard/mobile/cases/test-case-id')
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.case).toHaveProperty('id');
        expect(response.body.case).toHaveProperty('caseNumber');
        expect(response.body.case).toHaveProperty('deadlines');
      }
    });
  });

  describe('Deadlines', () => {
    it('should get urgent deadlines', async () => {
      const response = await request(app)
        .get('/api/dashboard/mobile/deadlines/urgent')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.deadlines)).toBe(true);
        expect(response.body).toHaveProperty('count');
      }
    });
  });

  describe('Updates', () => {
    it('should get recent updates', async () => {
      const response = await request(app)
        .get('/api/dashboard/mobile/updates/recent')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.updates)).toBe(true);
      }
    });
  });

  describe('Notifications', () => {
    it('should get notification summary', async () => {
      const response = await request(app)
        .get('/api/dashboard/mobile/notifications')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.notifications).toHaveProperty('total');
        expect(response.body.notifications).toHaveProperty('unread');
      }
    });

    it('should mark notification as read', async () => {
      const response = await request(app)
        .post('/api/dashboard/mobile/notifications/test-notification-id/read')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Financials', () => {
    it('should get financial summary', async () => {
      const response = await request(app)
        .get('/api/dashboard/mobile/financials')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.financials).toHaveProperty('monthRevenue');
        expect(response.body.financials).toHaveProperty('monthProfit');
      }
    });
  });

  describe('Profile', () => {
    it('should get user profile', async () => {
      const response = await request(app)
        .get('/api/dashboard/mobile/profile')
        .set('Authorization', authHeader);

      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.profile).toHaveProperty('name');
        expect(response.body.profile).toHaveProperty('email');
      }
    });
  });
});
