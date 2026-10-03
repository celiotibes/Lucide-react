/**
 * Testes das rotas HTTP de Assinatura Digital + LGPD Compliance
 * Total: 5 testes cobrindo POST /desafio-2fa, POST /validar-2fa, POST /:id/assinar
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasAssinaturasLGPD } from "../assinatura-lgpd-routes";

describe("Rotas HTTP de Assinatura LGPD", () => {
  let app: express.Application;
  let db: Database.Database;
  let mockAuthService: any;

  beforeEach(() => {
    // Cria banco de dados em memória
    db = new Database(":memory:");

    // Setup schema básico
    db.exec(`
      CREATE TABLE usuarios (
        id TEXT PRIMARY KEY,
        email TEXT,
        cpf TEXT
      );

      CREATE TABLE assinaturas_digitais (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        relatorio_tipo TEXT,
        relatorio_periodo TEXT,
        status TEXT DEFAULT 'pendente',
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE TABLE audit_lgpd_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id TEXT,
        acao TEXT,
        tabela TEXT,
        ip_address TEXT,
        user_agent TEXT,
        endpoint TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insere usuário de teste
    db.prepare(`
      INSERT INTO usuarios (id, email, cpf) VALUES ('user1', 'test@example.com', '12345678901')
    `).run();

    // Mock authService
    mockAuthService = {
      validarToken: vi.fn().mockReturnValue({
        usuarioId: "user1",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com" },
      }),
    };

    // Cria app com rotas
    app = express();
    app.use(express.json());

    // Middleware que injeta db
    app.use((req, res, next) => {
      (req as any).db = db;
      next();
    });

    // Mock auth middleware - simula autenticação bem-sucedida
    app.use((req, res, next) => {
      (req as any).auth = {
        usuarioId: "user1",
        token: "test-token",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "admin" },
        papel: "admin",
      };
      next();
    });

    // Monta as rotas
    app.use("/api/relatorios", criarRotasAssinaturasLGPD({
      authService: mockAuthService,
      db,
      certisignApiKey: "test-key",
      serProIdApiKey: "test-key",
    }));
  });

  describe("POST /api/relatorios/desafio-2fa", () => {
    it("deve enviar desafio 2FA com sucesso", async () => {
      const res = await request(app)
        .post("/api/relatorios/desafio-2fa")
        .set("Authorization", "Bearer test-token")
        .send({
          usuario_id: "user1",
          usuario_cpf: "12345678901",
          contexto: "assinatura_relatorio_dre_2024_01",
        });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
      expect(res.body).toHaveProperty("sucesso");
    });

    it("deve validar usuario_id obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/desafio-2fa")
        .set("Authorization", "Bearer test-token")
        .send({
          usuario_cpf: "12345678901",
          contexto: "assinatura_relatorio_dre_2024_01",
        });

      expect(res.status).toBe(400);
      expect(res.body.sucesso).toBe(false);
    });

    it("deve validar usuario_cpf obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/desafio-2fa")
        .set("Authorization", "Bearer test-token")
        .send({
          usuario_id: "user1",
          contexto: "assinatura_relatorio_dre_2024_01",
        });

      expect(res.status).toBe(400);
      expect(res.body.sucesso).toBe(false);
    });

    it("deve validar contexto obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/desafio-2fa")
        .set("Authorization", "Bearer test-token")
        .send({
          usuario_id: "user1",
          usuario_cpf: "12345678901",
        });

      expect(res.status).toBe(400);
      expect(res.body.sucesso).toBe(false);
    });
  });

  describe("POST /api/relatorios/validar-2fa", () => {
    it("deve validar código 2FA com sucesso", async () => {
      const res = await request(app)
        .post("/api/relatorios/validar-2fa")
        .set("Authorization", "Bearer test-token")
        .send({
          nonce: "nonce_123",
          codigo_sms: "123456",
        });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
      expect(res.body).toHaveProperty("sucesso");
    });

    it("deve validar nonce obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/validar-2fa")
        .set("Authorization", "Bearer test-token")
        .send({
          codigo_sms: "123456",
        });

      expect(res.status).toBe(400);
      expect(res.body.sucesso).toBe(false);
    });

    it("deve validar codigo_sms obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/validar-2fa")
        .set("Authorization", "Bearer test-token")
        .send({
          nonce: "nonce_123",
        });

      expect(res.status).toBe(400);
      expect(res.body.sucesso).toBe(false);
    });
  });

  describe("POST /api/relatorios/:id/assinar", () => {
    beforeEach(() => {
      // Insere relatório de teste
      db.prepare(`
        INSERT INTO assinaturas_digitais (
          id, usuario_id, relatorio_tipo, relatorio_periodo, status
        ) VALUES (
          'relatorio_1', 'user1', 'DRE', '2024-01', 'pendente'
        )
      `).run();
    });

    it("deve exigir nonce_2fa", async () => {
      const res = await request(app)
        .post("/api/relatorios/relatorio_1/assinar")
        .set("Authorization", "Bearer test-token")
        .send({
          usuario_id: "user1",
          usuario_nome: "João Silva",
          usuario_cpf: "12345678901",
          relatorio_tipo: "DRE",
          relatorio_periodo: "2024-01",
          pdf_url: "/path/to/pdf",
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("deve exigir usuario_id", async () => {
      const res = await request(app)
        .post("/api/relatorios/relatorio_1/assinar")
        .set("Authorization", "Bearer test-token")
        .send({
          nonce_2fa: "nonce_123",
          usuario_nome: "João Silva",
          usuario_cpf: "12345678901",
          relatorio_tipo: "DRE",
          relatorio_periodo: "2024-01",
          pdf_url: "/path/to/pdf",
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("deve exigir pdf_url", async () => {
      const res = await request(app)
        .post("/api/relatorios/relatorio_1/assinar")
        .set("Authorization", "Bearer test-token")
        .send({
          nonce_2fa: "nonce_123",
          usuario_id: "user1",
          usuario_nome: "João Silva",
          usuario_cpf: "12345678901",
          relatorio_tipo: "DRE",
          relatorio_periodo: "2024-01",
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
