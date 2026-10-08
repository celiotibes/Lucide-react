/**
 * API Configuration and Validation
 * Using Zod for runtime type validation
 */

import { z } from 'zod';

// Configuration Schemas
export const ApiConfigSchema = z.object({
  baseURL: z.string().url('Invalid API endpoint URL'),
  timeout: z.number().positive().default(30000),
  retryAttempts: z.number().nonnegative().default(3),
  retryDelay: z.number().nonnegative().default(1000),
  enableLogging: z.boolean().default(false),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

// Credentials Schema
export const CredentialsSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

// Document Schema
export const DocumentCreateSchema = z.object({
  tipo: z.enum(['recibo', 'notafiscal', 'contrato', 'outro']),
  arquivo_nome: z.string().min(1, 'File name is required'),
  valor: z.number().nonnegative('Value must be non-negative'),
  data_documento: z.string().datetime('Invalid date'),
  descricao: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type DocumentCreate = z.infer<typeof DocumentCreateSchema>;

// Transaction Schema
export const TransactionCreateSchema = z.object({
  data: z.string().datetime('Invalid date'),
  descricao: z.string().min(1, 'Description is required'),
  valor: z.number().positive('Value must be positive'),
  categoria: z.string().min(1, 'Category is required'),
  tipo: z.enum(['income', 'expense']),
  documento_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type TransactionCreate = z.infer<typeof TransactionCreateSchema>;

// Property Schema
export const PropertyCreateSchema = z.object({
  nome: z.string().min(1, 'Name is required'),
  tipo: z.enum(['imovel', 'veiculo', 'outro']),
  endereco: z.string().min(1, 'Address is required'),
  valor_estimado: z.number().nonnegative('Value must be non-negative'),
  data_aquisicao: z.string().datetime('Invalid date'),
  descricao: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type PropertyCreate = z.infer<typeof PropertyCreateSchema>;

// API Configuration Constants
export const DEFAULT_API_CONFIG: ApiConfig = {
  baseURL: 'http://localhost:8000',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  enableLogging: true,
};

// API Endpoints
export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/api/auth/login',
  AUTH_REGISTER: '/api/auth/register',
  AUTH_REFRESH: '/api/auth/refresh',
  AUTH_LOGOUT: '/api/auth/logout',
  AUTH_VERIFY: '/api/auth/verify',

  // Documents
  DOCUMENTS_LIST: '/api/documentos',
  DOCUMENTS_DETAIL: (id: string) => `/api/documentos/${id}`,
  DOCUMENTS_CREATE: '/api/documentos',
  DOCUMENTS_UPDATE: (id: string) => `/api/documentos/${id}`,
  DOCUMENTS_DELETE: (id: string) => `/api/documentos/${id}`,
  DOCUMENTS_UPLOAD: '/api/documentos/upload',

  // OCR
  OCR_PROCESS: '/api/ocr/process',
  OCR_STATUS: (id: string) => `/api/ocr/${id}/status`,

  // Transactions
  TRANSACTIONS_LIST: '/api/transacoes',
  TRANSACTIONS_DETAIL: (id: string) => `/api/transacoes/${id}`,
  TRANSACTIONS_CREATE: '/api/transacoes',
  TRANSACTIONS_UPDATE: (id: string) => `/api/transacoes/${id}`,
  TRANSACTIONS_DELETE: (id: string) => `/api/transacoes/${id}`,

  // Properties
  PROPERTIES_LIST: '/api/imoveis',
  PROPERTIES_DETAIL: (id: string) => `/api/imoveis/${id}`,
  PROPERTIES_CREATE: '/api/imoveis',
  PROPERTIES_UPDATE: (id: string) => `/api/imoveis/${id}`,
  PROPERTIES_DELETE: (id: string) => `/api/imoveis/${id}`,

  // Sync
  SYNC: '/api/sync',
  SYNC_STATUS: '/api/sync/status',

  // Dashboard
  DASHBOARD_STATS: '/api/dashboard/stats',
  DASHBOARD_SUMMARY: '/api/dashboard/summary',

  // User
  USER_PROFILE: '/api/user/profile',
  USER_UPDATE: '/api/user/profile',
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  TIMEOUT: 'Request timeout. Please try again.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  UNAUTHORIZED: 'Unauthorized. Please log in again.',
  NOT_FOUND: 'Resource not found.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Validation error. Please check your input.',
  API_ENDPOINT_INVALID: 'Invalid API endpoint. Please check the URL.',
} as const;
