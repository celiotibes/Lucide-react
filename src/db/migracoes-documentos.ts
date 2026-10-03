import type { Database } from "sql.js";
import { consultar, executar } from "./connection";

/** Garante que as colunas de deduplicação (arquivo_hash_sha256, chave_nfe) existem na tabela documentos,
 * e que os índices ÚNICOS PARCIAIS foram criados. Idempotente — roda sem erro se já executada. */
export function garantirColunasDeduplicacaoDocumentos(db: Database): void {
  // Verifica se as colunas já existem
  const infos = consultar<{ name: string }>(
    db,
    "PRAGMA table_info(documentos)",
  );
  const colunasExistentes = new Set(infos.map(col => col.name));

  if (colunasExistentes.has("arquivo_hash_sha256") && colunasExistentes.has("chave_nfe")) {
    return; // Já migrado
  }

  // Adiciona as colunas
  if (!colunasExistentes.has("arquivo_hash_sha256")) {
    try {
      executar(db, "ALTER TABLE documentos ADD COLUMN arquivo_hash_sha256 TEXT");
    } catch (e) {
      // Coluna já existe (SQLite às vezes não reconhece em PRAGMA)
    }
  }

  if (!colunasExistentes.has("chave_nfe")) {
    try {
      executar(db, "ALTER TABLE documentos ADD COLUMN chave_nfe TEXT");
    } catch (e) {
      // Coluna já existe
    }
  }

  // Cria os índices ÚNICOS PARCIAIS
  try {
    executar(
      db,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_arquivo_hash_unique ON documentos(arquivo_hash_sha256) WHERE arquivo_hash_sha256 IS NOT NULL",
    );
  } catch (e) {
    // Índice já existe
  }

  try {
    executar(
      db,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_chave_nfe_unique ON documentos(chave_nfe) WHERE chave_nfe IS NOT NULL",
    );
  } catch (e) {
    // Índice já existe
  }
}

/** Garante que a tabela sugestoes_ia_documentos existe. Idempotente. */
export function garantirTabelaSugestoesIA(db: Database): void {
  // Verifica se a tabela já existe
  const [tabela] = consultar<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sugestoes_ia_documentos'",
  );
  if (tabela) return;

  // Cria a tabela
  executar(
    db,
    `CREATE TABLE IF NOT EXISTS sugestoes_ia_documentos (
      id                      INTEGER PRIMARY KEY,
      documento_id            INTEGER REFERENCES documentos(id),
      campo                   TEXT NOT NULL,
      valor_sugerido          TEXT NOT NULL,
      confianca               REAL NOT NULL CHECK (confianca BETWEEN 0 AND 1),
      modelo                  TEXT,
      status                  TEXT NOT NULL CHECK (status IN ('pendente', 'aceita', 'corrigida', 'rejeitada')) DEFAULT 'pendente',
      valor_final             TEXT,
      revisado_por            TEXT,
      revisado_em             DATETIME,
      criado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );

  // Cria os índices
  try {
    executar(
      db,
      "CREATE INDEX IF NOT EXISTS idx_sugestoes_ia_documento ON sugestoes_ia_documentos(documento_id)",
    );
  } catch (e) {
    // Índice já existe
  }

  try {
    executar(
      db,
      "CREATE INDEX IF NOT EXISTS idx_sugestoes_ia_status ON sugestoes_ia_documentos(status)",
    );
  } catch (e) {
    // Índice já existe
  }

  try {
    executar(
      db,
      "CREATE INDEX IF NOT EXISTS idx_sugestoes_ia_criado ON sugestoes_ia_documentos(criado_em DESC)",
    );
  } catch (e) {
    // Índice já existe
  }
}

/** Executa todas as migrações necessárias para documentos. */
export function executarMigracoesDDocumentos(db: Database): void {
  garantirColunasDeduplicacaoDocumentos(db);
  garantirTabelaSugestoesIA(db);
}
