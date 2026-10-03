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
import * as SentryTracing from "@sentry/tracing";
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
        new SentryTracing.Http({
          tracingOrigins: ["localhost", /^\//],
        }),
      ],
      // before_send hook for filtering sensitive data
      beforeSend(event, hint) {
        // Filter sensitive data from event
        if (event.request) {
          event.request = filterSensitiveData(event.request) as Sentry.Request;
        }
        if (event.contexts) {
          event.contexts = filterSensitiveData(event.contexts) as Record<string, unknown>;
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
  } catch (error) {
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
  } catch (error) {
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
    const transaction = Sentry.startTransaction({
      op,
      name,
      data,
    });
    return transaction;
  } catch (error) {
    logger.error("[Sentry] Failed to create transaction", error instanceof Error ? error : { error: String(error) });
    return null;
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

export { Sentry, SentryTracing };
