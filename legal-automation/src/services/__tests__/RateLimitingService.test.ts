import { RateLimitingService } from '../RateLimitingService';

describe('RateLimitingService', () => {
  let service: RateLimitingService;

  beforeEach(() => {
    service = new RateLimitingService();
  });

  describe('Quota Checking', () => {
    it('should allow request when quota is available', () => {
      const result = service.checkAndConsume('user-1', 'analyze', 'standard');

      expect(result.allowed).toBe(true);
      expect(result.remaining.daily).toBeLessThan(500);
      expect(result.remaining.hourly).toBeLessThan(100);
      expect(result.remaining.minutely).toBeLessThan(20);
    });

    it('should track remaining quota correctly', () => {
      const result1 = service.checkAndConsume('user-1', 'analyze', 'standard');
      const remaining1 = result1.remaining.daily;

      const result2 = service.checkAndConsume('user-1', 'analyze', 'standard');
      const remaining2 = result2.remaining.daily;

      expect(remaining2).toBe(remaining1 - 1);
    });

    it('should track daily quota consumption', () => {
      const limit = 100; // free tier daily limit
      let lastResult: any;

      // Consume some daily quota (limited by minute: 5)
      for (let i = 0; i < 5; i++) {
        lastResult = service.checkAndConsume('user-daily-track', 'analyze', 'free');
      }

      // Should be consumed
      expect(lastResult.remaining.daily).toBeLessThan(limit);
    });

    it('should track hourly quota consumption', () => {
      const limit = 20; // free tier hourly limit
      let lastResult: any;

      // Consume some hourly quota (limited by minute: 5)
      for (let i = 0; i < 5; i++) {
        lastResult = service.checkAndConsume('user-hourly-track', 'analyze', 'free');
      }

      // Should be consumed
      expect(lastResult.remaining.hourly).toBeLessThan(limit);
    });

    it('should enforce minute quota limit', () => {
      const limit = 5; // free tier minute limit
      let lastResult = { allowed: true, remaining: { minutely: limit } };

      // Consume all minute quota
      for (let i = 0; i < limit; i++) {
        lastResult = service.checkAndConsume('user-minute', 'analyze', 'free');
      }

      // Next request should be denied
      const deniedResult = service.checkAndConsume('user-minute', 'analyze', 'free');
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.remaining.minutely).toBe(0);
    });
  });

  describe('Task-specific Quotas', () => {
    it('should track task-specific quotas', () => {
      const limit = 20; // free tier generate limit
      let lastResult = { allowed: true, remaining: { forTask: limit } };

      for (let i = 0; i < limit; i++) {
        lastResult = service.checkAndConsume('user-task', 'generate', 'free');
      }

      const deniedResult = service.checkAndConsume('user-task', 'generate', 'free');
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.remaining.forTask).toBe(0);
    });

    it('should allow different task types independently', () => {
      // Generate 5 generate tasks (limited by minute)
      for (let i = 0; i < 5; i++) {
        const result = service.checkAndConsume('user-multi', 'generate', 'free');
        expect(result.allowed).toBe(true);
      }

      // Next generate should be denied (minute limit)
      let result = service.checkAndConsume('user-multi', 'generate', 'free');
      expect(result.allowed).toBe(false);

      // But task quota per day is independent - we haven't hit generate task limit (20)
      const status = service.getQuotaStatus('user-multi');
      expect(status?.taskQuotas['generate']).toBe(5);
    });
  });

  describe('User Tiers', () => {
    it('should respect free tier minute limit', () => {
      let result: any;
      const limit = 5; // free tier minute limit
      for (let i = 0; i < limit; i++) {
        result = service.checkAndConsume('user-free', 'analyze', 'free');
      }
      expect(result.allowed).toBe(true);

      result = service.checkAndConsume('user-free', 'analyze', 'free');
      expect(result.allowed).toBe(false);
    });

    it('should respect standard tier minute limit', () => {
      let result: any;
      const limit = 20; // standard hourly, but minute is 20
      for (let i = 0; i < limit; i++) {
        result = service.checkAndConsume('user-standard', 'analyze', 'standard');
      }
      expect(result.allowed).toBe(true);

      result = service.checkAndConsume('user-standard', 'analyze', 'standard');
      expect(result.allowed).toBe(false);
    });

    it('should respect premium tier minute limit', () => {
      let result: any;
      const limit = 100; // premium minute limit
      for (let i = 0; i < limit; i++) {
        result = service.checkAndConsume('user-premium', 'analyze', 'premium');
      }
      expect(result.allowed).toBe(true);

      result = service.checkAndConsume('user-premium', 'analyze', 'premium');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Quota Status', () => {
    it('should retrieve quota status without consuming', () => {
      service.checkAndConsume('user-status', 'analyze', 'standard');

      const status = service.getQuotaStatus('user-status');
      expect(status).not.toBeNull();
      expect(status?.dailyRequests).toBe(1);
      expect(status?.isActive).toBe(true);
      expect(status?.tier).toBe('standard');
    });

    it('should return null for unknown user', () => {
      const status = service.getQuotaStatus('unknown-user');
      expect(status).toBeNull();
    });
  });

  describe('Quota Reset', () => {
    it('should reset user quota', () => {
      // Use quota
      service.checkAndConsume('user-reset', 'analyze', 'standard');
      let status = service.getQuotaStatus('user-reset');
      expect(status?.dailyRequests).toBe(1);

      // Reset
      service.resetQuota('user-reset');
      status = service.getQuotaStatus('user-reset');
      expect(status?.dailyRequests).toBe(0);
    });

    it('should return false when resetting unknown user', () => {
      const result = service.resetQuota('unknown-user');
      expect(result).toBe(false);
    });
  });

  describe('User Management', () => {
    it('should set user tier', () => {
      service.checkAndConsume('user-tier', 'analyze', 'free');
      service.setUserTier('user-tier', 'premium');

      const status = service.getQuotaStatus('user-tier');
      expect(status?.tier).toBe('premium');
    });

    it('should deactivate user', () => {
      service.checkAndConsume('user-deactivate', 'analyze', 'standard');
      service.deactivateUser('user-deactivate');

      const result = service.checkAndConsume('user-deactivate', 'analyze', 'standard');
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reactivate user', () => {
      service.deactivateUser('user-reactivate');
      service.activateUser('user-reactivate');

      const result = service.checkAndConsume('user-reactivate', 'analyze', 'standard');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should provide global statistics', () => {
      service.checkAndConsume('user-1', 'analyze', 'standard');
      service.checkAndConsume('user-2', 'analyze', 'free');
      service.checkAndConsume('user-3', 'analyze', 'premium');

      const stats = service.getStatistics();
      expect(stats.totalUsers).toBe(3);
      expect(stats.activeUsers).toBe(3);
      expect(stats.byTier.free).toBe(1);
      expect(stats.byTier.standard).toBe(1);
      expect(stats.byTier.premium).toBe(1);
      expect(stats.totalDailyRequests).toBe(3);
    });

    it('should count inactive users', () => {
      service.checkAndConsume('user-1', 'analyze', 'standard');
      service.checkAndConsume('user-2', 'analyze', 'standard');
      service.deactivateUser('user-1');

      const stats = service.getStatistics();
      expect(stats.totalUsers).toBe(2);
      expect(stats.activeUsers).toBe(1);
      expect(stats.inactiveUsers).toBe(1);
    });
  });

  describe('Retry After', () => {
    it('should return retry-after when quota exceeded', () => {
      const limit = 5;
      for (let i = 0; i < limit; i++) {
        service.checkAndConsume('user-retry', 'analyze', 'free');
      }

      const result = service.checkAndConsume('user-retry', 'analyze', 'free');
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Multiple Requests', () => {
    it('should handle concurrent requests from same user', () => {
      const results = [];
      const limit = 5; // free tier minute limit

      for (let i = 0; i < limit + 3; i++) {
        const result = service.checkAndConsume('user-concurrent', 'analyze', 'free');
        results.push(result);
      }

      // First 5 should be allowed
      for (let i = 0; i < limit; i++) {
        expect(results[i].allowed).toBe(true);
      }

      // Next 3 should be denied
      for (let i = limit; i < limit + 3; i++) {
        expect(results[i].allowed).toBe(false);
      }
    });
  });

  describe('Reset Windows', () => {
    it('should include reset times in response', () => {
      const result = service.checkAndConsume('user-reset-times', 'analyze', 'standard');

      expect(result.resetAt.daily).toBeInstanceOf(Date);
      expect(result.resetAt.hourly).toBeInstanceOf(Date);
      expect(result.resetAt.minutely).toBeInstanceOf(Date);

      // Reset times should be in the future
      const now = new Date();
      expect(result.resetAt.daily.getTime()).toBeGreaterThan(now.getTime());
      expect(result.resetAt.hourly.getTime()).toBeGreaterThan(now.getTime());
      expect(result.resetAt.minutely.getTime()).toBeGreaterThan(now.getTime());
    });
  });
});
