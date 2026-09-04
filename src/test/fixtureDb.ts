import initSqlJs, { type Database } from "sql.js";
import schemaSql from "../../contabilidade-reconstituicao/schema.sql?raw";
import { garantirPlanoDeContasPadrao } from "../domain/planoDeContas";

/** Banco sql.js em memória com o schema atual e o plano de contas padrão — mesma base que
 * `criarBancoVazio()` usa no navegador (db/connection.ts), mas resolvendo o WASM pelo
 * filesystem em vez de `fetch("/sql-wasm.wasm")` (que não existe fora do navegador/servidor
 * de dev). Cada teste chama isto para começar de um banco limpo e isolado — nunca compartilha
 * estado entre testes. */
export async function criarBancoDeTeste(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: (arquivo) => `node_modules/sql.js/dist/${arquivo}` });
  const db = new SQL.Database();
  db.run(schemaSql);
  garantirPlanoDeContasPadrao(db);
  return db;
}
