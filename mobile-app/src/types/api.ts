/**
 * API Request and Response Types
 * Defines all types used for communication with the desktop API
 */

export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  skip?: number;
  take?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// Authentication APIs
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    nome: string;
    avatar?: string;
  };
  expiresIn: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  nome: string;
  sobrenome?: string;
}

export interface RegisterResponse extends LoginResponse {}

// Document APIs
export interface DocumentListRequest extends PaginationParams {
  search?: string;
  tipo?: string;
  dataInicio?: string;
  dataFim?: string;
}

export interface DocumentResponse {
  id: string;
  tipo: string;
  arquivo_nome: string;
  valor: number;
  data_documento: string;
  data_criacao: string;
  proprietario_id: string;
  descricao?: string;
  tags?: string[];
  url?: string;
  arquivo_path?: string;
}

export interface CreateDocumentRequest {
  tipo: string;
  arquivo_nome: string;
  valor: number;
  data_documento: string;
  descricao?: string;
  tags?: string[];
}

export interface UpdateDocumentRequest {
  tipo?: string;
  arquivo_nome?: string;
  valor?: number;
  data_documento?: string;
  descricao?: string;
  tags?: string[];
}

export interface DocumentUploadResponse {
  id: string;
  arquivo_nome: string;
  arquivo_path: string;
  url: string;
}

// OCR APIs
export interface OCRProcessRequest {
  arquivo_path: string;
  documentoId?: string;
}

export interface OCRProcessResponse {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  result?: {
    text: string;
    confidence: number;
    detectedFields?: {
      valor?: string;
      data?: string;
      proprietario?: string;
      [key: string]: string | undefined;
    };
  };
  error?: string;
}

// Transaction APIs
export interface TransactionListRequest extends PaginationParams {
  search?: string;
  categoria?: string;
  dataInicio?: string;
  dataFim?: string;
  tipo?: 'income' | 'expense' | 'all';
}

export interface TransactionResponse {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'income' | 'expense';
  proprietario_id: string;
  documento_id?: string;
  data_criacao: string;
  tags?: string[];
}

export interface CreateTransactionRequest {
  data: string;
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'income' | 'expense';
  documento_id?: string;
  tags?: string[];
}

export interface UpdateTransactionRequest {
  data?: string;
  descricao?: string;
  valor?: number;
  categoria?: string;
  tipo?: 'income' | 'expense';
  tags?: string[];
}

// Property APIs
export interface PropertyListRequest extends PaginationParams {
  search?: string;
  tipo?: string;
}

export interface PropertyResponse {
  id: string;
  nome: string;
  tipo: string;
  endereco: string;
  valor_estimado: number;
  data_aquisicao: string;
  proprietario_id: string;
  descricao?: string;
  tags?: string[];
  data_criacao: string;
}

export interface CreatePropertyRequest {
  nome: string;
  tipo: string;
  endereco: string;
  valor_estimado: number;
  data_aquisicao: string;
  descricao?: string;
  tags?: string[];
}

export interface UpdatePropertyRequest {
  nome?: string;
  tipo?: string;
  endereco?: string;
  valor_estimado?: number;
  data_aquisicao?: string;
  descricao?: string;
  tags?: string[];
}

// Dashboard APIs
export interface DashboardStatsResponse {
  totalDocuments: number;
  totalValue: number;
  recentDocuments: DocumentResponse[];
  recentTransactions: TransactionResponse[];
  summary: {
    byType: Record<string, number>;
    byMonth: Array<{
      month: string;
      count: number;
      value: number;
    }>;
  };
}

// Sync APIs
export interface SyncRequest {
  lastSyncTimestamp: number;
  changes: {
    documents?: any[];
    transactions?: any[];
    properties?: any[];
  };
}

export interface SyncResponse {
  data: {
    documents?: DocumentResponse[];
    transactions?: TransactionResponse[];
    properties?: PropertyResponse[];
  };
  timestamp: number;
  hasMore: boolean;
}
