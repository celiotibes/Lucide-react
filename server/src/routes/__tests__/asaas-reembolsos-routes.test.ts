/**
 * Testes das rotas HTTP de reembolsos em Asaas.
 * Total: 8 testes cobrindo POST /processar-devolucao e GET /reembolsos
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { emitirCobrancaAluguel } from "../../../../src/domain/integracoes/asaasCobranca";
import { criarRotasAsaas } from "../asaas-routes";

describe("Rotas HTTP de Reembolsos Asaas", () => {
  let app: express.Application;
  let db: Database;
  let mockAuthService: any;
  let mockEventosService: any;

  const mockApiClient = {
    criarCliente: async () => ({ asaasCustomerId: `cust_${Date.now()}` }),
    criarCobranca: async () => ({
      asaasChargeId: `charge_${Date.now()}`,
      status: "PENDING",
      boletoUrl: "https://example.com/boleto",
      linhaDigitavel: "12345.67890",
      pixQrCode: "qrcode",
    }),
    consultarCobranca: async (id: string) => ({
      id,
      status: "RECEIVED",
      boletoUrl: "https://example.com/boleto",
      linhaDigitavel: "12345.67890",
      pixQrCode: "qrcode",
    }),
  };

  beforeEach(async () => {
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Setup schema
    db.run(`
      CREATE TABLE usuarios (id TEXT PRIMARY KEY);
      CREATE TABLE contratos_locacao (id INTEGER PRIMARY KEY, locatario TEXT);
      CREATE TABLE contrato_locatarios (
        id INTEGER PRIMARY KEY, contrato_id INTEGER, papel TEXT,
        cpf TEXT, email TEXT, telefone TEXT
      );
      CREATE TABLE aluguel_competencias (
        id INTEGER PRIMARY KEY, contrato_id INTEGER, valor_devido REAL,
        data_vencimento TEXT, status TEXT DEFAULT 'pendente', data_recebimento TEXT
      );
      CREATE TABLE asaas_clientes_externos (
        id INTEGER PRIMARY KEY, referencia_tipo TEXT, referencia_id INTEGER,
        asaas_customer_id TEXT UNIQUE, nome TEXT, cpf_cnpj TEXT, email TEXT, telefone TEXT
      );
      CREATE TABLE cobrancas_asaas (
        id INTEGER PRIMARY KEY, origem_tipo TEXT, origem_id INTEGER,
        asaas_customer_id TEXT, asaas_charge_id TEXT UNIQUE, tipo_cobranca TEXT,
        valor REAL, data_vencimento TEXT, status TEXT DEFAULT 'pendente',
        boleto_url TEXT, linha_digitavel TEXT, pix_qrcode TEXT,
        multa_percentual REAL, juros_percentual_mensal REAL,
        data_pagamento_confirmado TEXT, webhook_ultimo_evento TEXT,
        webhook_recebido_em TEXT, criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE reembolsos_asaas (
        id INTEGER PRIMARY KEY, asaas_charge_id TEXT UNIQUE,
        motivo TEXT, tipo TEXT, status TEXT DEFAULT 'processando',
        data_processamento TEXT, origem_tipo TEXT, origem_id INTEGER,
        mensagem_erro TEXT, criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (origem_tipo, origem_id)
      );
    `);

    db.run("INSERT INTO contratos_locacao (id, locatario) VALUES (1, 'João Silva')");
    db.run(
      "INSERT INTO contrato_locatarios (id, contrato_id, papel, cpf, email, telefone) VALUES (1, 1, 'locatario', '123.456.789-00', 'joao@example.com', '11999999999')",
    );
    db.run(
      "INSERT INTO aluguel_competencias (id, contrato_id, valor_devido, data_vencimento, status) VALUES (1, 1, 1500.00, '2025-01-31', 'pendente')",
    );

    // Mock services
    mockAuthService = {
      autenticar: vi.fn().mockResolvedValue({ usuarioId: "user1", token: "token1" }),
      verificarToken: vi.fn().mockResolvedValue({ usuarioId: "user1" }),
    };

    mockEventosService = {
      registrarEvento: vi.fn(),
    };

    // Cria app com rotas
    app = express();
    app.use(express.json());

    // Middleware que injeta db (simula contexto real)
    app.use((req, res, next) => {
      (req as any).db = db;
      next();
    });

    // Middleware de autenticação fake
    app.use((req, res, next) => {
      (req as any).usuarioId = "user1";
      next();
    });

    app.use("/api/asaas", criarRotasAsaas({ authService: mockAuthService, eventosService: mockEventosService }));
  });

  describe("POST /api/asaas/cobrancas/:chargeId/processar-devolucao", () => {
    it("deve processar devolução com sucesso", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .send({ motivo: "Cliente desistiu" });

      expect(res.status).toBe(201);
      expect(res.body.asaasChargeId).toBe(cobranca.asaasChargeId);
      expect(res.body.status).toBe("sucesso");
      expect(res.body.motivo).toBe("Cliente desistiu");
    });

    it("deve validar chargeId obrigatório", async () => {
      const res = await request(app)
        .post("/api/asaas/cobrancas//processar-devolucao")
        .send({ motivo: "Teste" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("chargeId");
    });

    it("deve validar motivo obrigatório", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .send({ motivo: "" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("motivo");
    });

    it("deve validar tipoForce se fornecido", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .send({ motivo: "Teste", tipoForce: "invalido" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("tipoForce");
    });

    it("deve permitir tipoForce válido", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .send({ motivo: "Teste", tipoForce: "reversao" });

      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe("reversao");
    });

    it("deve retornar 404 para cobrança não encontrada", async () => {
      const res = await request(app)
        .post("/api/asaas/cobrancas/charge_inexistente/processar-devolucao")
        .send({ motivo: "Teste" });

      expect(res.status).toBe(404);
      expect(res.body.erro).toContain("não encontrada");
    });

    it("deve retornar 400 para cobrança não paga", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      // Não atualiza status para pago

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .send({ motivo: "Teste" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("status");
    });
  });

  describe("GET /api/asaas/cobrancas/:chargeId/reembolsos", () => {
    it("deve listar reembolsos de uma cobrança", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });
      db.run("UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);

      await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .send({ motivo: "Teste" });

      const res = await request(app)
        .get(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/reembolsos`);

      expect(res.status).toBe(200);
      expect(res.body.chargeId).toBe(cobranca.asaasChargeId);
      expect(res.body.reembolsos).toHaveLength(1);
      expect(res.body.reembolsos[0].motivo).toBe("Teste");
    });

    it("deve retornar lista vazia para cobrança sem reembolsos", async () => {
      const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
        tipoCobranca: "boleto",
      });

      const res = await request(app)
        .get(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/reembolsos`);

      expect(res.status).toBe(200);
      expect(res.body.reembolsos).toHaveLength(0);
    });

    it("deve validar chargeId obrigatório", async () => {
      const res = await request(app).get("/api/asaas/cobrancas//reembolsos");

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("chargeId");
    });
  });
});
