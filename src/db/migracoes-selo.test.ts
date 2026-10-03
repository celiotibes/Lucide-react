import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import schemaSql from "../../contabilidade-reconstituicao/schema.sql?raw";
import { parseTabelasDoSchema, garantirColunasAtualizadas } from "./migracoes";

describe("colunas do selo encadeado em bancos antigos", () => {
  it("o parser do schema enxerga hash_lancamentos/hash_anterior/hash_selo", () => {
    const nomes = (parseTabelasDoSchema(schemaSql).get("ledger_encerramentos") ?? []).map((c) => c.nome);
    expect(nomes).toEqual(expect.arrayContaining(["hash_lancamentos", "hash_anterior", "hash_selo"]));
  });

  it("garantirColunasAtualizadas adiciona as colunas a uma ledger_encerramentos antiga", async () => {
    const SQL = await initSqlJs({ locateFile: (a) => `node_modules/sql.js/dist/${a}` });
    const db = new SQL.Database();
    db.run(schemaSql);
    db.run("DROP TRIGGER IF EXISTS tg_ledger_encerramentos_no_update");
    db.run("DROP TRIGGER IF EXISTS tg_ledger_encerramentos_no_delete");
    db.run("DROP TABLE ledger_encerramentos");
    db.run(`CREATE TABLE ledger_encerramentos (
      id INTEGER PRIMARY KEY, periodo_id INTEGER NOT NULL, data_encerramento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      encerrado_por INTEGER, total_debito REAL DEFAULT 0, total_credito REAL DEFAULT 0,
      balancete_OK INTEGER NOT NULL DEFAULT 0, hash_snapshot TEXT, observacoes TEXT)`);
    garantirColunasAtualizadas(db, schemaSql);
    const colunas = (db.exec("PRAGMA table_info(ledger_encerramentos)")[0].values).map((l) => String(l[1]));
    expect(colunas).toEqual(expect.arrayContaining(["hash_lancamentos", "hash_anterior", "hash_selo"]));
  });
});
