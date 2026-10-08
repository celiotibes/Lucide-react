/**
 * Phase 19: Reconciliation Engine - Transaction Matching & Reconciliation
 *
 * Sistema automático de reconciliação de transações:
 * - Matching fuzzy de lançamentos contábeis com transações bancárias/externas
 * - Tracking de matches com audit trail
 * - Detecção de transações desemparelhadas
 * - Scoring e aprovação de matches
 *
 * Tabelas:
 * - reconciliation_matches: armazena matches entre ledger e source transactions
 * - reconciliation_audit_log: audit trail de todas as mudanças
 * - reconciliation_status: status de reconciliação por agente/período
 *
 * Idempotente em boot (mesmo padrão das fases anteriores).
 */

-- =====================================================================
-- Tabela 1: RECONCILIATION_MATCHES - Armazena matches entre transações
-- =====================================================================

CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id TEXT PRIMARY KEY,  -- UUID

  -- Referências às transações
  ledger_entry_id TEXT NOT NULL,
  source_transaction_id TEXT NOT NULL,  -- ID da transação bancária/externa
  agente_id TEXT,  -- ID do agente econômico (para rastreamento)

  -- Scoring do match
  match_score INTEGER NOT NULL CHECK(match_score >= 0 AND match_score <= 100),
  -- Componentes do score (para auditoria)
  score_date INTEGER DEFAULT 0 CHECK(score_date >= 0 AND score_date <= 30),
  score_amount INTEGER DEFAULT 0 CHECK(score_amount >= 0 AND score_amount <= 40),
  score_description INTEGER DEFAULT 0 CHECK(score_description >= 0 AND score_description <= 30),

  -- Status do match
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(
    status IN ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_MATCHED')
  ),

  -- Auditoria
  created_by TEXT,  -- UUID do usuário que criou o match
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  reviewed_by TEXT,  -- UUID do usuário que revisou
  reviewed_at DATETIME,
  approved_by TEXT,  -- UUID do usuário que aprovou
  approved_at DATETIME,

  -- Metadados
  match_details TEXT,  -- JSON com detalhes do matching
  rejection_reason TEXT,  -- Motivo da rejeição (se houver)

  -- Timestamps
  updated_at DATETIME NOT NULL DEFAULT (datetime('now')),

  -- Foreign keys
  FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_ledger_entry_id
  ON reconciliation_matches(ledger_entry_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_source_transaction_id
  ON reconciliation_matches(source_transaction_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_agente_id
  ON reconciliation_matches(agente_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_status
  ON reconciliation_matches(status);

CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_score
  ON reconciliation_matches(match_score DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_created_at
  ON reconciliation_matches(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_agente_status
  ON reconciliation_matches(agente_id, status);

CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_search
  ON reconciliation_matches(agente_id, created_at DESC, status);

-- =====================================================================
-- Tabela 2: RECONCILIATION_AUDIT_LOG - Audit trail de mudanças
-- =====================================================================

CREATE TABLE IF NOT EXISTS reconciliation_audit_log (
  id TEXT PRIMARY KEY,  -- UUID

  -- Match em questão
  reconciliation_match_id TEXT NOT NULL,

  -- Ação realizada
  action TEXT NOT NULL CHECK(
    action IN ('CREATED', 'APPROVED', 'REJECTED', 'STATUS_CHANGED', 'REVIEWED')
  ),

  -- Detalhes
  old_status TEXT,
  new_status TEXT,
  changed_by TEXT NOT NULL,  -- UUID do usuário
  changed_at DATETIME NOT NULL DEFAULT (datetime('now')),

  -- Comentários
  notes TEXT,

  FOREIGN KEY (reconciliation_match_id) REFERENCES reconciliation_matches(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_audit_log_match_id
  ON reconciliation_audit_log(reconciliation_match_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_audit_log_changed_at
  ON reconciliation_audit_log(changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_audit_log_action
  ON reconciliation_audit_log(action);

-- =====================================================================
-- Tabela 3: RECONCILIATION_STATUS - Status de reconciliação por período
-- =====================================================================

CREATE TABLE IF NOT EXISTS reconciliation_status (
  id TEXT PRIMARY KEY,  -- UUID

  -- Referências
  agente_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Estatísticas
  total_ledger_entries INTEGER DEFAULT 0,
  total_source_transactions INTEGER DEFAULT 0,
  matched_entries INTEGER DEFAULT 0,
  pending_matches INTEGER DEFAULT 0,
  approved_matches INTEGER DEFAULT 0,
  rejected_matches INTEGER DEFAULT 0,
  unmatched_ledger_entries INTEGER DEFAULT 0,
  unmatched_source_transactions INTEGER DEFAULT 0,

  -- Reconciliation status
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(
    status IN ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'PARTIAL', 'FAILED')
  ),
  completion_percentage REAL DEFAULT 0.00,

  -- Performance metrics
  processing_time_ms INTEGER DEFAULT 0,

  -- Auditoria
  started_at DATETIME NOT NULL DEFAULT (datetime('now')),
  completed_at DATETIME,
  started_by TEXT,

  FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (started_by) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_status_agente_id
  ON reconciliation_status(agente_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_status_period
  ON reconciliation_status(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_reconciliation_status_agente_period
  ON reconciliation_status(agente_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_status_status
  ON reconciliation_status(status);

-- =====================================================================
-- Tabela 4: RECONCILIATION_CACHE - Cache para busca rápida
-- =====================================================================

CREATE TABLE IF NOT EXISTS reconciliation_cache (
  id TEXT PRIMARY KEY,
  agente_id TEXT,

  -- Chave de cache (hash de agente_id + período)
  cache_key TEXT NOT NULL UNIQUE,

  -- Dados cached em JSON
  cache_data TEXT NOT NULL,

  -- TTL
  cached_at DATETIME NOT NULL DEFAULT (datetime('now')),
  expires_at DATETIME NOT NULL,

  FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE
);

-- Índice para limpeza de cache expirado
CREATE INDEX IF NOT EXISTS idx_reconciliation_cache_expires_at
  ON reconciliation_cache(expires_at);

-- =====================================================================
-- View: RECONCILIATION_SUMMARY - Resumo de reconciliação
-- =====================================================================

CREATE VIEW IF NOT EXISTS reconciliation_summary AS
SELECT
  rs.agente_id,
  rs.period_start,
  rs.period_end,
  rs.status,
  rs.completion_percentage,
  rs.total_ledger_entries,
  rs.total_source_transactions,
  rs.matched_entries,
  rs.unmatched_ledger_entries,
  rs.unmatched_source_transactions,
  COUNT(DISTINCT rm.id) as total_matches,
  COUNT(DISTINCT CASE WHEN rm.status = 'APPROVED' THEN rm.id END) as approved_matches,
  COUNT(DISTINCT CASE WHEN rm.status = 'PENDING' THEN rm.id END) as pending_matches,
  ROUND(
    CAST(rs.matched_entries AS FLOAT) / NULLIF(rs.total_ledger_entries, 0) * 100,
    2
  ) as matching_rate
FROM
  reconciliation_status rs
LEFT JOIN reconciliation_matches rm ON rs.agente_id = rm.agente_id
  AND rm.created_at BETWEEN rs.period_start AND rs.period_end
GROUP BY
  rs.id;

-- =====================================================================
-- Triggers: Auto-update timestamps
-- =====================================================================

CREATE TRIGGER IF NOT EXISTS reconciliation_matches_update_timestamp
AFTER UPDATE ON reconciliation_matches
FOR EACH ROW
BEGIN
  UPDATE reconciliation_matches
  SET updated_at = (datetime('now'))
  WHERE id = NEW.id;
END;
