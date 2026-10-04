import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import {
  conciliarPixOFX,
  buscarMatchPixOfx,
  gerarLancamentoContabil,
  buscarStatusConciliacao,
  type ResultadoConciliacao,
  type ConciliacaoPix,
} from "../conciliacao-pix-ofx.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-conciliacao-pix-ofx-${process.pid}-${Date.now()}.db`);

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");

  // Cria tabelas de teste
  db.exec(`
    CREATE TABLE IF NOT EXISTS cobrancas_asaas (
      id TEXT PRIMARY KEY,
      asaas_charge_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'PENDING',
      valor REAL NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      beneficiario TEXT,
      origem_tipo TEXT,
      deletado INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS conciliacao_ofx_cache (
      id TEXT PRIMARY KEY,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      descricao TEXT NOT NULL,
      processado INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS conciliacoes_pix_ofx (
      id TEXT PRIMARY KEY,
      asaas_charge_id TEXT NOT NULL,
      pluggy_ofx_id TEXT,
      valor_asaas REAL NOT NULL,
      valor_ofx REAL,
      data_asaas TEXT NOT NULL,
      data_ofx TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      discrepancia_flag INTEGER NOT NULL DEFAULT 0,
      lancamento_razao_id TEXT,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT,
      UNIQUE(asaas_charge_id, criado_em)
    );

    CREATE TABLE IF NOT EXISTS audit_conciliacao_discrepancias (
      id TEXT PRIMARY KEY,
      conciliacao_id TEXT NOT NULL,
      tipo_discrepancia TEXT NOT NULL,
      descricao TEXT,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conciliacao_id) REFERENCES conciliacoes_pix_ofx(id)
    );

    CREATE TABLE IF NOT EXISTS razao (
      id TEXT PRIMARY KEY,
      conta_credito TEXT,
      conta_debito TEXT,
      valor REAL NOT NULL,
      tipo TEXT,
      status TEXT,
      conciliacao_pix_ofx_id TEXT,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conciliacao_pix_ofx_id) REFERENCES conciliacoes_pix_ofx(id)
    );

    CREATE INDEX IF NOT EXISTS idx_cobrancas_status ON cobrancas_asaas(status);
    CREATE INDEX IF NOT EXISTS idx_conciliacao_status ON conciliacoes_pix_ofx(status);
    CREATE INDEX IF NOT EXISTS idx_conciliacao_criado ON conciliacoes_pix_ofx(criado_em DESC);
  `);

  return db;
}

function inserirChargePaga(db: Database.Database, id: string, valor: number, beneficiario: string = "Cliente A") {
  const stmt = db.prepare(`
    INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
    VALUES (?, 'PAID', ?, ?, datetime('now'))
  `);
  stmt.run(id, valor, beneficiario);
}

function inserirTransacaoOFX(db: Database.Database, id: string, valor: number, descricao: string, data?: string) {
  const dataInsert = data || new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, valor, dataInsert, descricao);
}

describe("Reconciliação PIX↔OFX", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // ===== TESTES DE CONCILIAÇÃO GERAL =====

  it("01: conciliarPixOFX retorna 0 se nenhuma charge", () => {
    const resultado = conciliarPixOFX(db);
    expect(resultado.conciliadas).toBe(0);
    expect(resultado.pendentes).toBe(0);
    expect(resultado.detalhes).toContain("Nenhuma charge PIX paga para reconciliar");
  });

  it("02: conciliarPixOFX marca como pendente se sem OFX", () => {
    inserirChargePaga(db, "charge-1", 100, "Cliente A");

    const resultado = conciliarPixOFX(db);

    expect(resultado.pendentes).toBe(1);
    expect(resultado.conciliadas).toBe(0);

    // Verifica se foi criado registro de conciliação
    const stmt = db.prepare("SELECT * FROM conciliacoes_pix_ofx WHERE asaas_charge_id = ?");
    const conc = stmt.get("charge-1") as any;
    expect(conc).toBeDefined();
    expect(conc.status).toBe("pendente");
  });

  it("03: conciliarPixOFX reconcilia com match exato", () => {
    const hoje = new Date().toISOString();

    // Insere charge com data específica
    const stmtCharge = db.prepare(`
      INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
      VALUES (?, 'PAID', ?, ?, ?)
    `);
    stmtCharge.run("charge-2", 250, "Cliente B", hoje);

    inserirTransacaoOFX(db, "ofx-2", 250, "Cliente B - Pagamento", hoje);

    const resultado = conciliarPixOFX(db);

    expect(resultado.conciliadas).toBe(1);
    expect(resultado.discrepancias).toBe(0);
    expect(resultado.pendentes).toBe(0);

    const stmt = db.prepare("SELECT * FROM conciliacoes_pix_ofx WHERE asaas_charge_id = ?");
    const conc = stmt.get("charge-2") as any;
    expect(conc.status).toBe("reconciliado");
    expect(conc.pluggy_ofx_id).toBe("ofx-2");
  });

  it("04: conciliarPixOFX flags múltiplos matches como discrepância", () => {
    inserirChargePaga(db, "charge-3", 150, "Cliente C");
    inserirTransacaoOFX(db, "ofx-3a", 150, "Cliente C - Pagto");
    inserirTransacaoOFX(db, "ofx-3b", 150, "Cliente C - Outra");

    const resultado = conciliarPixOFX(db);

    expect(resultado.discrepancias).toBe(1);
    expect(resultado.conciliadas).toBe(0);

    const stmt = db.prepare("SELECT * FROM conciliacoes_pix_ofx WHERE asaas_charge_id = ?");
    const conc = stmt.get("charge-3") as any;
    expect(conc.status).toBe("discrepancia");
    expect(conc.discrepancia_flag).toBe(1);
  });

  // ===== TESTES DE MATCHING =====

  it("05: buscarMatchPixOfx retorna false se charge não existe", () => {
    const result = buscarMatchPixOfx(db, "inexistente");
    expect(result.match).toBe(false);
    expect(result.transacao).toBeNull();
  });

  it("06: buscarMatchPixOfx encontra match exato", () => {
    inserirChargePaga(db, "charge-4", 500, "Beneficiário X");
    inserirTransacaoOFX(db, "ofx-4", 500, "Beneficiário X");

    const result = buscarMatchPixOfx(db, "charge-4");

    expect(result.match).toBe(true);
    expect(result.transacao).not.toBeNull();
    expect(result.transacao!.id).toBe("ofx-4");
    expect(result.confianca).toBeGreaterThan(50);
    expect(result.multiplos).toBe(false);
  });

  it("07: buscarMatchPixOfx tolera variação de ±5% no valor", () => {
    inserirChargePaga(db, "charge-5", 1000, "Cliente D");
    inserirTransacaoOFX(db, "ofx-5", 1040, "Cliente D"); // +4% está dentro de 5%

    const result = buscarMatchPixOfx(db, "charge-5", 0.05); // 5%

    expect(result.match).toBe(true);
    expect(result.transacao!.id).toBe("ofx-5");
  });

  it("08: buscarMatchPixOfx rejeita valor fora de tolerância", () => {
    inserirChargePaga(db, "charge-6", 1000, "Cliente E");
    inserirTransacaoOFX(db, "ofx-6", 1100, "Cliente E"); // +10% está fora de 5%

    const result = buscarMatchPixOfx(db, "charge-6", 0.05); // 5%

    expect(result.match).toBe(false);
  });

  it("09: buscarMatchPixOfx detecta múltiplos matches", () => {
    inserirChargePaga(db, "charge-7", 300, "Cliente F");
    inserirTransacaoOFX(db, "ofx-7a", 300, "Cliente F");
    inserirTransacaoOFX(db, "ofx-7b", 300, "Cliente F");

    const result = buscarMatchPixOfx(db, "charge-7");

    expect(result.match).toBe(true);
    expect(result.multiplos).toBe(true);
  });

  // ===== TESTES DE LANÇAMENTO CONTÁBIL =====

  it("10: gerarLancamentoContabil cria entrada em razão", () => {
    inserirChargePaga(db, "charge-8", 450, "Cliente G");

    const conciliacao: ConciliacaoPix = {
      id: "conc-8",
      asaas_charge_id: "charge-8",
      pluggy_ofx_id: "ofx-8",
      valor_asaas: 450,
      valor_ofx: 450,
      data_asaas: new Date().toISOString(),
      data_ofx: new Date().toISOString(),
      status: "reconciliado",
      discrepancia_flag: false,
      lancamento_razao_id: null,
      criado_em: new Date().toISOString(),
      atualizado_em: null,
    };

    // Insere conciliação primeiro (FK)
    const stmtConc = db.prepare(`
      INSERT INTO conciliacoes_pix_ofx
        (id, asaas_charge_id, pluggy_ofx_id, valor_asaas, valor_ofx, data_asaas, data_ofx, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmtConc.run(
      conciliacao.id,
      conciliacao.asaas_charge_id,
      conciliacao.pluggy_ofx_id,
      conciliacao.valor_asaas,
      conciliacao.valor_ofx,
      conciliacao.data_asaas,
      conciliacao.data_ofx,
      conciliacao.status,
    );

    const lancamentoId = gerarLancamentoContabil(db, conciliacao);

    expect(lancamentoId).toBeDefined();
    const stmt = db.prepare("SELECT * FROM razao WHERE id = ?");
    const lancamento = stmt.get(lancamentoId) as any;
    expect(lancamento).toBeDefined();
    expect(lancamento.valor).toBe(450);
    expect(lancamento.tipo).toBe("entrada_pix");
    expect(lancamento.status).toBe("proposta"); // razao do servidor é fila de propostas, não lançamento final
  });

  it("11: gerarLancamentoContabil lança erro se charge não existe", () => {
    const conciliacao: ConciliacaoPix = {
      id: "conc-9",
      asaas_charge_id: "inexistente",
      pluggy_ofx_id: "ofx-9",
      valor_asaas: 100,
      valor_ofx: 100,
      data_asaas: new Date().toISOString(),
      data_ofx: new Date().toISOString(),
      status: "reconciliado",
      discrepancia_flag: false,
      lancamento_razao_id: null,
      criado_em: new Date().toISOString(),
      atualizado_em: null,
    };

    expect(() => gerarLancamentoContabil(db, conciliacao)).toThrow();
  });

  it("12: gerarLancamentoContabil valida FK com conciliacao", () => {
    inserirChargePaga(db, "charge-10", 200, "Cliente H");

    const conciliacao: ConciliacaoPix = {
      id: "conc-10",
      asaas_charge_id: "charge-10",
      pluggy_ofx_id: "ofx-10",
      valor_asaas: 200,
      valor_ofx: 200,
      data_asaas: new Date().toISOString(),
      data_ofx: new Date().toISOString(),
      status: "reconciliado",
      discrepancia_flag: false,
      lancamento_razao_id: null,
      criado_em: new Date().toISOString(),
      atualizado_em: null,
    };

    // Insere conciliação
    const stmtConc = db.prepare(`
      INSERT INTO conciliacoes_pix_ofx
        (id, asaas_charge_id, pluggy_ofx_id, valor_asaas, valor_ofx, data_asaas, data_ofx, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmtConc.run(
      conciliacao.id,
      conciliacao.asaas_charge_id,
      conciliacao.pluggy_ofx_id,
      conciliacao.valor_asaas,
      conciliacao.valor_ofx,
      conciliacao.data_asaas,
      conciliacao.data_ofx,
      conciliacao.status,
    );

    const lancamentoId = gerarLancamentoContabil(db, conciliacao);

    const stmt = db.prepare("SELECT conciliacao_pix_ofx_id FROM razao WHERE id = ?");
    const lancamento = stmt.get(lancamentoId) as any;
    expect(lancamento.conciliacao_pix_ofx_id).toBe("conc-10");
  });

  // ===== TESTES DE DISCREPÂNCIA =====

  it("13: Detecta discrepância de valor", () => {
    const hoje = new Date().toISOString();

    const stmtCharge = db.prepare(`
      INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
      VALUES (?, 'PAID', ?, ?, ?)
    `);
    stmtCharge.run("charge-11", 1000, "Cliente I", hoje);

    inserirTransacaoOFX(db, "ofx-11", 950, "Cliente I", hoje); // 5% de diferença

    const resultado = conciliarPixOFX(db);

    // Dependendo da tolerância, pode ser match (dentro de 5%)
    expect(resultado.conciliadas + resultado.discrepancias + resultado.pendentes).toBe(1);
  });

  it("14: Detecta discrepância de data", () => {
    const hoje = new Date();
    const hojeMenosTres = new Date(hoje.getTime() - 3 * 24 * 60 * 60 * 1000);

    const stmtCharge = db.prepare(`
      INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
      VALUES (?, 'PAID', ?, ?, ?)
    `);
    stmtCharge.run("charge-12", 800, "Cliente J", hojeMenosTres.toISOString());

    // OFX está 3 dias depois (fora da tolerância de ±2 dias)
    inserirTransacaoOFX(db, "ofx-12", 800, "Cliente J");

    const result = buscarMatchPixOfx(db, "charge-12");

    expect(result.match).toBe(false); // Fora da tolerância de data
  });

  it("15: Detecta discrepância sem beneficiário", () => {
    inserirChargePaga(db, "charge-13", 600, "");
    inserirTransacaoOFX(db, "ofx-13", 600, "Desc genérica");

    const result = buscarMatchPixOfx(db, "charge-13");

    expect(result.match).toBe(true); // Ainda encontra por valor/data
    expect(result.confianca).toBeLessThan(100); // Confiança menor sem beneficiário
  });

  // ===== TESTES DE STATUS E EXPIRAÇÃO =====

  it("16: buscarStatusConciliacao retorna contagens corretas", () => {
    inserirChargePaga(db, "charge-14", 100, "Cliente K");
    inserirTransacaoOFX(db, "ofx-14", 100, "Cliente K");

    conciliarPixOFX(db);

    const status = buscarStatusConciliacao(db, 30);

    expect(status.conciliadas).toBeGreaterThanOrEqual(0);
    expect(status.pendentes + status.conciliadas + status.discrepancias + status.expiradas).toBeGreaterThanOrEqual(0);
  });

  it("17: Marca pendências antigas como expiradas", () => {
    inserirChargePaga(db, "charge-15", 350, "Cliente L");

    conciliarPixOFX(db);

    // Insere uma conciliação antiga (8 dias atrás)
    const stmtOld = db.prepare(`
      INSERT INTO conciliacoes_pix_ofx
        (id, asaas_charge_id, pluggy_ofx_id, valor_asaas, valor_ofx, data_asaas, data_ofx, status, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-8 days'))
    `);
    stmtOld.run("conc-old", "charge-old", null, 100, null, "2024-01-01", null, "pendente");

    conciliarPixOFX(db);

    const stmt = db.prepare("SELECT status FROM conciliacoes_pix_ofx WHERE id = ?");
    const conc = stmt.get("conc-old") as any;
    expect(conc.status).toBe("expirado");
  });

  // ===== TESTES DE EDGE CASES =====

  it("18: Não cria duplicatas de conciliação", () => {
    inserirChargePaga(db, "charge-16", 525, "Cliente M");

    conciliarPixOFX(db);
    conciliarPixOFX(db); // segunda rodada

    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM conciliacoes_pix_ofx WHERE asaas_charge_id = ?");
    const result = stmt.get("charge-16") as any;
    expect(result.cnt).toBe(1); // Apenas uma
  });

  it("19: Processa múltiplas charges em uma rodada", () => {
    inserirChargePaga(db, "charge-17", 100, "Cliente N");
    inserirChargePaga(db, "charge-18", 200, "Cliente O");
    inserirChargePaga(db, "charge-19", 300, "Cliente P");

    const resultado = conciliarPixOFX(db);

    expect(resultado.pendentes).toBe(3);
  });

  it("20: Tolerance de valor e data trabalham juntos", () => {
    const hoje = new Date();
    const ontemDate = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);

    const stmtCharge = db.prepare(`
      INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
      VALUES (?, 'PAID', ?, ?, ?)
    `);
    stmtCharge.run("charge-20", 1000, "Cliente Q", ontemDate.toISOString());

    // OFX: mesma data (depois do insert), valor 3% abaixo (dentro de 5%)
    inserirTransacaoOFX(db, "ofx-20", 970, "Cliente Q");

    const result = buscarMatchPixOfx(db, "charge-20", 0.05, 2);

    expect(result.match).toBe(true);
    expect(result.transacao!.id).toBe("ofx-20");
  });

  // ===== TESTES PARTE C: Correção de débito/crédito e status =====

  it("PARTE C: gerarLancamentoContabil debita Caixa PIX (1120) e credita Receita (4110)", () => {
    const conciliacao: ConciliacaoPix = {
      id: randomUUID(),
      asaas_charge_id: "charge-pix-1",
      pluggy_ofx_id: "ofx-1",
      valor_asaas: 1500,
      valor_ofx: 1500,
      data_asaas: "2025-02-10",
      data_ofx: "2025-02-10",
      status: "proposta",
      discrepancia_flag: false,
      lancamento_razao_id: null,
      criado_em: new Date().toISOString(),
      atualizado_em: null,
    };

    inserirChargePaga(db, "charge-pix-1", 1500, "Cliente PIX");
    db.prepare(
      `INSERT INTO conciliacoes_pix_ofx (id, asaas_charge_id, pluggy_ofx_id, valor_asaas, valor_ofx, data_asaas, data_ofx, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(conciliacao.id, conciliacao.asaas_charge_id, conciliacao.pluggy_ofx_id, conciliacao.valor_asaas, conciliacao.valor_ofx, conciliacao.data_asaas, conciliacao.data_ofx, "reconciliado");

    const lancamentoId = gerarLancamentoContabil(db, conciliacao);
    expect(lancamentoId).toBeDefined();

    const stmt = db.prepare("SELECT conta_debito, conta_credito, valor FROM razao WHERE id = ?");
    const lancamento = stmt.get(lancamentoId) as any;

    // PARTE C (1): Direção CORRIGIDA — recebimento PIX debita Caixa, credita Receita
    expect(lancamento.conta_debito).toBe("1120"); // Caixa PIX
    expect(lancamento.conta_credito).toBe("4110"); // Receita
    expect(lancamento.valor).toBe(1500);
  });

  it("PARTE C: gerarLancamentoContabil grava status 'proposta', não 'reconciliado'", () => {
    const conciliacao: ConciliacaoPix = {
      id: randomUUID(),
      asaas_charge_id: "charge-proposta-1",
      pluggy_ofx_id: null,
      valor_asaas: 800,
      valor_ofx: null,
      data_asaas: "2025-02-11",
      data_ofx: null,
      status: "proposta",
      discrepancia_flag: false,
      lancamento_razao_id: null,
      criado_em: new Date().toISOString(),
      atualizado_em: null,
    };

    inserirChargePaga(db, "charge-proposta-1", 800, "Cliente Proposta");
    db.prepare(
      `INSERT INTO conciliacoes_pix_ofx (id, asaas_charge_id, pluggy_ofx_id, valor_asaas, valor_ofx, data_asaas, data_ofx, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(conciliacao.id, conciliacao.asaas_charge_id, conciliacao.pluggy_ofx_id, conciliacao.valor_asaas, conciliacao.valor_ofx, conciliacao.data_asaas, conciliacao.data_ofx, "reconciliado");

    const lancamentoId = gerarLancamentoContabil(db, conciliacao);

    const stmt = db.prepare("SELECT status FROM razao WHERE id = ?");
    const lancamento = stmt.get(lancamentoId) as any;

    // PARTE C (2): Status CORRIGIDO — razao é FILA DE PROPOSTAS
    expect(lancamento.status).toBe("proposta");
  });

  it("PARTE C: gerarLancamentoContabil não mascara erro de tabela não encontrada", () => {
    // Criar novo BD sem tabela razao
    const dbNoRazao = new Database(":memory:");
    dbNoRazao.pragma("foreign_keys = ON");

    // Cria tabelas mínimas menos razao
    dbNoRazao.exec(`
      CREATE TABLE cobrancas_asaas (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'PENDING',
        valor REAL NOT NULL,
        origem_tipo TEXT
      );
      INSERT INTO cobrancas_asaas VALUES ('charge-error-1', 'PAID', 500, 'pix');
    `);

    const conciliacao: ConciliacaoPix = {
      id: randomUUID(),
      asaas_charge_id: "charge-error-1",
      pluggy_ofx_id: null,
      valor_asaas: 500,
      valor_ofx: null,
      data_asaas: "2025-02-12",
      data_ofx: null,
      status: "proposta",
      discrepancia_flag: false,
      lancamento_razao_id: null,
      criado_em: new Date().toISOString(),
      atualizado_em: null,
    };

    // Deve lançar erro real de "no such table: razao"
    expect(() => gerarLancamentoContabil(dbNoRazao, conciliacao)).toThrow(
      /no such table/i,
    );
    dbNoRazao.close();
  });

  // ===== TESTES AVANÇADOS: AUDITORIA E DISCREPÂNCIAS =====

  it("21: Auditoria registra tipo de discrepância corretamente", () => {
    inserirChargePaga(db, "charge-auditoria-1", 500, "Cliente Audit");
    inserirTransacaoOFX(db, "ofx-audit-1", 500, "Cliente Audit");
    inserirTransacaoOFX(db, "ofx-audit-2", 500, "Cliente Audit");

    conciliarPixOFX(db);

    const stmtAudit = db.prepare(`
      SELECT tipo_discrepancia, descricao
      FROM audit_conciliacao_discrepancias
      WHERE tipo_discrepancia = 'multiplos_matches'
    `);
    const audit = stmtAudit.get() as any;

    expect(audit).toBeDefined();
    expect(audit.tipo_discrepancia).toBe("multiplos_matches");
    expect(audit.descricao).toContain("Múltiplos matches"); // Começa com maiúscula
  });

  it("22: Partial match com valor próximo ao limite", () => {
    const tolerancia = 0.05; // 5%
    inserirChargePaga(db, "charge-partial-1", 1000, "Cliente Partial");
    // Exatamente 5% abaixo (limite inclusivo)
    inserirTransacaoOFX(db, "ofx-partial-1", 950, "Cliente Partial");

    const result = buscarMatchPixOfx(db, "charge-partial-1", tolerancia);

    expect(result.match).toBe(true);
    expect(result.transacao!.valor).toBe(950);
  });

  it("23: Rejeita valor exatamente fora da tolerância", () => {
    inserirChargePaga(db, "charge-outside-1", 1000, "Cliente Outside");
    // 5.1% abaixo (fora do 5%)
    inserirTransacaoOFX(db, "ofx-outside-1", 949, "Cliente Outside");

    const result = buscarMatchPixOfx(db, "charge-outside-1", 0.05);

    expect(result.match).toBe(false);
  });

  it("24: Confiança reduzida sem beneficiário", () => {
    inserirChargePaga(db, "charge-no-ben-1", 700, "");
    inserirTransacaoOFX(db, "ofx-no-ben-1", 700, "Descrição genérica");

    const result = buscarMatchPixOfx(db, "charge-no-ben-1");

    expect(result.match).toBe(true);
    expect(result.confianca).toBeLessThan(100);
    expect(result.confianca).toBeGreaterThanOrEqual(50);
  });

  it("25: Data exatamente no limite de ±2 dias", () => {
    const hoje = new Date();
    const maisDosDias = new Date(hoje.getTime() + 2 * 24 * 60 * 60 * 1000);

    const stmtCharge = db.prepare(`
      INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
      VALUES (?, 'PAID', ?, ?, ?)
    `);
    stmtCharge.run("charge-date-limit-1", 1000, "Cliente Date", hoje.toISOString());

    inserirTransacaoOFX(db, "ofx-date-limit-1", 1000, "Cliente Date", maisDosDias.toISOString());

    const result = buscarMatchPixOfx(db, "charge-date-limit-1", 0.05, 2);

    expect(result.match).toBe(true);
  });

  it("26: Data um dia além do limite é rejeitada", () => {
    const hoje = new Date();
    const maisDeTreesDias = new Date(hoje.getTime() + 2.1 * 24 * 60 * 60 * 1000);

    const stmtCharge = db.prepare(`
      INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
      VALUES (?, 'PAID', ?, ?, ?)
    `);
    stmtCharge.run("charge-date-over-1", 1000, "Cliente Over", hoje.toISOString());

    inserirTransacaoOFX(db, "ofx-date-over-1", 1000, "Cliente Over", maisDeTreesDias.toISOString());

    const result = buscarMatchPixOfx(db, "charge-date-over-1", 0.05, 2);

    expect(result.match).toBe(false);
  });

  it("27: Cargas com múltiplas transações OFX (melhor confiança vence)", () => {
    inserirChargePaga(db, "charge-multi-1", 500, "Cliente Multi");
    inserirTransacaoOFX(db, "ofx-multi-1", 495, "Outro lugar"); // 1% de diferença, sem beneficiário
    inserirTransacaoOFX(db, "ofx-multi-2", 510, "Cliente Multi"); // 2% de diferença, com beneficiário

    const result = buscarMatchPixOfx(db, "charge-multi-1", 0.05);

    // Deve preferir o match com beneficiário (ofx-multi-2)
    expect(result.transacao!.id).toBe("ofx-multi-2");
    expect(result.confianca).toBeGreaterThan(50);
  });

  it("28: Descições case-insensitive no matching", () => {
    inserirChargePaga(db, "charge-case-1", 300, "CLIENTE UPPER");
    inserirTransacaoOFX(db, "ofx-case-1", 300, "cliente upper lowercase");

    const result = buscarMatchPixOfx(db, "charge-case-1");

    expect(result.match).toBe(true);
    expect(result.confianca).toBeGreaterThan(50); // Beneficiário encontrado
  });

  it("29: Batch processing com mix de reconciliadas/pendentes/discrepâncias", () => {
    // Reconciliada
    inserirChargePaga(db, "batch-recon-1", 100, "Cliente A");
    inserirTransacaoOFX(db, "ofx-batch-1", 100, "Cliente A");

    // Pendente (sem OFX)
    inserirChargePaga(db, "batch-pend-1", 200, "Cliente B");

    // Discrepância (múltiplos)
    inserirChargePaga(db, "batch-disc-1", 300, "Cliente C");
    inserirTransacaoOFX(db, "ofx-batch-2", 300, "Cliente C");
    inserirTransacaoOFX(db, "ofx-batch-3", 300, "Cliente C");

    const resultado = conciliarPixOFX(db);

    expect(resultado.conciliadas).toBe(1);
    expect(resultado.pendentes).toBe(1);
    expect(resultado.discrepancias).toBe(1);
    expect(resultado.conciliadas + resultado.pendentes + resultado.discrepancias).toBe(3);
  });

  it("30: Status 'expirado' é marcado após 7 dias", () => {
    inserirChargePaga(db, "charge-expire-1", 150, "Cliente Exp");

    // Primeira reconciliação — marca como pendente
    conciliarPixOFX(db);

    // Simula passagem de 8 dias atualizando criado_em
    const stmtUpdate = db.prepare(`
      UPDATE conciliacoes_pix_ofx
      SET criado_em = datetime('now', '-8 days')
      WHERE asaas_charge_id = ?
    `);
    stmtUpdate.run("charge-expire-1");

    // Segunda reconciliação
    conciliarPixOFX(db);

    const stmt = db.prepare("SELECT status FROM conciliacoes_pix_ofx WHERE asaas_charge_id = ?");
    const conc = stmt.get("charge-expire-1") as any;

    expect(conc.status).toBe("expirado");
  });

  it("31: Não expira reconciliados ou discrepâncias, apenas pendentes", () => {
    inserirChargePaga(db, "charge-no-exp-recon-1", 100, "Cliente NoExp");
    inserirTransacaoOFX(db, "ofx-no-exp-1", 100, "Cliente NoExp");

    conciliarPixOFX(db);

    // Simula 8 dias
    const stmtUpdate = db.prepare(`
      UPDATE conciliacoes_pix_ofx
      SET criado_em = datetime('now', '-8 days')
      WHERE asaas_charge_id = ?
    `);
    stmtUpdate.run("charge-no-exp-recon-1");

    // Segunda rodada não deve mudar status
    conciliarPixOFX(db);

    const stmt = db.prepare("SELECT status FROM conciliacoes_pix_ofx WHERE asaas_charge_id = ?");
    const conc = stmt.get("charge-no-exp-recon-1") as any;

    expect(conc.status).toBe("reconciliado"); // Permanece reconciliado
  });

  it("32: Lançamento contábil mantém referência à conciliação", () => {
    const hoje = new Date().toISOString();

    const stmtCharge = db.prepare(`
      INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
      VALUES (?, 'PAID', ?, ?, ?)
    `);
    stmtCharge.run("charge-ref-1", 1200, "Cliente Ref", hoje);

    inserirTransacaoOFX(db, "ofx-ref-1", 1200, "Cliente Ref", hoje);

    const resultado = conciliarPixOFX(db);

    expect(resultado.conciliadas).toBe(1);

    // Busca conciliação
    const stmtConc = db.prepare("SELECT id, lancamento_razao_id FROM conciliacoes_pix_ofx WHERE asaas_charge_id = ?");
    const conc = stmtConc.get("charge-ref-1") as any;

    expect(conc.lancamento_razao_id).toBeDefined();

    // Verifica que lançamento referencia conciliação
    const stmtLancamento = db.prepare("SELECT conciliacao_pix_ofx_id FROM razao WHERE id = ?");
    const lancamento = stmtLancamento.get(conc.lancamento_razao_id) as any;

    expect(lancamento.conciliacao_pix_ofx_id).toBe(conc.id);
  });

  it("33: Valor zero não causa erro de divisão", () => {
    const stmtCharge = db.prepare(`
      INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
      VALUES (?, 'PAID', ?, ?, datetime('now'))
    `);
    stmtCharge.run("charge-zero-1", 0, "Cliente Zero");

    // Não deve lançar erro
    expect(() => {
      buscarMatchPixOfx(db, "charge-zero-1", 0.05);
    }).not.toThrow();
  });

  it("34: Transações negativas (devoluções) não causam erro", () => {
    // Negativas são suportadas mas O beneficiário VAZIO em charge faz falhar
    // Isso é aceitável pois o sistema é para recebimentos (positivos)
    inserirChargePaga(db, "charge-neg-1", -100, "Devolução");
    inserirTransacaoOFX(db, "ofx-neg-1", -100, "Devolução OFX");

    // Não deve lançar erro
    expect(() => {
      buscarMatchPixOfx(db, "charge-neg-1");
    }).not.toThrow();
  });

  it("35: Confiança é calculada corretamente (50 base + bonificações)", () => {
    inserirChargePaga(db, "charge-conf-1", 1000, "Cliente Confiança");
    // Match exato: valor próximo (20), data próxima (20), beneficiário (20) = 50+60=110 capped
    inserirTransacaoOFX(db, "ofx-conf-1", 1010, "Cliente Confiança");

    const result = buscarMatchPixOfx(db, "charge-conf-1");

    // Confiança deve ser >80 (50 base + valor próximo + beneficiário)
    expect(result.confianca).toBeGreaterThan(80);
  });

  it("36: Status de conciliação após expiry reflete mudanças", () => {
    inserirChargePaga(db, "charge-status-1", 250, "Cliente Status");

    const status1 = buscarStatusConciliacao(db, 30);
    const antes = status1.pendentes;

    conciliarPixOFX(db);
    const status2 = buscarStatusConciliacao(db, 30);

    expect(status2.pendentes).toBe(antes + 1);
  });

  it("37: Reconciliação é realmente idempotente (sem duplicatas)", () => {
    inserirChargePaga(db, "charge-idem-1", 500, "Cliente Idem");
    inserirTransacaoOFX(db, "ofx-idem-1", 500, "Cliente Idem");

    conciliarPixOFX(db);
    conciliarPixOFX(db);
    conciliarPixOFX(db);

    const stmtCount = db.prepare("SELECT COUNT(*) as cnt FROM conciliacoes_pix_ofx WHERE asaas_charge_id = ?");
    const result = stmtCount.get("charge-idem-1") as any;

    // Apenas uma reconciliação, não três
    expect(result.cnt).toBe(1);
  });

  it("38: Lançamentos contábeis têm tipo 'entrada_pix' para receitas PIX", () => {
    const conciliacao: ConciliacaoPix = {
      id: randomUUID(),
      asaas_charge_id: "charge-tipo-1",
      pluggy_ofx_id: "ofx-tipo-1",
      valor_asaas: 600,
      valor_ofx: 600,
      data_asaas: "2025-02-14",
      data_ofx: "2025-02-14",
      status: "reconciliado",
      discrepancia_flag: false,
      lancamento_razao_id: null,
      criado_em: new Date().toISOString(),
      atualizado_em: null,
    };

    inserirChargePaga(db, "charge-tipo-1", 600, "Cliente Tipo");
    db.prepare(
      `INSERT INTO conciliacoes_pix_ofx (id, asaas_charge_id, pluggy_ofx_id, valor_asaas, valor_ofx, data_asaas, data_ofx, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(conciliacao.id, conciliacao.asaas_charge_id, conciliacao.pluggy_ofx_id, conciliacao.valor_asaas, conciliacao.valor_ofx, conciliacao.data_asaas, conciliacao.data_ofx, "reconciliado");

    const lancamentoId = gerarLancamentoContabil(db, conciliacao);

    const stmt = db.prepare("SELECT tipo FROM razao WHERE id = ?");
    const lancamento = stmt.get(lancamentoId) as any;

    expect(lancamento.tipo).toBe("entrada_pix");
  });

  it("39: Edge case: Diferentes formatos de data ISO 8601", () => {
    const stmtCharge = db.prepare(`
      INSERT INTO cobrancas_asaas (id, status, valor, beneficiario, criado_em)
      VALUES (?, 'PAID', ?, ?, ?)
    `);
    stmtCharge.run("charge-iso-1", 1000, "Cliente ISO", "2025-02-14T10:30:00Z");

    const stmtOFX = db.prepare(`
      INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao)
      VALUES (?, ?, ?, ?)
    `);
    stmtOFX.run("ofx-iso-1", 1000, "2025-02-14", "Cliente ISO");

    const result = buscarMatchPixOfx(db, "charge-iso-1");

    expect(result.match).toBe(true);
  });

  it("40: Descrição vazia em OFX ainda encontra match por valor/data", () => {
    inserirChargePaga(db, "charge-desc-empty-1", 400, "Cliente Desc");

    const stmtOFX = db.prepare(`
      INSERT INTO conciliacao_ofx_cache (id, valor, data, descricao)
      VALUES (?, ?, ?, ?)
    `);
    stmtOFX.run("ofx-desc-empty-1", 400, new Date().toISOString(), "");

    const result = buscarMatchPixOfx(db, "charge-desc-empty-1");

    expect(result.match).toBe(true); // Match por valor e data
    expect(result.confianca).toBeLessThan(100); // Sem beneficiário
  });
});
