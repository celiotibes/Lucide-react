/**
 * TokenManager - Manages JWT tokens with secure storage and validation
 * Features: Token storage, expiration checking, refresh token handling
 */

interface TokenPayload {
  iat: number;
  exp: number;
  sub: string;
  [key: string]: any;
}

interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: 'Bearer' | 'JWT';
}

export class TokenManager {
  private static readonly ACCESS_TOKEN_KEY = 'app_access_token';
  private static readonly REFRESH_TOKEN_KEY = 'app_refresh_token';
  private static readonly EXPIRES_AT_KEY = 'app_token_expires_at';
  private static readonly TOKEN_TYPE_KEY = 'app_token_type';
  private static readonly BUFFER_SECONDS = 300; // 5 minutes buffer

  /**
   * Store tokens securely
   */
  public static setTokens(
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number
  ): void {
    try {
      // Validate token format before storing
      this.validateTokenFormat(accessToken);

      const expiresAt = expiresIn
        ? Date.now() + expiresIn * 1000
        : this.extractExpirationFromToken(accessToken);

      // Store in secure storage (sessionStorage for sensitive, localStorage for refresh)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
        sessionStorage.setItem(
          this.EXPIRES_AT_KEY,
          expiresAt.toString()
        );
        sessionStorage.setItem(this.TOKEN_TYPE_KEY, 'Bearer');

        if (refreshToken) {
          // Store refresh token in localStorage with encryption marker
          localStorage.setItem(
            this.REFRESH_TOKEN_KEY,
            this.encodeRefreshToken(refreshToken)
          );
        }
      }
    } catch (error) {
      throw new Error(`Failed to store tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get access token
   */
  public static getAccessToken(): string | null {
    try {
      if (typeof window === 'undefined') return null;

      const token = sessionStorage.getItem(this.ACCESS_TOKEN_KEY);

      if (!token) return null;

      // Check if token is expired
      if (this.isTokenExpired()) {
        this.clearTokens();
        return null;
      }

      return token;
    } catch (error) {
      console.error('Error retrieving access token:', error);
      return null;
    }
  }

  /**
   * Get refresh token
   */
  public static getRefreshToken(): string | null {
    try {
      if (typeof window === 'undefined') return null;

      const encoded = localStorage.getItem(this.REFRESH_TOKEN_KEY);
      if (!encoded) return null;

      return this.decodeRefreshToken(encoded);
    } catch (error) {
      console.error('Error retrieving refresh token:', error);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  public static isTokenExpired(bufferSeconds = this.BUFFER_SECONDS): boolean {
    try {
      if (typeof window === 'undefined') return true;

      const expiresAtStr = sessionStorage.getItem(this.EXPIRES_AT_KEY);
      if (!expiresAtStr) return true;

      const expiresAt = parseInt(expiresAtStr, 10);
      const now = Date.now();
      const bufferMs = bufferSeconds * 1000;

      return now >= expiresAt - bufferMs;
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return true;
    }
  }

  /**
   * Get time until token expiration in seconds
   */
  public static getTimeUntilExpiration(): number {
    try {
      if (typeof window === 'undefined') return 0;

      const expiresAtStr = sessionStorage.getItem(this.EXPIRES_AT_KEY);
      if (!expiresAtStr) return 0;

      const expiresAt = parseInt(expiresAtStr, 10);
      const now = Date.now();
      const remainingMs = expiresAt - now;

      return Math.max(0, Math.floor(remainingMs / 1000));
    } catch (error) {
      console.error('Error calculating time until expiration:', error);
      return 0;
    }
  }

  /**
   * Validate token format and signature basic checks
   */
  public static validateTokenFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid token format: token must be a non-empty string');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error(
        'Invalid JWT format: token must have 3 parts separated by dots'
      );
    }

    // Validate base64 encoding
    parts.forEach((part, index) => {
      try {
        // Add padding if necessary
        const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
        atob(padded);
      } catch {
        throw new Error(`Invalid base64 encoding in JWT part ${index}`);
      }
    });

    return true;
  }

  /**
   * Extract expiration time from JWT
   */
  public static extractExpirationFromToken(token: string): number {
    try {
      const payload = this.decodeToken(token);
      if (!payload.exp) {
        throw new Error('Token does not contain exp claim');
      }
      return payload.exp * 1000; // Convert from seconds to milliseconds
    } catch (error) {
      throw new Error(
        `Failed to extract expiration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Decode JWT payload without verification (use only for expiration checks)
   */
  public static decodeToken(token: string): TokenPayload {
    try {
      this.validateTokenFormat(token);
      const payload = token.split('.')[1];
      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      const decoded = atob(padded);
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error(
        `Failed to decode token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get authorization header value
   */
  public static getAuthorizationHeader(): string | null {
    const token = this.getAccessToken();
    if (!token) return null;
    return `Bearer ${token}`;
  }

  /**
   * Clear all tokens
   */
  public static clearTokens(): void {
    if (typeof window === 'undefined') return;

    sessionStorage.removeItem(this.ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(this.EXPIRES_AT_KEY);
    sessionStorage.removeItem(this.TOKEN_TYPE_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }

  /**
   * Check if user is authenticated
   */
  public static isAuthenticated(): boolean {
    const token = this.getAccessToken();
    return token !== null && !this.isTokenExpired();
  }

  /**
   * Encode refresh token for storage
   */
  private static encodeRefreshToken(token: string): string {
    // Simple encoding - in production use proper encryption
    return Buffer.from(token).toString('base64');
  }

  /**
   * Decode refresh token from storage
   */
  private static decodeRefreshToken(encoded: string): string {
    // Simple decoding - in production use proper decryption
    return Buffer.from(encoded, 'base64').toString('utf-8');
  }

  /**
   * Get token details for debugging (no sensitive info)
   */
  public static getTokenInfo(): {
    isValid: boolean;
    expiresIn: number;
    hasRefreshToken: boolean;
  } | null {
    const token = this.getAccessToken();
    if (!token) return null;

    return {
      isValid: !this.isTokenExpired(),
      expiresIn: this.getTimeUntilExpiration(),
      hasRefreshToken: this.getRefreshToken() !== null,
    };
  }
}
