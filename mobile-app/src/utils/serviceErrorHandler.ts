/**
 * Service Error Handler - Phase 22.9
 *
 * Utilities for handling errors in services with:
 * - Automatic retry logic
 * - Graceful degradation
 * - User notifications
 * - Network error handling
 */

import { logger } from './logger';
import { ErrorHandler, ErrorContext, RetryOptions } from './errorHandler';
import { ERROR_CODES, getErrorMessage, isCriticalError } from '@/constants/errors';

export interface ServiceErrorOptions {
  operation: string;
  module: string;
  retryOptions?: RetryOptions;
  notifyUser?: boolean;
  fallbackValue?: any;
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorContext;
  retried?: boolean;
}

/**
 * Wrap service operation with error handling
 */
export async function withErrorHandler<T>(
  fn: () => Promise<T>,
  options: ServiceErrorOptions
): Promise<ServiceResponse<T>> {
  const { operation, module, retryOptions, fallbackValue } = options;

  try {
    logger.debug(`Starting operation: ${operation}`, undefined, module);
    const result = await fn();
    logger.info(`Operation completed: ${operation}`, undefined, module);
    return { success: true, data: result };
  } catch (error) {
    const errorContext = ErrorHandler.classifyError(error, module);
    ErrorHandler.logError(errorContext);

    // If retryable and retry options provided, attempt retry
    if (errorContext.retryable && retryOptions) {
      try {
        logger.info(`Retrying operation: ${operation}`, undefined, module);
        const result = await ErrorHandler.retry(fn, retryOptions, module);
        return { success: true, data: result, retried: true };
      } catch (retryError) {
        const retryContext = ErrorHandler.classifyError(retryError, module);
        ErrorHandler.logError(retryContext);
        return {
          success: false,
          error: retryContext,
          retried: true,
        };
      }
    }

    // Return fallback value if available
    if (fallbackValue !== undefined) {
      logger.warn(
        `Using fallback value for operation: ${operation}`,
        undefined,
        module
      );
      return { success: true, data: fallbackValue };
    }

    return { success: false, error: errorContext };
  }
}

/**
 * Handle network errors specifically
 */
export async function withNetworkErrorHandler<T>(
  fn: () => Promise<T>,
  options: ServiceErrorOptions
): Promise<ServiceResponse<T>> {
  return withErrorHandler(fn, {
    ...options,
    retryOptions: {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      shouldRetry: (error) => error.category === 'NETWORK',
    },
  });
}

/**
 * Handle database errors specifically
 */
export async function withDatabaseErrorHandler<T>(
  fn: () => Promise<T>,
  options: ServiceErrorOptions
): Promise<ServiceResponse<T>> {
  return withErrorHandler(fn, {
    ...options,
    retryOptions: {
      maxAttempts: 2,
      initialDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 2,
      shouldRetry: (error) => error.category === 'DATABASE',
    },
  });
}

/**
 * Safe service call with error logging
 */
export async function safeServiceCall<T>(
  operation: string,
  fn: () => Promise<T>,
  module: string,
  defaultValue?: T
): Promise<T | undefined> {
  try {
    logger.debug(`Executing: ${operation}`, undefined, module);
    const result = await fn();
    logger.info(`Success: ${operation}`, undefined, module);
    return result;
  } catch (error) {
    const errorContext = ErrorHandler.classifyError(error, module);
    ErrorHandler.logError(errorContext);

    if (defaultValue !== undefined) {
      logger.warn(`Using default value for: ${operation}`, undefined, module);
      return defaultValue;
    }

    return undefined;
  }
}

/**
 * Service operation with offline support
 */
export async function withOfflineSupport<T>(
  fn: () => Promise<T>,
  offlineFallback: T,
  options: ServiceErrorOptions
): Promise<ServiceResponse<T>> {
  try {
    const result = await fn();
    return { success: true, data: result };
  } catch (error) {
    const errorContext = ErrorHandler.classifyError(error, options.module);

    // If offline, use fallback
    if (errorContext.category === 'NETWORK') {
      logger.warn(
        `Offline detected. Using fallback for: ${options.operation}`,
        undefined,
        options.module
      );
      return {
        success: true,
        data: offlineFallback,
        error: errorContext,
      };
    }

    ErrorHandler.logError(errorContext);
    return { success: false, error: errorContext };
  }
}

/**
 * Create service response with error
 */
export function createErrorResponse<T>(
  error: unknown,
  module: string
): ServiceResponse<T> {
  const errorContext = ErrorHandler.classifyError(error, module);
  ErrorHandler.logError(errorContext);
  return {
    success: false,
    error: errorContext,
  };
}

/**
 * Create successful service response
 */
export function createSuccessResponse<T>(data: T): ServiceResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Log service error with context
 */
export function logServiceError(
  operation: string,
  error: unknown,
  context?: Record<string, any>
): void {
  const errorContext = ErrorHandler.classifyError(error);
  const logData = {
    operation,
    ...context,
    errorCode: errorContext.code,
    errorCategory: errorContext.category,
  };

  if (isCriticalError(errorContext.code)) {
    logger.error(
      `Critical error in ${operation}`,
      errorContext.originalError,
      'ServiceHandler'
    );
  } else if (errorContext.category === 'NETWORK') {
    logger.warn(`Network error in ${operation}`, logData, 'ServiceHandler');
  } else {
    logger.error(
      `Error in ${operation}`,
      errorContext.originalError,
      'ServiceHandler'
    );
  }
}

/**
 * Get user-friendly error message from response
 */
export function getResponseErrorMessage(response: ServiceResponse<any>): string {
  if (!response.error) {
    return 'Unknown error';
  }
  return response.error.userMessage || ERROR_CODES.UNKNOWN_ERROR;
}

/**
 * Check if response should be retried
 */
export function shouldRetryResponse<T>(response: ServiceResponse<T>): boolean {
  return !response.success && (response.error?.retryable ?? false);
}

/**
 * Batch service operations with error handling
 */
export async function batchServiceOperations<T>(
  operations: Array<() => Promise<T>>,
  options: ServiceErrorOptions & { continueOnError?: boolean }
): Promise<Array<ServiceResponse<T>>> {
  const results: Array<ServiceResponse<T>> = [];
  const { continueOnError = false } = options;

  for (const operation of operations) {
    try {
      const result = await operation();
      results.push({ success: true, data: result });
    } catch (error) {
      const errorContext = ErrorHandler.classifyError(error, options.module);
      results.push({ success: false, error: errorContext });

      if (!continueOnError) {
        break;
      }
    }
  }

  return results;
}
