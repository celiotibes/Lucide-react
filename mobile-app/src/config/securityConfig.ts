/**
 * Security Configuration - Centralized security setup for the application
 */

import { TokenManager } from '../services/security/TokenManager';
import { CertificatePinningService } from '../services/security/CertificatePinningService';
import { createSecureAPIClient, SecureAPIClient } from '../services/api/secureAPIClient';
import type { ApiSecurityConfig } from '../utils/security/apiSecurity';

/**
 * Production certificate pins for common APIs
 * Generate hashes using: openssl s_client -connect domain.com:443 | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -hex
 */
const PRODUCTION_CERTIFICATE_PINS = {
  'api.example.com': [
    {
      domain: 'api.example.com',
      publicKeyHash:
        'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a',
      isBackup: false,
      description: 'Primary certificate pin',
    },
    {
      domain: 'api.example.com',
      publicKeyHash:
        'ddd5dd6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4b',
      isBackup: true,
      description: 'Backup certificate pin',
    },
  ],
};

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  apiBaseUrl: string;
  enableEncryption: boolean;
  enableCertificatePinning: boolean;
  enableSecureLogging: boolean;
  environment: 'development' | 'staging' | 'production';
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const env = (import.meta.env.MODE || 'development') as
    | 'development'
    | 'staging'
    | 'production';

  const configs: Record<string, EnvironmentConfig> = {
    development: {
      apiBaseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
      enableEncryption: false,
      enableCertificatePinning: false,
      enableSecureLogging: true,
      environment: 'development',
    },
    staging: {
      apiBaseUrl:
        import.meta.env.VITE_API_URL || 'https://staging-api.example.com/api',
      enableEncryption: true,
      enableCertificatePinning: true,
      enableSecureLogging: true,
      environment: 'staging',
    },
    production: {
      apiBaseUrl:
        import.meta.env.VITE_API_URL || 'https://api.example.com/api',
      enableEncryption: true,
      enableCertificatePinning: true,
      enableSecureLogging: false,
      environment: 'production',
    },
  };

  return configs[env];
}

/**
 * Initialize all security services
 */
export function initializeSecurityServices(): void {
  const config = getEnvironmentConfig();

  console.log('[Security] Initializing security services...', {
    environment: config.environment,
    encryption: config.enableEncryption,
    certificatePinning: config.enableCertificatePinning,
  });

  // Initialize certificate pinning
  if (config.enableCertificatePinning) {
    try {
      const pins = Object.values(PRODUCTION_CERTIFICATE_PINS).flat();
      CertificatePinningService.initialize({
        pins,
        enableLogging: config.enableSecureLogging,
      });

      const status = CertificatePinningService.getStatus();
      console.log('[Security] Certificate pinning initialized', status);
    } catch (error) {
      console.error('[Security] Failed to initialize certificate pinning:', error);
    }
  }

  // Clean up expired certificates periodically
  if (config.enableCertificatePinning) {
    setInterval(
      () => {
        CertificatePinningService.cleanup();
      },
      24 * 60 * 60 * 1000
    ); // Daily cleanup
  }

  console.log('[Security] Security services initialized');
}

/**
 * Create configured API client instances
 */
export function createConfiguredAPIClient(
  apiName: string = 'default'
): SecureAPIClient {
  const config = getEnvironmentConfig();

  const securityConfig: ApiSecurityConfig = {
    enableEncryption: config.enableEncryption,
    enableCertificatePinning: config.enableCertificatePinning,
    encryptionFields: [
      'password',
      'ssn',
      'creditCard',
      'cvv',
      'bankAccount',
      'routingNumber',
    ],
    decryptionFields: [
      'password',
      'ssn',
      'creditCard',
      'cvv',
      'bankAccount',
      'routingNumber',
    ],
  };

  const client = createSecureAPIClient(config.apiBaseUrl, securityConfig);

  // Add custom error handler for tokens
  client.addErrorInterceptor(async (error) => {
    if (error.status === 401) {
      // Clear tokens and redirect to login
      console.warn('[Security] Unauthorized access, clearing tokens');
      TokenManager.clearTokens();
      window.location.href = '/login';
    }
    throw error;
  });

  // Add request logging in debug mode
  if (config.enableSecureLogging) {
    client.addRequestInterceptor(async (requestConfig) => {
      console.log(`[${apiName}] Request:`, {
        method: requestConfig.method,
        url: requestConfig.url,
        timestamp: new Date().toISOString(),
      });
      return requestConfig;
    });

    client.addResponseInterceptor(async (response) => {
      console.log(`[${apiName}] Response:`, {
        status: response.status,
        duration: response.duration,
        timestamp: new Date().toISOString(),
      });
      return response;
    });
  }

  return client;
}

/**
 * Initialize authentication
 */
export async function initializeAuthentication(): Promise<void> {
  const token = TokenManager.getAccessToken();

  if (!token) {
    console.log('[Auth] No stored token found');
    return;
  }

  if (TokenManager.isTokenExpired()) {
    console.warn('[Auth] Token expired, clearing');
    TokenManager.clearTokens();
    window.location.href = '/login';
    return;
  }

  const info = TokenManager.getTokenInfo();
  if (info) {
    console.log('[Auth] User authenticated', {
      expiresIn: info.expiresIn,
      hasRefreshToken: info.hasRefreshToken,
    });
  }
}

/**
 * Setup token refresh interval
 */
export function setupTokenRefreshInterval(
  refreshTokenFn: () => Promise<string>,
  bufferSeconds: number = 300
): void {
  const checkInterval = 60000; // Check every minute

  const tokenRefreshInterval = setInterval(async () => {
    const timeUntilExpiration = TokenManager.getTimeUntilExpiration();

    if (timeUntilExpiration > 0 && timeUntilExpiration < bufferSeconds) {
      console.log('[Auth] Token expiring soon, refreshing...');

      try {
        const newToken = await refreshTokenFn();
        TokenManager.setTokens(newToken);
        console.log('[Auth] Token refreshed successfully');
      } catch (error) {
        console.error('[Auth] Failed to refresh token:', error);
        TokenManager.clearTokens();
        window.location.href = '/login';
      }
    }
  }, checkInterval);

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    clearInterval(tokenRefreshInterval);
  });
}

/**
 * Complete initialization function to call on app startup
 */
export async function initializeApp(): Promise<void> {
  console.log('[App] Initializing application security...');

  try {
    // Initialize security services
    initializeSecurityServices();

    // Initialize authentication
    await initializeAuthentication();

    console.log('[App] Application security initialized successfully');
  } catch (error) {
    console.error('[App] Failed to initialize application:', error);
    throw error;
  }
}
