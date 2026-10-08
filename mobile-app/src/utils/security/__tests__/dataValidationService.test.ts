import { DataValidationService } from '../dataValidationService';

describe('DataValidationService', () => {
  describe('sanitizeInput', () => {
    it('should remove dangerous characters', () => {
      const input = '<script>alert("xss")</script>';
      const sanitized = DataValidationService.sanitizeInput(input);

      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
      expect(sanitized).not.toContain('"');
    });

    it('should remove javascript: protocol', () => {
      const input = 'javascript:alert("xss")';
      const sanitized = DataValidationService.sanitizeInput(input);

      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const input = 'onclick="alert(1)"';
      const sanitized = DataValidationService.sanitizeInput(input);

      expect(sanitized).not.toContain('onclick');
    });
  });

  describe('preventSqlInjection', () => {
    it('should detect SELECT statements', () => {
      const input = "test'; SELECT * FROM users; --";
      const safe = DataValidationService.preventSqlInjection(input);

      expect(safe).toBe(false);
    });

    it('should detect OR = patterns', () => {
      const input = "1' OR '1'='1";
      const safe = DataValidationService.preventSqlInjection(input);

      expect(safe).toBe(false);
    });

    it('should allow safe input', () => {
      const input = 'normal user input';
      const safe = DataValidationService.preventSqlInjection(input);

      expect(safe).toBe(true);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct emails', () => {
      expect(DataValidationService.validateEmail('test@example.com')).toBe(true);
      expect(DataValidationService.validateEmail('user.name@example.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(DataValidationService.validateEmail('invalid')).toBe(false);
      expect(DataValidationService.validateEmail('test@')).toBe(false);
      expect(DataValidationService.validateEmail('@example.com')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      expect(DataValidationService.validatePassword('SecureP@ss123')).toBe(true);
    });

    it('should reject weak passwords', () => {
      expect(DataValidationService.validatePassword('weak')).toBe(false);
      expect(DataValidationService.validatePassword('NoSpecialChar123')).toBe(false);
      expect(DataValidationService.validatePassword('nouppercase123!')).toBe(false);
    });
  });

  describe('escapeSpecialChars', () => {
    it('should escape HTML entities', () => {
      const input = '<script>alert("xss")</script>';
      const escaped = DataValidationService.escapeSpecialChars(input);

      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
      expect(escaped).toContain('&quot;');
    });
  });

  describe('isSafeString', () => {
    it('should identify safe strings', () => {
      expect(DataValidationService.isSafeString('Safe string')).toBe(true);
      expect(DataValidationService.isSafeString('123-456')).toBe(true);
    });

    it('should identify unsafe strings', () => {
      expect(DataValidationService.isSafeString('<script>alert(1)</script>')).toBe(false);
      expect(DataValidationService.isSafeString("'; DROP TABLE users; --")).toBe(false);
    });
  });
});
