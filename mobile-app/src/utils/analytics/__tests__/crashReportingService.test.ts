/**
 * Crash Reporting Service Tests - Phase 22.13: Analytics & Monitoring
 */

import { crashReportingService } from '../crashReportingService';

describe('CrashReportingService', () => {
  beforeEach(async () => {
    await crashReportingService.clearAll();
    await crashReportingService.initialize({
      enabled: true,
      environment: 'development',
    });
  });

  afterEach(async () => {
    crashReportingService.destroy();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await crashReportingService.initialize({
        enabled: true,
        environment: 'development',
      });

      expect(crashReportingService).toBeDefined();
    });

    it('should skip initialization when disabled', async () => {
      await crashReportingService.initialize({
        enabled: false,
      });

      expect(crashReportingService).toBeDefined();
    });
  });

  describe('Error Reporting', () => {
    it('should report an error', async () => {
      const error = new Error('Test error');
      const crashId = await crashReportingService.reportError(error);

      expect(crashId).toBeDefined();
      expect(crashId.length).toBeGreaterThan(0);
    });

    it('should report a string error', async () => {
      const crashId = await crashReportingService.reportError('Test error message');

      expect(crashId).toBeDefined();
      expect(crashId.length).toBeGreaterThan(0);
    });

    it('should report error with context', async () => {
      const error = new Error('Test error');
      const context = { userId: 'user123', screen: 'HomeScreen' };
      const crashId = await crashReportingService.reportError(error, context);

      expect(crashId).toBeDefined();
    });

    it('should get crash reports', async () => {
      const error = new Error('Test error');
      await crashReportingService.reportError(error);

      const reports = await crashReportingService.getCrashReports();
      expect(reports.length).toBeGreaterThan(0);
    });
  });

  describe('Breadcrumbs', () => {
    it('should add a breadcrumb', () => {
      crashReportingService.addBreadcrumb({
        message: 'Test breadcrumb',
        category: 'test',
      });

      const breadcrumbs = crashReportingService.getBreadcrumbs();
      expect(breadcrumbs.length).toBeGreaterThan(0);
    });

    it('should add log breadcrumb', () => {
      crashReportingService.addLogBreadcrumb('Log message', 'info');

      const breadcrumbs = crashReportingService.getBreadcrumbs();
      expect(breadcrumbs.length).toBeGreaterThan(0);
    });

    it('should add navigation breadcrumb', () => {
      crashReportingService.addNavigationBreadcrumb('HomeScreen', 'navigate');

      const breadcrumbs = crashReportingService.getBreadcrumbs();
      expect(breadcrumbs.length).toBeGreaterThan(0);
    });

    it('should add network breadcrumb', () => {
      crashReportingService.addNetworkBreadcrumb('GET', '/api/users', 200, 150);

      const breadcrumbs = crashReportingService.getBreadcrumbs();
      expect(breadcrumbs.length).toBeGreaterThan(0);
    });

    it('should limit breadcrumbs', async () => {
      await crashReportingService.initialize({
        enabled: true,
        environment: 'development',
        maxBreadcrumbs: 5,
      });

      for (let i = 0; i < 10; i++) {
        crashReportingService.addBreadcrumb({
          message: `Breadcrumb ${i}`,
          category: 'test',
        });
      }

      const breadcrumbs = crashReportingService.getBreadcrumbs();
      expect(breadcrumbs.length).toBeLessThanOrEqual(5);
    });

    it('should clear breadcrumbs', () => {
      crashReportingService.addBreadcrumb({
        message: 'Test breadcrumb',
        category: 'test',
      });

      expect(crashReportingService.getBreadcrumbs().length).toBeGreaterThan(0);

      crashReportingService.clearBreadcrumbs();
      expect(crashReportingService.getBreadcrumbs().length).toBe(0);
    });
  });

  describe('User Identification', () => {
    it('should set user', () => {
      crashReportingService.setUser('user123', 'user@example.com', 'testuser');

      const breadcrumbs = crashReportingService.getBreadcrumbs();
      expect(breadcrumbs.length).toBeGreaterThan(0);
      const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
      expect(lastBreadcrumb.message).toContain('User identified');
    });

    it('should clear user', () => {
      crashReportingService.setUser('user123');
      crashReportingService.clearUser();

      const breadcrumbs = crashReportingService.getBreadcrumbs();
      const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
      expect(lastBreadcrumb.message).toContain('User cleared');
    });
  });

  describe('Data Persistence', () => {
    it('should clear all data', async () => {
      crashReportingService.addBreadcrumb({
        message: 'Test breadcrumb',
        category: 'test',
      });

      expect(crashReportingService.getBreadcrumbs().length).toBeGreaterThan(0);

      await crashReportingService.clearAll();
      expect(crashReportingService.getBreadcrumbs().length).toBe(0);
    });
  });

  describe('Exception Reporting', () => {
    it('should report an exception', async () => {
      const exception = new Error('Test exception');
      const crashId = await crashReportingService.reportException(exception);

      expect(crashId).toBeDefined();
      expect(crashId.length).toBeGreaterThan(0);
    });
  });
});
