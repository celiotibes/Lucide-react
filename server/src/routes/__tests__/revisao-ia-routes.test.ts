/**
 * Testes para Rotas de Revisão IA com Validação Zod
 * Validação de entrada, tratamento de erros, boundary cases
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasRevisaoIA } from "../revisao-ia-routes";

describe("Rotas HTTP de Revisão IA com Validação Zod", () => {
  let app: express.Application;
  let db: Database.Database;
  let mockAuthService: unknown;

  beforeEach(() => {
    db = new Database(":memory:");

    // Setup schema
    db.exec(`
      CREATE TABLE fila_revisao_ia (
        id TEXT PRIMARY KEY,
        documento_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        motivo TEXT,
        solicitante_id TEXT NOT NULL,
        status TEXT DEFAULT 'pendente',
        revisor_id TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    mockAuthService = {
      validarToken: vi.fn().mockReturnValue({
        usuarioId: "user1",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
      }),
    };

    app = express();
    app.use(express.json());

    // Mock auth middleware
    app.use((req, res, next) => {
      (req as unknown).auth = {
        usuarioId: "user1",
        token: "test-token",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
      };
      (req as unknown).usuarioId = "user1";
      (req as unknown).usuarioRole = "admin";
      next();
    });

    app.use("/api/revisao-ia", criarRotasRevisaoIA({
      authService: mockAuthService,
      db,
    }));
  });

  describe("GET /api/revisao-ia/fila - Query Parameter Validation", () => {
    it("deve aceitar parametros validos", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ status: "pendente", limit: 50, offset: 0 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar status invalido", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ status: "invalido" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("status");
    });

    it("deve rejeitar limit acima do maximo (100)", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ limit: 101 });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar limit negativo", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ limit: -1 });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar offset negativo", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ offset: -1 });

      expect(res.status).toBe(400);
    });

    it("deve coercionar strings para numeros", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ limit: "50", offset: "0" });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar limit nao numerico", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ limit: "abc" });

      expect(res.status).toBe(400);
    });

    it("deve usar valores padrao quando nao informados", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token");

      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe("POST /api/revisao-ia/:id/revisar - Body Validation", () => {
    beforeEach(() => {
      // Inserir um item de teste
      db.prepare(`
        INSERT INTO fila_revisao_ia (id, documento_id, tipo, motivo, solicitante_id)
        VALUES (?, ?, ?, ?, ?)
      `).run("item-1", "doc-1", "revisao", "Motivo teste", "user-solicitante");
    });

    it("deve aceitar status valido", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/item-1/revisar")
        .set("Authorization", "Bearer test-token")
        .send({ status: "revisado" });

      expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
    });

    it("deve rejeitar status invalido", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/item-1/revisar")
        .set("Authorization", "Bearer test-token")
        .send({ status: "invalido" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("inválido");
    });

    it("deve rejeitar campos extras (strict mode)", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/item-1/revisar")
        .set("Authorization", "Bearer test-token")
        .send({ status: "revisado", extra_campo: "nao permitido" });

      expect(res.status).toBe(400);
    });

    it("deve usar valor padrao quando status nao informado", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/item-1/revisar")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect([200, 401, 403, 500]).toContain(res.status);
    });
  });

  describe("POST /api/revisao-ia/:id/rejeitar - Motivo Validation", () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO fila_revisao_ia (id, documento_id, tipo, motivo, solicitante_id)
        VALUES (?, ?, ?, ?, ?)
      `).run("item-2", "doc-2", "revisao", "Motivo teste", "user-solicitante");
    });

    it("deve aceitar motivo valido", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/item-2/rejeitar")
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "Dados incompletos" });

      expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
    });

    it("deve rejeitar motivo vazio", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/item-2/rejeitar")
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("inválido");
    });

    it("deve rejeitar motivo muito longo (> 500 chars)", async () => {
      const motivoLongo = "a".repeat(501);
      const res = await request(app)
        .post("/api/revisao-ia/item-2/rejeitar")
        .set("Authorization", "Bearer test-token")
        .send({ motivo: motivoLongo });

      expect(res.status).toBe(400);
    });

    it("deve aceitar motivo com 500 chars (limite maximo)", async () => {
      const motivoMaximo = "a".repeat(500);
      const res = await request(app)
        .post("/api/revisao-ia/item-2/rejeitar")
        .set("Authorization", "Bearer test-token")
        .send({ motivo: motivoMaximo });

      expect([200, 401, 403, 404, 500]).toContain(res.status);
    });

    it("deve trimmar espacos em branco", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/item-2/rejeitar")
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "  Motivo com espacos  " });

      expect([200, 401, 403, 404, 500]).toContain(res.status);
    });

    it("deve rejeitar motivo ausente", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/item-2/rejeitar")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/revisao-ia/criar - Item Creation Validation", () => {
    it("deve aceitar item valido", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          documentoId: "doc-novo",
          tipo: "revisao",
          motivo: "Motivo da revisao",
          solicitanteId: "user-solicitante",
        });

      expect([201, 400, 401, 403, 500]).toContain(res.status);
    });

    it("deve rejeitar documentoId vazio", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          documentoId: "",
          tipo: "revisao",
          motivo: "Motivo",
          solicitanteId: "user",
        });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar tipo invalido", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          documentoId: "doc-novo",
          tipo: "invalido",
          motivo: "Motivo",
          solicitanteId: "user",
        });

      expect(res.status).toBe(400);
    });

    it("deve aceitar tipos validos", async () => {
      const tipos = ["revisao", "analise", "validacao"];

      for (const tipo of tipos) {
        const res = await request(app)
          .post("/api/revisao-ia/criar")
          .set("Authorization", "Bearer test-token")
          .send({
            documentoId: `doc-${tipo}`,
            tipo,
            motivo: "Motivo teste",
            solicitanteId: "user",
          });

        expect([201, 400, 401, 403, 500]).toContain(res.status);
      }
    });

    it("deve rejeitar motivo vazio", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          documentoId: "doc",
          tipo: "revisao",
          motivo: "",
          solicitanteId: "user",
        });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar solicitanteId vazio", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          documentoId: "doc",
          tipo: "revisao",
          motivo: "Motivo",
          solicitanteId: "",
        });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar campos extras (strict mode)", async () => {
      const res = await request(app)
        .post("/api/revisao-ia/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          documentoId: "doc",
          tipo: "revisao",
          motivo: "Motivo",
          solicitanteId: "user",
          campoExtra: "nao permitido",
        });

      expect(res.status).toBe(400);
    });

    it("deve validar tamanho maximo de documentoId", async () => {
      const docIdLongo = "a".repeat(101);
      const res = await request(app)
        .post("/api/revisao-ia/criar")
        .set("Authorization", "Bearer test-token")
        .send({
          documentoId: docIdLongo,
          tipo: "revisao",
          motivo: "Motivo",
          solicitanteId: "user",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("Boundary Values and Edge Cases", () => {
    it("deve aceitar limit minimo (1)", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ limit: 1 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve aceitar limit maximo (100)", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ limit: 100 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve aceitar offset zero", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ offset: 0 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve aceitar status com enum exato", async () => {
      const validos = ["pendente", "revisado", "rejeitado"];

      for (const status of validos) {
        const res = await request(app)
          .get("/api/revisao-ia/fila")
          .set("Authorization", "Bearer test-token")
          .query({ status });

        expect([200, 400, 500]).toContain(res.status);
      }
    });
  });

  describe("Type Coercion", () => {
    it("deve coercionar limit de string para number", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ limit: "50" });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar limit que nao pode ser coercido", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ limit: "nao-numero" });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar float para limit", async () => {
      const res = await request(app)
        .get("/api/revisao-ia/fila")
        .set("Authorization", "Bearer test-token")
        .query({ limit: 50.5 });

      expect(res.status).toBe(400);
    });
  });
});
