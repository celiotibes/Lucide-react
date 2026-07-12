import { RateLimiter, RateLimitConfig } from '@middlewares/rateLimitMiddleware';
import { Request } from 'express';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ windowMs: 60000, maxRequests: 10 });
  });

  test('should allow requests within limit', () => {
    const req = { ip: '127.0.0.1' } as Request;

    for (let i = 0; i < 10; i++) {
      const result = limiter.checkLimit(req);
      expect(result.allowed).toBe(true);
    }
  });

  test('should block requests exceeding limit', () => {
    const req = { ip: '127.0.0.1' } as Request;

    for (let i = 0; i < 10; i++) {
      limiter.checkLimit(req);
    }

    const result = limiter.checkLimit(req);
    expect(result.allowed).toBe(false);
  });

  test('should track remaining requests', () => {
    const req = { ip: '127.0.0.1' } as Request;

    const result1 = limiter.checkLimit(req);
    expect(result1.remaining).toBe(9);

    const result2 = limiter.checkLimit(req);
    expect(result2.remaining).toBe(8);
  });

  test('should provide reset time', () => {
    const req = { ip: '127.0.0.1' } as Request;
    const result = limiter.checkLimit(req);

    expect(result.resetTime).toBeGreaterThan(Date.now());
  });

  test('should isolate clients', () => {
    const req1 = { ip: '127.0.0.1' } as Request;
    const req2 = { ip: '192.168.1.1' } as Request;

    for (let i = 0; i < 10; i++) {
      limiter.checkLimit(req1);
      limiter.checkLimit(req2);
    }

    const result1 = limiter.checkLimit(req1);
    const result2 = limiter.checkLimit(req2);

    expect(result1.allowed).toBe(false);
    expect(result2.allowed).toBe(false);
  });

  test('should get client stats', () => {
    const req = { ip: '127.0.0.1' } as Request;

    limiter.checkLimit(req);
    limiter.checkLimit(req);

    const stats = limiter.getClientStats('127.0.0.1');

    expect(stats).not.toBeNull();
    expect(stats?.count).toBe(2);
  });

  test('should reset client', () => {
    const req = { ip: '127.0.0.1' } as Request;

    limiter.checkLimit(req);
    limiter.resetClient('127.0.0.1');

    const stats = limiter.getClientStats('127.0.0.1');
    expect(stats).toBeNull();
  });

  test('should get statistics', () => {
    const req1 = { ip: '127.0.0.1' } as Request;
    const req2 = { ip: '192.168.1.1' } as Request;

    limiter.checkLimit(req1);
    limiter.checkLimit(req2);

    const stats = limiter.getStatistics();

    expect(stats.totalClients).toBeGreaterThan(0);
    expect(stats.averageRequests).toBeGreaterThan(0);
  });

  test('should reset all data', () => {
    const req = { ip: '127.0.0.1' } as Request;

    limiter.checkLimit(req);
    limiter.reset();

    const result = limiter.checkLimit(req);
    expect(result.allowed).toBe(true);
  });
});
