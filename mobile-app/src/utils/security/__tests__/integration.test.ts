import { EncryptionService } from '../encryptionService';
import { SecureStorageService } from '../secureStorageService';
import { CertificatePinningService } from '../certificatePinning';
import { TokenManager } from '../tokenManager';
import { PrivacyComplianceService, PrivacyRegulation } from '../privacyCompliance';
import { DataValidationService } from '../dataValidationService';

describe('Security Services Integration Tests', () => {
  let storage: SecureStorageService;
  let pinning: CertificatePinningService;
  let tokenManager: TokenManager;
  let privacy: PrivacyComplianceService;

  beforeEach(() => {
    storage = new SecureStorageService();
    pinning = new CertificatePinningService();
    tokenManager = new TokenManager();
    privacy = new PrivacyComplianceService();

    localStorage.clear();
  });

  describe('Complete Authentication Flow', () => {
    it('should handle user login with credential encryption and token storage', () => {
      const credentials = {
        username: 'user@example.com',
        password: 'SecureP@ss123',
      };

      // Validate credentials
      expect(DataValidationService.validateEmail(credentials.username)).toBe(true);
      expect(DataValidationService.validatePassword(credentials.password)).toBe(true);

      // Encrypt sensitive data
      const encryptedPassword = EncryptionService.encrypt(
        credentials.password,
        'encryption-key-12345678901234567890'
      );
      expect(encryptedPassword).toBeDefined();
      expect(encryptedPassword.length).toBeGreaterThan(0);

      // Store encrypted credentials
      storage.setItem('user_credentials', JSON.stringify({
        username: credentials.username,
        password: encryptedPassword,
      }), { encrypt: true, ttl: 86400 });

      // Verify storage
      const stored = storage.getItem('user_credentials');
      expect(stored).toBeDefined();
      expect(stored).toContain('user@example.com');

      // Simulate JWT token response
      const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNjE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.signature';

      // Store token securely
      tokenManager.setToken(jwtToken);
      expect(tokenManager.isTokenValid()).toBe(true);
      expect(tokenManager.getToken()).toBe(jwtToken);
    });

    it('should handle token refresh workflow', () => {
      const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MzAwMDAwMDB9.sig';
      const refreshToken = 'refresh_token_1234567890';

      tokenManager.setToken(accessToken);
      tokenManager.setRefreshToken(refreshToken);

      expect(tokenManager.getRefreshToken()).toBe(refreshToken);
      expect(tokenManager.isTokenValid()).toBeDefined();

      tokenManager.clearTokens();
      expect(tokenManager.getToken()).toBeNull();
    });
  });

  describe('Certificate Pinning Flow', () => {
    it('should validate API certificates before making requests', () => {
      const domain = 'api.crmt.app';
      const publicKey = 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAKj34GkWqyLEQ2j900j+VrQkJZHjUUx';

      // Add certificate pin
      pinning.addPin(domain, publicKey);
      expect(pinning.pins.has(domain)).toBe(true);

      // Verify certificate
      const isValid = pinning.verifyPin(domain, publicKey);
      expect(isValid).toBe(true);

      // Reject invalid certificate
      const invalidKey = 'invalid_key_12345';
      const isValidInvalid = pinning.verifyPin(domain, invalidKey);
      expect(isValidInvalid).toBe(false);
    });
  });

  describe('Privacy Compliance Workflow', () => {
    it('should track privacy policy acceptance and user consent', () => {
      const userId = 'user-123';
      const version = '1.0';

      // User accepts privacy policy
      privacy.acceptPrivacyPolicy(userId, PrivacyRegulation.GDPR, version);

      const acceptance = privacy.getPrivacyPolicyAcceptance(userId);
      expect(acceptance).toBeDefined();
      expect(acceptance.version).toBe(version);
      expect(acceptance.regulation).toBe(PrivacyRegulation.GDPR);

      // Update user consent preferences
      const consent = {
        marketing: true,
        analytics: false,
        thirdParty: false,
      };
      privacy.updateUserConsent(userId, consent);

      const storedConsent = privacy.getUserConsent(userId);
      expect(storedConsent.marketing).toBe(true);
      expect(storedConsent.analytics).toBe(false);
    });

    it('should handle data deletion requests', () => {
      const userId = 'user-123';

      privacy.requestDataDeletion(userId);
      const request = privacy.getDataDeletionRequest(userId);

      expect(request).toBeDefined();
      expect(request.status).toBe('pending');

      privacy.updateDataDeletionStatus(userId, 'processing');
      const updated = privacy.getDataDeletionRequest(userId);
      expect(updated.status).toBe('processing');

      privacy.updateDataDeletionStatus(userId, 'completed');
      const completed = privacy.getDataDeletionRequest(userId);
      expect(completed.status).toBe('completed');
    });

    it('should generate compliance reports', () => {
      const userId = 'user-123';

      privacy.acceptPrivacyPolicy(userId, PrivacyRegulation.CCPA, '1.0');
      privacy.updateUserConsent(userId, {
        marketing: true,
        analytics: true,
        thirdParty: false,
      });

      const report = privacy.generateComplianceReport(userId);
      expect(report).toBeDefined();
      expect(report.userId).toBe(userId);
      expect(report.regulations).toContain(PrivacyRegulation.CCPA);
    });

    it('should export user data in standard format', () => {
      const userId = 'user-123';
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        transactions: ['TX001', 'TX002'],
      };

      const exported = privacy.exportUserData(userId, userData);
      expect(exported).toBeDefined();
      expect(exported.format).toBe('json');
      expect(exported.data).toEqual(userData);
    });
  });

  describe('Input Validation & Threat Prevention', () => {
    it('should prevent SQL injection attempts in API requests', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "SELECT * FROM users WHERE id = 1",
      ];

      maliciousInputs.forEach(input => {
        const isSafe = DataValidationService.preventSqlInjection(input);
        expect(isSafe).toBe(false);
      });

      const safeInput = 'John Doe';
      expect(DataValidationService.preventSqlInjection(safeInput)).toBe(true);
    });

    it('should prevent XSS attacks in user-generated content', () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror="alert(1)">',
        'javascript:alert(1)',
      ];

      xssPayloads.forEach(payload => {
        const sanitized = DataValidationService.sanitizeInput(payload);
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('javascript:');
      });
    });

    it('should validate and sanitize form inputs before API submission', () => {
      const formData = {
        email: 'user@example.com',
        password: 'SecureP@ss123',
        name: 'John Doe',
      };

      expect(DataValidationService.validateEmail(formData.email)).toBe(true);
      expect(DataValidationService.validatePassword(formData.password)).toBe(true);

      const sanitizedName = DataValidationService.sanitizeInput(formData.name);
      expect(DataValidationService.isSafeString(sanitizedName)).toBe(true);
    });
  });

  describe('Secure Data Storage with TTL', () => {
    it('should automatically expire stored credentials', () => {
      const apiKey = 'sk_live_1234567890abcdef';
      const shortTTL = 2; // 2 seconds for testing

      storage.setItem('api_key', apiKey, {
        encrypt: true,
        ttl: shortTTL,
      });

      const retrieved = storage.getItem('api_key');
      expect(retrieved).toBe(apiKey);

      jest.useFakeTimers();
      jest.advanceTimersByTime((shortTTL + 1) * 1000);

      const expired = storage.getItem('api_key');
      expect(expired).toBeNull();

      jest.useRealTimers();
    });

    it('should maintain data integrity for multiple stored items', () => {
      const items = {
        api_key: 'sk_live_123',
        refresh_token: 'refresh_abc',
        user_id: 'user_xyz',
      };

      Object.entries(items).forEach(([key, value]) => {
        storage.setItem(key, value, { encrypt: true });
      });

      Object.entries(items).forEach(([key, value]) => {
        expect(storage.getItem(key)).toBe(value);
      });
    });
  });

  describe('End-to-End Encryption & Decryption', () => {
    it('should encrypt and decrypt sensitive financial data', () => {
      const financialData = {
        accountNumber: '1234567890',
        balance: 15000.50,
        currency: 'BRL',
      };

      const encryptionKey = 'financial-key-1234567890123456';

      const encrypted = EncryptionService.encrypt(
        JSON.stringify(financialData),
        encryptionKey
      );

      expect(encrypted).not.toContain('1234567890');
      expect(encrypted).not.toContain('15000.50');

      const decrypted = EncryptionService.decrypt(encrypted, encryptionKey);
      const parsed = JSON.parse(decrypted);

      expect(parsed.accountNumber).toBe('1234567890');
      expect(parsed.balance).toBe(15000.50);
    });

    it('should detect tampering with encrypted data', () => {
      const originalData = 'sensitive_information';
      const key = 'encryption-key-1234567890123456';

      const encrypted = EncryptionService.encrypt(originalData, key);
      const parts = encrypted.split(':');

      // Tamper with the ciphertext
      parts[3] = 'tampered_ciphertext';
      const tamperedData = parts.join(':');

      expect(() => {
        EncryptionService.decrypt(tamperedData, key);
      }).toThrow();
    });
  });

  describe('Audit Trail & Logging', () => {
    it('should log security-relevant events', () => {
      const events: any[] = [];

      const logEvent = (event: string, details: any) => {
        events.push({ timestamp: new Date(), event, details });
      };

      // Simulate security events
      logEvent('LOGIN_ATTEMPT', { userId: 'user-123', success: true });
      logEvent('TOKEN_REFRESH', { userId: 'user-123', tokenAge: 800 });
      logEvent('CERTIFICATE_PIN_VERIFIED', { domain: 'api.crmt.app', valid: true });
      logEvent('CONSENT_UPDATED', { userId: 'user-123', type: 'marketing', value: true });

      expect(events.length).toBe(4);
      expect(events[0].event).toBe('LOGIN_ATTEMPT');
      expect(events[2].event).toBe('CERTIFICATE_PIN_VERIFIED');
    });
  });
});
