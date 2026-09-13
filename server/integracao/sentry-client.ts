/**
 * Sentry Integration Client
 *
 * Centralized error tracking and monitoring for production issues.
 * All cron jobs and critical paths should use this client.
 */

import * as Sentry from '@sentry/node';

/**
 * Initialize Sentry (call once on startup)
 */
export function initializeSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn(
      'SENTRY_DSN not configured - error tracking disabled. Set SENTRY_DSN to enable.'
    );
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],
    beforeSend(event, hint) {
      // Filter out spam/irrelevant errors
      if (event.exception) {
        const message = hint.originalException?.toString() || '';
        if (
          message.includes('Network timeout') ||
          message.includes('ECONNREFUSED')
        ) {
          return null; // Don't send network errors
        }
      }
      return event;
    },
  });

  console.log('✓ Sentry initialized');
}

/**
 * Log a cron job execution with result
 */
export function logCronExecution(
  cronName: string,
  status: 'success' | 'failure' | 'partial',
  duration: number,
  details?: Record<string, any>
) {
  Sentry.captureMessage(
    `Cron [${cronName}] ${status.toUpperCase()} (${duration}ms)`,
    status === 'failure' ? 'error' : 'info'
  );

  Sentry.setContext('cron_execution', {
    name: cronName,
    status,
    duration_ms: duration,
    ...details,
  });
}

/**
 * Log a fiscal operation (for compliance)
 */
export function logFiscalOperation(
  operationType: 'fatura' | 'cobranca' | 'recebimento' | 'reajuste',
  operationId: string,
  details: {
    contratoId?: string;
    valor?: number;
    dataOperacao?: string;
    usuarioId?: string;
    [key: string]: any;
  }
) {
  Sentry.captureMessage(`Fiscal [${operationType}] ${operationId}`, 'info');

  Sentry.setContext('fiscal_operation', {
    type: operationType,
    id: operationId,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

/**
 * Log a security event (unusual access, failed auth, etc)
 */
export function logSecurityEvent(
  eventType:
    | 'auth_failure'
    | 'unauthorized_access'
    | 'rate_limit_exceeded'
    | 'suspicious_activity',
  userId: string | null,
  details: Record<string, any>
) {
  Sentry.captureMessage(`Security [${eventType}]`, 'warning');

  Sentry.setContext('security_event', {
    type: eventType,
    user_id: userId,
    ...details,
  });
}

/**
 * Log a webhook event processing
 */
export function logWebhookProcessing(
  webhookType: string,
  webhookId: string,
  status: 'received' | 'processed' | 'failed',
  error?: Error
) {
  const level = status === 'failed' ? 'error' : 'info';
  Sentry.captureMessage(`Webhook [${webhookType}] ${status}`, level);

  Sentry.setContext('webhook_event', {
    type: webhookType,
    id: webhookId,
    status,
    timestamp: new Date().toISOString(),
  });

  if (error) {
    Sentry.captureException(error, {
      tags: {
        webhook_type: webhookType,
        webhook_id: webhookId,
      },
    });
  }
}

/**
 * Wrap async function with automatic error tracking
 */
export async function trackAsyncOperation<T>(
  name: string,
  fn: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();
    logCronExecution(name, 'success', Date.now() - startTime, context);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logCronExecution(name, 'failure', duration, {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });

    Sentry.captureException(error, {
      tags: { operation: name },
      extra: { duration_ms: duration, ...context },
    });

    throw error;
  }
}

/**
 * Wrap sync function with automatic error tracking
 */
export function trackSyncOperation<T>(
  name: string,
  fn: () => T,
  context?: Record<string, any>
): T {
  const startTime = Date.now();

  try {
    const result = fn();
    logCronExecution(name, 'success', Date.now() - startTime, context);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logCronExecution(name, 'failure', duration, {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });

    Sentry.captureException(error, {
      tags: { operation: name },
      extra: { duration_ms: duration, ...context },
    });

    throw error;
  }
}

/**
 * Set user context for all subsequent errors in this transaction
 */
export function setUserContext(userId: string | null, email?: string) {
  if (userId) {
    Sentry.setUser({
      id: userId,
      email: email || 'unknown@example.com',
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Set request context for API calls
 */
export function setRequestContext(
  path: string,
  method: string,
  statusCode?: number
) {
  Sentry.setContext('http', {
    path,
    method,
    status_code: statusCode,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Flush any pending events before shutdown (use in graceful shutdown)
 */
export async function flushSentry(timeout: number = 2000): Promise<void> {
  try {
    await Sentry.close(timeout);
    console.log('✓ Sentry events flushed');
  } catch (error) {
    console.error('Error flushing Sentry:', error);
  }
}

/**
 * Create a Sentry transaction for monitoring
 * Usage:
 *   const transaction = startTransaction('my-operation');
 *   try {
 *     // do work
 *     transaction.finish();
 *   } catch (error) {
 *     transaction.setStatus('error');
 *     throw error;
 *   }
 */
export function startTransaction(name: string) {
  return Sentry.startTransaction({
    name,
    op: 'operation',
  });
}

/**
 * Utility: Create a Sentry client wrapper for cron handlers
 * Usage:
 *   const handler = createCronHandler(async () => {
 *     // cron logic
 *   }, 'my-cron-name');
 */
export function createCronHandler(
  handler: () => Promise<void>,
  cronName: string
) {
  return async () => {
    const startTime = Date.now();

    try {
      await handler();
      logCronExecution(
        cronName,
        'success',
        Date.now() - startTime
      );
    } catch (error) {
      logCronExecution(
        cronName,
        'failure',
        Date.now() - startTime
      );

      Sentry.captureException(error, {
        tags: { cron: cronName },
      });

      throw error;
    }
  };
}

/**
 * Export Sentry instance for custom usage
 */
export { Sentry };
