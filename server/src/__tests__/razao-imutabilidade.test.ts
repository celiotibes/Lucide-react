import { it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
it("razao: triggers null-safe", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE conciliacoes_pix_ofx (id TEXT PRIMARY KEY);");
  db.exec(`CREATE TABLE razao (id TEXT PRIMARY KEY, conta_credito TEXT, conta_debito TEXT, valor REAL NOT NULL, tipo TEXT, status TEXT DEFAULT 'rascunho', referencia_id TEXT, conciliacao_pix_ofx_id TEXT, criado_em TEXT, atualizado_em TEXT);`);
  db.exec(readFileSync("/home/user/Lucide-react/server/src/migrations-phase12-imutabilidade.sql","utf8"));
  db.prepare("INSERT INTO razao (id, valor, status) VALUES ('a', 10, 'rascunho')").run();
  expect(() => db.prepare("UPDATE razao SET referencia_id='x' WHERE id='a'").run()).toThrow(/imut|alterados/i); // NULL -> valor
  db.prepare("UPDATE razao SET status='confirmado' WHERE id='a'").run();
  expect(() => db.prepare("DELETE FROM razao WHERE id='a'").run()).toThrow(/rascunho/);
  expect(() => db.prepare("UPDATE razao SET status='rascunho' WHERE id='a'").run()).toThrow(/Transição/);
});
