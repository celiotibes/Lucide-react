/**
 * Logging System Examples
 *
 * Demonstrates usage of the secure logging system with data masking
 */

import { secureLogger, LogLevel } from './logger';
import { logMasker } from './logMasking';
import { createRemoteLogger, RemoteLoggerProvider } from './remoteLogger';
import { auditLogger, AuditEventType } from './auditLog';

/**
 * Example 1: Basic logging with automatic masking
 */
export function example1_basicLogging() {
  console.log('\n=== Example 1: Basic Logging ===');

  // Sensitive data is automatically masked
  secureLogger.info('User login successful', {
    userId: 'user@example.com',
    token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    password: 'secret123',
  });

  secureLogger.warn('API rate limit approaching', {
    remaining: 95,
    resetTime: '2024-01-15T10:30:00Z',
  });

  secureLogger.error('Database connection failed', new Error('Connection timeout'));
}

/**
 * Example 2: Module-based logging
 */
export function example2_moduleLogging() {
  console.log('\n=== Example 2: Module Logging ===');

  secureLogger.info('User authenticated', { userId: 'john@example.com' }, 'AuthService');
  secureLogger.info('Payment processed', { amount: 99.99, orderId: 'ORD-123' }, 'PaymentService');
  secureLogger.warn('Cache miss detected', { cacheKey: 'user-data-123' }, 'CacheService');
}

/**
 * Example 3: Object masking
 */
export function example3_objectMasking() {
  console.log('\n=== Example 3: Object Masking ===');

  const sensitiveData = {
    user: {
      name: 'John Doe',
      email: 'john@example.com',
      ssn: '123-45-6789',
      creditCard: '4532-1234-5678-9010',
      phone: '+1-555-123-4567',
    },
    auth: {
      apiKey: 'sk_live_51234567890abcdef',
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      refreshToken: 'refresh_token_123456',
      password: 'MyPassword123!',
    },
    database: {
      connectionString: 'mongodb://user:password@db.example.com:27017/mydb',
    },
  };

  const masked = logMasker.maskObject(sensitiveData);
  console.log('Masked object:', JSON.stringify(masked, null, 2));

  secureLogger.info('Data processed', masked);
}

/**
 * Example 4: User action tracking (without PII)
 */
export function example4_userActionTracking() {
  console.log('\n=== Example 4: User Action Tracking ===');

  // Track user actions for analytics (without revealing personal data)
  secureLogger.logUserAction('login', 'authentication', {
    method: 'email',
    deviceType: 'mobile',
    appVersion: '1.0.0',
  });

  secureLogger.logUserAction('purchase', 'commerce', {
    productCount: 3,
    category: 'electronics',
    totalValue: 99.99,
  });

  secureLogger.logUserAction('settings_changed', 'preferences', {
    settingsChanged: ['notifications', 'language'],
    newLanguage: 'pt-BR',
  });
}

/**
 * Example 5: Security event logging
 */
export async function example5_securityLogging() {
  console.log('\n=== Example 5: Security Logging ===');

  // Log authentication event
  await auditLogger.logAuthEvent(
    AuditEventType.AUTH_LOGIN,
    'user123',
    true,
    {
      ipAddress: '192.168.1.1',
      deviceId: 'device-abc123',
    },
  );

  // Log failed authentication
  await auditLogger.logAuthEvent(
    AuditEventType.AUTH_FAILED,
    'user456',
    false,
    {
      attempts: 3,
      reason: 'Invalid password',
    },
  );

  // Log permission change
  await auditLogger.logPermissionChange(
    'admin-user',
    'Document-123',
    { permission: 'view' },
    { permission: 'edit' },
    'User requested write access',
  );

  // Log data access
  await auditLogger.logDataAccess(
    'user789',
    'record-456',
    'HealthRecord',
    {
      duration: '5 minutes',
      action: 'viewed',
    },
  );
}

/**
 * Example 6: Remote logging with Sentry
 */
export async function example6_remoteLogging() {
  console.log('\n=== Example 6: Remote Logging ===');

  // Initialize Sentry remote logger
  const sentryLogger = createRemoteLogger(RemoteLoggerProvider.SENTRY, {
    enabled: true,
    dsn: 'https://your-sentry-dsn@sentry.io/project',
    environment: 'production',
    release: '1.0.0',
    sampleRate: 1.0,
  });

  // Set user context
  sentryLogger.setUserContext('user123', {
    email: 'user@example.com',
    subscription: 'premium',
  });

  // Add breadcrumb
  sentryLogger.addBreadcrumb('user-action', 'User clicked button', 'info', {
    buttonId: 'submit-btn',
  });

  // Capture exception
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    await sentryLogger.captureException(error as Error, {
      context: 'payment-processing',
    });
  }

  // Capture message
  await sentryLogger.captureMessage('Payment completed successfully', 'info', {
    orderId: 'ORD-123',
    amount: 99.99,
  });
}

/**
 * Example 7: URL masking
 */
export function example7_urlMasking() {
  console.log('\n=== Example 7: URL Masking ===');

  const urls = [
    'https://api.example.com/data?token=abc123xyz&key=secret',
    'https://auth.example.com/login?username=john@example.com&password=mypassword123',
    'https://api.example.com/export?access_token=eyJhbGciOiJIUzI1NiJ9',
  ];

  urls.forEach(url => {
    const masked = logMasker.maskURL(url);
    console.log(`Original: ${url}`);
    console.log(`Masked:   ${masked}`);
    console.log('---');
  });
}

/**
 * Example 8: Getting logs and statistics
 */
export function example8_logsAndStats() {
  console.log('\n=== Example 8: Logs & Statistics ===');

  // Generate some logs
  secureLogger.debug('Debug message', { details: 'some details' });
  secureLogger.info('Info message', { userId: 'john@example.com' });
  secureLogger.warn('Warning message', { severity: 'high' });
  secureLogger.error('Error message', new Error('Test error'));

  // Get all logs
  const allLogs = secureLogger.getLogs();
  console.log(`Total logs: ${allLogs.length}`);

  // Get logs by level
  const errors = secureLogger.getLogsByLevel(LogLevel.ERROR);
  console.log(`Error logs: ${errors.length}`);

  // Get logs by module
  const authLogs = secureLogger.getLogsByModule('AuthService');
  console.log(`Auth logs: ${authLogs.length}`);

  // Get statistics
  const stats = secureLogger.getStats();
  console.log('Logging statistics:', stats);

  // Print summary
  secureLogger.printSummary();
}

/**
 * Example 9: Log masking statistics
 */
export function example9_maskingStats() {
  console.log('\n=== Example 9: Masking Statistics ===');

  const testData = `
    User email: john@example.com
    API Key: sk_live_51234567890abcdef
    Credit Card: 4532-1234-5678-9010
    SSN: 123-45-6789
    Phone: +1-555-123-4567
    Password: MySecurePassword123!
    Bearer token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
  `;

  const stats = logMasker.getStats(testData);
  console.log('Masking statistics:', stats);
}

/**
 * Example 10: Audit log export
 */
export async function example10_auditExport() {
  console.log('\n=== Example 10: Audit Export ===');

  // Log some audit events
  await auditLogger.logEvent(
    AuditEventType.DATA_ACCESSED,
    'User accessed sensitive data',
    { dataType: 'health_records' },
    {
      userId: 'user123',
      status: 'success',
      severity: 'medium',
    },
  );

  // Get statistics
  const stats = auditLogger.getStats();
  console.log('Audit statistics:', stats);

  // Export as CSV
  const csvExport = await auditLogger.exportAsCSV();
  console.log('Audit trail (CSV):\n', csvExport);

  // Get compliance events
  const complianceEvents = auditLogger.getComplianceEvents();
  console.log(`Compliance events: ${complianceEvents.length}`);
}

/**
 * Example 11: Real-world scenario - Login flow
 */
export async function example11_loginFlow() {
  console.log('\n=== Example 11: Login Flow ===');

  const userId = 'user@example.com';
  const sessionId = 'session-abc123';

  try {
    // User attempts login
    secureLogger.info('Login attempt started', { userId }, 'AuthService');
    await auditLogger.logEvent(
      AuditEventType.AUTH_LOGIN,
      'User initiated login',
      { method: 'email' },
      {
        userId,
        sessionId,
        status: 'pending',
      },
    );

    // Simulate authentication
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZXhwIjoxNzA0ODY3MjAwfQ.sig';
    const mfaCode = '123456';

    secureLogger.debug('MFA verification started', { mfaCodeLength: mfaCode.length }, 'AuthService');

    // Login successful
    secureLogger.info('Login successful', { userId, sessionId }, 'AuthService');
    await auditLogger.logAuthEvent(
      AuditEventType.AUTH_LOGIN,
      userId,
      true,
      {
        sessionId,
        mfaEnabled: true,
      },
    );

    // Log user action
    secureLogger.logUserAction('login', 'authentication', {
      method: 'email',
      mfaUsed: true,
      deviceType: 'mobile',
    });
  } catch (error) {
    secureLogger.error('Login failed', error as Error, 'AuthService');
    await auditLogger.logAuthEvent(
      AuditEventType.AUTH_FAILED,
      userId,
      false,
      {
        error: (error as Error).message,
      },
    );
  }
}

/**
 * Example 12: Real-world scenario - Data export
 */
export async function example12_dataExport() {
  console.log('\n=== Example 12: Data Export ===');

  const userId = 'user123';
  const dataType = 'personal_data';

  try {
    secureLogger.info('Data export requested', { dataType }, 'ExportService');

    await auditLogger.logEvent(
      AuditEventType.DATA_EXPORTED,
      `User requested export of ${dataType}`,
      {
        format: 'json',
        includeMetadata: true,
      },
      {
        userId,
        resource: 'UserData',
        resourceId: userId,
        status: 'success',
        severity: 'high',
      },
    );

    // Log user action
    secureLogger.logUserAction('data_export', 'compliance', {
      dataType,
      format: 'json',
    });

    secureLogger.info('Data export completed', { userId, dataType }, 'ExportService');
  } catch (error) {
    secureLogger.error('Data export failed', error as Error, 'ExportService');
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  example1_basicLogging();
  example2_moduleLogging();
  example3_objectMasking();
  example4_userActionTracking();
  await example5_securityLogging();
  await example6_remoteLogging();
  example7_urlMasking();
  example8_logsAndStats();
  example9_maskingStats();
  await example10_auditExport();
  await example11_loginFlow();
  await example12_dataExport();

  console.log('\n✅ All examples completed!');
}
