/**
 * Error Handler Utilities - Phase 22.9
 *
 * Comprehensive error handling with:
 * - Error classification (network, database, validation, unknown)
 * - User-friendly error messages
 * - Structured logging with stack traces
 * - Retry logic with exponential backoff
 * - Error recovery strategies
 */

import { logger, LogLevel } from './logger';
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_CATEGORIES,
  I18N_LOCALES
} from '@/constants/errors';
import { AxiosError } from 'axios';

export type ErrorCategory =
  | 'NETWORK'
  | 'DATABASE'
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SERVER'
  | 'UNKNOWN';

export interface ErrorContext {
  category: ErrorCategory;
  code: string;
  message: string;
  userMessage: string;
  statusCode?: number;
  originalError?: Error;
  metadata?: Record<string, any>;
  retryable: boolean;
  retryCount?: number;
  timestamp: string;
  module?: string;
}

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: ErrorContext) => boolean;
}

export class ErrorHandler {
  private static readonly DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
    maxAttempts: 3,
    initialDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
    shouldRetry: (error) => error.retryable,
  };

  /**
   * Classify error and create error context
   */
  static classifyError(
    error: unknown,
    module?: string,
    locale: I18N_LOCALES = 'pt-BR'
  ): ErrorContext {
    let category: ErrorCategory = 'UNKNOWN';
    let code = ERROR_CODES.UNKNOWN_ERROR;
    let statusCode: number | undefined;
    let message = String(error);
    let retryable = false;

    if (error instanceof AxiosError) {
      ({ category, code, statusCode, retryable } = this.classifyNetworkError(error));
      message = error.message;
    } else if (error instanceof ReferenceError) {
      category = 'VALIDATION';
      code = ERROR_CODES.VALIDATION_ERROR;
      message = error.message;
    } else if (error instanceof TypeError) {
      category = 'VALIDATION';
      code = ERROR_CODES.VALIDATION_ERROR;
      message = error.message;
    } else if (error instanceof Error) {
      if (error.message.includes('SQLITE_CONSTRAINT')) {
        category = 'DATABASE';
        code = ERROR_CODES.DATABASE_CONSTRAINT;
        message = error.message;
      } else if (error.message.includes('SQLITE_IOERR')) {
        category = 'DATABASE';
        code = ERROR_CODES.DATABASE_IO_ERROR;
        message = error.message;
        retryable = true;
      } else {
        message = error.message;
      }
    }

    const userMessage = this.getUserMessage(code, locale);

    return {
      category,
      code,
      message,
      userMessage,
      statusCode,
      originalError: error instanceof Error ? error : undefined,
      retryable,
      timestamp: new Date().toISOString(),
      module,
    };
  }

  /**
   * Classify network errors
   */
  private static classifyNetworkError(error: AxiosError): {
    category: ErrorCategory;
    code: string;
    statusCode?: number;
    retryable: boolean;
  } {
    const status = error.response?.status;
    const code = error.code;

    if (!error.response) {
      // Network connectivity issue
      return {
        category: 'NETWORK',
        code: ERROR_CODES.NETWORK_ERROR,
        statusCode: 0,
        retryable: true,
      };
    }

    if (code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return {
        category: 'NETWORK',
        code: ERROR_CODES.TIMEOUT,
        statusCode: status,
        retryable: true,
      };
    }

    if (status === 401) {
      return {
        category: 'AUTHENTICATION',
        code: ERROR_CODES.UNAUTHORIZED,
        statusCode: 401,
        retryable: false,
      };
    }

    if (status === 403) {
      return {
        category: 'AUTHORIZATION',
        code: ERROR_CODES.FORBIDDEN,
        statusCode: 403,
        retryable: false,
      };
    }

    if (status === 404) {
      return {
        category: 'NOT_FOUND',
        code: ERROR_CODES.NOT_FOUND,
        statusCode: 404,
        retryable: false,
      };
    }

    if (status === 409) {
      return {
        category: 'CONFLICT',
        code: ERROR_CODES.CONFLICT,
        statusCode: 409,
        retryable: false,
      };
    }

    if (status === 422 || status === 400) {
      return {
        category: 'VALIDATION',
        code: ERROR_CODES.VALIDATION_ERROR,
        statusCode: status,
        retryable: false,
      };
    }

    if (status && status >= 500) {
      return {
        category: 'SERVER',
        code: ERROR_CODES.SERVER_ERROR,
        statusCode: status,
        retryable: status !== 501, // Don't retry 501 Not Implemented
      };
    }

    if (status === 429) {
      return {
        category: 'SERVER',
        code: ERROR_CODES.RATE_LIMITED,
        statusCode: 429,
        retryable: true,
      };
    }

    return {
      category: 'UNKNOWN',
      code: ERROR_CODES.UNKNOWN_ERROR,
      statusCode: status,
      retryable: false,
    };
  }

  /**
   * Get user-friendly message
   */
  static getUserMessage(code: string, locale: I18N_LOCALES = 'pt-BR'): string {
    return ERROR_MESSAGES[locale]?.[code as keyof typeof ERROR_MESSAGES.pt-BR] ||
           ERROR_MESSAGES[locale]?.UNKNOWN_ERROR ||
           'Ocorreu um erro inesperado';
  }

  /**
   * Log error with context
   */
  static logError(context: ErrorContext): void {
    const logData = {
      code: context.code,
      category: context.category,
      statusCode: context.statusCode,
      retryable: context.retryable,
      metadata: context.metadata,
      userMessage: context.userMessage,
    };

    switch (context.category) {
      case 'NETWORK':
        logger.warn(context.message, logData, context.module || 'ErrorHandler');
        break;
      case 'DATABASE':
        logger.error(context.message, context.originalError, context.module || 'ErrorHandler');
        break;
      case 'VALIDATION':
        logger.warn(context.message, logData, context.module || 'ErrorHandler');
        break;
      default:
        logger.error(context.message, context.originalError, context.module || 'ErrorHandler');
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  static async retry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions,
    module?: string
  ): Promise<T> {
    const opts = { ...this.DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: ErrorContext | null = null;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        logger.debug(`Attempt ${attempt}/${opts.maxAttempts}`, { module }, module);
        return await fn();
      } catch (error) {
        const errorContext = this.classifyError(error, module);
        errorContext.retryCount = attempt;
        lastError = errorContext;

        if (!opts.shouldRetry(errorContext)) {
          this.logError(errorContext);
          throw errorContext;
        }

        if (attempt < opts.maxAttempts) {
          const delay = this.calculateBackoff(attempt, opts);
          logger.debug(
            `Retrying after ${delay}ms (attempt ${attempt + 1})`,
            { error: errorContext.code },
            module
          );
          await this.sleep(delay);
        }
      }
    }

    if (lastError) {
      this.logError(lastError);
      throw lastError;
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Calculate exponential backoff delay
   */
  private static calculateBackoff(
    attempt: number,
    options: Required<RetryOptions>
  ): number {
    const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
    const jitteredDelay = exponentialDelay * (0.5 + Math.random() * 0.5); // Add jitter
    return Math.min(jitteredDelay, options.maxDelay);
  }

  /**
   * Sleep utility for delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle database errors with recovery
   */
  static handleDatabaseError(error: unknown, operation: string, module?: string): ErrorContext {
    const context = this.classifyError(error, module);

    if (context.category === 'DATABASE') {
      logger.warn(
        `Database error during ${operation}`,
        {
          operation,
          code: context.code,
          message: context.message,
        },
        module || 'DatabaseHandler'
      );
    }

    return context;
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: unknown, module?: string): boolean {
    const context = this.classifyError(error, module);
    return context.retryable;
  }

  /**
   * Check if error is auth-related
   */
  static isAuthError(error: unknown): boolean {
    const context = this.classifyError(error);
    return context.category === 'AUTHENTICATION' || context.category === 'AUTHORIZATION';
  }

  /**
   * Check if error is network-related
   */
  static isNetworkError(error: unknown): boolean {
    const context = this.classifyError(error);
    return context.category === 'NETWORK';
  }

  /**
   * Extract detailed error information
   */
  static getErrorDetails(error: unknown, module?: string): {
    message: string;
    stack?: string;
    code?: string;
    statusCode?: number;
  } {
    const context = this.classifyError(error, module);
    return {
      message: context.message,
      stack: context.originalError?.stack,
      code: context.code,
      statusCode: context.statusCode,
    };
  }

  /**
   * Create error report for debugging
   */
  static createErrorReport(
    error: unknown,
    operation: string,
    module?: string
  ): Record<string, any> {
    const context = this.classifyError(error, module);

    return {
      timestamp: context.timestamp,
      operation,
      module: module || 'Unknown',
      error: {
        category: context.category,
        code: context.code,
        message: context.message,
        userMessage: context.userMessage,
        statusCode: context.statusCode,
        retryable: context.retryable,
      },
      stack: context.originalError?.stack,
      metadata: context.metadata,
    };
  }
}

// Export error context for use in components
export type { ErrorContext, RetryOptions };
