/**
 * Testes das rotas HTTP de reembolsos em Asaas.
 * Total: 8 testes cobrindo POST /processar-devolucao e GET /reembolsos
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { criarRotasAsaas } from "../asaas-routes";

/**
 * Helper to create a test cobrança (charge) in the database
 */
function criarCobrancaTeste(db: Database, origem_tipo: string, origem_id: number, status: string = "pendente") {
  const chargeId = `charge_${Date.now()}`;
  const agora = new Date().toISOString();

  // Use raw SQL for sql.js compatibility
  db.run(`
    INSERT INTO cobrancas_asaas (
      origem_tipo, origem_id, asaas_charge_id, tipo_cobranca, valor,
      data_vencimento, status, boleto_url, linha_digitavel, pix_qrcode, criado_em
    ) VALUES ('${origem_tipo}', ${origem_id}, '${chargeId}', 'boleto', 1500,
      '2025-12-31', '${status}', 'https://example.com/boleto', '12345.67890', 'qrcode', '${agora}')
  `);

  return { asaasChargeId: chargeId, id: 1, status };
}

describe("Rotas HTTP de Reembolsos Asaas", () => {
  let app: express.Application;
  let db: Database;
  let mockAuthService: unknown;
  let mockEventosService: unknown;

  // Unused
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
      validarToken: vi.fn().mockReturnValue({
        usuarioId: "user1",
        token: "test-token",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "titular" },
        papel: "locador",
      }),
    };

    mockEventosService = {
      registrarEvento: vi.fn(),
    };

    // Cria app com rotas
    app = express();
    app.use(express.json());

    // Middleware que injeta db (simula contexto real) - DEVE vir ANTES das rotas
    app.use((req, res, next) => {
      (req as unknown).db = db;
      next();
    });

    // Middleware de autenticação fake
    app.use((req, res, next) => {
      (req as unknown).usuarioId = "user1";
      next();
    });

    // Monta as rotas DEPOIS dos middlewares de db e auth
    app.use("/api/asaas", criarRotasAsaas({ authService: mockAuthService, eventosService: mockEventosService, db }));
  });

  describe("POST /api/asaas/cobrancas/:chargeId/processar-devolucao", () => {
    it("deve processar devolução com sucesso", async () => {
      const cobranca = criarCobrancaTeste(db, "locacao", 1, "pago");

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "Cliente desistiu" });

      if (res.status !== 201) {
        console.log("Error response:", JSON.stringify(res.body, null, 2));
      }
      expect(res.status).toBe(201);
      expect(res.body.asaasChargeId).toBe(cobranca.asaasChargeId);
      expect(res.body.status).toBe("processando");  // Status after creation is "processando"
      expect(res.body.motivo).toBe("Cliente desistiu");
    });

    it("deve validar chargeId obrigatório", async () => {
      const res = await request(app)
        .post("/api/asaas/cobrancas//processar-devolucao")
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "Teste" });

      // Express returns 404 when route pattern doesn't match (empty parameter)
      expect(res.status).toBe(404);
    });

    it("deve validar motivo obrigatório", async () => {
      const cobranca = criarCobrancaTeste(db, "locacao", 1, "pago");

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("motivo");
    });

    it("deve validar tipoForce se fornecido", async () => {
      const cobranca = criarCobrancaTeste(db, "locacao", 1, "pago");

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "Teste", tipoForce: "invalido" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("tipoForce");
    });

    it("deve permitir tipoForce válido", async () => {
      const cobranca = criarCobrancaTeste(db, "locacao", 1, "pago");

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "Teste", tipoForce: "reversao" });

      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe("reversao");
      expect(res.body.status).toBe("processando");
    });

    it("deve retornar 404 para cobrança não encontrada", async () => {
      const res = await request(app)
        .post("/api/asaas/cobrancas/charge_inexistente/processar-devolucao")
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "Teste" });

      expect(res.status).toBe(404);
      expect(res.body.erro).toContain("não encontrada");
    });

    it("deve retornar 400 para cobrança não paga", async () => {
      const cobranca = criarCobrancaTeste(db, "locacao", 1, "pendente");

      const res = await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "Teste" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("status");
    });
  });

  describe("GET /api/asaas/cobrancas/:chargeId/reembolsos", () => {
    it("deve listar reembolsos de uma cobrança", async () => {
      const cobranca = criarCobrancaTeste(db, "locacao", 1, "pago");

      await request(app)
        .post(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/processar-devolucao`)
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "Teste" });

      const res = await request(app)
        .get(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/reembolsos`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body.chargeId).toBe(cobranca.asaasChargeId);
      expect(res.body.reembolsos).toHaveLength(1);
      expect(res.body.reembolsos[0].motivo).toBe("Teste");
    });

    it("deve retornar lista vazia para cobrança sem reembolsos", async () => {
      const cobranca = criarCobrancaTeste(db, "locacao", 1, "pendente");

      const res = await request(app)
        .get(`/api/asaas/cobrancas/${cobranca.asaasChargeId}/reembolsos`)
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body.reembolsos).toHaveLength(0);
    });

    it("deve validar chargeId obrigatório", async () => {
      const res = await request(app)
        .get("/api/asaas/cobrancas//reembolsos")
        .set("Authorization", "Bearer test-token");

      // Express returns 404 when route pattern doesn't match (empty parameter)
      expect(res.status).toBe(404);
    });
  });
});
