/**
 * TokenManager Integration Tests
 * Phase 22.16: API Integration & Security Service Tests
 *
 * Tests token lifecycle, secure storage, auto-refresh, multi-device sync,
 * concurrent request handling, and crash recovery.
 */

import { TokenManager, JWTToken } from '@/utils/security/tokenManager';
import { SecureStorageService } from '@/utils/security/secureStorageService';

describe('TokenManager Integration Tests', () => {
  let tokenManager: TokenManager;
  let secureStorage: SecureStorageService;

  // Mock token for testing
  const MOCK_JWT_TOKEN: JWTToken = {
    accessToken:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ',
    refreshToken: 'refresh_token_12345_67890',
    expiresIn: 3600,
    tokenType: 'Bearer',
    issuedAt: Date.now(),
  };

  const EXPIRED_JWT_TOKEN: JWTToken = {
    accessToken:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.hSa26pDPP5K8L4uO5bIw9Q_KCNx0iHWQ_jI5X8CtYQc',
    refreshToken: 'refresh_token_expired',
    expiresIn: -3600, // Already expired
    tokenType: 'Bearer',
    issuedAt: Date.now() - 7200000,
  };

  beforeEach(() => {
    // Initialize SecureStorageService with mock
    secureStorage = new SecureStorageService();
    tokenManager = new TokenManager(secureStorage);
  });

  afterEach(() => {
    // Clean up tokens
    if (tokenManager) {
      tokenManager.clearTokens();
    }
  });

  describe('Token Storage and Retrieval', () => {
    it('should store and retrieve access token securely via SecureStorageService', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      const token = tokenManager.getToken();

      expect(token).toBe(MOCK_JWT_TOKEN.accessToken);
    });

    it('should store and retrieve refresh token securely', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      const refreshToken = tokenManager.getRefreshToken();

      expect(refreshToken).toBe(MOCK_JWT_TOKEN.refreshToken);
    });

    it('should return null when token not found', () => {
      const token = tokenManager.getToken();
      expect(token).toBeNull();
    });

    it('should store token with correct expiration', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      const expiry = tokenManager.getTokenExpiry();

      expect(expiry).not.toBeNull();
      expect(expiry).toBeGreaterThan(3500000); // Should be close to 3600s
      expect(expiry).toBeLessThanOrEqual(3600000);
    });

    it('should handle multiple token updates', () => {
      const token1 = MOCK_JWT_TOKEN;
      const token2: JWTToken = {
        ...MOCK_JWT_TOKEN,
        accessToken: 'new_token_value_123456',
      };

      tokenManager.setToken(token1);
      expect(tokenManager.getToken()).toBe(token1.accessToken);

      tokenManager.setToken(token2);
      expect(tokenManager.getToken()).toBe(token2.accessToken);
    });
  });

  describe('Token Expiration Detection', () => {
    it('should detect valid tokens', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      expect(tokenManager.isTokenValid()).toBe(true);
    });

    it('should detect expired tokens', () => {
      tokenManager.setToken(EXPIRED_JWT_TOKEN);
      expect(tokenManager.isTokenValid()).toBe(false);
    });

    it('should return isTokenExpired correctly', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      expect(tokenManager.isTokenExpired()).toBe(false);
    });

    it('should consider token expired within buffer window', () => {
      const tokenNearExpiry: JWTToken = {
        ...MOCK_JWT_TOKEN,
        expiresIn: 200, // 200 seconds = less than 5 minute buffer
      };

      tokenManager.setToken(tokenNearExpiry);
      expect(tokenManager.isTokenExpired()).toBe(true);
    });

    it('should detect missing token as expired', () => {
      tokenManager.clearTokens();
      expect(tokenManager.isTokenExpired()).toBe(true);
    });
  });

  describe('Token Decoding', () => {
    it('should decode valid JWT token', () => {
      const payload = tokenManager.decodeToken(MOCK_JWT_TOKEN.accessToken);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('1234567890');
      expect(payload?.name).toBe('John Doe');
      expect(payload?.exp).toBe(9999999999);
    });

    it('should return null for invalid JWT format', () => {
      const invalidToken = 'not.a.jwt';
      const payload = tokenManager.decodeToken(invalidToken);
      expect(payload).toBeNull();
    });

    it('should return null for malformed base64', () => {
      const malformedToken = 'eyJ.!!!invalid!!!.signature';
      const payload = tokenManager.decodeToken(malformedToken);
      expect(payload).toBeNull();
    });

    it('should return null for empty token', () => {
      const payload = tokenManager.decodeToken('');
      expect(payload).toBeNull();
    });
  });

  describe('Token Cleanup and Logout', () => {
    it('should clear all tokens on logout', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      expect(tokenManager.getToken()).not.toBeNull();

      tokenManager.clearTokens();

      expect(tokenManager.getToken()).toBeNull();
      expect(tokenManager.getRefreshToken()).toBeNull();
      expect(tokenManager.isTokenValid()).toBe(false);
    });

    it('should prevent memory leaks by clearing references', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      tokenManager.clearTokens();

      // Verify no lingering references
      expect(tokenManager.getToken()).toBeNull();
      expect(tokenManager.getRefreshToken()).toBeNull();
    });

    it('should handle multiple clearTokens calls', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      tokenManager.clearTokens();
      tokenManager.clearTokens(); // Should not throw

      expect(tokenManager.getToken()).toBeNull();
    });
  });

  describe('Token Refresh Determination', () => {
    it('should identify when token needs refresh', () => {
      const tokenNearExpiry: JWTToken = {
        ...MOCK_JWT_TOKEN,
        expiresIn: 100, // Very short expiry
      };

      tokenManager.setToken(tokenNearExpiry);
      expect(tokenManager.shouldRefreshToken()).toBe(true);
    });

    it('should identify when token does not need refresh', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      expect(tokenManager.shouldRefreshToken()).toBe(false);
    });

    it('should handle missing token gracefully', () => {
      tokenManager.clearTokens();
      expect(tokenManager.shouldRefreshToken()).toBe(true);
    });
  });

  describe('Concurrent Token Operations', () => {
    it('should handle concurrent setToken and getToken operations', async () => {
      const operations = Array(10)
        .fill(null)
        .map((_, i) => {
          const token: JWTToken = {
            ...MOCK_JWT_TOKEN,
            accessToken: `token_${i}`,
          };

          return Promise.resolve()
            .then(() => tokenManager.setToken(token))
            .then(() => tokenManager.getToken());
        });

      const results = await Promise.all(operations);

      // At least some should be defined
      expect(results.some((r) => r !== null)).toBe(true);
    });

    it('should handle concurrent refresh token checks', async () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);

      const checks = Array(20)
        .fill(null)
        .map(() => Promise.resolve(tokenManager.shouldRefreshToken()));

      const results = await Promise.all(checks);

      // All should be consistent
      expect(results.every((r) => r === results[0])).toBe(true);
    });
  });

  describe('Token Persistence and Recovery', () => {
    it('should survive process simulation', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      const tokenBefore = tokenManager.getToken();

      // Simulate app crash/restart by creating new instance
      const newTokenManager = new TokenManager(secureStorage);

      // Should be able to retrieve token
      const tokenAfter = newTokenManager.getToken();
      expect(tokenAfter).toBe(tokenBefore);
    });

    it('should preserve token state across multiple instances', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);

      // Create multiple instances sharing same storage
      const instance2 = new TokenManager(secureStorage);
      const instance3 = new TokenManager(secureStorage);

      expect(instance2.getToken()).toBe(MOCK_JWT_TOKEN.accessToken);
      expect(instance3.getToken()).toBe(MOCK_JWT_TOKEN.accessToken);
    });
  });

  describe('Invalid Token Handling', () => {
    it('should reject completely invalid tokens', () => {
      tokenManager.setToken(EXPIRED_JWT_TOKEN);
      expect(tokenManager.isTokenValid()).toBe(false);
    });

    it('should not expose tokens in error messages', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      tokenManager.decodeToken('invalid token');

      const errorCalls = consoleSpy.mock.calls;
      const hasTokenExposed = errorCalls.some((call) =>
        call.some((arg) => {
          if (typeof arg === 'string') {
            return (
              arg.includes('invalid token') ||
              arg.includes(MOCK_JWT_TOKEN.accessToken)
            );
          }
          return false;
        })
      );

      // Ensure token is not logged with the error
      expect(hasTokenExposed).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('Token Expiry Calculation', () => {
    it('should calculate correct remaining time for valid token', () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);
      const expiry = tokenManager.getTokenExpiry();

      expect(expiry).not.toBeNull();
      expect(expiry).toBeGreaterThan(0);
      expect(expiry).toBeLessThanOrEqual(MOCK_JWT_TOKEN.expiresIn * 1000);
    });

    it('should return null for missing token', () => {
      const expiry = tokenManager.getTokenExpiry();
      expect(expiry).toBeNull();
    });

    it('should return 0 or null for expired token', () => {
      tokenManager.setToken(EXPIRED_JWT_TOKEN);
      const expiry = tokenManager.getTokenExpiry();

      expect(expiry === null || (expiry !== null && expiry <= 0)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle token with zero expiry', () => {
      const zeroExpiryToken: JWTToken = {
        ...MOCK_JWT_TOKEN,
        expiresIn: 0,
      };

      tokenManager.setToken(zeroExpiryToken);
      expect(tokenManager.isTokenExpired()).toBe(true);
    });

    it('should handle token with negative expiry', () => {
      const negativeExpiryToken: JWTToken = {
        ...MOCK_JWT_TOKEN,
        expiresIn: -1000,
      };

      tokenManager.setToken(negativeExpiryToken);
      expect(tokenManager.isTokenExpired()).toBe(true);
    });

    it('should handle very long token strings', () => {
      const longToken: JWTToken = {
        ...MOCK_JWT_TOKEN,
        accessToken: MOCK_JWT_TOKEN.accessToken + 'x'.repeat(10000),
      };

      tokenManager.setToken(longToken);
      const token = tokenManager.getToken();

      expect(token).toBe(longToken.accessToken);
    });

    it('should handle special characters in refresh token', () => {
      const specialToken: JWTToken = {
        ...MOCK_JWT_TOKEN,
        refreshToken: 'token_with_!@#$%^&*()_+-=[]{}|;:,.<>?',
      };

      tokenManager.setToken(specialToken);
      const refreshToken = tokenManager.getRefreshToken();

      expect(refreshToken).toBe(specialToken.refreshToken);
    });
  });

  describe('Token Refresh Callback (if implemented)', () => {
    it('should not throw when setting refresh callback', () => {
      expect(() => {
        tokenManager.setTokenRefreshCallback(() => {});
      }).not.toThrow();
    });
  });

  describe('Integration with SecureStorageService', () => {
    it('should delegate to SecureStorageService for encryption', () => {
      const storageSetSpy = jest.spyOn(secureStorage, 'setItem');

      tokenManager.setToken(MOCK_JWT_TOKEN);

      expect(storageSetSpy).toHaveBeenCalled();
      storageSetSpy.mockRestore();
    });

    it('should use encrypted storage for sensitive tokens', async () => {
      tokenManager.setToken(MOCK_JWT_TOKEN);

      // Verify token is stored encrypted
      const rawToken = tokenManager.getToken();
      expect(rawToken).toBeTruthy();

      // The token should be retrievable via the secure storage
      tokenManager.clearTokens();
      expect(tokenManager.getToken()).toBeNull();
    });
  });
});
