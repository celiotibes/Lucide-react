import { SecureStorageService } from './secureStorageService';

export interface JWTToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  issuedAt: number;
}

export interface TokenPayload {
  sub: string;
  exp: number;
  iat: number;
  [key: string]: any;
}

export class TokenManager {
  private secureStorage: SecureStorageService;
  private readonly TOKEN_KEY = 'auth_token';
  private readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private readonly TOKEN_EXPIRY_BUFFER = 300000; // 5 minutes

  constructor(secureStorage?: SecureStorageService) {
    this.secureStorage = secureStorage || new SecureStorageService();
  }

  setToken(token: JWTToken): void {
    this.secureStorage.setItem(this.TOKEN_KEY, token.accessToken, { encrypt: true });
    this.secureStorage.setItem(this.REFRESH_TOKEN_KEY, token.refreshToken, { encrypt: true });
    this.secureStorage.setItem('token_expires_at', Date.now() + token.expiresIn * 1000, {
      encrypt: false,
    });
  }

  getToken(): string | null {
    return this.secureStorage.getItem<string>(this.TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return this.secureStorage.getItem<string>(this.REFRESH_TOKEN_KEY);
  }

  isTokenExpired(): boolean {
    const expiresAt = this.secureStorage.getItem<number>('token_expires_at');
    if (!expiresAt) return true;

    return Date.now() > expiresAt - this.TOKEN_EXPIRY_BUFFER;
  }

  isTokenValid(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = this.decodeToken(token);
      if (!payload) return false;

      return payload.exp * 1000 > Date.now();
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  clearTokens(): void {
    this.secureStorage.removeItem(this.TOKEN_KEY);
    this.secureStorage.removeItem(this.REFRESH_TOKEN_KEY);
    this.secureStorage.removeItem('token_expires_at');
  }

  decodeToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const decoded = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      console.error('Token decode error:', error);
      return null;
    }
  }

  getTokenExpiry(): number | null {
    const expiresAt = this.secureStorage.getItem<number>('token_expires_at');
    return expiresAt ? Math.max(0, expiresAt - Date.now()) : null;
  }

  shouldRefreshToken(): boolean {
    return this.isTokenExpired();
  }

  setTokenRefreshCallback(callback: (error?: Error) => void): void {
    if (typeof window !== 'undefined') {
      const checkInterval = setInterval(() => {
        if (this.shouldRefreshToken()) {
          clearInterval(checkInterval);
          callback();
        }
      }, 60000); // Check every minute
    }
  }
}
