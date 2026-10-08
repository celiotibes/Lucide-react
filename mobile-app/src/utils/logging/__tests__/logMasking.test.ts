/**
 * Log Masking Tests
 *
 * Comprehensive tests to verify that sensitive data is properly masked
 */

import { LogMasker, DEFAULT_MASKING_CONFIG } from '../logMasking';

describe('LogMasker', () => {
  let masker: LogMasker;

  beforeEach(() => {
    masker = new LogMasker();
  });

  // ===== BEARER TOKENS =====
  describe('Bearer Tokens', () => {
    test('should mask bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-TOKEN]');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    test('should mask case-insensitive bearer tokens', () => {
      const input = 'auth: bearer token123abc';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-TOKEN]');
    });
  });

  // ===== JWT TOKENS =====
  describe('JWT Tokens', () => {
    test('should mask JWT tokens', () => {
      const input = 'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-JWT]');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });
  });

  // ===== API KEYS =====
  describe('API Keys', () => {
    test('should mask api_key parameter', () => {
      const input = 'api_key: sk_live_51234567890abcdef';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-API-KEY]');
      expect(result).not.toContain('sk_live_51234567890abcdef');
    });

    test('should mask apiKey parameter', () => {
      const input = 'apiKey=abc123xyz789';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-API-KEY]');
    });

    test('should mask x-api-key header', () => {
      const input = 'x-api-key: secret-key-123';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-API-KEY]');
    });
  });

  // ===== AWS CREDENTIALS =====
  describe('AWS Credentials', () => {
    test('should mask AWS access keys', () => {
      const input = 'AKIA2ZWYNX2VLQY7WKBJ';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-AWS-ACCESS-KEY]');
    });

    test('should mask AWS secret keys', () => {
      const input = 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG+j8SN7F8VsRgQklxNe';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-AWS-SECRET-KEY]');
    });
  });

  // ===== PASSWORDS =====
  describe('Passwords', () => {
    test('should mask password field', () => {
      const input = 'password=MySecurePassword123!';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-PASSWORD]');
      expect(result).not.toContain('MySecurePassword123');
    });

    test('should mask pwd field', () => {
      const input = 'pwd: secretpassword';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-PASSWORD]');
    });

    test('should mask passwd field', () => {
      const input = 'passwd=mypassword123';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-PASSWORD]');
    });
  });

  // ===== DATABASE URLS =====
  describe('Database Connection Strings', () => {
    test('should mask MongoDB connection string', () => {
      const input = 'mongodb://user:password@db.example.com:27017/mydb';
      const result = masker.mask(input);
      expect(result).toContain('mongodb://[REDACTED-DATABASE-URL]');
      expect(result).not.toContain('user:password');
    });

    test('should mask PostgreSQL connection string', () => {
      const input = 'postgres://user:password@localhost:5432/database';
      const result = masker.mask(input);
      expect(result).toContain('postgres://[REDACTED-DATABASE-URL]');
    });

    test('should mask MySQL connection string', () => {
      const input = 'mysql://root:mypassword@localhost:3306/db';
      const result = masker.mask(input);
      expect(result).toContain('mysql://[REDACTED-DATABASE-URL]');
    });

    test('should mask Redis connection string', () => {
      const input = 'redis://user:password@redis.example.com:6379';
      const result = masker.mask(input);
      expect(result).toContain('redis://[REDACTED-DATABASE-URL]');
    });
  });

  // ===== CREDIT CARDS =====
  describe('Credit Card Numbers', () => {
    test('should mask valid credit card number', () => {
      const input = 'Card: 4532-1234-5678-9010';
      const result = masker.mask(input);
      expect(result).toContain('****-****-****-9010');
      expect(result).not.toContain('4532-1234-5678');
    });

    test('should mask credit card without separators', () => {
      const input = 'Payment with 4532123456789010';
      const result = masker.mask(input);
      expect(result).toContain('****-****-****-9010');
    });

    test('should show last 4 digits', () => {
      const input = '1234567890123456';
      const result = masker.mask(input);
      expect(result).toContain('3456');
    });
  });

  // ===== SOCIAL SECURITY NUMBERS =====
  describe('Social Security Numbers', () => {
    test('should mask SSN format XXX-XX-XXXX', () => {
      const input = 'SSN: 123-45-6789';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-SSN]');
      expect(result).not.toContain('123-45-6789');
    });

    test('should mask multiple SSNs', () => {
      const input = 'User1: 111-22-3333, User2: 444-55-6666';
      const result = masker.mask(input);
      const matches = result.match(/\[REDACTED-SSN\]/g) || [];
      expect(matches.length).toBe(2);
    });
  });

  // ===== EMAIL ADDRESSES =====
  describe('Email Addresses', () => {
    test('should mask email addresses', () => {
      const input = 'Contact: john@example.com';
      const result = masker.mask(input);
      expect(result).toContain('j****@example.com');
      expect(result).not.toContain('john@');
    });

    test('should mask emails with long usernames', () => {
      const input = 'firstname.lastname@domain.example.com';
      const result = masker.mask(input);
      expect(result).toContain('f****@');
    });

    test('should mask multiple emails', () => {
      const input = 'admin@example.com and user@example.com';
      const result = masker.mask(input);
      expect(result).toContain('a****@example.com');
      expect(result).toContain('u****@example.com');
    });
  });

  // ===== PHONE NUMBERS =====
  describe('Phone Numbers', () => {
    test('should mask US phone numbers', () => {
      const input = 'Phone: (555) 123-4567';
      const result = masker.mask(input);
      expect(result).toContain('***-***-4567');
      expect(result).not.toContain('555-123');
    });

    test('should mask international phone numbers', () => {
      const input = '+55 11 99999-8888';
      const result = masker.mask(input);
      expect(result).toContain('+55***');
      expect(result).toContain('8888');
    });

    test('should mask phone with different formats', () => {
      const input = '1-555-123-4567';
      const result = masker.mask(input);
      expect(result).toContain('***-***-4567');
    });
  });

  // ===== URL PARAMETERS =====
  describe('URL Parameters', () => {
    test('should mask token in URL', () => {
      const input = 'https://api.example.com?token=abc123xyz';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-URL-PARAM]');
      expect(result).not.toContain('abc123xyz');
    });

    test('should mask key in URL', () => {
      const input = 'https://example.com/page?key=secret';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-URL-PARAM]');
    });

    test('should mask password in URL', () => {
      const input = 'https://user:password@example.com/api?password=secret';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-URL-PARAM]');
    });

    test('should mask access_token parameter', () => {
      const input = 'https://api.example.com/v1?access_token=eyJhbGciOiJIUzI1NiJ9';
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-URL-PARAM]');
    });
  });

  // ===== PRIVATE KEYS =====
  describe('Private Keys', () => {
    test('should mask RSA private keys', () => {
      const input = `-----BEGIN RSA PRIVATE KEY-----
        MIIEpAIBAAKCAQEA2a2rwplBkRGLhA5dFm0hD5L...
        -----END RSA PRIVATE KEY-----`;
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-PRIVATE-KEY]');
    });

    test('should mask OpenSSH private keys', () => {
      const input = `-----BEGIN OPENSSH PRIVATE KEY-----
        b3BlbnNzaC1rZXktdjEAAAAABG5vbmU...
        -----END OPENSSH PRIVATE KEY-----`;
      const result = masker.mask(input);
      expect(result).toContain('[REDACTED-PRIVATE-KEY]');
    });
  });

  // ===== OBJECT MASKING =====
  describe('Object Masking', () => {
    test('should mask nested objects', () => {
      const obj = {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          auth: {
            token: 'Bearer abc123xyz',
            password: 'secret123',
          },
        },
      };

      const masked = masker.maskObject(obj);
      expect(JSON.stringify(masked)).not.toContain('john@example.com');
      expect(JSON.stringify(masked)).not.toContain('secret123');
      expect(JSON.stringify(masked)).not.toContain('abc123xyz');
    });

    test('should mask sensitive key names', () => {
      const obj = {
        apiKey: 'sk_live_123456',
        password: 'mypassword',
        creditCard: '4532-1234-5678-9010',
        ssn: '123-45-6789',
      };

      const masked = masker.maskObject(obj);
      expect(masked.apiKey).toBe('[REDACTED]');
      expect(masked.password).toBe('[REDACTED]');
      expect(masked.creditCard).toBe('[REDACTED]');
      expect(masked.ssn).toBe('[REDACTED]');
    });

    test('should handle arrays in objects', () => {
      const obj = {
        emails: ['john@example.com', 'jane@example.com'],
        data: [{ email: 'test@example.com' }],
      };

      const masked = masker.maskObject(obj);
      const stringified = JSON.stringify(masked);
      expect(stringified).not.toContain('john@example.com');
      expect(stringified).not.toContain('test@example.com');
    });
  });

  // ===== URL MASKING =====
  describe('URL Masking', () => {
    test('should mask URL with sensitive parameters', () => {
      const url = 'https://api.example.com/endpoint?token=abc123&key=secret&data=public';
      const masked = masker.maskURL(url);
      expect(masked).not.toContain('abc123');
      expect(masked).not.toContain('secret');
      expect(masked).toContain('data=public');
    });

    test('should preserve non-sensitive URL parts', () => {
      const url = 'https://api.example.com/endpoint?api_key=secret123&userId=123';
      const masked = masker.maskURL(url);
      expect(masked).toContain('https://api.example.com/endpoint');
      expect(masked).toContain('userId=123');
    });
  });

  // ===== CUSTOM PATTERNS =====
  describe('Custom Patterns', () => {
    test('should mask custom patterns', () => {
      const maskerWithCustom = new LogMasker();
      maskerWithCustom.registerPattern('customSecret', /secret_[a-z0-9]+/gi);

      const input = 'Custom secret: secret_abc123xyz';
      const result = maskerWithCustom.mask(input);
      expect(result).toContain('[REDACTED-CUSTOMSECRET]');
    });
  });

  // ===== CONFIGURATION =====
  describe('Configuration', () => {
    test('should respect masking configuration', () => {
      const maskerNoEmail = new LogMasker({
        ...DEFAULT_MASKING_CONFIG,
        maskEmails: false,
      });

      const input = 'Email: john@example.com';
      const result = maskerNoEmail.mask(input);
      expect(result).toContain('john@example.com');
    });

    test('should disable all masking if configured', () => {
      const maskerDisabled = new LogMasker({
        maskTokens: false,
        maskPasswords: false,
        maskEmails: false,
        maskPhoneNumbers: false,
        maskCreditCards: false,
        maskSSN: false,
        maskURLParams: false,
        maskAPIKeys: false,
      });

      const input = 'Password: secret, Email: john@example.com, Token: abc123';
      const result = maskerDisabled.mask(input);
      expect(result).toContain('secret');
      expect(result).toContain('john@example.com');
    });
  });

  // ===== STATISTICS =====
  describe('Statistics', () => {
    test('should count masked patterns', () => {
      const input = `
        Email: john@example.com
        Email: jane@example.com
        Token: Bearer abc123
        Credit Card: 4532-1234-5678-9010
      `;

      const stats = masker.getStats(input);
      expect(stats.totalMatches).toBeGreaterThan(0);
      expect(stats.maskedPatterns.email).toBe(2);
      expect(stats.maskedPatterns.bearer).toBeGreaterThan(0);
    });
  });

  // ===== EDGE CASES =====
  describe('Edge Cases', () => {
    test('should handle empty strings', () => {
      expect(masker.mask('')).toBe('');
      expect(masker.maskObject({})).toEqual({});
    });

    test('should handle null and undefined', () => {
      expect(masker.mask(null)).toBe(null);
      expect(masker.mask(undefined)).toBe(undefined);
    });

    test('should handle circular references gracefully', () => {
      const obj: any = { name: 'John' };
      obj.self = obj;

      expect(() => masker.maskObject(obj)).not.toThrow();
    });

    test('should handle very large objects', () => {
      const largeObj = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          email: `user${i}@example.com`,
        })),
      };

      const masked = masker.maskObject(largeObj);
      expect(masked.items).toHaveLength(1000);
    });
  });
});
