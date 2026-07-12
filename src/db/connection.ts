import initSqlJs, { type Database } from "sql.js";
import { get, set } from "idb-keyval";
import schemaSql from "../../contabilidade-reconstituicao/schema.sql?raw";
// Import tardio (dentro das funções, não no topo do módulo) porque planoDeContas.ts importa
// consultar/executar deste mesmo arquivo — ciclo seguro em ESM desde que nada rode no
// nível superior do módulo, só dentro de corpos de função chamados depois de ambos os
// módulos avaliados.
import { garantirPlanoDeContasPadrao } from "../domain/planoDeContas";
import { garantirColunasAtualizadas } from "./migracoes";

const IDB_KEY = "contabilidade-db-v1";

let dbInstance: Database | null = null;

async function criarBancoVazio(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const db = new SQL.Database();
  db.run(schemaSql);
  garantirPlanoDeContasPadrao(db);
  return db;
}

/** Um banco vindo de fora (IndexedDB salvo antes, ou arquivo .sqlite importado) pode ter
 * sido criado por uma versão anterior do schema.sql — pode faltar tabela inteira (nova
 * feature) ou coluna nova em tabela já existente. Rodar o schema.sql atual de novo
 * (idempotente: todo CREATE TABLE/INDEX usa IF NOT EXISTS) cria as tabelas que faltam;
 * garantirColunasAtualizadas() cobre o caso de coluna nova numa tabela que já existia,
 * via ALTER TABLE ADD COLUMN. Sem isso, qualquer usuário que já tinha dados salvos antes
 * de uma migração aditiva quebraria ao usar a feature nova. */
function migrarBancoExistente(db: Database): void {
  db.run(schemaSql);
  garantirColunasAtualizadas(db, schemaSql);
  garantirPlanoDeContasPadrao(db);
}

/** Abre o banco: recupera do IndexedDB se existir, senão cria com o schema em branco.
 * Garante também o plano de contas padrão mesmo para quem nunca clicou em "Carregar
 * dados de demonstração" — sem isso, um usuário só com dados reais não teria categoria
 * nenhuma para classificar suas transações. */
export async function abrirBanco(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const bytesSalvos = await get<Uint8Array>(IDB_KEY);
  if (bytesSalvos) {
    const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
    dbInstance = new SQL.Database(bytesSalvos);
    migrarBancoExistente(dbInstance);
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

/** Importa um arquivo .sqlite previamente exportado — mesma migração aditiva de
 * abrirBanco(), porque um backup antigo tem exatamente o mesmo risco de faltar
 * tabela/coluna de um banco recuperado do IndexedDB. */
export async function importarArquivo(bytes: Uint8Array): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  dbInstance = new SQL.Database(bytes);
  migrarBancoExistente(dbInstance);
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
