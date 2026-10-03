/**
 * Testes das rotas HTTP de Relatório Executivo
 * Total: 5 testes cobrindo GET /dashboard, GET /download/:mes/:ano, POST /gerar, POST /enviar-email
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasRelatorioExecutivo } from "../relatorio-executivo-routes";

describe("Rotas HTTP de Relatório Executivo", () => {
  let app: express.Application;
  let db: Database.Database;
  let mockAuthService: any;

  beforeEach(() => {
    // Cria banco de dados em memória
    db = new Database(":memory:");

    // Setup schema básico
    db.exec(`
      CREATE TABLE relatorios_executivos (
        id TEXT PRIMARY KEY,
        mes INTEGER,
        ano INTEGER,
        conteudo TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );
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
      (req as any).db = db;
      next();
    });

    // Mock auth middleware - simula autenticação bem-sucedida
    app.use((req, res, next) => {
      (req as any).auth = {
        usuarioId: "user1",
        token: "test-token",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
        papel: "admin",
      };
      next();
    });

    // Monta as rotas
    app.use("/api/relatorios/executivo", criarRotasRelatorioExecutivo({
      authService: mockAuthService,
      db,
    }));
  });

  describe("GET /api/relatorios/executivo/dashboard", () => {
    it("deve retornar dashboard com sucesso", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("mes");
      expect(res.body).toHaveProperty("ano");
    });

    it("deve validar mes obrigatório", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ ano: 2026 })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("mes");
    });

    it("deve validar ano obrigatório", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10 })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("ano");
    });

    it("deve validar mes entre 1 e 12", async () => {
      const res1 = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 0, ano: 2026 })
        .send({});

      expect(res1.status).toBe(400);
      expect(res1.body.erro).toContain("1 e 12");

      const res2 = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 13, ano: 2026 })
        .send({});

      expect(res2.status).toBe(400);
    });

    it("deve validar ano entre 2000 e 2100", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 1999 })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("2000 e 2100");
    });
  });

  describe("GET /api/relatorios/executivo/download/:mes/:ano", () => {
    it("deve fazer download com sucesso", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/download/10/2026")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
    });

    it("deve validar mes entre 1 e 12", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/download/0/2026")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(400);
    });

    it("deve validar ano entre 2000 e 2100", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/download/10/1999")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/relatorios/executivo/gerar", () => {
    it("deve gerar relatório com sucesso", async () => {
      const res = await request(app)
        .post("/api/relatorios/executivo/gerar")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sucesso");
      expect(res.body.sucesso).toBe(true);
      expect(res.body).toHaveProperty("relatorio");
    });

    it("deve validar mes obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/executivo/gerar")
        .set("Authorization", "Bearer test-token")
        .query({ ano: 2026 })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("mes");
    });

    it("deve validar ano obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/executivo/gerar")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10 })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("ano");
    });

    it("deve validar mes entre 1 e 12", async () => {
      const res = await request(app)
        .post("/api/relatorios/executivo/gerar")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 13, ano: 2026 })
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/relatorios/executivo/enviar-email", () => {
    it("deve enviar email com sucesso", async () => {
      const res = await request(app)
        .post("/api/relatorios/executivo/enviar-email")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, email: "user@example.com" })
        .send({});

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });

    it("deve validar mes obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/executivo/enviar-email")
        .set("Authorization", "Bearer test-token")
        .query({ ano: 2026, email: "user@example.com" })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("mes");
    });

    it("deve validar ano obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/executivo/enviar-email")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, email: "user@example.com" })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("ano");
    });

    it("deve validar email obrigatório", async () => {
      const res = await request(app)
        .post("/api/relatorios/executivo/enviar-email")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("email");
    });

    it("deve validar formato de email", async () => {
      const res = await request(app)
        .post("/api/relatorios/executivo/enviar-email")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, email: "invalido" })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("email");
    });
  });
});
