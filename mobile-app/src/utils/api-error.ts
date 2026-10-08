/**
 * API Error Handling Utilities
 * Provides error parsing and user-friendly messages
 */

import { AxiosError } from 'axios';
import { ApiErrorResponse, AuthError } from '@/types';
import { ERROR_MESSAGES, HTTP_STATUS } from '@/api';

export class ApiException extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code: string = 'UNKNOWN_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiException';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function parseApiError(error: unknown): ApiErrorResponse {
  if (error instanceof ApiException) {
    return {
      error: error.code,
      message: error.message,
      statusCode: error.statusCode,
      details: error.details,
    };
  }

  if (error instanceof AxiosError) {
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
      message: error.message || ERROR_MESSAGES.SERVER_ERROR,
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

export function toAuthError(error: ApiErrorResponse): AuthError {
  let code = error.error;
  let message = error.message;

  switch (error.statusCode) {
    case HTTP_STATUS.UNAUTHORIZED:
      code = 'INVALID_CREDENTIALS';
      message = ERROR_MESSAGES.INVALID_CREDENTIALS;
      break;
    case HTTP_STATUS.BAD_REQUEST:
      code = 'VALIDATION_ERROR';
      message = ERROR_MESSAGES.VALIDATION_ERROR;
      break;
    case HTTP_STATUS.CONFLICT:
      code = 'CONFLICT';
      message = 'Email already in use';
      break;
  }

  return { code, message };
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return !error.response || error.code === 'ECONNABORTED';
  }
  return false;
}

export function isAuthError(error: unknown): boolean {
  const parsed = parseApiError(error);
  return parsed.statusCode === HTTP_STATUS.UNAUTHORIZED;
}

export function isValidationError(error: unknown): boolean {
  const parsed = parseApiError(error);
  return (
    parsed.statusCode === HTTP_STATUS.BAD_REQUEST ||
    parsed.statusCode === HTTP_STATUS.UNPROCESSABLE_ENTITY
  );
}

export function getErrorMessage(error: unknown): string {
  const parsed = parseApiError(error);
  return parsed.message || ERROR_MESSAGES.SERVER_ERROR;
}

export function getErrorCode(error: unknown): string {
  const parsed = parseApiError(error);
  return parsed.error;
}

export function shouldRetry(error: unknown): boolean {
  const parsed = parseApiError(error);

  // Retry on network errors and server errors
  if (isNetworkError(error)) {
    return true;
  }

  // Retry on 5xx errors except 501 Not Implemented
  if (parsed.statusCode >= 500 && parsed.statusCode !== 501) {
    return true;
  }

  // Retry on 429 Too Many Requests
  if (parsed.statusCode === 429) {
    return true;
  }

  return false;
}
