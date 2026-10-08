/**
 * Tests for TokenManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenManager } from '../../services/security/TokenManager';

describe('TokenManager', () => {
  beforeEach(() => {
    // Clear storage before each test
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      localStorage.clear();
    }
  });

  afterEach(() => {
    TokenManager.clearTokens();
  });

  describe('setTokens and getAccessToken', () => {
    it('should store and retrieve access token', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      TokenManager.setTokens(token);
      const storedToken = TokenManager.getAccessToken();

      expect(storedToken).toBe(token);
    });

    it('should return null if no token is stored', () => {
      const token = TokenManager.getAccessToken();
      expect(token).toBeNull();
    });

    it('should store refresh token', () => {
      const accessToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const refreshToken = 'refresh-token-123';

      TokenManager.setTokens(accessToken, refreshToken);
      const storedRefreshToken = TokenManager.getRefreshToken();

      expect(storedRefreshToken).toBe(refreshToken);
    });
  });

  describe('validateTokenFormat', () => {
    it('should validate correct JWT format', () => {
      const validToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      expect(() => TokenManager.validateTokenFormat(validToken)).not.toThrow();
    });

    it('should reject empty token', () => {
      expect(() => TokenManager.validateTokenFormat('')).toThrow();
    });

    it('should reject token with wrong number of parts', () => {
      expect(() => TokenManager.validateTokenFormat('part1.part2')).toThrow();
    });

    it('should reject invalid base64 encoding', () => {
      expect(() => TokenManager.validateTokenFormat('!!!.!!!.!!!')).toThrow();
    });
  });

  describe('decodeToken', () => {
    it('should decode valid JWT payload', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const payload = TokenManager.decodeToken(token);

      expect(payload.sub).toBe('1234567890');
      expect(payload.name).toBe('John Doe');
      expect(payload.exp).toBeDefined();
    });

    it('should throw error for invalid token', () => {
      expect(() => TokenManager.decodeToken('invalid.token.format')).toThrow();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      TokenManager.setTokens(token);
      const isExpired = TokenManager.isTokenExpired();

      expect(isExpired).toBe(false);
    });

    it('should return true if no token is stored', () => {
      const isExpired = TokenManager.isTokenExpired();
      expect(isExpired).toBe(true);
    });

    it('should return true if token is expired', () => {
      // Token with exp in the past (Jan 1, 1970)
      const expiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjEwMDB9.test';

      // Manually set expired token
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('app_access_token', expiredToken);
        sessionStorage.setItem('app_token_expires_at', '1000000'); // Very old timestamp
      }

      const isExpired = TokenManager.isTokenExpired();
      expect(isExpired).toBe(true);
    });
  });

  describe('getTimeUntilExpiration', () => {
    it('should return time until expiration in seconds', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      TokenManager.setTokens(token);
      const timeUntilExpiration = TokenManager.getTimeUntilExpiration();

      expect(timeUntilExpiration).toBeGreaterThan(0);
    });

    it('should return 0 if no token', () => {
      const time = TokenManager.getTimeUntilExpiration();
      expect(time).toBe(0);
    });
  });

  describe('getAuthorizationHeader', () => {
    it('should return Bearer token', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      TokenManager.setTokens(token);
      const header = TokenManager.getAuthorizationHeader();

      expect(header).toBe(`Bearer ${token}`);
    });

    it('should return null if no token', () => {
      const header = TokenManager.getAuthorizationHeader();
      expect(header).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true if valid token', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      TokenManager.setTokens(token);
      const isAuthenticated = TokenManager.isAuthenticated();

      expect(isAuthenticated).toBe(true);
    });

    it('should return false if no token', () => {
      const isAuthenticated = TokenManager.isAuthenticated();
      expect(isAuthenticated).toBe(false);
    });
  });

  describe('clearTokens', () => {
    it('should clear all tokens', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      TokenManager.setTokens(token, 'refresh-token');
      TokenManager.clearTokens();

      expect(TokenManager.getAccessToken()).toBeNull();
      expect(TokenManager.getRefreshToken()).toBeNull();
      expect(TokenManager.isAuthenticated()).toBe(false);
    });
  });

  describe('getTokenInfo', () => {
    it('should return token info', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      TokenManager.setTokens(token, 'refresh-token');
      const info = TokenManager.getTokenInfo();

      expect(info).not.toBeNull();
      expect(info?.isValid).toBe(true);
      expect(info?.expiresIn).toBeGreaterThan(0);
      expect(info?.hasRefreshToken).toBe(true);
    });

    it('should return null if no token', () => {
      const info = TokenManager.getTokenInfo();
      expect(info).toBeNull();
    });
  });
});
