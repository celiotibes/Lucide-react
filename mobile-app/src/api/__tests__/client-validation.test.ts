/**
 * API Client Validation Middleware Tests - Phase 22.14
 * Tests for input/output validation and XSS/SQL injection prevention
 */

import { apiClient, ValidationError, SanitizationError, formatApiError } from '../client';

describe('API Client Validation Middleware - Phase 22.14', () => {
  describe('ValidationError and SanitizationError classes', () => {
    it('should create ValidationError with correct properties', () => {
      const error = new ValidationError('Test validation failed', 'TEST_CODE', { field: 'email' });
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test validation failed');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ field: 'email' });
    });

    it('should create SanitizationError with correct properties', () => {
      const error = new SanitizationError('Test sanitization failed', 'SANITIZE_CODE');
      expect(error.name).toBe('SanitizationError');
      expect(error.message).toBe('Test sanitization failed');
      expect(error.code).toBe('SANITIZE_CODE');
    });
  });

  describe('Email validation', () => {
    it('should validate correct email format', () => {
      const result = apiClient.validateEmail('test@example.com');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid email format', () => {
      const result = apiClient.validateEmail('invalid-email');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject empty email', () => {
      const result = apiClient.validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email must be a non-empty string');
    });

    it('should reject email with SQL keywords', () => {
      const result = apiClient.validateEmail("test@example.com'; DROP TABLE users--");
      expect(result.valid).toBe(false);
    });
  });

  describe('Numeric field validation', () => {
    it('should validate numeric strings', () => {
      const result = apiClient.validateNumeric('123.45', 'amount');
      expect(result.valid).toBe(true);
    });

    it('should validate numbers', () => {
      const result = apiClient.validateNumeric(123, 'amount');
      expect(result.valid).toBe(true);
    });

    it('should reject NaN', () => {
      const result = apiClient.validateNumeric('not-a-number', 'amount');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a valid number');
    });

    it('should reject Infinity', () => {
      const result = apiClient.validateNumeric(Infinity, 'amount');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a finite number');
    });
  });

  describe('String field validation', () => {
    it('should validate safe strings', () => {
      const result = apiClient.validateString('normal text', 'description');
      expect(result.valid).toBe(true);
    });

    it('should reject strings with SQL keywords', () => {
      const result = apiClient.validateString('SELECT * FROM users', 'description');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('SQL');
    });

    it('should reject strings with script tags', () => {
      const result = apiClient.validateString('<script>alert("xss")</script>', 'description');
      expect(result.valid).toBe(false);
    });

    it('should reject strings with event handlers', () => {
      const result = apiClient.validateString('text onerror=alert("xss")', 'description');
      expect(result.valid).toBe(false);
    });

    it('should reject empty strings', () => {
      const result = apiClient.validateString('', 'description');
      expect(result.valid).toBe(false);
    });
  });

  describe('String sanitization', () => {
    it('should sanitize input strings', () => {
      const input = '<script>alert("xss")</script>';
      const sanitized = apiClient.sanitizeString(input);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('script');
    });

    it('should remove dangerous characters', () => {
      const input = 'text<>{}\'";`danger';
      const sanitized = apiClient.sanitizeString(input);
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
      expect(sanitized).not.toContain('{');
      expect(sanitized).not.toContain('}');
    });

    it('should remove javascript protocol', () => {
      const input = 'javascript:alert("xss")';
      const sanitized = apiClient.sanitizeString(input);
      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const input = 'text onclick=alert("xss")';
      const sanitized = apiClient.sanitizeString(input);
      expect(sanitized).not.toContain('onclick');
    });
  });

  describe('HTML sanitization', () => {
    it('should escape HTML entities', () => {
      const html = '<b>bold text</b>';
      const sanitized = apiClient.sanitizeHtml(html);
      // Should escape dangerous tags but convert to text content
      expect(sanitized).toBeTruthy();
    });

    it('should handle script tags in HTML', () => {
      const html = '<p>text</p><script>alert("xss")</script>';
      const sanitized = apiClient.sanitizeHtml(html);
      expect(sanitized).not.toContain('<script>');
    });
  });

  describe('formatApiError function', () => {
    it('should format ValidationError correctly', () => {
      const error = new ValidationError('Invalid input', 'INVALID_INPUT_CODE');
      const formatted = formatApiError(error);

      expect(formatted.error).toBe('INVALID_INPUT_CODE');
      expect(formatted.message).toBe('Invalid input');
      expect(formatted.statusCode).toBe(400);
    });

    it('should format SanitizationError correctly', () => {
      const error = new SanitizationError('Sanitization failed', 'SANITIZE_FAILED');
      const formatted = formatApiError(error);

      expect(formatted.error).toBe('SANITIZE_FAILED');
      expect(formatted.message).toBe('Sanitization failed');
      expect(formatted.statusCode).toBe(400);
    });

    it('should handle unknown errors', () => {
      const error = new Error('Unknown error');
      const formatted = formatApiError(error);

      expect(formatted.error).toBe('UNKNOWN_ERROR');
      expect(formatted.statusCode).toBe(500);
    });
  });

  describe('getValidationErrorDetails method', () => {
    it('should extract details from ValidationError', () => {
      const error = new ValidationError('Test error', 'TEST_CODE', { field: 'email' });
      const details = apiClient.getValidationErrorDetails(error);

      expect(details.message).toBe('Test error');
      expect(details.code).toBe('TEST_CODE');
      expect(details.details).toEqual({ field: 'email' });
    });

    it('should extract details from SanitizationError', () => {
      const error = new SanitizationError('Sanitize error', 'SANITIZE_CODE');
      const details = apiClient.getValidationErrorDetails(error);

      expect(details.message).toBe('Sanitize error');
      expect(details.code).toBe('SANITIZE_CODE');
    });

    it('should handle unknown error types', () => {
      const details = apiClient.getValidationErrorDetails(new Error('Generic error'));

      expect(details.code).toBe('UNKNOWN_ERROR');
      expect(details.message).toContain('Unknown');
    });
  });

  describe('Client configuration', () => {
    it('should have API client instance', () => {
      expect(apiClient).toBeDefined();
    });

    it('should have axios instance', () => {
      const axiosInstance = apiClient.getAxiosInstance();
      expect(axiosInstance).toBeDefined();
    });

    it('should allow setting base URL', () => {
      const originalUrl = apiClient.getBaseURL();
      apiClient.setBaseURL('http://new-url.com');
      expect(apiClient.getBaseURL()).toBe('http://new-url.com');
      // Restore original
      apiClient.setBaseURL(originalUrl);
    });
  });
});
