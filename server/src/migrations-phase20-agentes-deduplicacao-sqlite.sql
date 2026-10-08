/**
 * Fase 20: Sistema de deduplicação e resolução de duplicatas para agentes econômicos
 *
 * Implementa:
 * - Detecção avançada de duplicatas (CNPJ/CPF, fuzzy-match de nome, similaridade de endereço)
 * - Merge de agentes com auditoria completa
 * - Rollback/unmerge de operações
 * - Rastreamento completo de alterações
 *
 * Tabelas adicionais:
 * - agentes_duplicatas_audit_trail: Log completo de operações de merge/unmerge
 * - Estende agentes_duplicatas_suspeitas com colunas de referência de transações
 *
 * Aplicada em TODO boot (idempotente).
 */

-- =====================================================================
-- Tabela: AGENTES_DUPLICATAS_AUDIT_TRAIL - Log de operações
-- =====================================================================

CREATE TABLE IF NOT EXISTS agentes_duplicatas_audit_trail (
  id TEXT PRIMARY KEY,

  -- Tipo de operação
  tipo_operacao TEXT NOT NULL CHECK (tipo_operacao IN ('MERGE', 'UNMERGE', 'REVIEW')),

  -- Referências aos agentes
  agente_primario_id TEXT NOT NULL,
  agente_secundario_id TEXT NOT NULL,

  -- Estados antes e depois (JSON para flexibilidade)
  estado_anterior TEXT NOT NULL,
  estado_posterior TEXT NOT NULL,

  -- Auditoria
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por TEXT NOT NULL,
  descricao TEXT,

  -- Metadata
  resultado TEXT,  -- 'sucesso' ou 'erro'
  mensagem_erro TEXT,

  FOREIGN KEY (agente_primario_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (agente_secundario_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_agentes_audit_trail_tipo
  ON agentes_duplicatas_audit_trail(tipo_operacao);

CREATE INDEX IF NOT EXISTS idx_agentes_audit_trail_agentes
  ON agentes_duplicatas_audit_trail(agente_primario_id, agente_secundario_id);

CREATE INDEX IF NOT EXISTS idx_agentes_audit_trail_data
  ON agentes_duplicatas_audit_trail(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_agentes_audit_trail_usuario
  ON agentes_duplicatas_audit_trail(criado_por);


-- =====================================================================
-- Alterações à Tabela: AGENTES_DUPLICATAS_SUSPEITAS
-- =====================================================================

-- Adicionar coluna para referência de transações (se não existir)
-- ALTER TABLE agentes_duplicatas_suspeitas ADD COLUMN ledger_1_id UUID;
-- ALTER TABLE agentes_duplicatas_suspeitas ADD COLUMN ledger_2_id UUID;

-- Adicionar colunas de revisão_notas e merge_data
-- Nota: Usando PRAGMA table_info para idempotência em tempo de execução (database-init.ts)
-- A aplicação verifica se as colunas existem antes de executar ALTER TABLE

-- Índice para buscar duplicatas não revisadas
CREATE INDEX IF NOT EXISTS idx_agentes_duplicatas_nao_revisadas
  ON agentes_duplicatas_suspeitas(status)
  WHERE status = 'pendente';


-- =====================================================================
-- View: Histórico completo de operações em agentes
-- =====================================================================

DROP VIEW IF EXISTS agentes_operacoes_completo;
CREATE VIEW agentes_operacoes_completo AS
SELECT
  'merge' as tipo_evento,
  d.id as evento_id,
  d.agente_id_1 as agente_primario_id,
  d.agente_id_2 as agente_secundario_id,
  a1.nome as agente_primario_nome,
  a2.nome as agente_secundario_nome,
  d.score,
  d.status,
  d.analisado_em as evento_data,
  d.analisado_por as executado_por,
  d.decisao as descricao
FROM agentes_duplicatas_suspeitas d
JOIN agentes_economicos a1 ON d.agente_id_1 = a1.id
JOIN agentes_economicos a2 ON d.agente_id_2 = a2.id
WHERE d.status IN ('mesclada', 'refutada')

UNION ALL

SELECT
  'audit' as tipo_evento,
  t.id as evento_id,
  t.agente_primario_id,
  t.agente_secundario_id,
  a1.nome as agente_primario_nome,
  a2.nome as agente_secundario_nome,
  0 as score,
  t.resultado as status,
  t.criado_em as evento_data,
  t.criado_por as executado_por,
  t.descricao
FROM agentes_duplicatas_audit_trail t
LEFT JOIN agentes_economicos a1 ON t.agente_primario_id = a1.id
LEFT JOIN agentes_economicos a2 ON t.agente_secundario_id = a2.id
ORDER BY evento_data DESC;


-- =====================================================================
-- View: Estatísticas de duplicatas por status
-- =====================================================================

DROP VIEW IF EXISTS agentes_duplicatas_stats;
CREATE VIEW agentes_duplicatas_stats AS
SELECT
  status,
  COUNT(*) as total,
  AVG(score) as score_medio,
  MAX(score) as score_maximo,
  MIN(score) as score_minimo
FROM agentes_duplicatas_suspeitas
GROUP BY status;


-- =====================================================================
-- View: Agentes que foram mesclados (histórico)
-- =====================================================================

DROP VIEW IF EXISTS agentes_merges_historico;
CREATE VIEW agentes_merges_historico AS
SELECT
  d.id as merge_id,
  d.agente_id_1 as agente_primario_id,
  a1.nome as agente_primario_nome,
  a1.cpf_cnpj as agente_primario_cpf_cnpj,
  d.agente_id_2 as agente_duplicado_id,
  a2.nome as agente_duplicado_nome,
  a2.cpf_cnpj as agente_duplicado_cpf_cnpj,
  d.score,
  d.motivo,
  d.analisado_em as data_merge,
  u.nome as analisado_por_nome,
  a2.ativo as agente_duplicado_ainda_ativo
FROM agentes_duplicatas_suspeitas d
JOIN agentes_economicos a1 ON d.agente_id_1 = a1.id
LEFT JOIN agentes_economicos a2 ON d.agente_id_2 = a2.id
LEFT JOIN usuarios u ON d.analisado_por = u.id
WHERE d.status = 'mesclada'
ORDER BY d.analisado_em DESC;


-- =====================================================================
-- View: Duplicatas com dados dos agentes
-- =====================================================================

DROP VIEW IF EXISTS agentes_duplicatas_detalhadas;
CREATE VIEW agentes_duplicatas_detalhadas AS
SELECT
  d.id,
  d.agente_id_1,
  a1.tipo_entidade as tipo_1,
  a1.cpf_cnpj as cpf_cnpj_1,
  a1.nome as nome_1,
  a1.email as email_1,
  a1.papel as papel_1,
  d.agente_id_2,
  a2.tipo_entidade as tipo_2,
  a2.cpf_cnpj as cpf_cnpj_2,
  a2.nome as nome_2,
  a2.email as email_2,
  a2.papel as papel_2,
  d.score,
  d.score_cpf,
  d.score_nome,
  d.score_email,
  d.score_telefone,
  d.score_endereco,
  d.motivo,
  d.status,
  d.criado_em,
  d.analisado_em
FROM agentes_duplicatas_suspeitas d
JOIN agentes_economicos a1 ON d.agente_id_1 = a1.id
JOIN agentes_economicos a2 ON d.agente_id_2 = a2.id
ORDER BY d.score DESC;


-- =====================================================================
-- Tabela: LEDGER_ENTRIES_DUPLICATAS (tracking de transações duplicadas)
-- =====================================================================

CREATE TABLE IF NOT EXISTS ledger_entries_duplicatas (
  id TEXT PRIMARY KEY,

  -- Referências às transações
  ledger_entrada_1_id TEXT NOT NULL,
  ledger_entrada_2_id TEXT NOT NULL,

  -- Score de duplicata
  score REAL NOT NULL CHECK (score >= 0 AND score <= 100),

  -- Status
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmada', 'refutada', 'mesclada')),

  -- Auditoria
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por TEXT NOT NULL,
  analisado_em TIMESTAMP,
  analisado_por TEXT,
  decisao TEXT,

  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
  FOREIGN KEY (analisado_por) REFERENCES usuarios(id) ON DELETE SET NULL,

  -- Garante que não há duplicatas reflexivas
  CHECK (ledger_entrada_1_id != ledger_entrada_2_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_duplicatas_entrada_1
  ON ledger_entries_duplicatas(ledger_entrada_1_id);

CREATE INDEX IF NOT EXISTS idx_ledger_duplicatas_entrada_2
  ON ledger_entries_duplicatas(ledger_entrada_2_id);

CREATE INDEX IF NOT EXISTS idx_ledger_duplicatas_score
  ON ledger_entries_duplicatas(score DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_duplicatas_status
  ON ledger_entries_duplicatas(status);

CREATE INDEX IF NOT EXISTS idx_ledger_duplicatas_data
  ON ledger_entries_duplicatas(criado_em DESC);


-- =====================================================================
-- Helper Functions: Implementadas em TypeScript (database-init.ts)
-- =====================================================================
-- count_agent_references(agent_id UUID)
--   Conta referências de um agente em: ledger_entries, agentes_validacoes, agentes_vinculacoes
-- validate_agent_merge(primary_agent_id UUID, secondary_agent_id UUID)
--   Valida se merge é possível e retorna lista de issues
-- NOTA: PL/pgSQL não é suportado em SQLite. Implementação movida para TypeScript.

