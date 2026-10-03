import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { migrarPapeisUsuarios } from "../migrations/migrar-papeis-usuarios.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const lerSql = (...partes: string[]) => fs.readFileSync(path.join(dir, ...partes), "utf-8");

const colunas = (db: Database.Database, tabela: string) =>
  (db.pragma(`table_info(${tabela})`) as Array<{ name: string; type: string; notnull: number; pk: number }>).map(
    (c) => `${c.name}:${c.type}:${c.notnull}:${c.pk}`,
  );

describe("migrarPapeisUsuarios contra o schema antigo REAL (phase2 antes da mudança)", () => {
  function bancoAntigoPopulado() {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(lerSql("fixtures", "phase2-auth-antigo.sql"));
    db.prepare("INSERT INTO usuarios (id, nome, email, senha_hash, role) VALUES ('u1','Célio','celio@example.com','hash','titular')").run();
    db.prepare("INSERT INTO usuarios (id, nome, email, senha_hash, role) VALUES ('u2','Ana','ana@example.com','hash','contador')").run();
    db.prepare(
      "INSERT INTO permissoes_papel (papel, funcao, habilitado, limite_valor, atualizado_por) VALUES ('contador','aprovar_pagamento',1,5000,'u1')",
    ).run();
    return db;
  }

  it("preserva dados (inclusive atualizado_por), views, índices e o CHECK de limite_valor", () => {
    const db = bancoAntigoPopulado();
    const viewsAntes = (db.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").all() as Array<{ name: string }>).map((v) => v.name);
    expect(viewsAntes.length).toBeGreaterThan(0);
    expect(() => db.prepare("INSERT INTO usuarios (id,nome,email,senha_hash,role) VALUES ('x','X','x@example.com','h','inquilino')").run()).toThrow();

    migrarPapeisUsuarios(db);

    expect((db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n).toBe(2);
    const perm = db.prepare("SELECT limite_valor, atualizado_por FROM permissoes_papel WHERE papel='contador' AND funcao='aprovar_pagamento'").get() as { limite_valor: number; atualizado_por: string };
    expect(perm).toEqual({ limite_valor: 5000, atualizado_por: "u1" }); // ON DELETE SET NULL não pode ter disparado

    db.prepare("INSERT INTO usuarios (id,nome,email,senha_hash,role) VALUES ('i1','Inq','inq@example.com','h','inquilino')").run();
    db.prepare("INSERT INTO usuarios (id,nome,email,senha_hash,role) VALUES ('p1','Pre','pre@example.com','h','prestador')").run();
    db.prepare("INSERT INTO permissoes_papel (papel, funcao, habilitado) VALUES ('inquilino','importar_documentos',0)").run();
    expect(() => db.prepare("INSERT INTO permissoes_papel (papel, funcao, habilitado, limite_valor) VALUES ('prestador','aprovar_pagamento',0,-1)").run()).toThrow();

    const viewsDepois = (db.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").all() as Array<{ name: string }>).map((v) => v.name);
    expect(viewsDepois).toEqual(viewsAntes);
    for (const v of viewsDepois) expect(() => db.prepare(`SELECT * FROM ${v} LIMIT 1`).all()).not.toThrow();

    const indices = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('usuarios','permissoes_papel') AND name LIKE 'idx_%'").all() as Array<{ name: string }>).map((i) => i.name);
    expect(indices).toEqual(expect.arrayContaining(["idx_usuarios_email", "idx_usuarios_role", "idx_usuarios_prestador_id", "idx_usuarios_ativo", "idx_permissoes_papel_papel", "idx_permissoes_papel_funcao"]));
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("a estrutura migrada é idêntica à de um banco novo criado pelo phase2 atual, e a 2ª execução é no-op", () => {
    const antigo = bancoAntigoPopulado();
    migrarPapeisUsuarios(antigo);
    const schemaAntes = antigo.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all();
    migrarPapeisUsuarios(antigo);
    expect(antigo.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all()).toEqual(schemaAntes);

    const novo = new Database(":memory:");
    novo.exec(lerSql("..", "migrations-phase2-auth.sql"));
    expect(colunas(antigo, "usuarios")).toEqual(colunas(novo, "usuarios"));
    expect(colunas(antigo, "permissoes_papel")).toEqual(colunas(novo, "permissoes_papel"));
  });
});
