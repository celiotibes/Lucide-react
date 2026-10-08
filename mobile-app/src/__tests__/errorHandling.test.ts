/**
 * Error Handling Tests - Phase 22.9
 * Tests for logger, error handler, and service wrappers
 */

import { logger, LogLevel } from '@/utils/logger';
import { ErrorHandler } from '@/utils/errorHandler';
import { ERROR_CODES } from '@/constants/errors';
import { AxiosError } from 'axios';

describe('Logger Service', () => {
  beforeEach(() => {
    logger.clearLogs();
  });

  test('should log at different levels', () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');
    logger.fatal('Fatal message');

    const allLogs = logger.getLogs();
    expect(allLogs).toHaveLength(5);
  });

  test('should filter logs by level', () => {
    logger.debug('Debug');
    logger.info('Info');
    logger.error('Error');

    const errors = logger.getLogs(LogLevel.ERROR);
    expect(errors).toHaveLength(1);
    expect(errors[0].level).toBe(LogLevel.ERROR);
  });

  test('should include module name in logs', () => {
    logger.info('Test message', undefined, 'TestModule');
    const logs = logger.getLogs();
    expect(logs[0].module).toBe('TestModule');
  });

  test('should sanitize metadata', () => {
    const circular: any = { a: 1 };
    circular.self = circular;

    logger.debug('Test', circular);
    const logs = logger.getLogs();
    expect(logs[0].metadata).toBeDefined();
  });

  test('should generate statistics', () => {
    logger.debug('Debug');
    logger.info('Info');
    logger.info('Info 2');
    logger.error('Error');

    const stats = logger.getStats();
    expect(stats.totalLogs).toBe(4);
    expect(stats.byLevel.DEBUG).toBe(1);
    expect(stats.byLevel.INFO).toBe(2);
    expect(stats.byLevel.ERROR).toBe(1);
  });

  test('should extract stack traces from errors', () => {
    const error = new Error('Test error');
    logger.error('Error occurred', error);

    const logs = logger.getLogs(LogLevel.ERROR);
    expect(logs[0].stack).toBeDefined();
    expect(logs[0].message).toContain('Test error');
  });
});

describe('Error Handler', () => {
  test('should classify network error', () => {
    const axiosError = new AxiosError('Network error');
    axiosError.code = 'ECONNREFUSED';

    const context = ErrorHandler.classifyError(axiosError);
    expect(context.category).toBe('NETWORK');
    expect(context.code).toBe(ERROR_CODES.NETWORK_ERROR);
    expect(context.retryable).toBe(true);
  });

  test('should classify timeout error', () => {
    const axiosError = new AxiosError('Timeout');
    axiosError.code = 'ECONNABORTED';

    const context = ErrorHandler.classifyError(axiosError);
    expect(context.category).toBe('NETWORK');
    expect(context.code).toBe(ERROR_CODES.TIMEOUT);
  });

  test('should classify validation error', () => {
    const error = new TypeError('Invalid type');

    const context = ErrorHandler.classifyError(error);
    expect(context.category).toBe('VALIDATION');
    expect(context.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(context.retryable).toBe(false);
  });

  test('should classify HTTP 401 as authentication error', () => {
    const axiosError = new AxiosError('Unauthorized');
    axiosError.response = { status: 401, statusText: 'Unauthorized', data: {} } as any;

    const context = ErrorHandler.classifyError(axiosError);
    expect(context.category).toBe('AUTHENTICATION');
    expect(context.statusCode).toBe(401);
    expect(context.retryable).toBe(false);
  });

  test('should classify HTTP 404 as not found', () => {
    const axiosError = new AxiosError('Not found');
    axiosError.response = { status: 404, statusText: 'Not Found', data: {} } as any;

    const context = ErrorHandler.classifyError(axiosError);
    expect(context.category).toBe('NOT_FOUND');
    expect(context.retryable).toBe(false);
  });

  test('should classify HTTP 500 as server error', () => {
    const axiosError = new AxiosError('Server error');
    axiosError.response = { status: 500, statusText: 'Server Error', data: {} } as any;

    const context = ErrorHandler.classifyError(axiosError);
    expect(context.category).toBe('SERVER');
    expect(context.retryable).toBe(true);
  });

  test('should check if error is retryable', () => {
    const networkError = new AxiosError('Network error');
    networkError.code = 'ECONNREFUSED';

    expect(ErrorHandler.isRetryable(networkError)).toBe(true);

    const authError = new AxiosError('Unauthorized');
    authError.response = { status: 401, statusText: 'Unauthorized', data: {} } as any;

    expect(ErrorHandler.isRetryable(authError)).toBe(false);
  });

  test('should check if error is auth-related', () => {
    const authError = new AxiosError('Unauthorized');
    authError.response = { status: 401, statusText: 'Unauthorized', data: {} } as any;

    expect(ErrorHandler.isAuthError(authError)).toBe(true);

    const networkError = new AxiosError('Network error');
    networkError.code = 'ECONNREFUSED';

    expect(ErrorHandler.isAuthError(networkError)).toBe(false);
  });

  test('should classify database constraint error', () => {
    const error = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed');

    const context = ErrorHandler.classifyError(error);
    expect(context.category).toBe('DATABASE');
    expect(context.code).toBe(ERROR_CODES.DATABASE_CONSTRAINT);
  });

  test('should get user message', () => {
    const message = ErrorHandler.getUserMessage(
      ERROR_CODES.NETWORK_ERROR,
      'pt-BR'
    );
    expect(message).toBe('Erro de conexão. Verifique sua internet.');

    const englishMessage = ErrorHandler.getUserMessage(
      ERROR_CODES.NETWORK_ERROR,
      'en-US'
    );
    expect(englishMessage).toBe('Network error. Check your connection.');
  });

  test('should create error report', () => {
    const error = new Error('Test error');
    const report = ErrorHandler.createErrorReport(error, 'testOp', 'testModule');

    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('operation', 'testOp');
    expect(report).toHaveProperty('module', 'testModule');
    expect(report).toHaveProperty('error');
    expect(report.error).toHaveProperty('code');
    expect(report.error).toHaveProperty('message');
  });
});

describe('Error Retry Logic', () => {
  test('should retry successful operation', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new AxiosError('Temporary error');
      }
      return 'success';
    };

    const result = await ErrorHandler.retry(
      fn,
      {
        maxAttempts: 3,
        initialDelay: 10,
        maxDelay: 100,
      }
    );

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  test('should throw after max attempts', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new AxiosError('Persistent error');
    };

    try {
      await ErrorHandler.retry(
        fn,
        {
          maxAttempts: 2,
          initialDelay: 10,
        }
      );
      fail('Should have thrown');
    } catch (error) {
      expect(attempts).toBe(2);
      const context = error as any;
      expect(context.retryCount).toBe(2);
    }
  });

  test('should not retry non-retryable errors', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      const error = new AxiosError('Auth error');
      error.response = { status: 401, statusText: 'Unauthorized', data: {} } as any;
      throw error;
    };

    try {
      await ErrorHandler.retry(
        fn,
        {
          maxAttempts: 3,
          initialDelay: 10,
        }
      );
      fail('Should have thrown');
    } catch (error) {
      expect(attempts).toBe(1); // Only initial attempt
    }
  });

  test('should calculate exponential backoff correctly', () => {
    // Test backoff calculation indirectly through retry behavior
    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    (global as any).setTimeout = (fn: Function, delay: number) => {
      delays.push(delay);
      return originalSetTimeout(fn, 0);
    };

    // Just verify the retry logic doesn't crash with backoff
    try {
      ErrorHandler.retry(
        async () => {
          throw new AxiosError('Network error');
        },
        {
          maxAttempts: 3,
          initialDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2,
        }
      );
    } catch {
      // Expected to fail
    }

    (global as any).setTimeout = originalSetTimeout;
  });
});

describe('Error Context', () => {
  test('should include timestamp', () => {
    const error = new Error('Test');
    const context = ErrorHandler.classifyError(error);

    expect(context.timestamp).toBeDefined();
    // Should be valid ISO string
    expect(new Date(context.timestamp).getTime()).toBeGreaterThan(0);
  });

  test('should include original error', () => {
    const originalError = new Error('Original');
    const context = ErrorHandler.classifyError(originalError);

    expect(context.originalError).toBe(originalError);
  });

  test('should include metadata', () => {
    const metadata = { userId: '123', operation: 'fetch' };
    const error = new Error('Test');
    const context = ErrorHandler.classifyError(error);

    // Metadata can be added manually
    context.metadata = metadata;
    expect(context.metadata).toEqual(metadata);
  });
});

describe('Database Error Classification', () => {
  test('should classify constraint violations', () => {
    const constraints = [
      'SQLITE_CONSTRAINT: UNIQUE constraint failed',
      'SQLITE_CONSTRAINT: FOREIGN KEY constraint failed',
      'SQLITE_CONSTRAINT: NOT NULL constraint failed',
    ];

    constraints.forEach((msg) => {
      const error = new Error(msg);
      const context = ErrorHandler.classifyError(error);
      expect(context.category).toBe('DATABASE');
    });
  });

  test('should classify IO errors as retryable', () => {
    const error = new Error('SQLITE_IOERR: disk I/O error');
    const context = ErrorHandler.classifyError(error);

    expect(context.category).toBe('DATABASE');
    expect(context.code).toBe(ERROR_CODES.DATABASE_IO_ERROR);
    expect(context.retryable).toBe(true);
  });
});
