/**
 * Error Constants and Messages - Phase 22.9
 *
 * Centralized error codes and user-friendly messages
 * Supporting multiple languages: Portuguese and English
 */

export const ERROR_CODES = {
  // Network Errors
  NETWORK_ERROR: 'ERR_NETWORK',
  TIMEOUT: 'ERR_TIMEOUT',
  CONNECTION_REFUSED: 'ERR_CONNECTION_REFUSED',

  // Authentication & Authorization
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  FORBIDDEN: 'ERR_FORBIDDEN',
  INVALID_CREDENTIALS: 'ERR_INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'ERR_TOKEN_EXPIRED',
  SESSION_EXPIRED: 'ERR_SESSION_EXPIRED',

  // Database Errors
  DATABASE_ERROR: 'ERR_DATABASE',
  DATABASE_CONSTRAINT: 'ERR_DB_CONSTRAINT',
  DATABASE_IO_ERROR: 'ERR_DB_IO',
  DATA_INTEGRITY_ERROR: 'ERR_DATA_INTEGRITY',
  STORAGE_QUOTA_ERROR: 'ERR_STORAGE_QUOTA',

  // Validation Errors
  VALIDATION_ERROR: 'ERR_VALIDATION',
  INVALID_INPUT: 'ERR_INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'ERR_MISSING_FIELD',
  INVALID_FORMAT: 'ERR_INVALID_FORMAT',

  // Resource Errors
  NOT_FOUND: 'ERR_NOT_FOUND',
  CONFLICT: 'ERR_CONFLICT',
  RESOURCE_EXISTS: 'ERR_RESOURCE_EXISTS',
  RESOURCE_DELETED: 'ERR_RESOURCE_DELETED',

  // Server Errors
  SERVER_ERROR: 'ERR_SERVER',
  SERVICE_UNAVAILABLE: 'ERR_SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'ERR_RATE_LIMITED',
  BAD_GATEWAY: 'ERR_BAD_GATEWAY',

  // Application Errors
  SYNC_ERROR: 'ERR_SYNC_FAILED',
  SYNC_CONFLICT: 'ERR_SYNC_CONFLICT',
  OFFLINE_MODE: 'ERR_OFFLINE_MODE',
  CACHE_ERROR: 'ERR_CACHE',
  UNKNOWN_ERROR: 'ERR_UNKNOWN',
} as const;

export const ERROR_CATEGORIES = {
  NETWORK: 'NETWORK',
  DATABASE: 'DATABASE',
  VALIDATION: 'VALIDATION',
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SERVER: 'SERVER',
  UNKNOWN: 'UNKNOWN',
} as const;

export type I18N_LOCALES = 'pt-BR' | 'en-US';

export const ERROR_MESSAGES = {
  'pt-BR': {
    // Network Errors
    [ERROR_CODES.NETWORK_ERROR]: 'Erro de conexão. Verifique sua internet.',
    [ERROR_CODES.TIMEOUT]: 'Tempo limite excedido. Tente novamente.',
    [ERROR_CODES.CONNECTION_REFUSED]: 'Conexão recusada. Servidor indisponível.',

    // Authentication & Authorization
    [ERROR_CODES.UNAUTHORIZED]: 'Não autorizado. Faça login novamente.',
    [ERROR_CODES.FORBIDDEN]: 'Acesso negado.',
    [ERROR_CODES.INVALID_CREDENTIALS]: 'Email ou senha inválidos.',
    [ERROR_CODES.TOKEN_EXPIRED]: 'Sessão expirada. Faça login novamente.',
    [ERROR_CODES.SESSION_EXPIRED]: 'Sua sessão expirou. Por favor, faça login novamente.',

    // Database Errors
    [ERROR_CODES.DATABASE_ERROR]: 'Erro ao acessar banco de dados.',
    [ERROR_CODES.DATABASE_CONSTRAINT]: 'Violação de restrição de banco de dados.',
    [ERROR_CODES.DATABASE_IO_ERROR]: 'Erro ao ler/escrever dados.',
    [ERROR_CODES.DATA_INTEGRITY_ERROR]: 'Erro de integridade de dados.',
    [ERROR_CODES.STORAGE_QUOTA_ERROR]: 'Espaço de armazenamento insuficiente.',

    // Validation Errors
    [ERROR_CODES.VALIDATION_ERROR]: 'Dados inválidos. Verifique sua entrada.',
    [ERROR_CODES.INVALID_INPUT]: 'Entrada inválida.',
    [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Campo obrigatório não preenchido.',
    [ERROR_CODES.INVALID_FORMAT]: 'Formato inválido.',

    // Resource Errors
    [ERROR_CODES.NOT_FOUND]: 'Recurso não encontrado.',
    [ERROR_CODES.CONFLICT]: 'Conflito ao processar requisição.',
    [ERROR_CODES.RESOURCE_EXISTS]: 'Recurso já existe.',
    [ERROR_CODES.RESOURCE_DELETED]: 'Recurso foi deletado.',

    // Server Errors
    [ERROR_CODES.SERVER_ERROR]: 'Erro no servidor. Tente novamente.',
    [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Serviço indisponível. Tente novamente.',
    [ERROR_CODES.RATE_LIMITED]: 'Muitas requisições. Aguarde alguns instantes.',
    [ERROR_CODES.BAD_GATEWAY]: 'Erro de gateway. Tente novamente.',

    // Application Errors
    [ERROR_CODES.SYNC_ERROR]: 'Erro ao sincronizar dados.',
    [ERROR_CODES.SYNC_CONFLICT]: 'Conflito de sincronização detectado.',
    [ERROR_CODES.OFFLINE_MODE]: 'Modo offline. Conecte-se à internet.',
    [ERROR_CODES.CACHE_ERROR]: 'Erro ao acessar cache.',
    [ERROR_CODES.UNKNOWN_ERROR]: 'Erro desconhecido. Tente novamente.',
  },
  'en-US': {
    // Network Errors
    [ERROR_CODES.NETWORK_ERROR]: 'Network error. Check your connection.',
    [ERROR_CODES.TIMEOUT]: 'Request timeout. Please try again.',
    [ERROR_CODES.CONNECTION_REFUSED]: 'Connection refused. Server unavailable.',

    // Authentication & Authorization
    [ERROR_CODES.UNAUTHORIZED]: 'Unauthorized. Please login again.',
    [ERROR_CODES.FORBIDDEN]: 'Access denied.',
    [ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid email or password.',
    [ERROR_CODES.TOKEN_EXPIRED]: 'Session expired. Please login again.',
    [ERROR_CODES.SESSION_EXPIRED]: 'Your session has expired. Please login again.',

    // Database Errors
    [ERROR_CODES.DATABASE_ERROR]: 'Database access error.',
    [ERROR_CODES.DATABASE_CONSTRAINT]: 'Database constraint violation.',
    [ERROR_CODES.DATABASE_IO_ERROR]: 'Error reading/writing data.',
    [ERROR_CODES.DATA_INTEGRITY_ERROR]: 'Data integrity error.',
    [ERROR_CODES.STORAGE_QUOTA_ERROR]: 'Storage quota exceeded.',

    // Validation Errors
    [ERROR_CODES.VALIDATION_ERROR]: 'Invalid data. Check your input.',
    [ERROR_CODES.INVALID_INPUT]: 'Invalid input.',
    [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Required field is missing.',
    [ERROR_CODES.INVALID_FORMAT]: 'Invalid format.',

    // Resource Errors
    [ERROR_CODES.NOT_FOUND]: 'Resource not found.',
    [ERROR_CODES.CONFLICT]: 'Conflict processing request.',
    [ERROR_CODES.RESOURCE_EXISTS]: 'Resource already exists.',
    [ERROR_CODES.RESOURCE_DELETED]: 'Resource has been deleted.',

    // Server Errors
    [ERROR_CODES.SERVER_ERROR]: 'Server error. Please try again.',
    [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service unavailable. Please try again.',
    [ERROR_CODES.RATE_LIMITED]: 'Too many requests. Please wait.',
    [ERROR_CODES.BAD_GATEWAY]: 'Gateway error. Please try again.',

    // Application Errors
    [ERROR_CODES.SYNC_ERROR]: 'Error syncing data.',
    [ERROR_CODES.SYNC_CONFLICT]: 'Sync conflict detected.',
    [ERROR_CODES.OFFLINE_MODE]: 'Offline mode. Connect to internet.',
    [ERROR_CODES.CACHE_ERROR]: 'Cache access error.',
    [ERROR_CODES.UNKNOWN_ERROR]: 'Unknown error. Please try again.',
  },
} as const;

/**
 * Get error message by code and locale
 */
export function getErrorMessage(
  code: string,
  locale: I18N_LOCALES = 'pt-BR'
): string {
  return (
    ERROR_MESSAGES[locale]?.[code as keyof typeof ERROR_MESSAGES['pt-BR']] ||
    ERROR_MESSAGES[locale]?.UNKNOWN_ERROR ||
    'An error occurred'
  );
}

/**
 * Get error documentation URL
 */
export function getErrorDocUrl(code: string): string {
  return `https://docs.example.com/errors/${code}`;
}

/**
 * Check if error code is retryable
 */
export function isRetryableError(code: string): boolean {
  const retryableCodes = [
    ERROR_CODES.NETWORK_ERROR,
    ERROR_CODES.TIMEOUT,
    ERROR_CODES.SERVER_ERROR,
    ERROR_CODES.SERVICE_UNAVAILABLE,
    ERROR_CODES.RATE_LIMITED,
    ERROR_CODES.DATABASE_IO_ERROR,
  ];
  return retryableCodes.includes(code as any);
}

/**
 * Check if error is critical (should show alert)
 */
export function isCriticalError(code: string): boolean {
  const criticalCodes = [
    ERROR_CODES.DATA_INTEGRITY_ERROR,
    ERROR_CODES.STORAGE_QUOTA_ERROR,
    ERROR_CODES.SYNC_CONFLICT,
    ERROR_CODES.SESSION_EXPIRED,
    ERROR_CODES.TOKEN_EXPIRED,
  ];
  return criticalCodes.includes(code as any);
}

/**
 * Log severity mapping
 */
export const ERROR_SEVERITY = {
  [ERROR_CODES.NETWORK_ERROR]: 'LOW',
  [ERROR_CODES.TIMEOUT]: 'LOW',
  [ERROR_CODES.VALIDATION_ERROR]: 'LOW',
  [ERROR_CODES.NOT_FOUND]: 'LOW',
  [ERROR_CODES.OFFLINE_MODE]: 'MEDIUM',
  [ERROR_CODES.CONFLICT]: 'MEDIUM',
  [ERROR_CODES.SYNC_ERROR]: 'MEDIUM',
  [ERROR_CODES.DATABASE_ERROR]: 'HIGH',
  [ERROR_CODES.DATA_INTEGRITY_ERROR]: 'CRITICAL',
  [ERROR_CODES.SESSION_EXPIRED]: 'HIGH',
  [ERROR_CODES.TOKEN_EXPIRED]: 'HIGH',
  [ERROR_CODES.UNAUTHORIZED]: 'HIGH',
  [ERROR_CODES.UNKNOWN_ERROR]: 'HIGH',
} as const;
