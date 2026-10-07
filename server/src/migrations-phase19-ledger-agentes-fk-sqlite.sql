/**
 * Phase 19: Integração de Lançamentos Contábeis com Agentes Econômicos - SQLite
 *
 * Versão SQLite da Fase 19 com adaptações para compatibilidade:
 * - Remove IF NOT EXISTS em ALTER TABLE (SQLite não suporta)
 * - Usa CREATE INDEX IF NOT EXISTS (suportado)
 * - Usa CREATE VIEW IF NOT EXISTS (suportado)
 * - Usa CREATE TABLE IF NOT EXISTS (suportado)
 *
 * Idempotente em boot (coluna existente = erro ignorado por aplicação).
 */

-- =====================================================================
-- 1. Adiciona colunas FK à tabela ledger_entries
-- =====================================================================

-- Adiciona coluna agente_id (FK para agentes_economicos)
-- NULLABLE porque ledger_entries históricos podem não ter agente associado inicialmente
ALTER TABLE ledger_entries ADD COLUMN agente_id TEXT;

-- Adiciona coluna denormalizada agente_papel para otimizar queries
-- Copia do agentes_economicos.papel para evitar JOINs frequentes
ALTER TABLE ledger_entries ADD COLUMN agente_papel TEXT;

-- Adiciona coluna referencia_agente_externo para rastreamento
-- Se a entrada foi criada a partir de uma integração externa que já tinha CNPJ/CPF
ALTER TABLE ledger_entries ADD COLUMN referencia_agente_externo TEXT;

-- Adiciona coluna para tracking de backfill
ALTER TABLE ledger_entries ADD COLUMN backfill_em TIMESTAMP;

-- Adiciona coluna para audit trail de mudanças de agente
ALTER TABLE ledger_entries ADD COLUMN agente_atualizado_em TIMESTAMP;
ALTER TABLE ledger_entries ADD COLUMN agente_atualizado_por TEXT;


-- =====================================================================
-- 2. Adiciona constraint de validação
-- =====================================================================

-- Se agente_id está preenchido, agente_papel também deve estar (data integrity)
-- Executado via application logic, não como constraint de DB (mais flexível)

-- Garante que agente_papel, se preenchido, é um papel válido
-- Nota: Usar CONSTRAINT com CHECK é limitado em SQLite, então confiar em app-level validation
-- SQLite não permite adicionar constraints a colunas já criadas


-- =====================================================================
-- 3. Foreign Key (via aplicação)
-- =====================================================================

-- SQLite não suporta ALTER TABLE ADD CONSTRAINT de FK em tabelas existentes
-- A FK será criada via aplicação na primeira sincronização
-- Para fins de documentação:
-- FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE SET NULL


-- =====================================================================
-- 4. Índices para performance
-- =====================================================================

-- Índice composto para queries por agente + data
-- Muito utilizado em: getAgentLedger(), getAgentBalance(), generateAgentReport()
CREATE INDEX IF NOT EXISTS idx_ledger_entries_agente_id_data
  ON ledger_entries(agente_id, criado_em DESC);

-- Índice para agente + tipo (receita/despesa)
-- Utilizado em: getAgentBalance(), cálculos de saldo por agente
CREATE INDEX IF NOT EXISTS idx_ledger_entries_agente_tipo
  ON ledger_entries(agente_id, tipo);

-- Índice para agente + categoria
-- Utilizado em: getAgentBreakdown(), relatórios por categoria
CREATE INDEX IF NOT EXISTS idx_ledger_entries_agente_categoria
  ON ledger_entries(agente_id, categoria);

-- Índice para referencia_agente_externo
-- Utilizado em backfill: verificar se já foi processado
CREATE INDEX IF NOT EXISTS idx_ledger_entries_referencia_agente_externo
  ON ledger_entries(referencia_agente_externo);

-- Índice para backfill tracking
-- Utilizado em: identificar entradas processadas vs. não processadas
CREATE INDEX IF NOT EXISTS idx_ledger_entries_backfill
  ON ledger_entries(backfill_em) WHERE backfill_em IS NOT NULL;

-- Índice para agente_papel (denormalizado)
-- Utilizado em: queries por papel do agente
CREATE INDEX IF NOT EXISTS idx_ledger_entries_agente_papel
  ON ledger_entries(agente_papel);


-- =====================================================================
-- 5. View para análise de cobertura de agentes
-- =====================================================================

-- View para verificar qual porcentagem de ledger_entries tem agente associado
CREATE VIEW IF NOT EXISTS ledger_entries_agente_coverage AS
SELECT
  COUNT(*) as total_entries,
  COUNT(CASE WHEN agente_id IS NOT NULL THEN 1 END) as entries_com_agente,
  ROUND(
    COUNT(CASE WHEN agente_id IS NOT NULL THEN 1 END) * 100.0 / COUNT(*),
    2
  ) as cobertura_percentual,
  MIN(criado_em) as primeira_entrada,
  MAX(criado_em) as ultima_entrada
FROM ledger_entries;

-- View para listar entradas órfãs (sem agente)
CREATE VIEW IF NOT EXISTS ledger_entries_orfas AS
SELECT
  id,
  data,
  tipo,
  categoria,
  valor,
  descricao,
  referencia_externa,
  criado_em,
  referencia_agente_externo
FROM ledger_entries
WHERE agente_id IS NULL
  AND backfill_em IS NULL
ORDER BY criado_em DESC;


-- =====================================================================
-- 6. Tabela de auditoria de vinculações agente-ledger
-- =====================================================================

-- Armazena histórico de quando um ledger_entry foi vinculado/desvinculado de um agente
CREATE TABLE IF NOT EXISTS ledger_entries_agente_auditoria (
  id TEXT PRIMARY KEY,
  ledger_entry_id TEXT NOT NULL,
  agente_id_anterior TEXT,
  agente_id_novo TEXT,
  agente_papel_anterior TEXT,
  agente_papel_novo TEXT,
  motivo_mudanca TEXT NOT NULL,
  usuario_id TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ledger_agente_auditoria_ledger_entry
  ON ledger_entries_agente_auditoria(ledger_entry_id);

CREATE INDEX IF NOT EXISTS idx_ledger_agente_auditoria_agente
  ON ledger_entries_agente_auditoria(agente_id_novo);

CREATE INDEX IF NOT EXISTS idx_ledger_agente_auditoria_criado
  ON ledger_entries_agente_auditoria(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_agente_auditoria_motivo
  ON ledger_entries_agente_auditoria(motivo_mudanca);
