/**
 * Testes das rotas HTTP de Pagamentos PIX Proativos via Asaas
 * Total: 5 testes cobrindo POST /criar, GET /:id, GET /, POST /:id/sincronizar
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasAsaasPixProativo } from "../asaas-pagamentos-pix-routes";

describe("Rotas HTTP de Pagamentos PIX Asaas", () => {
  let app: express.Application;
  let db: Database.Database;
  let mockAuthService: unknown;
  let mockFetch: unknown;

  beforeEach(() => {
    // Define variáveis de ambiente necessárias
    process.env.ASAAS_API_KEY = "test_api_key_12345";
    process.env.ASAAS_SANDBOX = "true";

    // Mock fetch para evitar chamadas reais à API Asaas
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: "asaas_mock_123",
        status: "PENDING",
        value: 500.0,
        pixQrCode: "mock_qr_code",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    // Cria banco de dados em memória
    db = new Database(":memory:");

    // Setup schema baseado na migração phase9
    db.exec(`
      CREATE TABLE pagamentos_pix_solicitados (
        id TEXT PRIMARY KEY,
        beneficiario_id TEXT NOT NULL,
        beneficiario_nome TEXT NOT NULL,
        beneficiario_cpf_cnpj TEXT NOT NULL,
        valor REAL NOT NULL,
        descricao TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        asaas_payment_id TEXT,
        tipo_chave_pix TEXT NOT NULL,
        chave_pix_value TEXT,
        qr_code TEXT,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(beneficiario_id, valor, criado_em)
      );

      CREATE INDEX idx_pagamentos_pix_status ON pagamentos_pix_solicitados(status);
      CREATE INDEX idx_pagamentos_pix_beneficiario ON pagamentos_pix_solicitados(beneficiario_id);
      CREATE INDEX idx_pagamentos_pix_asaas_id ON pagamentos_pix_solicitados(asaas_payment_id);
      CREATE INDEX idx_pagamentos_pix_criado ON pagamentos_pix_solicitados(criado_em DESC);

      CREATE TABLE pagamentos_pix_historico (
        id TEXT PRIMARY KEY,
        pagamento_id TEXT NOT NULL,
        status_anterior TEXT,
        status_novo TEXT NOT NULL,
        webhook_timestamp DATETIME,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pagamento_id) REFERENCES pagamentos_pix_solicitados(id)
      );

      CREATE INDEX idx_pagamentos_pix_hist_pagamento ON pagamentos_pix_historico(pagamento_id);
      CREATE INDEX idx_pagamentos_pix_hist_criado ON pagamentos_pix_historico(criado_em DESC);
    `);

    // Mock authService
    mockAuthService = {
      validarToken: vi.fn().mockReturnValue({
        usuarioId: "user1",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
      }),
    };

    // Cria app com rotas
    app = express();
    app.use(express.json());

    // Middleware que injeta db
    app.use((req, res, next) => {
      (req as unknown).db = db;
      next();
    });

    // Mock auth middleware - simula autenticação bem-sucedida
    app.use((req, res, next) => {
      (req as unknown).auth = {
        usuarioId: "user1",
        token: "test-token",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
        papel: "admin",
      };
      next();
    });

    // Monta as rotas
    app.use("/api/asaas", criarRotasAsaasPixProativo({ authService: mockAuthService, db }));
  });

  afterEach(() => {
    // Limpa variáveis de ambiente
    delete process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_SANDBOX;
    vi.unstubAllGlobals();
    if (db) db.close();
  });

  describe("POST /api/asaas/pagamentos-pix/criar", () => {
    it("deve criar pagamento PIX com sucesso", async () => {
      const res = await request(app)
        .post("/api/asaas/pagamentos-pix/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          beneficiarioId: "benef_123",
          beneficiarioNome: "João Silva",
          beneficiarioCpfCnpj: "12345678901",
          valor: 500.00,
          descricao: "Pagamento de serviços",
          tipoChavePix: "CPF",
          chavePixValue: "12345678901",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.beneficiarioId).toBe("benef_123");
      expect(res.body.valor).toBe(500.00);
    });

    it("deve validar campos obrigatórios", async () => {
      const res = await request(app)
        .post("/api/asaas/pagamentos-pix/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          beneficiarioId: "benef_123",
          // Faltam outros campos
        });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("Campos obrigatórios");
    });

    it("deve validar tipo de chave PIX", async () => {
      const res = await request(app)
        .post("/api/asaas/pagamentos-pix/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          beneficiarioId: "benef_123",
          beneficiarioNome: "João Silva",
          beneficiarioCpfCnpj: "12345678901",
          valor: 500.00,
          descricao: "Pagamento",
          tipoChavePix: "INVALIDO",
          chavePixValue: "12345678901",
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("deve rejeitar valor inválido", async () => {
      const res = await request(app)
        .post("/api/asaas/pagamentos-pix/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          beneficiarioId: "benef_123",
          beneficiarioNome: "João Silva",
          beneficiarioCpfCnpj: "12345678901",
          valor: "abc",
          descricao: "Pagamento",
          tipoChavePix: "CPF",
          chavePixValue: "12345678901",
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /api/asaas/pagamentos-pix/:id", () => {
    beforeEach(() => {
      // Insere um pagamento de teste
      db.prepare(`
        INSERT INTO pagamentos_pix_solicitados (
          id, asaas_payment_id, beneficiario_id, beneficiario_nome,
          beneficiario_cpf_cnpj, valor, descricao, status, tipo_chave_pix
        ) VALUES (
          'pag_1', 'asaas_123', 'benef_1', 'João Silva',
          '12345678901', 500.00, 'Pagamento teste', 'PENDING', 'CPF'
        )
      `).run();
    });

    it("deve buscar pagamento com sucesso", async () => {
      const res = await request(app)
        .get("/api/asaas/pagamentos-pix/pag_1")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("pagamento");
      expect(res.body.pagamento.id).toBe("pag_1");
      expect(res.body).toHaveProperty("historico");
    });

    it("deve retornar 404 para pagamento inexistente", async () => {
      const res = await request(app)
        .get("/api/asaas/pagamentos-pix/inexistente")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.erro).toContain("não encontrado");
    });
  });

  describe("GET /api/asaas/pagamentos-pix", () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO pagamentos_pix_solicitados (
          id, asaas_payment_id, beneficiario_id, beneficiario_nome,
          beneficiario_cpf_cnpj, valor, descricao, status, tipo_chave_pix
        ) VALUES
          ('pag_1', 'asaas_1', 'benef_1', 'João Silva', '12345678901', 500.00, 'Pagamento 1', 'PENDING', 'CPF'),
          ('pag_2', 'asaas_2', 'benef_2', 'Maria Silva', '98765432100', 1000.00, 'Pagamento 2', 'COMPLETED', 'CNPJ')
      `).run();
    });

    it("deve listar pagamentos com sucesso", async () => {
      const res = await request(app)
        .get("/api/asaas/pagamentos-pix")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("pagamentos");
      expect(res.body).toHaveProperty("total");
      expect(res.body.pagamentos).toBeInstanceOf(Array);
    });

    it("deve filtrar por status", async () => {
      const res = await request(app)
        .get("/api/asaas/pagamentos-pix")
        .set("Authorization", "Bearer test-token")
        .query({ status: "PENDING" })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.pagamentos).toBeInstanceOf(Array);
    });

    it("deve filtrar por beneficiarioId", async () => {
      const res = await request(app)
        .get("/api/asaas/pagamentos-pix")
        .set("Authorization", "Bearer test-token")
        .query({ beneficiarioId: "benef_1" })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.pagamentos).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/asaas/pagamentos-pix/:id/sincronizar", () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO pagamentos_pix_solicitados (
          id, asaas_payment_id, beneficiario_id, beneficiario_nome,
          beneficiario_cpf_cnpj, valor, descricao, status, tipo_chave_pix
        ) VALUES (
          'pag_1', 'asaas_123', 'benef_1', 'João Silva',
          '12345678901', 500.00, 'Pagamento', 'PENDING', 'CPF'
        )
      `).run();
    });

    it("deve sincronizar pagamento com sucesso", async () => {
      const res = await request(app)
        .post("/api/asaas/pagamentos-pix/pag_1/sincronizar")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.sucesso).toBe(true);
      expect(res.body).toHaveProperty("statusAnterior");
      expect(res.body).toHaveProperty("statusNovo");
    });

    it("deve retornar 404 para pagamento inexistente", async () => {
      const res = await request(app)
        .post("/api/asaas/pagamentos-pix/inexistente/sincronizar")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.erro).toContain("não encontrado");
    });
  });
});
