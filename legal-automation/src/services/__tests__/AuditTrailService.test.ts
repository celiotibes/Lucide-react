import { auditTrailService } from '@services/AuditTrailService';

describe('AuditTrailService', () => {
  beforeEach(() => {
    auditTrailService.reset();
  });

  describe('log', () => {
    test('should log successful action', () => {
      const log = auditTrailService.log(
        'user1',
        'CREATE',
        'CONTRACT',
        'contract-123',
        {
          title: { before: undefined, after: 'New Contract' },
        },
        { ipAddress: '192.168.1.1' },
        'success',
      );

      expect(log.userId).toBe('user1');
      expect(log.action).toBe('CREATE');
      expect(log.entityType).toBe('CONTRACT');
      expect(log.status).toBe('success');
      expect(log.timestamp).toBeDefined();
    });

    test('should log failed action', () => {
      const log = auditTrailService.log(
        'user2',
        'DELETE',
        'CLIENT',
        'client-456',
        {},
        {},
        'failed',
        'Permission denied',
      );

      expect(log.status).toBe('failed');
      expect(log.errorMessage).toBe('Permission denied');
    });

    test('should track changes', () => {
      const changes = {
        status: { before: 'draft', after: 'signed' },
        amount: { before: 1000, after: 1500 },
      };

      const log = auditTrailService.log(
        'user1',
        'UPDATE',
        'INVOICE',
        'inv-789',
        changes,
      );

      expect(log.changes).toEqual(changes);
    });
  });

  describe('query', () => {
    test('should query by user', () => {
      auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {});
      auditTrailService.log('user2', 'UPDATE', 'CONTRACT', 'c2', {});
      auditTrailService.log('user1', 'DELETE', 'CONTRACT', 'c3', {});

      const results = auditTrailService.query({ userId: 'user1' });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.userId === 'user1')).toBe(true);
    });

    test('should query by action', () => {
      auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {});
      auditTrailService.log('user1', 'UPDATE', 'CONTRACT', 'c2', {});
      auditTrailService.log('user1', 'CREATE', 'INVOICE', 'i1', {});

      const results = auditTrailService.query({ action: 'CREATE' });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.action === 'CREATE')).toBe(true);
    });

    test('should query by entity', () => {
      auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {});
      auditTrailService.log('user1', 'UPDATE', 'CONTRACT', 'c1', {});
      auditTrailService.log('user1', 'UPDATE', 'INVOICE', 'i1', {});

      const results = auditTrailService.query({
        entityType: 'CONTRACT',
        entityId: 'c1',
      });

      expect(results).toHaveLength(2);
    });

    test('should query by date range', () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 60000);
      const endDate = new Date(now.getTime() + 60000);

      auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {});

      const results = auditTrailService.query({ startDate, endDate });

      expect(results.length).toBeGreaterThan(0);
    });

    test('should query by status', () => {
      auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {}, {}, 'success');
      auditTrailService.log('user1', 'UPDATE', 'CONTRACT', 'c2', {}, {}, 'failed');

      const successResults = auditTrailService.query({ status: 'success' });
      const failedResults = auditTrailService.query({ status: 'failed' });

      expect(successResults).toHaveLength(1);
      expect(failedResults).toHaveLength(1);
    });

    test('should respect limit and offset', () => {
      for (let i = 0; i < 10; i++) {
        auditTrailService.log('user1', 'CREATE', 'CONTRACT', `c${i}`, {});
      }

      const page1 = auditTrailService.query({ limit: 5, offset: 0 });
      const page2 = auditTrailService.query({ limit: 5, offset: 5 });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);
      expect(page1[0].entityId).not.toBe(page2[0].entityId);
    });
  });

  describe('getEntityHistory', () => {
    test('should get history for entity', () => {
      auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {});
      auditTrailService.log('user1', 'UPDATE', 'CONTRACT', 'c1', {});
      auditTrailService.log('user1', 'UPDATE', 'CONTRACT', 'c1', {});

      const history = auditTrailService.getEntityHistory('CONTRACT', 'c1');

      expect(history).toHaveLength(3);
      expect(history.every((h) => h.entityId === 'c1')).toBe(true);
    });

    test('should return empty array for non-existent entity', () => {
      const history = auditTrailService.getEntityHistory('CONTRACT', 'non-existent');

      expect(history).toHaveLength(0);
    });
  });

  describe('getUserActivity', () => {
    test('should get user activity', () => {
      auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {});
      auditTrailService.log('user1', 'UPDATE', 'INVOICE', 'i1', {});
      auditTrailService.log('user2', 'DELETE', 'CLIENT', 'cl1', {});

      const activity = auditTrailService.getUserActivity('user1', 30);

      expect(activity).toHaveLength(2);
      expect(activity.every((a) => a.userId === 'user1')).toBe(true);
    });
  });

  describe('getLog', () => {
    test('should retrieve log by ID', () => {
      const logged = auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {});
      const retrieved = auditTrailService.getLog(logged.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(logged.id);
    });

    test('should return null for non-existent log', () => {
      const log = auditTrailService.getLog('non-existent');

      expect(log).toBeNull();
    });
  });

  describe('export', () => {
    test('should export logs to CSV', () => {
      auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {
        title: { before: undefined, after: 'Contract 1' },
      });

      const csv = auditTrailService.export({});

      expect(csv).toContain('ID');
      expect(csv).toContain('Timestamp');
      expect(csv).toContain('user1');
      expect(csv).toContain('CREATE');
      expect(csv).toContain('CONTRACT');
    });
  });

  describe('getStatistics', () => {
    test('should calculate statistics', () => {
      for (let i = 0; i < 7; i++) {
        auditTrailService.log(
          `user${i % 3}`,
          i < 5 ? 'CREATE' : 'UPDATE',
          'CONTRACT',
          `c${i}`,
          {},
          {},
          i < 6 ? 'success' : 'failed',
        );
      }

      const stats = auditTrailService.getStatistics();

      expect(stats.totalLogs).toBe(7);
      expect(stats.successCount).toBe(6);
      expect(stats.failedCount).toBe(1);
      expect(stats.uniqueUsers).toBe(3);
      expect(stats.uniqueActions).toBe(2);
      expect(stats.logsLast24h).toBe(7);
    });
  });

  describe('reset', () => {
    test('should reset all data', () => {
      auditTrailService.log('user1', 'CREATE', 'CONTRACT', 'c1', {});
      auditTrailService.reset();

      const stats = auditTrailService.getStatistics();

      expect(stats.totalLogs).toBe(0);
    });
  });
});
