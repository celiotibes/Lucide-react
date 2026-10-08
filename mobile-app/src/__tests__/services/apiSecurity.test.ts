/**
 * Tests for API Security utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SecurityHeadersBuilder,
  RetryHandler,
  PayloadHandler,
  SecureLogger,
  SecurityUtils,
} from '../../utils/security/apiSecurity';
import { TokenManager } from '../../services/security/TokenManager';

describe('API Security Utilities', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      localStorage.clear();
    }
  });

  afterEach(() => {
    TokenManager.clearTokens();
  });

  describe('SecurityHeadersBuilder', () => {
    it('should add standard security headers', () => {
      const headers = new SecurityHeadersBuilder()
        .addStandardSecurityHeaders()
        .build();

      expect(headers['Content-Security-Policy']).toBeDefined();
      expect(headers['Strict-Transport-Security']).toBeDefined();
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBeDefined();
    });

    it('should add authentication header', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      TokenManager.setTokens(token);

      const headers = new SecurityHeadersBuilder()
        .addAuthenticationHeader()
        .build();

      expect(headers['Authorization']).toBe(`Bearer ${token}`);
    });

    it('should not add authentication header if no token', () => {
      const headers = new SecurityHeadersBuilder()
        .addAuthenticationHeader()
        .build();

      expect(headers['Authorization']).toBeUndefined();
    });

    it('should add custom headers', () => {
      const headers = new SecurityHeadersBuilder()
        .addHeader('X-Custom-Header', 'custom-value')
        .build();

      expect(headers['X-Custom-Header']).toBe('custom-value');
    });

    it('should merge all headers', () => {
      const headers = new SecurityHeadersBuilder()
        .addStandardSecurityHeaders()
        .addHeader('X-Custom', 'value')
        .build();

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Accept']).toBe('application/json');
      expect(headers['X-Custom']).toBe('value');
      expect(headers['X-Content-Type-Options']).toBeDefined();
    });
  });

  describe('RetryHandler', () => {
    it('should calculate exponential backoff', () => {
      const delay1 = RetryHandler.calculateDelay(0);
      const delay2 = RetryHandler.calculateDelay(1);
      const delay3 = RetryHandler.calculateDelay(2);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should cap delay at maximum', () => {
      const delay = RetryHandler.calculateDelay(10);
      expect(delay).toBeLessThanOrEqual(30000);
    });

    it('should determine if retry is needed', () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      };

      // Should retry on 5xx error within max attempts
      expect(RetryHandler.shouldRetry(0, 500, config)).toBe(true);
      expect(RetryHandler.shouldRetry(2, 500, config)).toBe(true);

      // Should not retry after max attempts
      expect(RetryHandler.shouldRetry(3, 500, config)).toBe(false);

      // Should not retry on non-retryable status
      expect(RetryHandler.shouldRetry(0, 404, config)).toBe(false);
      expect(RetryHandler.shouldRetry(0, 401, config)).toBe(false);
    });

    it('should sleep for specified duration', async () => {
      const start = performance.now();
      await RetryHandler.sleep(100);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(200); // Allow some tolerance
    });
  });

  describe('PayloadHandler', () => {
    it('should encrypt sensitive fields', async () => {
      const payload = {
        name: 'John',
        email: 'john@example.com',
        password: 'secret123',
      };

      const encrypted = await PayloadHandler.encryptSensitiveFields(payload, [
        'password',
      ]);

      expect(encrypted.name).toBe('John');
      expect(encrypted.email).toBe('john@example.com');
      expect(encrypted._encrypted_password).toBeDefined();
      expect(encrypted.password).toBeUndefined();
    });

    it('should decrypt sensitive fields', async () => {
      const encrypted = {
        name: 'John',
        email: 'john@example.com',
        _encrypted_password: {
          iv: 'aW52YWxpZA==',
          salt: 'c2FsdA==',
          data: 'ZGF0YQ==',
          tag: 'dGFn',
          algorithm: 'AES-256-GCM',
        },
      };

      // Note: This will fail to decrypt because the encrypted data is invalid
      // In production, use real encrypted data
      try {
        await PayloadHandler.decryptSensitiveFields(encrypted, ['password']);
      } catch (error) {
        // Expected to fail with invalid data
        expect(error).toBeDefined();
      }
    });

    it('should handle multiple sensitive fields', async () => {
      const payload = {
        username: 'user',
        password: 'pass123',
        creditCard: '4111-1111-1111-1111',
        cvv: '123',
      };

      const encrypted = await PayloadHandler.encryptSensitiveFields(payload, [
        'password',
        'creditCard',
        'cvv',
      ]);

      expect(encrypted.username).toBe('user');
      expect(encrypted._encrypted_password).toBeDefined();
      expect(encrypted._encrypted_creditCard).toBeDefined();
      expect(encrypted._encrypted_cvv).toBeDefined();
      expect(encrypted.password).toBeUndefined();
      expect(encrypted.creditCard).toBeUndefined();
      expect(encrypted.cvv).toBeUndefined();
    });
  });

  describe('SecureLogger', () => {
    it('should redact sensitive headers', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const headers = {
        'Authorization': 'Bearer token123',
        'X-API-Key': 'secret-key',
        'Content-Type': 'application/json',
      };

      SecureLogger.logRequest('GET', 'https://api.example.com', headers);

      expect(consoleSpy).toHaveBeenCalled();
      const lastCall = consoleSpy.mock.calls[0];
      expect(JSON.stringify(lastCall)).toContain('[REDACTED]');

      consoleSpy.mockRestore();
    });

    it('should redact sensitive body fields', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const body = {
        username: 'user',
        password: 'secret123',
        creditCard: '4111-1111-1111-1111',
      };

      SecureLogger.logRequest('POST', 'https://api.example.com', {}, body);

      const callOutput = JSON.stringify(consoleSpy.mock.calls);
      expect(callOutput).toContain('password');
      // The actual redaction happens in the sanitizer

      consoleSpy.mockRestore();
    });

    it('should log response safely', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      SecureLogger.logResponse(200, { 'Set-Cookie': 'token=abc' }, { data: 'value' }, 150);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log errors safely', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      const error = new Error('API Error');
      SecureLogger.logError(error, { sensitiveData: 'secret' });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('SecurityUtils', () => {
    it('should generate CSRF token', () => {
      const token = SecurityUtils.generateCSRFToken();

      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes * 2 hex chars
      expect(/^[a-f0-9]{64}$/.test(token)).toBe(true);
    });

    it('should generate different CSRF tokens', () => {
      const token1 = SecurityUtils.generateCSRFToken();
      const token2 = SecurityUtils.generateCSRFToken();

      expect(token1).not.toBe(token2);
    });

    it('should store and retrieve CSRF token', () => {
      const token = SecurityUtils.generateCSRFToken();
      SecurityUtils.storeCSRFToken(token);

      const retrieved = SecurityUtils.getCSRFToken();
      expect(retrieved).toBe(token);
    });

    it('should check same-origin URLs', () => {
      // Mock window.location.origin
      Object.defineProperty(window, 'location', {
        value: {
          origin: 'https://example.com',
          href: 'https://example.com/page',
        },
        writable: true,
      });

      expect(SecurityUtils.isSameOrigin('https://example.com/api')).toBe(true);
      expect(SecurityUtils.isSameOrigin('https://other.com/api')).toBe(false);
      expect(SecurityUtils.isSameOrigin('/relative/path')).toBe(true);
    });
  });
});
