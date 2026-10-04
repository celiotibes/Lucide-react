import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { migrarTiposAcaoAuditoria, TIPOS_ACAO_NOVOS } from "../migrations/migrar-tipos-acao-auditoria.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = (...p: string[]) => fs.readFileSync(path.join(dir, ...p), "utf-8");

function bancoAntigo() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(sql("fixtures", "phase2-auth-antigo.sql"));
  db.prepare("INSERT INTO usuarios (id, nome, email, senha_hash, role) VALUES ('u1','Célio','c@example.com','h','titular')").run();
  const ins = db.prepare(
    `INSERT INTO auditoria (id, usuario_id, usuario_nome, usuario_email, usuario_role, tipo_acao, recurso, recurso_id, descricao, resultado)
     VALUES (?, 'u1', 'Célio', 'c@example.com', 'titular', ?, 'usuario', 'u1', ?, 'sucesso')`,
  );
  ins.run("a1", "login", "entrou");
  ins.run("a2", "acesso_negado", "negado");
  return { db, ins };
}

describe("migrarTiposAcaoAuditoria contra o schema antigo real", () => {
  it("preserva linhas, índices e views, aceita os tipos novos e continua recusando tipo inventado", () => {
    const { db, ins } = bancoAntigo();
    expect(() => ins.run("x", "acl_concessao", "antes")).toThrow(); // antigo recusa

    const views = (db.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").all() as { name: string }[]).map((v) => v.name);
    migrarTiposAcaoAuditoria(db);

    expect((db.prepare("SELECT COUNT(*) AS n FROM auditoria").get() as { n: number }).n).toBe(2);
    for (const t of TIPOS_ACAO_NOVOS) expect(() => ins.run(`n-${t}`, t, "depois")).not.toThrow();
    expect(() => ins.run("inv", "tipo_inventado", "x")).toThrow();

    const viewsDepois = (db.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").all() as { name: string }[]).map((v) => v.name);
    expect(viewsDepois).toEqual(views);
    for (const v of viewsDepois) expect(() => db.prepare(`SELECT * FROM ${v} LIMIT 1`).all()).not.toThrow();
    const idx = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='auditoria' AND name LIKE 'idx_%'").all() as { name: string }[]).map((i) => i.name);
    expect(idx).toEqual(expect.arrayContaining(["idx_auditoria_timestamp", "idx_auditoria_usuario_id", "idx_auditoria_tipo_acao", "idx_auditoria_usuario_periodo"]));
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("estrutura idêntica à de um banco novo e a 2ª execução é no-op", () => {
    const { db } = bancoAntigo();
    migrarTiposAcaoAuditoria(db);
    const antes = db.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all();
    migrarTiposAcaoAuditoria(db);
    expect(db.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all()).toEqual(antes);

    const novo = new Database(":memory:");
    novo.exec(sql("..", "migrations-phase2-auth.sql"));
    const cols = (d: Database.Database) => (d.pragma("table_info(auditoria)") as { name: string; type: string; notnull: number }[]).map((c) => `${c.name}:${c.type}:${c.notnull}`);
    expect(cols(db)).toEqual(cols(novo));
  });
});
