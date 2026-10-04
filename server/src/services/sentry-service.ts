/**
 * SEC-012: Sentry Integration — Error tracking and performance monitoring
 *
 * Initializes Sentry SDK with:
 * - Error tracking with exception capture
 * - Performance monitoring with transaction tracing
 * - Sensitive data filtering (API keys, tokens, PII)
 * - Release tracking from package.json
 * - Request/transaction middleware integration
 *
 * Usage:
 * 1. Initialize in index.ts: initializeSentry()
 * 2. Use app.use(Sentry.Handlers.requestHandler()) after helmet
 * 3. Use app.use(Sentry.Handlers.tracingHandler()) before routes
 * 4. Capture exceptions: Sentry.captureException(error, { tags, level })
 * 5. Use Sentry.startTransaction() for long-running operations
 */

import * as Sentry from "@sentry/node";
import { Http } from "@sentry/node";
import { readFileSync } from "fs";
import { resolve } from "path";
import { logger } from "./logger-service.js";

/**
 * List of sensitive keys that should be filtered from Sentry events
 */
const SENSITIVE_KEYS = [
  "api_key",
  "apikey",
  "api-key",
  "client_secret",
  "clientsecret",
  "token",
  "auth",
  "authorization",
  "cookie",
  "password",
  "secret",
  "private_key",
  "privatekey",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "x-api-key",
  "x-auth-token",
  "session_id",
  "sessionid",
  "credit_card",
  "creditcard",
  "ssn",
  "cnpj",
  "cpf",
  "account_number",
  "accountnumber",
  "pii",
];

/**
 * Sensitive patterns to redact (regex)
 */
const SENSITIVE_PATTERNS = [
  /api[_-]?key[:\s=]+[^\s,}]+/gi,
  /token[:\s=]+[^\s,}]+/gi,
  /secret[:\s=]+[^\s,}]+/gi,
  /password[:\s=]+[^\s,}]+/gi,
  /authorization[:\s=]+bearer\s+[^\s,}]+/gi,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, // CPF
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, // CNPJ
];

/**
 * Filter sensitive values from an object recursively
 */
function filterSensitiveData(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    let filtered = obj;
    for (const pattern of SENSITIVE_PATTERNS) {
      filtered = filtered.replace(pattern, "[REDACTED]");
    }
    return filtered;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => filterSensitiveData(item));
  }

  if (typeof obj === "object") {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
        filtered[key] = "[REDACTED]";
      } else {
        filtered[key] = filterSensitiveData(value);
      }
    }
    return filtered;
  }

  return obj;
}

/**
 * Get version from package.json
 */
function getPackageVersion(): string {
  try {
    const packagePath = resolve(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
    return packageJson.version || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Initialize Sentry SDK
 */
export function initializeSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || "development";
  const release = getPackageVersion();

  // Skip initialization if DSN is not provided or explicitly disabled
  if (!dsn || dsn === "" || dsn === "disabled") {
    logger.info("[Sentry] Disabled (SENTRY_DSN not configured or set to 'disabled')");
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment,
      release,
      // Tracing: 10% in production, 100% in development
      tracesSampleRate: environment === "production" ? 0.1 : 1.0,
      // Profiling: 10% in production (requires Sentry profiling support)
      profilesSampleRate: environment === "production" ? 0.1 : 1.0,
      // Integrations
      integrations: [
        new Http({
          tracing: {
            tracePropagationTargets: ["localhost", /^\//],
          },
        }),
      ],
      // before_send hook for filtering sensitive data
      beforeSend(event) {
        // Filter sensitive data from event
        if (event.request) {
          event.request = filterSensitiveData(event.request) as any;
        }
        if (event.contexts) {
          event.contexts = filterSensitiveData(event.contexts) as Record<string, any>;
        }
        if (event.extra) {
          event.extra = filterSensitiveData(event.extra) as Record<string, unknown>;
        }
        if (event.tags) {
          event.tags = filterSensitiveData(event.tags) as Record<string, string>;
        }

        // Filter breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
            if (breadcrumb.data) {
              breadcrumb.data = filterSensitiveData(breadcrumb.data) as Record<string, unknown>;
            }
            return breadcrumb;
          });
        }

        // Don't send test errors to Sentry
        const isTestError = process.env.NODE_ENV === "test" || event.tags?.["test_error"] === "true";
        if (isTestError) {
          return null;
        }

        return event;
      },
      // Ignore certain errors
      ignoreErrors: [
        // Browser extensions
        "chrome-extension://",
        "moz-extension://",
        // Known third-party errors
        "NetworkError",
        "timeout of",
        "Load failed",
      ],
    });

    logger.info("[Sentry] Initialized", {
      environment,
      release,
      tracesSampleRate: environment === "production" ? 0.1 : 1.0,
    });
  } catch {
    logger.error("[Sentry] Initialization failed", error instanceof Error ? error : { error: String(error) });
  }
}

/**
 * Attach Sentry handlers to Express app
 */
export function attachSentryHandlers(app: any): void {
  try {
    // Request handler — must be first
    app.use(Sentry.Handlers.requestHandler());

    // Tracing handler — for request tracing
    app.use(Sentry.Handlers.tracingHandler());

    // Error handler — must be last (special 4-param signature)
    app.use(Sentry.Handlers.errorHandler());

    logger.info("[Sentry] Handlers attached to Express");
  } catch {
    logger.error("[Sentry] Failed to attach handlers", error instanceof Error ? error : { error: String(error) });
  }
}

/**
 * Create a Sentry transaction for long-running operations
 */
export function createSentryTransaction(
  op: string,
  name: string,
  data?: Record<string, unknown>,
): Sentry.Transaction | null {
  try {
    // Check if Sentry.startTransaction exists (Sentry may not be initialized)
    if (!Sentry.startTransaction) {
      return null;
    }

    const transaction = Sentry.startTransaction({
      op,
      name,
      data,
    });
    return transaction;
  } catch {
    logger.error("[Sentry] Failed to create transaction", error instanceof Error ? error : { error: String(error) });
    return null;
  }
}

/**
 * SEC-012: Track database operations with Sentry
 * Use for monitoring database queries and operations
 */
export function trackDatabaseOperation(
  operationName: string,
  details?: {
    table?: string;
    operation?: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
    rowsAffected?: number;
    duration?: number;
  },
): Sentry.Span | null {
  try {
    const parentTransaction = Sentry.getCurrentHub().getScope()?.getTransaction();
    if (!parentTransaction) {
      return null;
    }

    const span = parentTransaction.startChild({
      op: "db.query",
      description: operationName,
      data: {
        table: details?.table,
        operation: details?.operation,
        rows_affected: details?.rowsAffected,
        duration_ms: details?.duration,
      },
    });

    return span;
  } catch {
    logger.debug("[Sentry] Failed to track database operation", { error: String(error) });
    return null;
  }
}

/**
 * SEC-012: Track payment-related operations
 */
export function trackPaymentOperation(
  operationName: string,
  details?: {
    provider?: string;
    transactionId?: string;
    amount?: number;
    status?: string;
  },
): void {
  try {
    captureMessage(`Payment operation: ${operationName}`, {
      level: "info",
      tags: {
        operation: "payment",
        provider: details?.provider || "unknown",
        status: details?.status || "pending",
      },
      extra: {
        transaction_id: details?.transactionId,
        amount: details?.amount,
      },
    });

    // Also track as transaction if available
    const transaction = createSentryTransaction("payment", operationName, {
      provider: details?.provider,
      amount: details?.amount,
      status: details?.status,
    });

    if (transaction) {
      setTimeout(() => {
        transaction.finish();
      }, 100);
    }
  } catch {
    logger.debug("[Sentry] Failed to track payment operation", { error: String(error) });
  }
}

/**
 * SEC-012: Track async cobrança reconciliation
 */
export function trackCobrancaReconciliation(
  status: "started" | "completed" | "failed",
  details?: {
    recordsProcessed?: number;
    recordsFailed?: number;
    duration?: number;
  },
): void {
  try {
    const level = status === "failed" ? "error" : "info";
    captureMessage(`Cobrança reconciliation: ${status}`, {
      level,
      tags: {
        operation: "asaas_cobrancas_reconciliador",
        status,
      },
      extra: {
        records_processed: details?.recordsProcessed,
        records_failed: details?.recordsFailed,
        duration_ms: details?.duration,
      },
    });
  } catch {
    logger.debug("[Sentry] Failed to track cobrança reconciliation", { error: String(error) });
  }
}

/**
 * SEC-012: Track charge creation operations
 */
export function trackChargeCreation(
  status: "started" | "completed" | "failed",
  details?: {
    chargeId?: string;
    amount?: number;
    customerId?: string;
    error?: string;
  },
): void {
  try {
    const level = status === "failed" ? "error" : "info";
    captureMessage(`Charge creation: ${status}`, {
      level,
      tags: {
        operation: "charge_creation",
        status,
      },
      extra: {
        charge_id: details?.chargeId,
        amount: details?.amount,
        customer_id: details?.customerId,
        error: details?.error,
      },
    });
  } catch {
    logger.debug("[Sentry] Failed to track charge creation", { error: String(error) });
  }
}

/**
 * SEC-012: Track payment registration operations
 */
export function trackPaymentRegistration(
  status: "started" | "completed" | "failed",
  details?: {
    paymentId?: string;
    amount?: number;
    accountId?: string;
    error?: string;
  },
): void {
  try {
    const level = status === "failed" ? "error" : "info";
    captureMessage(`Payment registration: ${status}`, {
      level,
      tags: {
        operation: "payment_registration",
        status,
      },
      extra: {
        payment_id: details?.paymentId,
        amount: details?.amount,
        account_id: details?.accountId,
        error: details?.error,
      },
    });
  } catch {
    logger.debug("[Sentry] Failed to track payment registration", { error: String(error) });
  }
}

/**
 * Capture an exception to Sentry
 */
export function captureException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    level?: "fatal" | "error" | "warning" | "info" | "debug";
    extra?: Record<string, unknown>;
    user?: { id?: string; email?: string };
    operation?: string;
  },
): string | null {
  try {
    const eventId = Sentry.captureException(error, {
      tags: {
        ...context?.tags,
        operation: context?.operation,
      },
      level: context?.level || "error",
      extra: context?.extra,
      user: context?.user,
    });
    return eventId;
  } catch {
    // If Sentry is disabled or fails, return null silently
    return null;
  }
}

/**
 * Capture a message to Sentry
 */
export function captureMessage(
  message: string,
  context?: {
    tags?: Record<string, string>;
    level?: "fatal" | "error" | "warning" | "info" | "debug";
    extra?: Record<string, unknown>;
  },
): string | null {
  try {
    const eventId = Sentry.captureMessage(message, {
      tags: context?.tags,
      level: context?.level || "info",
      extra: context?.extra,
    });
    return eventId;
  } catch {
    // If Sentry is disabled or fails, return null silently
    return null;
  }
}

/**
 * Set user context for Sentry
 */
export function setSentryUser(userId: string, email?: string): void {
  try {
    Sentry.setUser({
      id: userId,
      email,
    });
  } catch {
    // If Sentry is disabled, fail silently
  }
}

/**
 * Clear user context
 */
export function clearSentryUser(): void {
  try {
    Sentry.setUser(null);
  } catch {
    // If Sentry is disabled, fail silently
  }
}

/**
 * Add a breadcrumb to Sentry
 */
export function addSentryBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  category?: string,
  level?: "fatal" | "error" | "warning" | "info" | "debug",
): void {
  try {
    Sentry.addBreadcrumb({
      message,
      data: filterSensitiveData(data) as Record<string, unknown>,
      category: category || "user-action",
      level: level || "info",
      timestamp: Date.now() / 1000,
    });
  } catch {
    // If Sentry is disabled, fail silently
  }
}

/**
 * OBS-002: Start a Sentry transaction for critical DB operations
 * Tracks performance of long-running database queries and operations
 * @param operationName - Name of the database operation
 * @param queryType - Type of query (SELECT, INSERT, UPDATE, DELETE, etc.)
 * @returns Transaction object for child spans
 */
export function startDbTransaction(
  operationName: string,
  queryType: string = "db.query"
): Sentry.Transaction | null {
  try {
    if (!Sentry.startTransaction) return null;

    const transaction = Sentry.startTransaction({
      op: "db",
      name: operationName,
      description: `Database operation: ${queryType}`,
      tags: {
        "db.operation": operationName,
        "db.query_type": queryType,
      },
    });

    return transaction;
  } catch {
    logger.error("[Sentry] Failed to start DB transaction", error instanceof Error ? error : { error: String(error) });
    return null;
  }
}

/**
 * OBS-002: Add child span to transaction for tracing DB statement execution
 * Tracks individual SQL statement execution within a transaction
 * @param parentTransaction - Parent transaction created by startDbTransaction
 * @param sqlStatement - SQL query being executed
 * @param table - Table name being accessed
 * @returns Span object to finish tracking
 */
export function createDbStatementSpan(
  parentTransaction: Sentry.Transaction | null,
  sqlStatement: string,
  table: string = "unknown"
): Sentry.Span | null {
  try {
    if (!parentTransaction) return null;

    // Add breadcrumb for each statement execution
    addSentryBreadcrumb(
      `Executing SQL: ${sqlStatement.substring(0, 100)}...`,
      {
        table,
        statement_length: sqlStatement.length,
      },
      "db.statement",
      "debug"
    );

    // Create child span
    const span = parentTransaction.startChild({
      op: "db.query",
      description: `SQL: ${sqlStatement.substring(0, 80)}...`,
      tags: {
        "db.table": table,
        "db.statement_type": sqlStatement.split(/\s+/)[0].toUpperCase(),
      },
    });

    return span;
  } catch {
    logger.error("[Sentry] Failed to create DB statement span", error instanceof Error ? error : { error: String(error) });
    return null;
  }
}

/**
 * OBS-002: Detect and report N+1 query pattern
 * Logs when multiple similar queries are executed in sequence
 * @param queryType - Type of query being checked
 * @param table - Table being queried
 * @param executionCount - Number of times this query was executed
 * @param threshold - Threshold to trigger N+1 detection (default: 3)
 */
export function detectN1Queries(
  queryType: string,
  table: string,
  executionCount: number,
  threshold: number = 3
): void {
  try {
    if (executionCount >= threshold) {
      const message = `N+1 Query Pattern Detected: ${executionCount} executions of ${queryType} on table ${table}`;

      addSentryBreadcrumb(
        message,
        {
          query_type: queryType,
          table,
          execution_count: executionCount,
          threshold,
        },
        "performance.n1_query",
        "warning"
      );

      captureMessage(message, {
        level: "warning",
        tags: {
          "pattern": "n1_query",
          "table": table,
          "query_type": queryType,
        },
        extra: {
          execution_count: executionCount,
        },
      });
    }
  } catch {
    logger.error("[Sentry] Failed to detect N+1 queries", error instanceof Error ? error : { error: String(error) });
  }
}

/**
 * OBS-002: Trace Promise.all() parallelization performance
 * Monitors parallel execution of multiple operations
 * @param operationName - Name of the parallel operation group
 * @param promises - Array of promises to track
 * @returns Promise that tracks all child promises
 */
export async function traceParallelOperations<T>(
  operationName: string,
  promises: Promise<T>[]
): Promise<T[]> {
  const transaction = createSentryTransaction("parallel", operationName);

  try {
    if (transaction) {
      const startTime = Date.now();

      // Create child spans for each promise
      const trackedPromises = promises.map((promise, index) => {
        const span = transaction.startChild({
          op: "parallel.operation",
          description: `${operationName} - Operation ${index + 1}/${promises.length}`,
        });

        return promise
          .then((result) => {
            if (span) {
              span.finish();
            }
            return result;
          })
          .catch((error) => {
            if (span) {
              span.setStatus("error");
              span.setData("error", error);
              span.finish();
            }
            throw error;
          });
      });

      const results = await Promise.all(trackedPromises);

      const duration = Date.now() - startTime;
      transaction.setData("duration_ms", duration);
      transaction.setData("operation_count", promises.length);
      transaction.finish();

      addSentryBreadcrumb(
        `Parallel operation completed: ${operationName}`,
        {
          operation_count: promises.length,
          duration_ms: duration,
          avg_duration_per_op: duration / promises.length,
        },
        "performance.parallel",
        "info"
      );

      return results;
    } else {
      return Promise.all(promises);
    }
  } catch {
    if (transaction) {
      transaction.setStatus("error");
      transaction.setData("error", error instanceof Error ? error.message : String(error));
      transaction.finish();
    }
    throw error;
  }
}

/**
 * OBS-002: Track database transaction with detailed span information
 * Useful for audit trail and complex multi-statement operations
 * @param transactionName - Name for logging purposes
 * @param operation - Async operation to track
 * @returns Result of the operation
 */
export async function trackDatabaseTransaction<T>(
  transactionName: string,
  operation: () => Promise<T>
): Promise<T> {
  const transaction = startDbTransaction(transactionName, "transaction");
  const startTime = Date.now();

  try {
    addSentryBreadcrumb(
      `Database transaction started: ${transactionName}`,
      {},
      "db.transaction",
      "debug"
    );

    const result = await operation();

    const duration = Date.now() - startTime;
    if (transaction) {
      transaction.setData("duration_ms", duration);
      transaction.setStatus("ok");
      transaction.finish();
    }

    addSentryBreadcrumb(
      `Database transaction completed: ${transactionName}`,
      { duration_ms: duration },
      "db.transaction",
      "debug"
    );

    return result;
  } catch {
    const duration = Date.now() - startTime;

    if (transaction) {
      transaction.setStatus("error");
      transaction.setData("error", error instanceof Error ? error.message : String(error));
      transaction.setData("duration_ms", duration);
      transaction.finish();
    }

    addSentryBreadcrumb(
      `Database transaction failed: ${transactionName}`,
      {
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
      },
      "db.transaction",
      "error"
    );

    throw error;
  }
}

export { Sentry };

/**
 * SentryService class for dependency injection
 */
export class SentryService {
  constructor(options?: { dsn?: string }) {
    if (options?.dsn) {
      process.env.SENTRY_DSN = options.dsn;
    }
  }
}
