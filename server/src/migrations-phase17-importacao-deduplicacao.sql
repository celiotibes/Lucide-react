/**
 * Phase 17: Sistema de Importação de Documentos — Fase 3 (Validação e Deduplicação)
 *
 * Implementa:
 * 1. Validação de linhas importadas (data, valor, campos obrigatórios)
 * 2. Deduplicação com fuzzy matching (Levenshtein)
 * 3. Sistema de aprovação/rejeição de linhas
 *
 * Tabelas:
 * - importacao_lotes: Lotes de importação (um arquivo = um lote)
 * - importacao_linhas: Linhas individuais do lote com status (pendente/aprovado/rejeitado)
 * - importacao_validacoes: Histórico de validações executadas
 * - importacao_deduplicacoes: Registro de detecções de duplicatas
 */

-- ============================================================
-- 1. TABELA DE LOTES DE IMPORTAÇÃO
-- ============================================================

CREATE TABLE IF NOT EXISTS importacao_lotes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  usuario_id TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  formato TEXT NOT NULL CHECK(formato IN ('csv', 'json', 'xlsx', 'ofx')),
  total_linhas INTEGER NOT NULL DEFAULT 0,
  linhas_processadas INTEGER NOT NULL DEFAULT 0,
  linhas_aprovadas INTEGER NOT NULL DEFAULT 0,
  linhas_rejeitadas INTEGER NOT NULL DEFAULT 0,

  -- Status do lote
  status TEXT NOT NULL DEFAULT 'processando'
    CHECK(status IN ('processando', 'validado', 'importado', 'erro')),

  -- Logs e erros
  resumo_erro TEXT,

  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME,

  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_importacao_lotes_usuario
  ON importacao_lotes(usuario_id);

CREATE INDEX IF NOT EXISTS idx_importacao_lotes_status
  ON importacao_lotes(status);

CREATE INDEX IF NOT EXISTS idx_importacao_lotes_criado_desc
  ON importacao_lotes(criado_em DESC);

-- ============================================================
-- 2. TABELA DE LINHAS DE IMPORTAÇÃO
-- ============================================================

CREATE TABLE IF NOT EXISTS importacao_linhas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  lote_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  numero_linha INTEGER NOT NULL,

  -- Dados da linha
  data_transacao DATE NOT NULL,
  valor DECIMAL(12, 2) NOT NULL,
  descricao TEXT NOT NULL,
  tipo_operacao TEXT,                         -- 'débito', 'crédito', etc
  categoria TEXT,
  conta_bancaria TEXT,

  -- Status de processamento
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK(status IN ('pendente', 'validado', 'aprovado', 'rejeitado')),

  -- Validação
  validacoes_executadas TEXT,                 -- JSON array de validações executadas
  erros_validacao TEXT,                       -- JSON array de erros encontrados

  -- Deduplicação
  score_duplicata REAL DEFAULT 0,             -- 0-100
  suspeita_duplicata INTEGER NOT NULL DEFAULT 0 CHECK(suspeita_duplicata IN (0, 1)),
  linha_duplicada_id TEXT,                    -- ID da linha existente potencialmente duplicada
  motivo_duplicata TEXT,                      -- Descrição do por quê é suspeita de duplicata

  -- Aprovação/Rejeição
  aprovado_por TEXT,
  aprovado_em DATETIME,
  rejeitado_por TEXT,
  rejeitado_em DATETIME,
  motivo_rejeicao TEXT,

  -- Auditoria
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME,

  FOREIGN KEY(lote_id) REFERENCES importacao_lotes(id) ON DELETE CASCADE,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY(linha_duplicada_id) REFERENCES importacao_linhas(id) ON DELETE SET NULL,
  FOREIGN KEY(aprovado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY(rejeitado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_importacao_linhas_lote
  ON importacao_linhas(lote_id);

CREATE INDEX IF NOT EXISTS idx_importacao_linhas_usuario
  ON importacao_linhas(usuario_id);

CREATE INDEX IF NOT EXISTS idx_importacao_linhas_status
  ON importacao_linhas(status);

CREATE INDEX IF NOT EXISTS idx_importacao_linhas_suspeita_duplicata
  ON importacao_linhas(suspeita_duplicata)
  WHERE suspeita_duplicata = 1;

CREATE INDEX IF NOT EXISTS idx_importacao_linhas_data_valor
  ON importacao_linhas(data_transacao, valor);

CREATE INDEX IF NOT EXISTS idx_importacao_linhas_descricao
  ON importacao_linhas(descricao);

-- ============================================================
-- 3. TABELA DE HISTÓRICO DE VALIDAÇÕES
-- ============================================================

CREATE TABLE IF NOT EXISTS importacao_validacoes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  linha_id TEXT NOT NULL,
  tipo_validacao TEXT NOT NULL
    CHECK(tipo_validacao IN ('data_futura', 'valor_invalido', 'campo_obrigatorio', 'formato')),
  passou INTEGER NOT NULL CHECK(passou IN (0, 1)),
  mensagem_erro TEXT,

  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(linha_id) REFERENCES importacao_linhas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_importacao_validacoes_linha
  ON importacao_validacoes(linha_id);

-- ============================================================
-- 4. TABELA DE DETECÇÕES DE DUPLICATAS
-- ============================================================

CREATE TABLE IF NOT EXISTS importacao_deduplicacoes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  linha_nova_id TEXT NOT NULL,
  linha_existente_id TEXT NOT NULL,

  -- Scores de cada componente (0-100)
  score_data INTEGER,                         -- ±1 dia: 0-30
  score_valor INTEGER,                        -- ±5%: 0-40
  score_descricao INTEGER,                    -- Levenshtein: 0-30
  score_total REAL NOT NULL,                  -- Soma ponderada: 0-100

  -- Motivo textual
  motivos TEXT,                               -- JSON array com os motivos

  -- Ação tomada
  acao TEXT DEFAULT 'pendente'
    CHECK(acao IN ('pendente', 'confirmada', 'rejeitada', 'ignorada')),

  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME,

  FOREIGN KEY(linha_nova_id) REFERENCES importacao_linhas(id) ON DELETE CASCADE,
  FOREIGN KEY(linha_existente_id) REFERENCES importacao_linhas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_importacao_deduplicacoes_nova
  ON importacao_deduplicacoes(linha_nova_id);

CREATE INDEX IF NOT EXISTS idx_importacao_deduplicacoes_existente
  ON importacao_deduplicacoes(linha_existente_id);

CREATE INDEX IF NOT EXISTS idx_importacao_deduplicacoes_score
  ON importacao_deduplicacoes(score_total DESC);

-- ============================================================
-- 5. VIEW: Linhas pendentes de aprovação
-- ============================================================

CREATE VIEW IF NOT EXISTS v_importacao_linhas_pendentes AS
SELECT
  il.id,
  il.lote_id,
  il.numero_linha,
  il.data_transacao,
  il.valor,
  il.descricao,
  il.tipo_operacao,
  il.categoria,
  il.suspeita_duplicata,
  il.score_duplicata,
  il.linha_duplicada_id,
  il.motivo_duplicata,
  il.erros_validacao,
  il.criado_em,
  COUNT(iv.id) as total_erros_validacao
FROM importacao_linhas il
LEFT JOIN importacao_validacoes iv ON il.id = iv.linha_id AND iv.passou = 0
WHERE il.status = 'pendente'
GROUP BY il.id
ORDER BY il.criado_em DESC;

-- ============================================================
-- 6. VIEW: Linhas rejeitadas e seus motivos
-- ============================================================

CREATE VIEW IF NOT EXISTS v_importacao_linhas_rejeitadas AS
SELECT
  il.id,
  il.lote_id,
  il.numero_linha,
  il.data_transacao,
  il.valor,
  il.descricao,
  il.motivo_rejeicao,
  il.suspeita_duplicata,
  il.score_duplicata,
  il.rejeitado_em,
  il.rejeitado_por,
  GROUP_CONCAT(iv.tipo_validacao, ', ') as erros_encontrados
FROM importacao_linhas il
LEFT JOIN importacao_validacoes iv ON il.id = iv.linha_id AND iv.passou = 0
WHERE il.status = 'rejeitado'
GROUP BY il.id
ORDER BY il.rejeitado_em DESC;
