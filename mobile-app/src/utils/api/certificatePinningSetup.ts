/**
 * Certificate Pinning Setup
 * Phase 22.14 Security Hardening
 *
 * Initialize and configure certificate pinning for the API client
 * This module handles:
 * - Loading pinned certificates from configuration
 * - Setting up pinning for critical hosts
 * - Monitoring validation failures
 * - Logging security incidents
 */

import { APIClient } from '../../services/APIClient';
import { logger } from '../logger';

/**
 * Certificate configuration for critical hosts
 * In production, these would be loaded from a secure configuration service
 */
interface CertificateConfig {
  domain: string;
  primaryKey: string;
  backupKey?: string;
  expiresAt?: number;
}

/**
 * Production certificate pins
 * IMPORTANT: Update these with real certificate public keys
 */
const PRODUCTION_CERTIFICATES: CertificateConfig[] = [
  {
    domain: 'api.example.com',
    primaryKey: process.env.REACT_APP_API_CERT_PRIMARY || '',
    backupKey: process.env.REACT_APP_API_CERT_BACKUP || '',
  },
  {
    domain: 'sentry.io',
    primaryKey: process.env.REACT_APP_SENTRY_CERT_PRIMARY || '',
  },
];

/**
 * Staging certificate pins
 */
const STAGING_CERTIFICATES: CertificateConfig[] = [
  {
    domain: 'staging-api.example.com',
    primaryKey: process.env.REACT_APP_STAGING_API_CERT_PRIMARY || '',
    backupKey: process.env.REACT_APP_STAGING_API_CERT_BACKUP || '',
  },
];

/**
 * Get environment-specific certificates
 */
function getEnvironmentCertificates(): CertificateConfig[] {
  const env = process.env.NODE_ENV;

  switch (env) {
    case 'production':
      return PRODUCTION_CERTIFICATES.filter(cert => cert.primaryKey);
    case 'staging':
      return STAGING_CERTIFICATES.filter(cert => cert.primaryKey);
    default:
      // Development - empty or test certificates
      return [];
  }
}

/**
 * Initialize API client with certificate pinning
 */
export function initializeAPIClientWithPinning(): APIClient {
  const isProd = process.env.NODE_ENV === 'production';
  const baseURL = process.env.REACT_APP_API_BASE_URL || 'https://api.example.com';

  const client = new APIClient({
    baseURL,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    headers: {
      'User-Agent': 'SecureClient/2.14',
    },
    enableCertificatePinning: isProd,
    pinnedHosts: getEnvironmentCertificates().map(cert => cert.domain),
  });

  // Setup certificate pinning for critical hosts
  setupCertificatePinning(client);

  // Setup security monitoring
  setupSecurityMonitoring(client);

  logger.info('API client initialized with certificate pinning', {
    environment: process.env.NODE_ENV,
    baseURL,
    pinningEnabled: isProd,
  });

  return client;
}

/**
 * Setup certificate pinning for configured hosts
 */
function setupCertificatePinning(client: APIClient): void {
  const certificates = getEnvironmentCertificates();

  if (certificates.length === 0) {
    logger.debug('No certificate pinning configured for this environment');
    return;
  }

  certificates.forEach(cert => {
    try {
      // Add primary certificate
      if (cert.primaryKey) {
        client.addPinnedCertificate(
          cert.domain,
          cert.primaryKey,
          cert.expiresAt,
          false // primary
        );

        logger.debug(`Primary certificate pinned for ${cert.domain}`);
      }

      // Add backup certificate if available
      if (cert.backupKey) {
        client.addPinnedCertificate(
          cert.domain,
          cert.backupKey,
          cert.expiresAt,
          true // backup
        );

        logger.debug(`Backup certificate pinned for ${cert.domain}`);
      }
    } catch (error) {
      logger.error(
        `Failed to pin certificate for ${cert.domain}`,
        error
      );
    }
  });

  logger.info(`Certificate pinning configured for ${certificates.length} hosts`);
}

/**
 * Setup security monitoring and incident logging
 */
function setupSecurityMonitoring(client: APIClient): void {
  // Monitor validation failures
  const monitorInterval = setInterval(() => {
    const logs = client.getValidationLogs();
    const failures = logs.filter(log => !log.success);

    if (failures.length === 0) {
      return;
    }

    // Analyze failure patterns
    const failuresByHost = failures.reduce((acc, failure) => {
      if (!acc[failure.host]) {
        acc[failure.host] = [];
      }
      acc[failure.host].push(failure);
      return acc;
    }, {} as Record<string, typeof failures>);

    // Log concerning patterns
    Object.entries(failuresByHost).forEach(([host, hostFailures]) => {
      const recentFailures = hostFailures.slice(-10);
      const failureRate = (recentFailures.length / logs.length) * 100;

      if (failureRate > 10) {
        logger.warn(
          `High certificate validation failure rate for ${host}`,
          {
            failureRate: `${failureRate.toFixed(2)}%`,
            recentFailures: recentFailures.length,
          }
        );

        // Report security incident
        reportSecurityIncident(
          'high_validation_failure_rate',
          { host, failureRate, failures: recentFailures }
        );
      }
    });
  }, 5 * 60 * 1000); // Check every 5 minutes

  // Cleanup on window unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      clearInterval(monitorInterval);
    });
  }
}

/**
 * Report security incident to logging service
 */
async function reportSecurityIncident(
  type: string,
  details: any
): Promise<void> {
  try {
    const incident = {
      type,
      timestamp: new Date().toISOString(),
      severity: 'warning',
      details,
      environment: process.env.NODE_ENV,
      platform: typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
    };

    // Log locally
    logger.warn(`Security incident: ${type}`, details);

    // Send to security logging service (if configured)
    const securityLogEndpoint = process.env.REACT_APP_SECURITY_LOG_ENDPOINT;
    if (securityLogEndpoint) {
      try {
        await fetch(securityLogEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(incident),
        });
      } catch (fetchError) {
        logger.error('Failed to report security incident', fetchError);
      }
    }
  } catch (error) {
    logger.error('Error reporting security incident', error);
  }
}

/**
 * Get certificate validation stats for debugging
 */
export function getCertificateValidationStats(
  client: APIClient
): {
  totalValidations: number;
  successRate: number;
  failuresByHost: Record<string, number>;
  latestFailures: Array<{
    host: string;
    method: string;
    error: string;
    timestamp: string;
  }>;
} {
  const logs = client.getValidationLogs();
  const failures = logs.filter(log => !log.success);

  // Calculate stats
  const successRate = logs.length > 0
    ? ((logs.length - failures.length) / logs.length) * 100
    : 100;

  // Group failures by host
  const failuresByHost = failures.reduce((acc, failure) => {
    acc[failure.host] = (acc[failure.host] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get latest failures
  const latestFailures = failures.slice(-5).map(f => ({
    host: f.host,
    method: f.method,
    error: f.error || 'Unknown error',
    timestamp: new Date(f.timestamp).toISOString(),
  }));

  return {
    totalValidations: logs.length,
    successRate: parseFloat(successRate.toFixed(2)),
    failuresByHost,
    latestFailures,
  };
}

/**
 * Export validation logs for analysis
 */
export function exportValidationLogs(client: APIClient): string {
  const logs = client.getValidationLogs();
  const stats = getCertificateValidationStats(client);

  const report = {
    exportedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    statistics: stats,
    logs: logs.map(log => ({
      ...log,
      timestamp: new Date(log.timestamp).toISOString(),
    })),
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Rotate certificates (refresh or update expired ones)
 */
export function updateCertificates(
  client: APIClient,
  domain: string,
  newPrimaryKey: string,
  newBackupKey?: string
): void {
  try {
    // Calculate new expiry (30 days from now)
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

    // Add new certificates
    client.addPinnedCertificate(domain, newPrimaryKey, expiresAt, false);

    if (newBackupKey) {
      client.addPinnedCertificate(domain, newBackupKey, expiresAt, true);
    }

    logger.info(`Certificates rotated for ${domain}`, {
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    logger.error(`Failed to rotate certificates for ${domain}`, error);
    throw error;
  }
}

/**
 * Clear and reset security monitoring (for development/testing)
 */
export function resetSecurityMonitoring(client: APIClient): void {
  client.clearValidationLogs();
  logger.info('Security monitoring reset - validation logs cleared');
}
