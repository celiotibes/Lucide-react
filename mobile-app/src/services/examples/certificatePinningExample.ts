/**
 * Certificate Pinning Integration Example
 * Phase 22.14 Security Hardening
 *
 * This file demonstrates how to use certificate pinning with the APIClient
 * to validate SSL/TLS certificates before making API requests.
 */

import { APIClient, PinningError, ValidationError } from '../APIClient';

/**
 * Example 1: Initialize API client with certificate pinning enabled
 */
export function initializeSecureAPIClient(): APIClient {
  const client = new APIClient({
    baseURL: 'https://api.example.com',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    enableCertificatePinning: true,
    pinnedHosts: ['api.example.com', 'sentry.io'],
  });

  return client;
}

/**
 * Example 2: Add pinned certificates for critical hosts
 */
export function setupCriticalHostPinning(client: APIClient): void {
  // Add primary certificate for API server
  client.addPinnedCertificate(
    'api.example.com',
    'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBALRiMLAA...', // Public key
    undefined, // Uses default expiry (24 hours)
    false // Not a backup
  );

  // Add backup certificate for failover
  client.addPinnedCertificate(
    'api.example.com',
    'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAMxrH/...', // Backup public key
    undefined,
    true // This is a backup certificate
  );

  // Add certificate for Sentry crash reporting endpoint
  client.addPinnedCertificate(
    'sentry.io',
    'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAO9qN/...'
  );

  console.log('✅ Certificate pinning configured for critical hosts');
}

/**
 * Example 3: Making requests with automatic certificate validation
 */
export async function makeSecureRequest(client: APIClient): Promise<void> {
  try {
    // Certificate validation happens automatically before the request
    const response = await client.get('/api/documents');

    if (response.success) {
      console.log('✅ Request successful with valid certificate');
      console.log('Response data:', response.data);
    } else {
      console.error('❌ Request failed:', response.error);
    }
  } catch (error) {
    if (error instanceof PinningError) {
      console.error('🔒 Certificate pinning validation failed:', {
        host: error.host,
        message: error.message,
        timestamp: new Date(error.timestamp).toISOString(),
      });
    } else if (error instanceof ValidationError) {
      console.error('🔒 Certificate chain validation failed:', {
        host: error.host,
        reason: error.reason,
        message: error.message,
        timestamp: new Date(error.timestamp).toISOString(),
      });
    } else {
      console.error('❌ Unexpected error:', error);
    }
  }
}

/**
 * Example 4: Making authenticated requests
 */
export async function makeAuthenticatedSecureRequest(
  client: APIClient,
  authToken: string
): Promise<void> {
  // Set authentication token
  client.setAuthToken(authToken);

  try {
    // Certificate validation + authentication combined
    const response = await client.post('/api/documents', {
      title: 'New Document',
      content: 'Document content...',
    });

    if (response.success) {
      console.log('✅ Authenticated request successful');
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
  } finally {
    // Clear token when done
    client.clearAuthToken();
  }
}

/**
 * Example 5: Monitoring validation attempts and failures
 */
export function monitorCertificateValidation(client: APIClient): void {
  // Get all validation logs
  const logs = client.getValidationLogs();

  console.log('📊 Certificate Validation Summary:');
  console.log(`Total validation attempts: ${logs.length}`);

  // Analyze by method
  const byMethod = logs.reduce((acc, log) => {
    acc[log.method] = (acc[log.method] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Validation methods:', byMethod);

  // Count failures
  const failures = logs.filter((log) => !log.success);
  console.log(`Validation failures: ${failures.length}`);

  if (failures.length > 0) {
    console.log('\n⚠️  Recent validation failures:');
    failures.slice(-5).forEach((log) => {
      console.log(`  - ${log.host}: ${log.error} (${log.method})`);
    });
  }
}

/**
 * Example 6: Batch requests with certificate validation
 */
export async function makeBatchSecureRequests(client: APIClient): Promise<void> {
  try {
    const results = await client.batch([
      {
        method: 'GET',
        endpoint: '/api/documents',
      },
      {
        method: 'GET',
        endpoint: '/api/transactions',
      },
      {
        method: 'GET',
        endpoint: '/api/properties',
      },
    ]);

    console.log(`✅ Batch request completed: ${results.length} requests`);

    results.forEach((result, index) => {
      if (result.success) {
        console.log(`  Request ${index + 1}: ✅ Success (HTTP ${result.status})`);
      } else {
        console.log(`  Request ${index + 1}: ❌ Failed - ${result.error}`);
      }
    });
  } catch (error) {
    console.error('❌ Batch request failed:', error);
  }
}

/**
 * Example 7: Handling certificate validation errors gracefully
 */
export async function handleValidationErrorsGracefully(
  client: APIClient
): Promise<void> {
  try {
    const response = await client.get('/api/sensitive-data');

    if (response.success) {
      console.log('✅ Sensitive data retrieved securely');
    }
  } catch (error) {
    if (error instanceof PinningError) {
      // Pinning validation failed - this is a security issue
      console.error('🚨 SECURITY ALERT: Certificate pinning failed');
      console.error('Details:', {
        host: error.host,
        fingerprint: error.fingerprint,
        timestamp: new Date(error.timestamp).toISOString(),
      });

      // Log security incident
      // await logSecurityIncident('certificate_pinning_failed', error);

      // Block the request - don't proceed
      throw error;
    } else if (error instanceof ValidationError) {
      // Standard validation failed - also a security concern
      console.error('🚨 SECURITY ALERT: Certificate validation failed');
      console.error('Details:', {
        host: error.host,
        reason: error.reason,
        timestamp: new Date(error.timestamp).toISOString(),
      });

      // Log security incident
      // await logSecurityIncident('certificate_validation_failed', error);

      throw error;
    } else {
      // Other errors
      console.error('❌ Request error:', error);
    }
  }
}

/**
 * Example 8: Clearing validation logs after analysis
 */
export function clearValidationLogs(client: APIClient): void {
  // Get stats before clearing
  const logs = client.getValidationLogs();
  console.log(`Clearing ${logs.length} validation logs`);

  // Clear logs
  client.clearValidationLogs();

  // Verify cleared
  const remaining = client.getValidationLogs();
  console.log(`Validation logs remaining: ${remaining.length}`);
}

/**
 * Example 9: Complete workflow - Secure initialization and usage
 */
export async function completeSecureWorkflow(): Promise<void> {
  // 1. Initialize secure API client
  const client = initializeSecureAPIClient();
  console.log('Step 1: ✅ API client initialized with certificate pinning');

  // 2. Setup pinning for critical hosts
  setupCriticalHostPinning(client);
  console.log('Step 2: ✅ Critical host pinning configured');

  // 3. Make requests
  try {
    // Single request
    console.log('Step 3: Making secure request...');
    await makeSecureRequest(client);

    // Batch requests
    console.log('Step 4: Making batch secure requests...');
    await makeBatchSecureRequests(client);

    // Monitor validation
    console.log('Step 5: Monitoring validation...');
    monitorCertificateValidation(client);

    // Cleanup
    console.log('Step 6: Clearing validation logs...');
    clearValidationLogs(client);
  } catch (error) {
    console.error('❌ Workflow failed:', error);
    throw error;
  }

  console.log('✅ Secure workflow completed successfully');
}

/**
 * Example 10: Testing certificate validation with custom configuration
 */
export function testCustomPinningConfiguration(): APIClient {
  // Create client with specific configuration
  const client = new APIClient({
    baseURL: 'https://staging-api.example.com',
    timeout: 10000,
    retryAttempts: 2,
    retryDelay: 500,
    enableCertificatePinning: true,
    pinnedHosts: ['staging-api.example.com'],
  });

  // Add staging certificate
  client.addPinnedCertificate(
    'staging-api.example.com',
    'staging-cert-public-key-xyz'
  );

  return client;
}
