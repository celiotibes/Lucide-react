/**
 * Business Domain Types
 * Core entities used throughout the application
 */

export interface User {
  id: string;
  email: string;
  nome: string;
  sobrenome?: string;
  avatar?: string;
  ativo: boolean;
  data_criacao: string;
  ultima_atualizacao: string;
}

export interface Document {
  id: string;
  tipo: 'recibo' | 'notafiscal' | 'contrato' | 'outro';
  arquivo_nome: string;
  arquivo_path?: string;
  url?: string;
  valor: number;
  data_documento: string;
  data_criacao: string;
  proprietario_id: string;
  descricao?: string;
  tags?: string[];
  ocr_processado: boolean;
  ocr_resultado?: string;
}

export interface Transaction {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'income' | 'expense';
  proprietario_id: string;
  documento_id?: string;
  data_criacao: string;
  ultima_atualizacao: string;
  tags?: string[];
  notas?: string;
}

export interface Property {
  id: string;
  nome: string;
  tipo: 'imovel' | 'veiculo' | 'outro';
  endereco: string;
  valor_estimado: number;
  data_aquisicao: string;
  proprietario_id: string;
  descricao?: string;
  tags?: string[];
  data_criacao: string;
  ultima_atualizacao: string;
}

export interface Category {
  id: string;
  nome: string;
  tipo: 'income' | 'expense';
  icon?: string;
  cor?: string;
  ativa: boolean;
}

export interface Tag {
  id: string;
  nome: string;
  cor?: string;
  proprietario_id: string;
}

export type DocumentType = 'recibo' | 'notafiscal' | 'contrato' | 'outro';
export type TransactionType = 'income' | 'expense';
export type PropertyType = 'imovel' | 'veiculo' | 'outro';

export interface DashboardData {
  user: User;
  stats: {
    totalDocuments: number;
    totalValue: number;
    documentsByType: Record<DocumentType, number>;
    transactionsByMonth: Array<{
      month: string;
      income: number;
      expense: number;
    }>;
  };
  recentDocuments: Document[];
  recentTransactions: Transaction[];
  recentProperties: Property[];
}

export interface SyncData {
  documents: Document[];
  transactions: Transaction[];
  properties: Property[];
  deletedIds: {
    documents: string[];
    transactions: string[];
    properties: string[];
  };
  timestamp: number;
}
