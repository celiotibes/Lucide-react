/**
 * Relatório executivo contra o schema REAL do servidor (mesmas migrações do boot, na mesma
 * ordem de database-init.ts), que NÃO tem transacoes/imoveis/cobrancas/plano_de_contas.
 * A rota nunca pode responder 500 por "no such table" e nunca pode inventar números.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasRelatorioExecutivo } from "../relatorio-executivo-routes";
import { criarBancoDoServidor } from "./schema-boot";
import { gerarRelatorioExecutivo, secaoIndisponivel } from "../../domain/relatorios/relatorio-executivo";

function criarApp(db: Database.Database) {
  const authService = {
    validarToken: vi.fn().mockReturnValue({
      usuarioId: "u1",
      autenticado: true,
      usuario: { id: "u1", email: "a@b.c", role: "administrador" },
    }),
  } as unknown;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown).auth = {
      usuarioId: "u1",
      token: "t",
      autenticado: true,
      usuario: { id: "u1", email: "a@b.c", role: "administrador" },
    };
    next();
  });
  app.use("/api/relatorios/executivo", criarRotasRelatorioExecutivo({ authService, db }));
  return app;
}

describe("Relatório executivo: banco novo do servidor (sem tabelas de negócio)", () => {
  let db: Database.Database;
  let app: express.Application;

  beforeEach(() => {
    db = criarBancoDoServidor();
    app = criarApp(db);
  });
  afterEach(() => {
    db.close();
  });

  it("pré-condição: o schema do boot realmente não tem as tabelas de negócio", () => {
    const nomes = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    for (const ausente of ["transacoes", "imoveis", "cobrancas", "asaas_cobrancas", "plano_de_contas"]) {
      expect(nomes).not.toContain(ausente);
    }
    expect(nomes).toContain("razao");
  });

  it("GET /dashboard responde 200 (não 500) e marca seções como indisponíveis com motivo", async () => {
    const res = await request(app).get("/api/relatorios/executivo/dashboard?mes=10&ano=2026").set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.completo).toBe(false);
    for (const secao of ["dre", "fluxo", "margens", "contas", "sumario"]) {
      expect(res.body[secao].indisponivel).toBe(true);
      expect(typeof res.body[secao].motivo).toBe("string");
      expect(res.body[secao].motivo.length).toBeGreaterThan(10);
      expect(typeof res.body[secao].fonteEsperada).toBe("string");
      expect(res.body.secoesIndisponiveis).toContain(secao);
    }
    expect(res.body.margens.tabelasAusentes).toEqual(expect.arrayContaining(["imoveis", "transacoes"]));
    // Nenhum número de negócio inventado
    expect(res.body.dre.receitaTotal).toBeUndefined();
    expect(res.body.fluxo.saldoAtual).toBeUndefined();
    expect(res.body.contas.aReceber).toBeUndefined();
    expect(res.body.alertas).toEqual([]);
    // razao existe: seção disponível e zerada de forma legítima (0 lançamentos reais)
    expect(res.body.razaoServidor.fonte).toBe("razao");
    expect(res.body.razaoServidor.totalLancamentos).toBe(0);
  });

  it("GET /margens responde 200 com seção indisponível (não vazia enganosa)", async () => {
    const res = await request(app).get("/api/relatorios/executivo/margens?mes=10&ano=2026").set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.indisponivel).toBe(true);
    expect(res.body.items).toBeUndefined();
  });

  it("GET /download e POST /gerar também não estouram e explicam a indisponibilidade", async () => {
    const dl = await request(app).get("/api/relatorios/executivo/download/10/2026").set("Authorization", "Bearer t");
    expect(dl.status).toBe(200);
    expect(dl.text).toContain("indisponível");
    expect(dl.text).toContain("Demonstração de Resultado (DRE)");

    const gerar = await request(app).post("/api/relatorios/executivo/gerar?mes=10&ano=2026").set("Authorization", "Bearer t");
    expect(gerar.status).toBe(200);
    expect(gerar.body.relatorio.completo).toBe(false);
  });

  it("nunca lança, mesmo sem a tabela razao (banco totalmente vazio)", () => {
    const vazio = new Database(":memory:");
    const rel = gerarRelatorioExecutivo(vazio, 1, 2026);
    expect(secaoIndisponivel(rel.razaoServidor)).toBe(true);
    expect(secaoIndisponivel(rel.dre)).toBe(true);
    expect(rel.completo).toBe(false);
    vazio.close();
  });
});

describe("Relatório executivo: banco do servidor com dados", () => {
  let db: Database.Database;
  let app: express.Application;

  beforeEach(() => {
    db = criarBancoDoServidor();
    app = criarApp(db);
  });
  afterEach(() => {
    db.close();
  });

  it("razaoServidor soma só o mês pedido, agrupando por tipo/status, sem conversão", async () => {
    const ins = db.prepare(
      "INSERT INTO razao (id, conta_debito, conta_credito, valor, tipo, status, criado_em) VALUES (?, '1120', '4110', ?, ?, ?, ?)",
    );
    ins.run("a", 100.5, "entrada_pix", "proposta", "2026-10-03 10:00:00");
    ins.run("b", 50, "entrada_pix", "proposta", "2026-10-31 23:59:59");
    ins.run("c", 70, "entrada_pix", "confirmado", "2026-10-15 08:00:00");
    ins.run("fora1", 999, "entrada_pix", "proposta", "2026-09-30 23:59:59");
    ins.run("fora2", 888, "entrada_pix", "proposta", "2026-11-01 00:00:00");

    const res = await request(app).get("/api/relatorios/executivo/dashboard?mes=10&ano=2026").set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    const r = res.body.razaoServidor;
    expect(r.totalLancamentos).toBe(3);
    expect(r.valorTotal).toBeCloseTo(220.5);
    expect(r.porTipoStatus).toEqual([
      { tipo: "entrada_pix", status: "confirmado", quantidade: 1, valorTotal: 70 },
      { tipo: "entrada_pix", status: "proposta", quantidade: 2, valorTotal: 150.5 },
    ]);
    // O resto continua indisponível: ter razao não vira DRE
    expect(res.body.dre.indisponivel).toBe(true);
  });

  it("dezembro vira janeiro corretamente no filtro do razão", () => {
    db.prepare(
      "INSERT INTO razao (id, valor, tipo, status, criado_em) VALUES ('x', 10, 't', 'proposta', '2026-12-31 12:00:00')",
    ).run();
    db.prepare(
      "INSERT INTO razao (id, valor, tipo, status, criado_em) VALUES ('y', 20, 't', 'proposta', '2027-01-01 00:00:00')",
    ).run();
    const rel = gerarRelatorioExecutivo(db, 12, 2026);
    expect(secaoIndisponivel(rel.razaoServidor)).toBe(false);
    if (!secaoIndisponivel(rel.razaoServidor)) expect(rel.razaoServidor.valorTotal).toBe(10);
  });

  it("se imoveis+transacoes existirem, margens são calculadas de verdade (e nada mais é inventado)", async () => {
    db.exec(`
      CREATE TABLE imoveis (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
      CREATE TABLE transacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, imovel_id INTEGER, data TEXT, tipo TEXT,
        descricao TEXT, categoria TEXT, valor REAL
      );
      INSERT INTO imoveis (nome) VALUES ('Kitnet 1');
      INSERT INTO transacoes (imovel_id, data, tipo, descricao, categoria, valor)
        VALUES (1, '2026-10-05T12:00:00.000Z', 'RECEITA', 'Aluguel outubro', 'Aluguel', 1000),
               (1, '2026-10-06T12:00:00.000Z', 'DESPESA', 'Condomínio', 'Condomínio', 200);
    `);
    const res = await request(app).get("/api/relatorios/executivo/dashboard?mes=10&ano=2026").set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
    expect(res.body.margens.indisponivel).toBeUndefined();
    expect(res.body.margens.total).toBe(1);
    expect(res.body.margens.top5[0].nomePropriedade).toBe("Kitnet 1");
    expect(res.body.margens.top5[0].margem).toBeCloseTo(80);
    // transacoes existe, mas sem cobrancas/plano_de_contas o resto segue indisponível
    expect(res.body.dre.indisponivel).toBe(true);
    expect(res.body.fluxo.indisponivel).toBe(true);
    expect(res.body.contas.indisponivel).toBe(true);

    const pag = await request(app).get("/api/relatorios/executivo/margens?mes=10&ano=2026&limit=10").set("Authorization", "Bearer t");
    expect(pag.status).toBe(200);
    expect(pag.body.total).toBe(1);
    expect(pag.body.items).toHaveLength(1);
  });
});
