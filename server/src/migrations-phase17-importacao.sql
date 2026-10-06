/**
 * Fase 17: Importação de Documentos (UPLOAD + VALIDAÇÃO + DEDUPLICAÇÃO)
 *
 * Implementa sistema completo de importação de documentos financeiros:
 * - OFX (Open Financial Exchange)
 * - CSV (Planilhas)
 * - PDF (Extratos, notas fiscais)
 * - Imagens (Comprovantes, recibos)
 *
 * Fase 1 (UPLOAD):
 * - Validação de arquivo (extensão, tamanho, MIME type)
 * - Cálculo de SHA-256
 * - Detecção de tipo de arquivo
 * - Armazenamento no banco de dados
 *
 * Fase 3 (VALIDAÇÃO + DEDUPLICAÇÃO):
 * - Validação de linhas (data, valor, campos obrigatórios)
 * - Detecção de duplicatas com fuzzy matching (Levenshtein)
 * - Scoring system (0-100): data (30) + valor (40) + descrição (30)
 * - Threshold: score >= 80 = suspeita de duplicata
 * - Sistema de aprovação/rejeição de linhas
 *
 * Tabelas:
 * - importacao_lotes: Lotes de importação (metadados dos arquivos)
 * - importacao_linhas: Linhas importadas com dados estruturados
 * - importacao_validacoes: Histórico de validações
 * - importacao_deduplicacoes: Registro de detecções de duplicatas
 *
 * Aplicada em TODO boot (idempotente — todas as tabelas usam IF NOT EXISTS).
 */

-- =====================================================================
-- Tabela 1: IMPORTACAO_LOTES - Lotes de importação
-- =====================================================================
CREATE TABLE IF NOT EXISTS importacao_lotes (
  id                          TEXT PRIMARY KEY,                -- UUID
  usuario_id                  TEXT NOT NULL,                  -- FK para usuarios.id

  -- Dados do arquivo
  arquivo_nome                TEXT NOT NULL,                  -- Nome original do arquivo
  arquivo_hash                TEXT NOT NULL UNIQUE,           -- SHA-256 do conteúdo
  tipo                        TEXT NOT NULL,                  -- FileType enum (OFX, CSV, PDF, JPEG, PNG)
  tamanho_bytes               INTEGER NOT NULL,               -- Tamanho em bytes

  -- Status e auditoria
  status                      TEXT NOT NULL DEFAULT 'ENVIADO', -- LoteStatus enum
  erro_mensagem               TEXT,                            -- Mensagem de erro, se houver
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,

  -- Constraints
  CHECK (tipo IN ('OFX', 'CSV', 'PDF', 'JPEG', 'PNG')),
  CHECK (status IN ('ENVIADO', 'RECEBIDO', 'PROCESSANDO', 'PROCESSADO', 'ERRO', 'CANCELADO')),
  CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 52428800)  -- 50 MB max
);

-- Índices para buscar lotes
CREATE INDEX IF NOT EXISTS idx_importacao_lotes_usuario
  ON importacao_lotes(usuario_id);

CREATE INDEX IF NOT EXISTS idx_importacao_lotes_status
  ON importacao_lotes(status);

CREATE INDEX IF NOT EXISTS idx_importacao_lotes_tipo
  ON importacao_lotes(tipo);

CREATE INDEX IF NOT EXISTS idx_importacao_lotes_criado_em
  ON importacao_lotes(criado_em);

-- Índice para evitar duplicatas (mesmo arquivo já importado)
CREATE UNIQUE INDEX IF NOT EXISTS idx_importacao_lotes_usuario_hash
  ON importacao_lotes(usuario_id, arquivo_hash);


-- =====================================================================
-- Tabela 2: IMPORTACAO_LINHAS - Linhas importadas
-- =====================================================================
CREATE TABLE IF NOT EXISTS importacao_linhas (
  id                          TEXT PRIMARY KEY,                -- UUID
  lote_id                     TEXT NOT NULL,                  -- FK para importacao_lotes.id

  -- Dados da linha
  numero_linha                INTEGER NOT NULL,               -- Número da linha (1-indexed)
  dados_brutos                TEXT NOT NULL,                  -- Dados brutos da linha

  -- Status e auditoria
  status                      TEXT NOT NULL DEFAULT 'PENDENTE',  -- LinhaStatus enum
  erro_mensagem               TEXT,                            -- Mensagem de erro, se houver
  criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key
  FOREIGN KEY (lote_id) REFERENCES importacao_lotes(id) ON DELETE CASCADE,

  -- Constraints
  CHECK (numero_linha >= 1),
  CHECK (status IN ('PENDENTE', 'VALIDADA', 'PROCESSADA', 'ERRO', 'IGNORADA')),
  UNIQUE (lote_id, numero_linha)  -- Evitar duplicatas de linha no mesmo lote
);

-- Índices para buscar linhas
CREATE INDEX IF NOT EXISTS idx_importacao_linhas_lote
  ON importacao_linhas(lote_id);

CREATE INDEX IF NOT EXISTS idx_importacao_linhas_status
  ON importacao_linhas(status);

-- Índice para otimizar buscas de linhas com erro
CREATE INDEX IF NOT EXISTS idx_importacao_linhas_lote_status
  ON importacao_linhas(lote_id, status);

-- =====================================================================
-- Fase 3: VALIDAÇÃO E DEDUPLICAÇÃO
-- Adição de colunas para validação e fuzzy matching
-- =====================================================================

-- Adicionar colunas de validação/deduplicação ao importacao_linhas (se ainda não existem)
-- Nota: SQLite não suporta ALTER TABLE ADD COLUMN IF NOT EXISTS, então isso deve ser
-- executado na migração. Se a coluna já existe, a execução falhará (esperado).

-- Tabela 3: IMPORTACAO_VALIDACOES - Histórico de validações
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

-- Tabela 4: IMPORTACAO_DEDUPLICACOES - Registro de detecções de duplicatas
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

-- =====================================================================
-- VIEWS PARA ANÁLISE E APROVAÇÃO
-- =====================================================================

CREATE VIEW IF NOT EXISTS v_importacao_linhas_pendentes AS
SELECT
  il.id,
  il.lote_id,
  il.numero_linha,
  il.dados_brutos,
  il.status,
  il.criado_em,
  COUNT(iv.id) as total_erros_validacao
FROM importacao_linhas il
LEFT JOIN importacao_validacoes iv ON il.id = iv.linha_id AND iv.passou = 0
WHERE il.status IN ('PENDENTE', 'VALIDADA')
GROUP BY il.id
ORDER BY il.criado_em DESC;

CREATE VIEW IF NOT EXISTS v_importacao_linhas_com_erros AS
SELECT
  il.id,
  il.lote_id,
  il.numero_linha,
  il.dados_brutos,
  il.status,
  il.erro_mensagem,
  il.criado_em,
  GROUP_CONCAT(iv.tipo_validacao, ', ') as erros_encontrados
FROM importacao_linhas il
LEFT JOIN importacao_validacoes iv ON il.id = iv.linha_id AND iv.passou = 0
WHERE il.status = 'ERRO'
GROUP BY il.id
ORDER BY il.criado_em DESC;
