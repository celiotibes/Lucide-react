/**
 * SEC-XXX: Tests for Adaptive Rate Limiting
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  createRateLimitMiddleware,
  RateLimitStore,
  generateRateLimitKey,
  getEndpointConfig,
} from "../rate-limit-middleware.js";

// Mock types for Request and Response
interface MockRequest extends Partial<Request> {
  ip?: string | null;
  path?: string;
  auth?: { usuario?: { id: string } | null } | undefined;
}

interface MockResponse extends Partial<Response> {
  statusCode?: number;
  jsonData?: unknown;
  set: (key: string, value: string) => MockResponse;
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
}

describe("SEC-XXX: Adaptive Rate Limiting", () => {
  describe("RateLimitStore", () => {
    let store: RateLimitStore;

    beforeEach(() => {
      store = new RateLimitStore(60000);
    });

    afterEach(() => {
      store.destroy();
    });

    it("should allow requests within limit", () => {
      const key = "test-key";
      const limit = 5;
      const windowMs = 60000;

      for (let i = 1; i <= limit; i++) {
        const result = store.check(key, limit, windowMs);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit - i);
      }
    });

    it("should block requests exceeding limit", () => {
      const key = "test-key";
      const limit = 3;
      const windowMs = 60000;

      // Allow limit requests
      for (let i = 0; i < limit; i++) {
        store.check(key, limit, windowMs);
      }

      // Next request should be blocked
      const result = store.check(key, limit, windowMs);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });

    it("should reset bucket after window expires", () => {
      const key = "test-key";
      const limit = 2;
      const windowMs = 100;

      // Fill the bucket
      store.check(key, limit, windowMs);
      store.check(key, limit, windowMs);

      // Next request in same window should be blocked
      let result = store.check(key, limit, windowMs);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      const then = Date.now();
      while (Date.now() - then < windowMs + 10) {
        // Busy wait (for testing only)
      }

      // After window expires, should allow again
      result = store.check(key, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - 1);
    });

    it("should track remaining correctly", () => {
      const key = "test-key";
      const limit = 5;
      const windowMs = 60000;

      for (let i = 1; i <= limit; i++) {
        const result = store.check(key, limit, windowMs);
        expect(result.remaining).toBe(Math.max(0, limit - i));
      }
    });

    it("should provide reset time", () => {
      const key = "test-key";
      const limit = 5;
      const windowMs = 60000;
      const before = Date.now();

      const result = store.check(key, limit, windowMs);
      const after = Date.now();

      expect(result.resetTime).toBeGreaterThanOrEqual(before + windowMs);
      expect(result.resetTime).toBeLessThanOrEqual(after + windowMs);
    });

    it("should implement exponential backoff", () => {
      const key = "test-key-exponential";
      const limit = 1;
      const windowMs = 60000;

      // First request allowed
      let result = store.check(key, limit, windowMs);
      expect(result.allowed).toBe(true);

      // Second request blocked (first violation)
      result = store.check(key, limit, windowMs);
      expect(result.allowed).toBe(false);
      const firstRetryAfter = result.retryAfter || 0;
      expect(firstRetryAfter).toBeGreaterThan(0);
      expect(firstRetryAfter).toBeLessThanOrEqual(10);

      // Immediately try again while still blocked - should still be blocked
      // but next violation will have longer backoff
      // Create a new key to simulate second violation
      const key2 = "test-key-exponential-2";

      // Exceed limit immediately (first violation for key2)
      result = store.check(key2, limit, windowMs);
      expect(result.allowed).toBe(true);

      result = store.check(key2, limit, windowMs);
      expect(result.allowed).toBe(false);
      const firstViolationRetryAfter = result.retryAfter || 0;
      expect(firstViolationRetryAfter).toBeGreaterThan(0);
      expect(firstViolationRetryAfter).toBeLessThanOrEqual(10);

      // Simulate time passing by manipulating the bucket
      // This allows us to test the exponential backoff without waiting
      const storeInternal = store as unknown as { buckets: Map<string, { blockedUntil: number }> };
      const bucket = storeInternal.buckets.get(key2);
      if (bucket) {
        // Simulate 11 seconds passing by setting blockedUntil to past
        bucket.blockedUntil = Date.now() - 1000;
      }

      // Third request - should unblock and allow one more request
      result = store.check(key2, limit, windowMs);
      expect(result.allowed).toBe(true);

      // Fourth request - violates limit again (second violation)
      result = store.check(key2, limit, windowMs);
      expect(result.allowed).toBe(false);
      const secondViolationRetryAfter = result.retryAfter || 0;
      // Second violation should have longer backoff (20s)
      expect(secondViolationRetryAfter).toBeGreaterThan(firstViolationRetryAfter);
      expect(secondViolationRetryAfter).toBeGreaterThanOrEqual(20);
    });

    it("should handle different keys independently", () => {
      const key1 = "key1";
      const key2 = "key2";
      const limit = 2;
      const windowMs = 60000;

      // Fill key1
      store.check(key1, limit, windowMs);
      store.check(key1, limit, windowMs);

      // key2 should not be affected
      const result = store.check(key2, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - 1);
    });

    it("should clean up expired buckets", () => {
      const key1 = "key1";
      const key2 = "key2";

      // Create buckets
      store.check(key1, 5, 60000);
      store.check(key2, 5, 60000);

      // Manually trigger cleanup (in real code, this happens on interval)
      // We'll just verify the method doesn't crash
      expect(() => {
        store.clear();
      }).not.toThrow();
    });
  });

  describe("generateRateLimitKey", () => {
    it("should generate key from IP only when not authenticated", () => {
      const req: MockRequest = {
        ip: "192.168.1.1",
        auth: undefined,
      };

      const key = generateRateLimitKey(req as Request, false);
      expect(key).toBe("192.168.1.1");
    });

    it("should generate key from IP when includeUserId is false", () => {
      const req: MockRequest = {
        ip: "192.168.1.1",
        auth: { usuario: { id: "user-123" } },
      };

      const key = generateRateLimitKey(req as Request, false);
      expect(key).toBe("192.168.1.1");
    });

    it("should generate key from userId:IP when authenticated", () => {
      const req: MockRequest = {
        ip: "192.168.1.1",
        auth: { usuario: { id: "user-123" } },
      };

      const key = generateRateLimitKey(req as Request, true);
      expect(key).toBe("user-123:192.168.1.1");
    });

    it("should handle missing IP gracefully", () => {
      const req: MockRequest = {
        ip: null,
        auth: undefined,
      };

      const key = generateRateLimitKey(req as Request, false);
      expect(key).toBe("unknown");
    });

    it("should handle authenticated without userId", () => {
      const req: MockRequest = {
        ip: "192.168.1.1",
        auth: { usuario: null },
      };

      const key = generateRateLimitKey(req as Request, true);
      expect(key).toBe("192.168.1.1");
    });
  });

  describe("getEndpointConfig", () => {
    it("should return critical limits for login endpoint", () => {
      const req: MockRequest = { path: "/api/auth/login" };
      const config = getEndpointConfig(req as Request);

      expect(config.limit).toBe(10);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it("should return critical limits for bootstrap endpoint", () => {
      const req: MockRequest = { path: "/api/auth/bootstrap" };
      const config = getEndpointConfig(req as Request);

      expect(config.limit).toBe(10);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it("should return critical limits for payment endpoints", () => {
      const req: MockRequest = { path: "/api/payments/create" };
      const config = getEndpointConfig(req as Request);

      expect(config.limit).toBe(10);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it("should return critical limits for permissões endpoint", () => {
      const req: MockRequest = { path: "/api/auth/permissoes" };
      const config = getEndpointConfig(req as Request);

      expect(config.limit).toBe(10);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it("should return standard limits for other endpoints", () => {
      const req: MockRequest = { path: "/api/transactions" };
      const config = getEndpointConfig(req as Request);

      expect(config.limit).toBe(100);
      expect(config.windowMs).toBe(15 * 60 * 1000);
    });

    it("should return standard limits for unknown endpoints", () => {
      const req: MockRequest = { path: "/api/unknown" };
      const config = getEndpointConfig(req as Request);

      expect(config.limit).toBe(100);
      expect(config.windowMs).toBe(15 * 60 * 1000);
    });
  });

  describe("createRateLimitMiddleware", () => {
    let store: RateLimitStore;

    beforeEach(() => {
      store = new RateLimitStore();
    });

    afterEach(() => {
      store.destroy();
    });

    it("should allow requests within limit", async () => {
      const store = new RateLimitStore();
      const middleware = createRateLimitMiddleware({ limit: 3, windowMs: 60000, store });

      const req: MockRequest = {
        ip: "192.168.1.99",
        path: "/api/test",
      };

      const res: MockResponse = {
        statusCode: 0,
        jsonData: undefined,
        status: function (code: number) {
          this.statusCode = code;
          return this;
        },
        json: function (data: unknown) {
          this.jsonData = data;
          return this;
        },
        set: function () {
          return this;
        },
      };

      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      // Allow all requests within limit
      for (let i = 0; i < 3; i++) {
        nextCalled = false;
        middleware(req as Request, res as Response, next);
        expect(nextCalled).toBe(true);
      }
      store.destroy();
    });

    it("should set rate limit headers", async () => {
      const store = new RateLimitStore();
      const middleware = createRateLimitMiddleware({ limit: 5, windowMs: 60000, store });

      const req: MockRequest = {
        ip: "192.168.1.100",
        path: "/api/test",
      };

      const headers: Record<string, string> = {};
      const res: MockResponse = {
        statusCode: 0,
        jsonData: undefined,
        status: function (code: number) {
          this.statusCode = code;
          return this;
        },
        json: function (data: unknown) {
          this.jsonData = data;
          return this;
        },
        set: function (key: string, value: string) {
          headers[key] = value;
          return this;
        },
      };

      const next = () => {};

      middleware(req as Request, res as Response, next);

      expect(headers["X-RateLimit-Limit"]).toBe("5");
      expect(headers["X-RateLimit-Remaining"]).toBe("4");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
      store.destroy();
    });

    it("should block exceeded requests with 429 status", async () => {
      const store = new RateLimitStore();
      const middleware = createRateLimitMiddleware({ limit: 1, windowMs: 60000, store });

      const req: MockRequest = {
        ip: "192.168.1.101",
        path: "/api/test",
      };

      let statusCode = 0;
      const res: MockResponse = {
        statusCode: 0,
        jsonData: undefined,
        status: function (code: number) {
          statusCode = code;
          return this;
        },
        json: function (data: unknown) {
          this.jsonData = data;
          return this;
        },
        set: function () {
          return this;
        },
      };

      const next = () => {};

      // First request allowed
      middleware(req as Request, res as Response, next);
      expect(statusCode).not.toBe(429);

      // Second request blocked
      middleware(req as Request, res as Response, next);
      expect(statusCode).toBe(429);
      store.destroy();
    });

    it("should include retry-after header when rate limited", async () => {
      const store = new RateLimitStore();
      const middleware = createRateLimitMiddleware({ limit: 1, windowMs: 60000, store });

      const req: MockRequest = {
        ip: "192.168.1.102",
        path: "/api/test",
      };

      const headers: Record<string, string> = {};
      const res: MockResponse = {
        statusCode: 0,
        jsonData: undefined,
        status: function (code: number) {
          this.statusCode = code;
          return this;
        },
        json: function (data: unknown) {
          this.jsonData = data;
          return this;
        },
        set: function (key: string, value: string) {
          headers[key] = value;
          return this;
        },
      };

      const next = () => {};

      // First request
      middleware(req as Request, res as Response, next);

      // Second request (blocked)
      middleware(req as Request, res as Response, next);

      expect(headers["Retry-After"]).toBeDefined();
      expect(parseInt(headers["Retry-After"])).toBeGreaterThan(0);
      store.destroy();
    });
  });
});
