/**
 * Phase 8: Sistema de reconciliação automática de cobranças Asaas.
 *
 * Adiciona:
 * 1. Tabela `audit_reconciliacao_asaas` para logging de sincronizações
 * 2. Índices para queries de auditoria (cobranca_id, data DESC)
 * 3. Rastreamento de mudanças de status e taxa
 *
 * Migração idempotente — todas as operações usam IF NOT EXISTS.
 */

-- Tabela de auditoria de reconciliações
-- Nota: Removido FOREIGN KEY para cobrancas_asaas (tabela existe apenas no cliente)
-- A integridade referencial é validada em aplicação
CREATE TABLE IF NOT EXISTS audit_reconciliacao_asaas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  cobranca_id TEXT NOT NULL,
  status_antes TEXT,
  status_depois TEXT NOT NULL,
  taxa_antes REAL,
  taxa_depois REAL NOT NULL,
  discrepancia INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices para performance de queries de auditoria
CREATE INDEX IF NOT EXISTS idx_audit_reconciliacao_cobranca
  ON audit_reconciliacao_asaas(cobranca_id);

CREATE INDEX IF NOT EXISTS idx_audit_reconciliacao_criado_desc
  ON audit_reconciliacao_asaas(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_audit_reconciliacao_discrepancia
  ON audit_reconciliacao_asaas(discrepancia, criado_em DESC);

-- Índice para buscar auditoria de uma cobrança por período
CREATE INDEX IF NOT EXISTS idx_audit_reconciliacao_cobranca_data
  ON audit_reconciliacao_asaas(cobranca_id, criado_em DESC);
