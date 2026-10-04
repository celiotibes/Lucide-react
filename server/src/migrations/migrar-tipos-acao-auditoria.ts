/**
 * Acrescenta tipos de ação ao CHECK de `auditoria.tipo_acao` em bancos EXISTENTES.
 *
 * SQLite não altera CHECK: é preciso reconstruir a tabela. Para não perder nada por divergência de uma
 * cópia escrita à mão, o novo CREATE TABLE é DERIVADO do SQL guardado em sqlite_master (só a lista do
 * CHECK muda). Views e triggers que dependem da tabela são recriados; índices também.
 * Idempotente: se o CHECK já aceita os tipos novos, não faz nada.
 */
import type Database from "better-sqlite3";
import { logger } from "../services/logger-service.js";

export const TIPOS_ACAO_NOVOS = [
  "acl_concessao",
  "acl_reativacao",
  "acl_revogacao",
  "lgpd_acesso_dados",
  "lgpd_exclusao_conta",
  "portal_publicacao",
] as const;

export function migrarTiposAcaoAuditoria(db: Database.Database): void {
  const tabela = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='auditoria'").get() as
    | { sql: string }
    | undefined;
  if (!tabela) return;
  if (TIPOS_ACAO_NOVOS.every((t) => tabela.sql.includes(`'${t}'`))) return;

  const antigo = "'acesso_negado'";
  if (!tabela.sql.includes(antigo)) {
    throw new Error("[migrarTiposAcaoAuditoria] CHECK de tipo_acao em formato inesperado: 'acesso_negado' não encontrado");
  }
  const lista = [antigo, ...TIPOS_ACAO_NOVOS.filter((t) => !tabela.sql.includes(`'${t}'`)).map((t) => `'${t}'`)].join(", ");
  const sqlNovo = tabela.sql
    .replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?"?auditoria"?/i, "CREATE TABLE auditoria_novo")
    .replace(antigo, lista);

  const indices = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='auditoria' AND sql IS NOT NULL ORDER BY rowid")
    .all() as Array<{ sql: string }>;
  const views = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL ORDER BY rowid")
    .all() as Array<{ name: string; sql: string }>;
  const triggers = db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL AND (tbl_name='auditoria' OR sql LIKE '%auditoria%') ORDER BY rowid",
    )
    .all() as Array<{ name: string; sql: string }>;

  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      for (const t of triggers) db.exec(`DROP TRIGGER IF EXISTS ${t.name}`);
      for (const v of [...views].reverse()) db.exec(`DROP VIEW IF EXISTS ${v.name}`);

      db.exec("DROP TABLE IF EXISTS auditoria_novo");
      db.exec(sqlNovo);
      db.exec("INSERT INTO auditoria_novo SELECT * FROM auditoria");
      db.exec("DROP TABLE auditoria");
      db.exec("ALTER TABLE auditoria_novo RENAME TO auditoria");

      for (const i of indices) db.exec(i.sql);
      for (const v of views) db.exec(v.sql);
      for (const t of triggers) db.exec(t.sql);
    })();
    const violacoes = db.pragma("foreign_key_check") as unknown[];
    if (violacoes.length > 0) throw new Error(`violações de foreign key após a migração: ${violacoes.length}`);
    logger.info("[migrarTiposAcaoAuditoria] CHECK de tipo_acao estendido");
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
