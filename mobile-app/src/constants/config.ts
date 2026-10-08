/**
 * Application Configuration Constants
 * Default values, timeouts, API limits, etc.
 */

export const APP_CONFIG = {
  // App information
  APP_NAME: 'CRMT Mobile',
  APP_VERSION: '0.1.0',
  APP_SLUG: 'crmt-mobile',

  // API Configuration
  API: {
    DEFAULT_TIMEOUT: 30000, // 30 seconds
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000, // 1 second
    DEFAULT_ENDPOINT: 'http://localhost:8000',
  },

  // Token Configuration
  TOKEN: {
    TOKEN_KEY: 'authToken',
    REFRESH_TOKEN_KEY: 'refreshToken',
    TOKEN_EXPIRES_KEY: 'tokenExpiresAt',
    REFRESH_THRESHOLD: 5 * 60 * 1000, // Refresh 5 minutes before expiry
  },

  // Database Configuration
  DB: {
    NAME: 'crmt_mobile.db',
    VERSION: 1,
  },

  // UI Configuration
  UI: {
    TOAST_DURATION: 3000,
    DIALOG_ANIMATION_DURATION: 300,
    ANIMATION_DURATION: 200,
  },

  // Pagination
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },

  // Sync Configuration
  SYNC: {
    AUTO_SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
    SYNC_BATCH_SIZE: 50,
    RETRY_MAX_ATTEMPTS: 3,
  },

  // Cache Configuration
  CACHE: {
    DOCUMENTS_TTL: 60 * 60 * 1000, // 1 hour
    TRANSACTIONS_TTL: 60 * 60 * 1000, // 1 hour
    USER_PROFILE_TTL: 24 * 60 * 60 * 1000, // 1 day
  },

  // File Configuration
  FILE: {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50 MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'application/pdf'],
    DOCUMENT_UPLOAD_CHUNK_SIZE: 1024 * 1024, // 1 MB chunks
  },

  // Date Configuration
  DATE: {
    FORMAT: 'yyyy-MM-dd',
    DISPLAY_FORMAT: 'dd/MM/yyyy',
    TIME_FORMAT: 'HH:mm:ss',
    DATETIME_FORMAT: 'dd/MM/yyyy HH:mm:ss',
  },

  // Logging
  LOGGING: {
    ENABLED: true,
    LEVEL: 'info', // 'debug' | 'info' | 'warn' | 'error'
  },

  // Security
  SECURITY: {
    MIN_PASSWORD_LENGTH: 6,
    ENABLE_BIOMETRIC: true,
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  },

  // Feature Flags
  FEATURES: {
    OCR_ENABLED: true,
    OFFLINE_MODE: true,
    BIOMETRIC_LOGIN: false, // TODO: Implement
    VOICE_INPUT: false, // TODO: Implement
  },
} as const;

// Document Types
export const DOCUMENT_TYPES = {
  RECIBO: 'recibo',
  NOTAFISCAL: 'notafiscal',
  CONTRATO: 'contrato',
  OUTRO: 'outro',
} as const;

// Transaction Types
export const TRANSACTION_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

// Transaction Categories
export const TRANSACTION_CATEGORIES = {
  SALARY: 'salary',
  BONUS: 'bonus',
  FREELANCE: 'freelance',
  INVESTMENT: 'investment',
  OTHER_INCOME: 'other_income',
  RENT: 'rent',
  UTILITIES: 'utilities',
  GROCERIES: 'groceries',
  TRANSPORT: 'transport',
  ENTERTAINMENT: 'entertainment',
  HEALTHCARE: 'healthcare',
  EDUCATION: 'education',
  OTHER_EXPENSE: 'other_expense',
} as const;

// Property Types
export const PROPERTY_TYPES = {
  IMOVEL: 'imovel',
  VEICULO: 'veiculo',
  OUTRO: 'outro',
} as const;

// Error Codes
export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;
