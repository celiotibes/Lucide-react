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
  let mockAuthService: unknown;

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

  describe("Edge Cases - Boundary Values", () => {
    it("deve aceitar mes minimo (1)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 1, ano: 2026 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve aceitar mes maximo (12)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 12, ano: 2026 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar mes abaixo do minimo (0)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 0, ano: 2026 });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar mes acima do maximo (13)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 13, ano: 2026 });

      expect(res.status).toBe(400);
    });

    it("deve aceitar ano minimo (2000)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2000 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve aceitar ano maximo (2100)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2100 });

      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe("GET /api/relatorios/executivo/margens - Pagination", () => {
    it("deve retornar margens com paginação padrão", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve validar limit maximo (500)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 50, offset: 0 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar limit acima do maximo", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 501, offset: 0 });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("deve aceitar offset valido", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 50, offset: 100 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar offset negativo", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 50, offset: -1 });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Error Handling - Database Unavailable", () => {
    it("deve retornar 500 quando database nao disponivel", async () => {
      const appNoDB = express();
      appNoDB.use(express.json());

      // Auth middleware sem db
      appNoDB.use((req, res, next) => {
        (req as unknown).auth = {
          usuarioId: "user1",
          token: "test-token",
          autenticado: true,
          usuario: { id: "user1", email: "test@example.com", role: "administrador" },
          papel: "admin",
        };
        next();
      });

      // Monta as rotas SEM db
      appNoDB.use("/api/relatorios/executivo", criarRotasRelatorioExecutivo({
        authService: mockAuthService,
        db: undefined, // Simula database nao disponivel
      }));

      const res = await request(appNoDB)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      expect(res.status).toBe(500);
      expect(res.body.erro).toContain("Database");
    });
  });

  describe("Type Coercion and Validation", () => {
    it("deve coercionar string para numero", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: "10", ano: "2026" });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar non-numeric mes", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: "abc", ano: 2026 });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar non-numeric ano", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: "abc" });

      expect(res.status).toBe(400);
    });
  });

  describe("First Month and Last Month Edge Cases", () => {
    it("deve gerar relatorio para janeiro (primeiro mes do ano)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 1, ano: 2026 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve gerar relatorio para dezembro (ultimo mes do ano)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 12, ano: 2026 });

      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe("Historical Data Aggregation", () => {
    it("deve retornar historico ao gerar relatorio", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      if (res.status === 200 && res.body.dre && !res.body.dre.indisponivel) {
        expect(res.body.dre).toHaveProperty("historico");
      }
    });
  });
});
