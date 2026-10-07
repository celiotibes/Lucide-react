/**
 * Cria um banco em memória com o schema REAL do servidor: as mesmas migrações do boot, na mesma
 * ordem de database-init.ts (fase 2 + lista de runMigracoesIdempotentes). Não contém as tabelas
 * de negócio do navegador (transacoes, imoveis, cobrancas, asaas_cobrancas, plano_de_contas).
 *
 * Se database-init.ts ganhar uma migração nova, acrescente-a aqui (o teste de paridade em
 * matriz-rotas-acesso.test.ts compara esta lista com o código-fonte e falha se divergir).
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = path.join(__dirname, "../..");

export const MIGRACOES_BOOT = [
  "migrations-phase2-auth.sql",
  "migrations-phase3-integracoes.sql",
  "migrations-phase4-vinculos-externos.sql",
  "migrations-phase4.1-anomalias.sql",
  "migrations-phase5-lembretes-agendados.sql",
  "migrations-phase6-analytics-completa.sql",
  "migrations-phase6-relatorios-dre.sql",
  "migrations-phase7-margens-propriedades.sql",
  "migrations-phase7-relatorio-executivo.sql",
  "migrations-phase8-asaas-reembolsos.sql",
  "migrations-phase8-reconciliacao-asaas.sql",
  "migrations-phase8-conciliacao-pix-ofx.sql",
  "migrations-phase9-pagamentos-pix-proativos.sql",
  "migrations-phase10-assinatura-lgpd.sql",
  "migrations-phase11-performance-indexes.sql",
  "migrations-phase12-asaas-webhook-dedup.sql",
  "migrations-phase12-imutabilidade.sql",
  "migrations-phase13-acl-recursos.sql",
  "migrations-phase14-portal-inquilino.sql",
  "migrations-phase15-prestador-apontamentos.sql",
  "migrations-phase17-importacao.sql",
  "migrations-phase18-agentes-economicos-sqlite.sql",
  "migrations-phase18-ocr-extraction.sql",
  "migrations-phase19-reconciliation.sql",
  "migrations-phase19-ledger-agentes-fk-sqlite.sql",
  "migrations-phase20-agentes-deduplicacao-sqlite.sql",
];

export function criarBancoDoServidor(): Database.Database {
  const db = new Database(":memory:");
  for (const arquivo of MIGRACOES_BOOT) {
    db.exec(fs.readFileSync(path.join(SRC_DIR, arquivo), "utf-8"));
  }
  return db;
}
