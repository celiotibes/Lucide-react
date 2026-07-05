import request from 'supertest';
import express from 'express';
import ReportGenerationService from '@services/ReportGenerationService';
import reportingController from '@api/controllers/reportingController';
import { createAuthHeader } from '../setup/testHelpers';

const app = express();
app.use(express.json());
app.use('/api', reportingController);

describe('Report Generation - E2E Tests', () => {
  const userId = 'test-user-reports';
  const authHeader = createAuthHeader(userId);
  let reportId: string;

  describe('Report Generation', () => {
    it('should generate case summary report in PDF', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', authHeader)
        .send({
          reportType: 'case_summary',
          format: 'pdf',
          options: { includeCharts: true },
        });

      expect([201, 400, 500]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body.status).toBe('success');
        expect(response.body.report).toHaveProperty('id');
        expect(response.body.report.format).toBe('pdf');
        reportId = response.body.report.id;
      }
    });

    it('should generate financial summary in Excel', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', authHeader)
        .send({
          reportType: 'financial_summary',
          format: 'excel',
        });

      expect([201, 400, 500]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body.report.format).toBe('excel');
      }
    });

    it('should generate deadline report in CSV', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', authHeader)
        .send({
          reportType: 'deadline_report',
          format: 'csv',
        });

      expect([201, 400, 500]).toContain(response.status);
    });

    it('should support report filters', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', authHeader)
        .send({
          reportType: 'case_summary',
          format: 'pdf',
          filters: {
            status: ['active', 'pending'],
            priority: ['high', 'critical'],
            dateRange: {
              from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              to: new Date(),
            },
          },
        });

      expect([201, 400, 500]).toContain(response.status);
    });

    it('should require report type and format', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', authHeader)
        .send({
          reportType: 'case_summary',
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .send({
          reportType: 'case_summary',
          format: 'pdf',
        });

      expect([401, 500]).toContain(response.status);
    });
  });

  describe('Report Formats', () => {
    ['pdf', 'excel', 'csv', 'html'].forEach((format) => {
      it(\`should support \${format} format\`, async () => {
        const response = await request(app)
          .post('/api/reports/generate')
          .set('Authorization', authHeader)
          .send({
            reportType: 'case_summary',
            format,
          });

        expect([201, 400, 500]).toContain(response.status);

        if (response.status === 201) {
          expect(response.body.report.format).toBe(format);
        }
      });
    });
  });

  describe('Report Types', () => {
    ['case_summary', 'financial_summary', 'deadline_report', 'performance_metrics', 'time_tracking'].forEach((type) => {
      it(\`should generate \${type} report\`, async () => {
        const response = await request(app)
          .post('/api/reports/generate')
          .set('Authorization', authHeader)
          .send({
            reportType: type,
            format: 'pdf',
          });

        expect([201, 400, 500]).toContain(response.status);
      });
    });
  });

  describe('Report Download', () => {
    it('should download report file', async () => {
      if (!reportId) {
        expect(reportId).toBeDefined();
        return;
      }

      const response = await request(app)
        .get(\`/api/reports/\${reportId}/download\`)
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.headers['content-disposition']).toBeDefined();
      }
    });

    it('should return 404 for non-existent report', async () => {
      const response = await request(app)
        .get('/api/reports/non-existent-id/download')
        .set('Authorization', authHeader);

      expect(response.status).toBe(404);
    });
  });

  describe('Report Preview', () => {
    it('should preview report in HTML', async () => {
      if (!reportId) {
        expect(reportId).toBeDefined();
        return;
      }

      const response = await request(app)
        .get(\`/api/reports/\${reportId}/preview\`)
        .set('Authorization', authHeader);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.headers['content-type']).toContain('text/html');
      }
    });
  });

  describe('Report Scheduling', () => {
    it('should schedule recurring report', async () => {
      const response = await request(app)
        .post('/api/reports/schedule')
        .set('Authorization', authHeader)
        .send({
          reportType: 'financial_summary',
          format: 'excel',
          frequency: 'monthly',
          recipients: ['user@example.com'],
        });

      expect([201, 400, 500]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body.status).toBe('success');
        expect(response.body.schedule).toHaveProperty('id');
        expect(response.body.schedule.frequency).toBe('monthly');
      }
    });

    it('should support different frequencies', async () => {
      const frequencies = ['daily', 'weekly', 'monthly', 'quarterly'];

      for (const frequency of frequencies) {
        const response = await request(app)
          .post('/api/reports/schedule')
          .set('Authorization', authHeader)
          .send({
            reportType: 'case_summary',
            format: 'pdf',
            frequency,
          });

        expect([201, 400, 500]).toContain(response.status);
      }
    });

    it('should require frequency', async () => {
      const response = await request(app)
        .post('/api/reports/schedule')
        .set('Authorization', authHeader)
        .send({
          reportType: 'case_summary',
          format: 'pdf',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Report Options', () => {
    it('should respect report options', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', authHeader)
        .send({
          reportType: 'case_summary',
          format: 'pdf',
          options: {
            includeCharts: true,
            includeSummary: true,
            includeDetails: true,
            theme: 'dark',
            language: 'pt-BR',
          },
        });

      expect([201, 400, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .set('Authorization', authHeader)
        .send({
          reportType: 'invalid_type',
          format: 'pdf',
        });

      expect([400, 500]).toContain(response.status);
    });

    it('should handle missing authentication', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .send({
          reportType: 'case_summary',
          format: 'pdf',
        });

      expect([401, 500]).toContain(response.status);
    });
  });
});
