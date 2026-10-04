import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { readFileSync } from "node:fs";
import { anexarCarimbosAoSelo, listarCarimbos, type ClienteCarimbo } from "../carimboTempo";

const schema = readFileSync("contabilidade-reconstituicao/schema.sql", "utf8");
const bloco = /-- ===== BEGIN CARIMBO DE TEMPO RFC 3161[\s\S]*?-- END CARIMBO DE TEMPO RFC 3161/.exec(schema)![0];

describe("carimboTempo (cliente)", () => {
  let db: Database;
  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();
    db.run("CREATE TABLE ledger_encerramentos (id INTEGER PRIMARY KEY, hash_selo TEXT)");
    db.run("INSERT INTO ledger_encerramentos (id, hash_selo) VALUES (1, 'abc'), (2, NULL)");
    db.run(bloco);
  });

  const cliente = (): ClienteCarimbo => ({
    solicitar: async () => ({
      resultados: [{ tsa_url: "https://a/tsr", token_base64: "AAAA", solicitado_em: "2026-10-04T00:00:00Z" }],
      falhas: [{ tsa_url: "https://b/tsr", erro: "HTTP 500" }],
    }),
  });

  it("grava um carimbo por TSA e reporta falhas", async () => {
    const r = await anexarCarimbosAoSelo(db, 1, cliente());
    expect(r.gravados).toBe(1);
    expect(r.falhas[0]).toContain("https://b/tsr");
    expect(listarCarimbos(db, 1)).toHaveLength(1);
  });

  it("é idempotente por TSA", async () => {
    await anexarCarimbosAoSelo(db, 1, cliente());
    await anexarCarimbosAoSelo(db, 1, cliente());
    expect(listarCarimbos(db, 1)).toHaveLength(1);
  });

  it("recusa encerramento inexistente ou sem selo", async () => {
    await expect(anexarCarimbosAoSelo(db, 99, cliente())).rejects.toThrow(/não encontrado/);
    await expect(anexarCarimbosAoSelo(db, 2, cliente())).rejects.toThrow(/hash_selo/);
  });

  it("carimbo é append-only", async () => {
    await anexarCarimbosAoSelo(db, 1, cliente());
    expect(() => db.run("UPDATE ledger_selo_carimbos SET token_base64='x'")).toThrow(/append-only/);
    expect(() => db.run("DELETE FROM ledger_selo_carimbos")).toThrow(/append-only/);
  });
});
