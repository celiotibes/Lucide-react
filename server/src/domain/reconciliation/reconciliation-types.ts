/**
 * Tipos para o Sistema de Reconciliação de Transações
 */

/**
 * Resultado de um match entre ledger entry e source transaction
 */
export interface ReconciliationMatch {
  id: string;
  ledger_entry_id: string;
  source_transaction_id: string;
  agente_id?: string;
  match_score: number;
  score_date: number;
  score_amount: number;
  score_description: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_MATCHED';
  created_by?: string;
  created_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  approved_by?: string;
  approved_at?: string;
  match_details?: Record<string, unknown>;
  rejection_reason?: string;
  updated_at: string;
}

/**
 * Transação de origem (banco/sistema externo)
 */
export interface SourceTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Entrada de ledger
 */
export interface LedgerEntryForReconciliation {
  id: string;
  data: string;
  valor: number;
  descricao?: string;
  referencia_externa?: string;
  tipo: 'receita' | 'despesa';
  categoria: string;
}

/**
 * Resultado de um matching
 */
export interface MatchingResult {
  ledger_entry_id: string;
  source_transaction_id: string;
  match_score: number;
  score_breakdown: {
    date: number;
    amount: number;
    description: number;
  };
  candidates: {
    id: string;
    score: number;
    source_date: string;
    source_amount: number;
    source_description: string;
  }[];
}

/**
 * Entrada desemparelhada
 */
export interface UnmatchedEntry {
  id: string;
  date: string;
  amount: number;
  description?: string;
  type: 'ledger' | 'source';
  metadata?: Record<string, unknown>;
}

/**
 * Relatório de reconciliação
 */
export interface ReconciliationReport {
  agente_id: string;
  period_start: string;
  period_end: string;
  total_ledger_entries: number;
  total_source_transactions: number;
  matched_entries: number;
  pending_matches: number;
  approved_matches: number;
  rejected_matches: number;
  unmatched_ledger_entries: number;
  unmatched_source_transactions: number;
  matching_rate: number;
  unmatched_ledger: UnmatchedEntry[];
  unmatched_source: UnmatchedEntry[];
  recommendations: string[];
}

/**
 * Status da reconciliação
 */
export interface ReconciliationStatus {
  id: string;
  agente_id: string;
  period_start: string;
  period_end: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'PARTIAL' | 'FAILED';
  completion_percentage: number;
  total_ledger_entries: number;
  total_source_transactions: number;
  matched_entries: number;
  pending_matches: number;
  approved_matches: number;
  rejected_matches: number;
  unmatched_ledger_entries: number;
  unmatched_source_transactions: number;
  processing_time_ms: number;
  started_at: string;
  completed_at?: string;
  started_by?: string;
}

/**
 * Configuração de matching
 */
export interface MatchingConfig {
  date_tolerance_days?: number;  // Default: 1
  amount_tolerance_percent?: number;  // Default: 5
  description_similarity_threshold?: number;  // Default: 0.7
  score_thresholds?: {
    date: number;  // Default: 30
    amount: number;  // Default: 40
    description: number;  // Default: 30
  };
  minimum_match_score?: number;  // Default: 80
  max_candidates?: number;  // Default: 3
}
