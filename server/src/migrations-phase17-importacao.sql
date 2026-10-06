/**
 * Fase 17: Importação de Documentos (UPLOAD)
 *
 * Implementa tabelas para suportar importação de documentos financeiros:
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
 * Fase 2+ (PARSING, RECONHECIMENTO, etc.):
 * - Será implementado posteriormente
 *
 * Tabelas:
 * - importacao_lotes: Lotes de importação (metadados dos arquivos)
 * - importacao_linhas: Linhas importadas (dados brutos por linha)
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
