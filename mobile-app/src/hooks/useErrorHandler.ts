/**
 * useErrorHandler Hook - Phase 22.9
 * Custom hook for error handling in components
 */

import { useCallback, useState } from 'react';
import { logger } from '@/utils/logger';
import { ErrorHandler, ErrorContext, RetryOptions } from '@/utils/errorHandler';
import { getErrorMessage } from '@/constants/errors';

interface UseErrorHandlerOptions {
  onError?: (error: ErrorContext) => void;
  locale?: 'pt-BR' | 'en-US';
}

interface UseErrorHandlerReturn {
  error: ErrorContext | null;
  userMessage: string;
  isLoading: boolean;
  isRetrying: boolean;
  clearError: () => void;
  handleError: (error: unknown) => void;
  retry: <T>(fn: () => Promise<T>, options?: RetryOptions) => Promise<T | null>;
  executeWithErrorHandling: <T>(
    fn: () => Promise<T>,
    options?: RetryOptions
  ) => Promise<T | null>;
}

export function useErrorHandler(
  options: UseErrorHandlerOptions = {}
): UseErrorHandlerReturn {
  const [error, setError] = useState<ErrorContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const { onError, locale = 'pt-BR' } = options;

  const handleError = useCallback(
    (err: unknown) => {
      const errorContext = ErrorHandler.classifyError(err);
      setError(errorContext);

      // Log the error
      ErrorHandler.logError(errorContext);

      // Call custom error handler if provided
      if (onError) {
        onError(errorContext);
      }
    },
    [onError]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const retry = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      retryOptions?: RetryOptions
    ): Promise<T | null> => {
      if (!error?.retryable) {
        logger.warn('Error is not retryable', undefined, 'useErrorHandler');
        return null;
      }

      setIsRetrying(true);
      try {
        const result = await ErrorHandler.retry(fn, retryOptions);
        clearError();
        return result;
      } catch (retryError) {
        handleError(retryError);
        return null;
      } finally {
        setIsRetrying(false);
      }
    },
    [error?.retryable, clearError, handleError]
  );

  const executeWithErrorHandling = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      retryOptions?: RetryOptions
    ): Promise<T | null> => {
      clearError();
      setIsLoading(true);

      try {
        const result = await fn();
        setIsLoading(false);
        return result;
      } catch (err) {
        handleError(err);
        setIsLoading(false);

        // Attempt retry if error is retryable
        if (ErrorHandler.classifyError(err).retryable && retryOptions) {
          return retry(fn, retryOptions);
        }

        return null;
      }
    },
    [clearError, handleError, retry]
  );

  const userMessage = error
    ? getErrorMessage(error.code, locale)
    : '';

  return {
    error,
    userMessage,
    isLoading,
    isRetrying,
    clearError,
    handleError,
    retry,
    executeWithErrorHandling,
  };
}

/**
 * useAsync Hook with error handling
 */
export function useAsync<T, E = string>(
  asyncFunction: () => Promise<T>,
  immediate = true,
  errorHandlerOptions?: UseErrorHandlerOptions
) {
  const errorHandler = useErrorHandler(errorHandlerOptions);
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>(
    'idle'
  );
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async () => {
      setStatus('pending');
      errorHandler.clearError();

      try {
        const response = await asyncFunction();
        setData(response);
        setStatus('success');
        return response;
      } catch (error) {
        errorHandler.handleError(error);
        setStatus('error');
        return null;
      }
    },
    [asyncFunction, errorHandler]
  );

  // Call immediately if requested
  if (immediate) {
    const [hasExecuted, setHasExecuted] = useState(false);
    if (!hasExecuted) {
      setHasExecuted(true);
      execute();
    }
  }

  return {
    ...errorHandler,
    execute,
    status,
    data,
  };
}
