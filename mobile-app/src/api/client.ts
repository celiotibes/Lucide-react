/**
 * Axios API Client - Phase 22.14 Security Hardening
 * Configured with auth interceptors, input/output validation, and XSS/SQL injection prevention
 */

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiConfig, DEFAULT_API_CONFIG, ERROR_MESSAGES, HTTP_STATUS } from './config';
import { ApiErrorResponse } from '@/types';
import { DataValidationService } from '@/utils/security/dataValidationService';
import { logger } from '@/utils/logger';

/**
 * Custom error class for validation failures
 */
export class ValidationError extends Error {
  constructor(
    public message: string,
    public code: string = 'VALIDATION_ERROR',
    public details?: Record<string, any>,
  ) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Custom error class for sanitization failures
 */
export class SanitizationError extends Error {
  constructor(
    public message: string,
    public code: string = 'SANITIZATION_ERROR',
    public details?: Record<string, any>,
  ) {
    super(message);
    this.name = 'SanitizationError';
    Object.setPrototypeOf(this, SanitizationError.prototype);
  }
}

/**
 * Patterns for detecting suspicious content in requests/responses
 */
const SUSPICIOUS_PATTERNS = {
  SQL_KEYWORDS: /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b/gi,
  SCRIPT_TAGS: /<script[^>]*>.*?<\/script>/gi,
  EVENT_HANDLERS: /\b(onerror|onclick|onload|onmouseover|onchange|onsubmit|onfocus)\s*=/gi,
  SCRIPT_PROTOCOL: /javascript:/gi,
  DANGEROUS_HTML: /<iframe|<object|<embed|<img[^>]+src/gi,
};

/**
 * Type guard to check if value is a plain object
 */
function isPlainObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Recursively sanitize object values
 */
function sanitizeObjectValues(obj: any, depth = 0): any {
  if (depth > 10) {
    logger.warn('Sanitization depth exceeded', { depth }, 'ApiClient');
    return obj;
  }

  if (typeof obj === 'string') {
    return DataValidationService.sanitizeInput(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectValues(item, depth + 1));
  }

  if (isPlainObject(obj)) {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObjectValues(value, depth + 1);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Check for suspicious patterns in a string
 */
function detectSuspiciousPatterns(value: string): Array<{ pattern: string; matches: string[] }> {
  const suspicious: Array<{ pattern: string; matches: string[] }> = [];

  for (const [patternName, regex] of Object.entries(SUSPICIOUS_PATTERNS)) {
    const matches = value.match(regex);
    if (matches) {
      suspicious.push({
        pattern: patternName,
        matches: matches.slice(0, 3), // Limit to first 3 matches
      });
    }
  }

  return suspicious;
}

/**
 * Recursively validate object structure for suspicious content
 */
function validateObjectForSuspiciousContent(
  obj: any,
  path = 'root',
  depth = 0,
): Array<{ path: string; suspicious: Array<{ pattern: string; matches: string[] }> }> {
  if (depth > 10) {
    return [];
  }

  const violations: Array<{ path: string; suspicious: Array<{ pattern: string; matches: string[] }> }> = [];

  if (typeof obj === 'string') {
    const suspicious = detectSuspiciousPatterns(obj);
    if (suspicious.length > 0) {
      violations.push({ path, suspicious });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      violations.push(...validateObjectForSuspiciousContent(item, `${path}[${index}]`, depth + 1));
    });
  } else if (isPlainObject(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = `${path}.${key}`;
      violations.push(...validateObjectForSuspiciousContent(value, newPath, depth + 1));
    }
  }

  return violations;
}

class ApiClient {
  private instance: AxiosInstance;
  private config: ApiConfig;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = {
      ...DEFAULT_API_CONFIG,
      ...config,
    };

    this.instance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor 1 - Validate and sanitize input (Phase 22.14 Security Hardening)
    this.instance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const requestId = Math.random().toString(36).substr(2, 9);
        const timestamp = new Date().toISOString();

        try {
          // Validate request body if present
          if (config.data) {
            // Check for suspicious patterns in request data
            const violations = validateObjectForSuspiciousContent(config.data);

            if (violations.length > 0) {
              logger.warn(
                `Suspicious patterns detected in request: ${violations.length} violations`,
                {
                  requestId,
                  url: config.url,
                  violations: violations.slice(0, 5), // Limit to first 5 violations
                },
                'ApiClient',
              );

              // Reject requests with SQL keywords or script tags
              const criticalViolations = violations.filter((v) =>
                v.suspicious.some((s) =>
                  ['SQL_KEYWORDS', 'SCRIPT_TAGS', 'EVENT_HANDLERS'].includes(s.pattern),
                ),
              );

              if (criticalViolations.length > 0) {
                logger.error(
                  'Request blocked: contains potentially malicious content',
                  {
                    requestId,
                    url: config.url,
                    violations: criticalViolations,
                  },
                  'ApiClient',
                );
                throw new ValidationError(
                  'Request contains potentially malicious content (SQL keywords, scripts, or event handlers detected)',
                  'MALICIOUS_CONTENT_DETECTED',
                  { violations: criticalViolations },
                );
              }
            }

            // Sanitize request data
            const sanitizedData = sanitizeObjectValues(config.data);
            config.data = sanitizedData;

            logger.debug(
              'Request data validated and sanitized',
              {
                requestId,
                url: config.url,
                timestamp,
                dataType: typeof config.data,
              },
              'ApiClient',
            );
          }

          // Validate request structure
          if (config.data && isPlainObject(config.data)) {
            // Check for required fields in common endpoints
            const url = config.url || '';

            // Email validation for auth endpoints
            if ((url.includes('/auth/login') || url.includes('/auth/register')) && config.data.email) {
              if (!DataValidationService.validateEmail(config.data.email)) {
                throw new ValidationError(
                  'Invalid email format in request',
                  'INVALID_EMAIL',
                  { email: config.data.email },
                );
              }
            }

            // Numeric validation
            for (const [key, value] of Object.entries(config.data)) {
              if (
                typeof value === 'string' &&
                (key.includes('valor') || key.includes('value') || key.includes('amount'))
              ) {
                const num = Number(value);
                if (isNaN(num) || !isFinite(num)) {
                  throw new ValidationError(
                    `Invalid numeric value for field: ${key}`,
                    'INVALID_NUMBER',
                    { field: key, value },
                  );
                }
              }
            }
          }

          return config;
        } catch (error) {
          if (error instanceof ValidationError) {
            logger.error(
              'Validation error in request interceptor',
              {
                requestId,
                error: error.message,
                code: error.code,
                url: config.url,
              },
              'ApiClient',
            );
            return Promise.reject(error);
          }

          logger.error(
            'Unexpected error in request validation',
            error,
            'ApiClient',
          );
          return Promise.reject(error);
        }
      },
      (error) => Promise.reject(error),
    );

    // Request interceptor 2 - Add auth token
    this.instance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor 1 - Validate and sanitize response data
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        const requestId = Math.random().toString(36).substr(2, 9);

        try {
          if (response.data) {
            // Check for suspicious patterns in response data
            const violations = validateObjectForSuspiciousContent(response.data);

            if (violations.length > 0) {
              logger.warn(
                `Suspicious patterns detected in response: ${violations.length} violations`,
                {
                  requestId,
                  url: response.config?.url,
                  status: response.status,
                  violations: violations.slice(0, 3), // Limit to first 3 violations
                },
                'ApiClient',
              );
            }

            // Sanitize response data to remove any injected content
            const sanitizedData = sanitizeObjectValues(response.data);
            response.data = sanitizedData;

            logger.debug(
              'Response data validated and sanitized',
              {
                requestId,
                url: response.config?.url,
                status: response.status,
                timestamp: new Date().toISOString(),
              },
              'ApiClient',
            );
          }

          return response;
        } catch (error) {
          logger.error(
            'Error in response validation interceptor',
            error,
            'ApiClient',
          );
          // Don't reject on response validation errors - allow response to pass through
          // but log the issue
          return response;
        }
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };

        if (!originalRequest) {
          return Promise.reject(error);
        }

        // Handle 401 Unauthorized - try to refresh token
        if (error.response?.status === HTTP_STATUS.UNAUTHORIZED && !originalRequest._retry) {
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then((token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return this.instance(originalRequest);
              })
              .catch((err) => Promise.reject(err));
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const refreshToken = await AsyncStorage.getItem('refreshToken');
            if (!refreshToken) {
              throw new Error('No refresh token available');
            }

            const response = await this.instance.post('/api/auth/refresh', {
              refreshToken,
            });

            const { token, expiresIn } = response.data;
            await AsyncStorage.setItem('authToken', token);
            await AsyncStorage.setItem('tokenExpiresAt', (Date.now() + expiresIn * 1000).toString());

            this.instance.defaults.headers.common.Authorization = `Bearer ${token}`;
            originalRequest.headers.Authorization = `Bearer ${token}`;

            this.processQueue(null, token);
            this.isRefreshing = false;

            logger.info('Token refreshed successfully', {}, 'ApiClient');

            return this.instance(originalRequest);
          } catch (err) {
            this.processQueue(err as Error, null);
            this.isRefreshing = false;
            await this.clearAuth();

            logger.error('Token refresh failed', err, 'ApiClient');

            return Promise.reject(err);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private processQueue(error: Error | null, token: string | null): void {
    this.failedQueue.forEach((item) => {
      if (error) {
        item.reject(error);
      } else if (token) {
        item.resolve(token);
      }
    });
    this.failedQueue = [];
  }

  private async clearAuth(): Promise<void> {
    await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'tokenExpiresAt', 'user']);
  }

  public setBaseURL(url: string): void {
    this.config.baseURL = url;
    this.instance.defaults.baseURL = url;
  }

  public getBaseURL(): string {
    return this.config.baseURL;
  }

  public setAuthToken(token: string): void {
    this.instance.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  public clearAuthToken(): void {
    delete this.instance.defaults.headers.common.Authorization;
  }

  public async testConnection(): Promise<boolean> {
    try {
      const response = await this.instance.get('/api/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Validate email field
   */
  public validateEmail(email: string): { valid: boolean; error?: string } {
    try {
      if (!email || typeof email !== 'string') {
        return { valid: false, error: 'Email must be a non-empty string' };
      }

      if (!DataValidationService.validateEmail(email)) {
        return { valid: false, error: 'Invalid email format or contains suspicious content' };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Email validation error', error, 'ApiClient');
      return { valid: false, error: 'Email validation failed' };
    }
  }

  /**
   * Validate numeric field
   */
  public validateNumeric(value: any, fieldName: string): { valid: boolean; error?: string } {
    try {
      const num = Number(value);

      if (isNaN(num)) {
        return { valid: false, error: `${fieldName} must be a valid number` };
      }

      if (!isFinite(num)) {
        return { valid: false, error: `${fieldName} must be a finite number` };
      }

      return { valid: true };
    } catch (error) {
      logger.error(`Numeric validation error for ${fieldName}`, error, 'ApiClient');
      return { valid: false, error: `${fieldName} validation failed` };
    }
  }

  /**
   * Validate string field against SQL injection and XSS
   */
  public validateString(value: string, fieldName: string): { valid: boolean; error?: string } {
    try {
      if (!value || typeof value !== 'string') {
        return { valid: false, error: `${fieldName} must be a non-empty string` };
      }

      if (!DataValidationService.preventSqlInjection(value)) {
        return { valid: false, error: `${fieldName} contains suspicious SQL-like content` };
      }

      if (!DataValidationService.isSafeString(value)) {
        return { valid: false, error: `${fieldName} contains potentially unsafe content` };
      }

      return { valid: true };
    } catch (error) {
      logger.error(`String validation error for ${fieldName}`, error, 'ApiClient');
      return { valid: false, error: `${fieldName} validation failed` };
    }
  }

  /**
   * Sanitize input string
   */
  public sanitizeString(value: string): string {
    try {
      return DataValidationService.sanitizeInput(value);
    } catch (error) {
      logger.error('String sanitization error', error, 'ApiClient');
      return '';
    }
  }

  /**
   * Sanitize HTML content
   */
  public sanitizeHtml(html: string): string {
    try {
      return DataValidationService.sanitizeHtml(html);
    } catch (error) {
      logger.error('HTML sanitization error', error, 'ApiClient');
      return '';
    }
  }

  /**
   * Get validation error details for client-side handling
   */
  public getValidationErrorDetails(error: unknown): { message: string; code: string; details?: any } {
    if (error instanceof ValidationError) {
      return {
        message: error.message,
        code: error.code,
        details: error.details,
      };
    }

    if (error instanceof SanitizationError) {
      return {
        message: error.message,
        code: error.code,
        details: error.details,
      };
    }

    return {
      message: 'Unknown validation error',
      code: 'UNKNOWN_ERROR',
    };
  }

  public getAxiosInstance(): AxiosInstance {
    return this.instance;
  }
}

// Create and export singleton instance
export const apiClient = new ApiClient();

// Helper function to format API errors (Phase 22.14 Security Hardening)
export function formatApiError(error: unknown): ApiErrorResponse {
  // Handle validation errors
  if (error instanceof ValidationError) {
    logger.warn('Validation error formatted', {
      code: error.code,
      message: error.message,
    }, 'ApiClient');

    return {
      error: error.code,
      message: error.message,
      statusCode: HTTP_STATUS.BAD_REQUEST,
    };
  }

  // Handle sanitization errors
  if (error instanceof SanitizationError) {
    logger.warn('Sanitization error formatted', {
      code: error.code,
      message: error.message,
    }, 'ApiClient');

    return {
      error: error.code,
      message: error.message,
      statusCode: HTTP_STATUS.BAD_REQUEST,
    };
  }

  if (axios.isAxiosError(error)) {
    if (error.response?.data) {
      return error.response.data as ApiErrorResponse;
    }

    if (error.code === 'ECONNABORTED') {
      return {
        error: 'TIMEOUT',
        message: ERROR_MESSAGES.TIMEOUT,
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      };
    }

    if (!error.response) {
      return {
        error: 'NETWORK_ERROR',
        message: ERROR_MESSAGES.NETWORK_ERROR,
        statusCode: 0,
      };
    }

    return {
      error: `HTTP_${error.response.status}`,
      message: error.response.statusText || ERROR_MESSAGES.SERVER_ERROR,
      statusCode: error.response.status,
    };
  }

  if (error instanceof Error) {
    return {
      error: 'UNKNOWN_ERROR',
      message: error.message,
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    };
  }

  return {
    error: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  };
}
