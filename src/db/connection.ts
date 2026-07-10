import initSqlJs, { type Database } from "sql.js";
import { get, set } from "idb-keyval";
import schemaSql from "../../contabilidade-reconstituicao/schema.sql?raw";
// Import tardio (dentro das funções, não no topo do módulo) porque planoDeContas.ts importa
// consultar/executar deste mesmo arquivo — ciclo seguro em ESM desde que nada rode no
// nível superior do módulo, só dentro de corpos de função chamados depois de ambos os
// módulos avaliados.
import { garantirPlanoDeContasPadrao } from "../domain/planoDeContas";

const IDB_KEY = "contabilidade-db-v1";

let dbInstance: Database | null = null;

async function criarBancoVazio(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const db = new SQL.Database();
  db.run(schemaSql);
  garantirPlanoDeContasPadrao(db);
  return db;
}

/** Abre o banco: recupera do IndexedDB se existir, senão cria com o schema em branco.
 * Garante o plano de contas padrão mesmo para quem nunca clicou em "Carregar dados de
 * demonstração" — sem isso, um usuário só com dados reais não teria categoria nenhuma
 * para classificar suas transações. */
export async function abrirBanco(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const bytesSalvos = await get<Uint8Array>(IDB_KEY);
  if (bytesSalvos) {
    const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
    dbInstance = new SQL.Database(bytesSalvos);
    garantirPlanoDeContasPadrao(dbInstance);
  } else {
    dbInstance = await criarBancoVazio();
  }
  return dbInstance;
}

/** Persiste o estado atual do banco no IndexedDB. Chame após qualquer escrita. */
export async function salvarBanco(db: Database): Promise<void> {
  const bytes = db.export();
  await set(IDB_KEY, bytes);
}

/** Descarta todos os dados e recomeça do schema em branco. */
export async function reiniciarBanco(): Promise<Database> {
  dbInstance = await criarBancoVazio();
  await salvarBanco(dbInstance);
  return dbInstance;
}

/** Exporta o banco como arquivo .sqlite para download/backup do usuário. */
export function exportarArquivo(db: Database): Blob {
  return new Blob([db.export().slice().buffer as ArrayBuffer], { type: "application/x-sqlite3" });
}

/** Importa um arquivo .sqlite previamente exportado. */
export async function importarArquivo(bytes: Uint8Array): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  dbInstance = new SQL.Database(bytes);
  await salvarBanco(dbInstance);
  return dbInstance;
}

/** Executa uma consulta SELECT e retorna as linhas como objetos. */
export function consultar<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  params: (string | number | null)[] = [],
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const linhas: T[] = [];
  while (stmt.step()) {
    linhas.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return linhas;
}

/** Executa um INSERT/UPDATE/DELETE. */
export function executar(db: Database, sql: string, params: (string | number | null)[] = []): void {
  db.run(sql, params);
}
