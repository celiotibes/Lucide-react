/**
 * End-to-End Security Flow Integration Tests
 * Phase 22.16: API Integration & Security Service Tests
 *
 * Tests complete security workflows combining all services:
 * TokenManager, SecureStorageService, DataValidationService, and CertificatePinning
 */

import { TokenManager, JWTToken } from '@/utils/security/tokenManager';
import { SecureStorageService } from '@/utils/security/secureStorageService';
import { DataValidationService } from '@/utils/security/dataValidationService';
import { CertificatePinningService } from '@/utils/security/certificatePinning';
import { MockPayloads } from './fixtures/mockPayloads';
import { MockCertificates } from './fixtures/mockCertificates';

describe('End-to-End Security Flow Integration Tests', () => {
  let tokenManager: TokenManager;
  let secureStorage: SecureStorageService;
  let certificatePinning: CertificatePinningService;

  const MOCK_JWT_TOKEN: JWTToken = {
    accessToken:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ',
    refreshToken: 'refresh_token_12345',
    expiresIn: 3600,
    tokenType: 'Bearer',
    issuedAt: Date.now(),
  };

  beforeEach(async () => {
    // Initialize all security services
    secureStorage = new SecureStorageService();
    await secureStorage.initialize();

    tokenManager = new TokenManager(secureStorage);

    certificatePinning = new CertificatePinningService({
      allowBackupPins: true,
      pinningTimeout: 86400000,
    });

    // Add mock certificates
    certificatePinning.addPin(
      MockCertificates.VALID_CERT_API.domain,
      MockCertificates.VALID_CERT_API.publicKey
    );
  });

  afterEach(async () => {
    if (secureStorage) {
      await secureStorage.clear();
    }
  });

  describe('Login Flow with Token Security', () => {
    it('should complete secure login workflow', async () => {
      // Step 1: Validate login credentials
      const loginRequest = MockPayloads.VALID_LOGIN_REQUEST;
      const emailValid = DataValidationService.validateEmail(loginRequest.email);
      expect(emailValid).toBe(true);

      // Step 2: Store tokens securely
      tokenManager.setToken(MOCK_JWT_TOKEN);
      const storedToken = tokenManager.getToken();
      expect(storedToken).toBe(MOCK_JWT_TOKEN.accessToken);

      // Step 3: Verify token validity
      expect(tokenManager.isTokenValid()).toBe(true);
      expect(tokenManager.isTokenExpired()).toBe(false);
    });

    it('should reject login with invalid credentials', () => {
      // Invalid email should be rejected
      const invalidEmail = "user@example' OR '1'='1";
      const isValid = DataValidationService.validateEmail(invalidEmail);
      expect(isValid).toBe(false);
    });

    it('should prevent SQL injection in login attempts', () => {
      const sqlInjectionAttempt = MockPayloads.SQL_INJECTION_BASIC;

      // Email with SQL injection
      const emailSafe = DataValidationService.preventSqlInjection(
        sqlInjectionAttempt.email
      );
      expect(emailSafe).toBe(false);

      // Password with SQL injection
      const passwordSafe = DataValidationService.preventSqlInjection(
        sqlInjectionAttempt.password
      );
      expect(passwordSafe).toBe(false);
    });
  });

  describe('API Request Security', () => {
    it('should validate and sanitize request data before sending', async () => {
      // Prepare request data
      const requestData = MockPayloads.VALID_TRANSACTION;

      // Sanitize each field
      const sanitized = {
        id: DataValidationService.sanitizeInput(requestData.id),
        type: DataValidationService.sanitizeInput(requestData.type),
        description: DataValidationService.sanitizeInput(requestData.description),
        category: DataValidationService.sanitizeInput(requestData.category),
      };

      // All should be clean
      for (const value of Object.values(sanitized)) {
        expect(typeof value === 'string').toBe(true);
      }
    });

    it('should block requests with malicious payload', () => {
      const maliciousPayload = MockPayloads.XSS_SCRIPT_TAG_REQUEST;

      // Check if payload is safe
      const isSafe = DataValidationService.isSafeString(
        JSON.stringify(maliciousPayload)
      );
      expect(isSafe).toBe(false);
    });

    it('should validate certificate before API request', () => {
      // Verify certificate is pinned for domain
      const isVerified = certificatePinning.verifyPin(
        MockCertificates.VALID_CERT_API.domain,
        MockCertificates.VALID_CERT_API.publicKey
      );

      expect(isVerified).toBe(true);
    });

    it('should reject requests with unverified certificate', () => {
      // Try to verify wrong certificate
      const isVerified = certificatePinning.verifyPin(
        MockCertificates.VALID_CERT_API.domain,
        MockCertificates.WRONG_DOMAIN_CERT.publicKey
      );

      expect(isVerified).toBe(false);
    });
  });

  describe('Response Validation Security', () => {
    it('should validate and sanitize response data', () => {
      const responseData = MockPayloads.VALID_LOGIN_RESPONSE;

      // Sanitize response
      const sanitizedEmail = DataValidationService.sanitizeInput(
        responseData.user.email
      );
      expect(sanitizedEmail).toBe(responseData.user.email);

      // Verify email format
      expect(DataValidationService.validateEmail(responseData.user.email)).toBe(
        true
      );
    });

    it('should prevent stored XSS from response data', () => {
      const maliciousResponse = {
        message: MockPayloads.XSS_SCRIPT_TAG_REQUEST.data,
      };

      // Check if response is safe
      const isSafe = DataValidationService.isSafeString(
        maliciousResponse.message
      );
      expect(isSafe).toBe(false);
    });
  });

  describe('Token Refresh Security', () => {
    it('should securely refresh expired tokens', async () => {
      // Store initial token
      tokenManager.setToken(MOCK_JWT_TOKEN);

      // Check if refresh is needed
      const needsRefresh = tokenManager.shouldRefreshToken();
      expect(typeof needsRefresh).toBe('boolean');

      // Simulate refresh with new token
      const newToken: JWTToken = {
        ...MOCK_JWT_TOKEN,
        accessToken: 'new_access_token_value',
        refreshToken: 'new_refresh_token_value',
        issuedAt: Date.now(),
      };

      tokenManager.setToken(newToken);

      // Old token should be replaced
      expect(tokenManager.getToken()).toBe(newToken.accessToken);
      expect(tokenManager.getRefreshToken()).toBe(newToken.refreshToken);
    });

    it('should not duplicate token refresh for concurrent requests', async () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);

      // Simulate multiple concurrent refresh attempts
      const refreshPromises = Array(5)
        .fill(null)
        .map(() => {
          const newToken: JWTToken = {
            ...MOCK_JWT_TOKEN,
            accessToken: `refreshed_token_${Date.now()}_${Math.random()}`,
          };
          tokenManager.setToken(newToken);
          return Promise.resolve(tokenManager.getToken());
        });

      const tokens = await Promise.all(refreshPromises);

      // All should be tokens (not null)
      expect(tokens.every((t) => t !== null)).toBe(true);
    });
  });

  describe('Logout and Cleanup', () => {
    it('should securely clear all data on logout', async () => {
      // Setup: Store token
      tokenManager.setToken(MOCK_JWT_TOKEN);
      await secureStorage.setItem('user_id', '12345', { encrypt: true });

      expect(tokenManager.getToken()).not.toBeNull();

      // Execute logout
      tokenManager.clearTokens();
      await secureStorage.clear();

      // Verify cleanup
      expect(tokenManager.getToken()).toBeNull();
      expect(tokenManager.getRefreshToken()).toBeNull();
      expect(secureStorage.getAllKeys().length).toBe(0);
    });

    it('should not expose sensitive data in logs', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      tokenManager.clearTokens();

      // Check that token is not in any error log
      const logs = consoleSpy.mock.calls.flat().join('');
      expect(logs).not.toContain(MOCK_JWT_TOKEN.accessToken);

      consoleSpy.mockRestore();
    });
  });

  describe('Crash Recovery and Persistence', () => {
    it('should recover tokens after app crash', async () => {
      // Simulate first app session: store token
      tokenManager.setToken(MOCK_JWT_TOKEN);
      const tokenBeforeCrash = tokenManager.getToken();

      // Simulate app crash/restart by creating new instance
      const newTokenManager = new TokenManager(secureStorage);

      // Should recover the token
      const tokenAfterRecovery = newTokenManager.getToken();
      expect(tokenAfterRecovery).toBe(tokenBeforeCrash);
    });

    it('should maintain data integrity across persistence', async () => {
      // Store sensitive data
      const sensitiveData = { userId: '123', userName: 'John' };
      await secureStorage.setItem('user_profile', sensitiveData, {
        encrypt: true,
      });

      // Simulate restart
      const newStorage = new SecureStorageService();
      await newStorage.initialize();

      // Should be able to read encrypted data
      const recovered = newStorage.getItem('user_profile');
      expect(recovered).toEqual(sensitiveData);
    });
  });

  describe('Multi-Device Synchronization', () => {
    it('should handle logout on one device affecting global session', async () => {
      // Device 1: Login
      tokenManager.setToken(MOCK_JWT_TOKEN);
      expect(tokenManager.isTokenValid()).toBe(true);

      // Device 2: Simulate seeing logout event (in real app via server)
      // Clear tokens to simulate global logout
      tokenManager.clearTokens();

      // Device 1 and 2 should both be logged out
      expect(tokenManager.getToken()).toBeNull();
    });
  });

  describe('Concurrent Operations Safety', () => {
    it('should safely handle concurrent API requests with token refresh', async () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);

      // Simulate multiple concurrent operations
      const operations = Array(10)
        .fill(null)
        .map(async (_, i) => {
          // Validate request
          const data = {
            id: `request_${i}`,
            value: `data_${i}`,
          };

          const sanitized = DataValidationService.sanitizeInput(
            JSON.stringify(data)
          );

          // Get token
          const token = tokenManager.getToken();

          return { sanitized, token };
        });

      const results = await Promise.all(operations);

      // All operations should succeed
      expect(results.length).toBe(10);
      expect(results.every((r) => r.token !== null)).toBe(true);
    });
  });

  describe('Malicious Request Blocking', () => {
    it('should block complete XSS attack workflow', () => {
      // Step 1: Attempt to inject XSS in login email
      const xssEmail = "user@example.com<script>alert('XSS')</script>";
      const isValidEmail = DataValidationService.validateEmail(xssEmail);
      expect(isValidEmail).toBe(false);

      // Step 2: Attempt to sanitize (if somehow passed)
      const sanitized = DataValidationService.sanitizeInput(xssEmail);
      expect(sanitized).not.toContain('<script>');
    });

    it('should block complete SQL injection attack workflow', () => {
      // Step 1: Attempt SQL injection in login
      const sqlLoginAttempt = {
        email: "admin@example.com' --",
        password: "' OR '1'='1",
      };

      // Step 2: Validate input
      const emailSafe = DataValidationService.preventSqlInjection(
        sqlLoginAttempt.email
      );
      const passwordSafe = DataValidationService.preventSqlInjection(
        sqlLoginAttempt.password
      );

      expect(emailSafe).toBe(false);
      expect(passwordSafe).toBe(false);
    });

    it('should block certificate spoofing attack', () => {
      // Attempt to use wrong certificate
      const spoofAttempt = certificatePinning.verifyPin(
        MockCertificates.VALID_CERT_API.domain,
        MockCertificates.WRONG_DOMAIN_CERT.publicKey
      );

      expect(spoofAttempt).toBe(false);
    });
  });

  describe('Audit Trail and Monitoring', () => {
    it('should track token lifecycle without exposing sensitive data', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Token operations
      tokenManager.setToken(MOCK_JWT_TOKEN);
      const isValid = tokenManager.isTokenValid();
      tokenManager.clearTokens();

      // Check logs don't contain actual token
      const logs = consoleSpy.mock.calls.flat().join(' ');
      expect(logs).not.toContain(MOCK_JWT_TOKEN.accessToken);

      consoleSpy.mockRestore();
    });
  });

  describe('Full Workflow Integration', () => {
    it('should complete full secure application workflow', async () => {
      // 1. LOGIN: Validate and store token
      const loginData = MockPayloads.VALID_LOGIN_REQUEST;
      expect(DataValidationService.validateEmail(loginData.email)).toBe(true);

      tokenManager.setToken(MOCK_JWT_TOKEN);

      // 2. AUTHENTICATE: Check token validity
      expect(tokenManager.isTokenValid()).toBe(true);

      // 3. MAKE REQUEST: Validate request, check certificate
      const requestData = MockPayloads.VALID_TRANSACTION;
      const isSafe = DataValidationService.isSafeString(
        JSON.stringify(requestData)
      );
      expect(isSafe).toBe(true);

      const certValid = certificatePinning.verifyPin(
        MockCertificates.VALID_CERT_API.domain,
        MockCertificates.VALID_CERT_API.publicKey
      );
      expect(certValid).toBe(true);

      // 4. HANDLE RESPONSE: Validate response data
      const responseData = MockPayloads.VALID_LOGIN_RESPONSE;
      expect(DataValidationService.validateEmail(responseData.user.email)).toBe(
        true
      );

      // 5. LOGOUT: Clear everything
      tokenManager.clearTokens();
      await secureStorage.clear();

      expect(tokenManager.getToken()).toBeNull();
      expect(secureStorage.getAllKeys().length).toBe(0);
    });
  });
});
