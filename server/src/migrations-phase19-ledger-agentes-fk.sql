/**
 * Phase 19: Integração de Lançamentos Contábeis com Agentes Econômicos
 *
 * Adiciona relacionamento entre ledger_entries e agentes_economicos
 * para rastreamento completo de transações associadas a pessoas físicas e jurídicas.
 *
 * Estratégia:
 * 1. Adiciona coluna NULLABLE agente_id com FK para agentes_economicos
 * 2. Adiciona coluna denormalizada agente_papel para query speed
 * 3. Cria índice composto (agente_id, criado_em) para performance
 * 4. Suporta backfill de dados existentes com fuzzy matching
 * 5. Auditoria de todas as mudanças
 *
 * Idempotente em boot (todas as operações usam IF NOT EXISTS / IF COLUMN NOT EXISTS).
 */

-- =====================================================================
-- 1. Adiciona colunas FK à tabela ledger_entries
-- =====================================================================

-- Adiciona coluna agente_id (FK para agentes_economicos)
-- NULLABLE porque ledger_entries históricos podem não ter agente associado inicialmente
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS agente_id UUID;

-- Adiciona coluna denormalizada agente_papel para otimizar queries
-- Copia do agentes_economicos.papel para evitar JOINs frequentes
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS agente_papel TEXT;

-- Adiciona coluna referencia_agente_externo para rastreamento
-- Se a entrada foi criada a partir de uma integração externa que já tinha CNPJ/CPF
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS referencia_agente_externo TEXT;

-- Adiciona coluna para tracking de backfill
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS backfill_em TIMESTAMP;

-- Adiciona coluna para audit trail de mudanças de agente
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS agente_atualizado_em TIMESTAMP;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS agente_atualizado_por UUID;


-- =====================================================================
-- 2. Adiciona constraint de validação
-- =====================================================================

-- Se agente_id está preenchido, agente_papel também deve estar (data integrity)
-- Executado via application logic, não como constraint de DB (mais flexível)

-- Garante que agente_papel, se preenchido, é um papel válido
-- Nota: Usar CONSTRAINT com CHECK é limitado em SQLite, então confiar em app-level validation
-- ALTER TABLE ledger_entries ADD CONSTRAINT check_agente_papel
--   CHECK (agente_papel IS NULL OR agente_papel IN ('tenant', 'supplier', 'provider', 'legal_party', 'co_owner', 'borrower', 'lender'));


-- =====================================================================
-- 3. Adiciona Foreign Key (se PRAGMA foreign_keys está ativado)
-- =====================================================================

-- Cria FK com ON DELETE SET NULL (se agente é deletado, ledger_entries mantém histórico)
-- SQLite não suporta ALTER TABLE ADD CONSTRAINT de FK diretamente em tabelas existentes
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
  agente_id_anterior UUID,
  agente_id_novo UUID,
  agente_papel_anterior TEXT,
  agente_papel_novo TEXT,
  motivo_mudanca TEXT NOT NULL, -- 'backfill', 'manual', 'integracao', 'correcao'
  usuario_id UUID,  -- Quem fez a mudança (NULL se sistema)
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


-- =====================================================================
-- 7. Stored Procedure Helper: Vincular Ledger Entry a Agente (SQLite workaround)
-- =====================================================================

-- Nota: SQLite não tem stored procedures verdadeiras
-- As operações serão implementadas em TypeScript (agentes-backfill.ts)
-- Mantemos a documentação aqui como referência


-- =====================================================================
-- 8. Rollback Procedure (para desativação da feature)
-- =====================================================================

-- Para rollback completo:
-- 1. Deletar índices criados
-- 2. Deletar views criadas
-- 3. Deletar tabela de auditoria
-- 4. Remover colunas da ledger_entries (se suportado pelo SQLite via PRAGMA writable_schema)

-- Exemplo de rollback (executado manualmente se necessário):
-- DROP VIEW IF EXISTS ledger_entries_agente_coverage;
-- DROP VIEW IF EXISTS ledger_entries_orfas;
-- DROP TABLE IF EXISTS ledger_entries_agente_auditoria;
-- DROP INDEX IF EXISTS idx_ledger_entries_agente_id_data;
-- DROP INDEX IF EXISTS idx_ledger_entries_agente_tipo;
-- DROP INDEX IF EXISTS idx_ledger_entries_agente_categoria;
-- DROP INDEX IF EXISTS idx_ledger_entries_referencia_agente_externo;
-- DROP INDEX IF EXISTS idx_ledger_entries_backfill;
-- DROP INDEX IF EXISTS idx_ledger_entries_agente_papel;
-- ALTER TABLE ledger_entries DROP COLUMN agente_id; -- SQLite 3.35.0+ necessário
-- ALTER TABLE ledger_entries DROP COLUMN agente_papel;
-- ALTER TABLE ledger_entries DROP COLUMN referencia_agente_externo;
-- ALTER TABLE ledger_entries DROP COLUMN backfill_em;
-- ALTER TABLE ledger_entries DROP COLUMN agente_atualizado_em;
-- ALTER TABLE ledger_entries DROP COLUMN agente_atualizado_por;


-- =====================================================================
-- 9. Data integrity checks (executar após backfill)
-- =====================================================================

-- Verificar se todos os agente_id referenciam IDs válidos em agentes_economicos
-- SELECT l.id, l.agente_id
-- FROM ledger_entries l
-- LEFT JOIN agentes_economicos a ON l.agente_id = a.id
-- WHERE l.agente_id IS NOT NULL AND a.id IS NULL;

-- Verificar se agente_papel corresponde ao papel real do agente
-- SELECT l.id, l.agente_papel, a.papel
-- FROM ledger_entries l
-- INNER JOIN agentes_economicos a ON l.agente_id = a.id
-- WHERE l.agente_papel != a.papel;
