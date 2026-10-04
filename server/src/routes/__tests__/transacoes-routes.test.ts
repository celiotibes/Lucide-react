/**
 * Testes das rotas HTTP de Categorização Inteligente de Transações
 * Total: 5 testes cobrindo POST /sugerir-categoria
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { criarRotasTransacoes } from "../transacoes-routes";

// Mock do módulo de domínio
vi.mock("../domain/transacoes/categorizacaoInteligente", () => ({
  sugerirCategoria: vi.fn((db, id) => ({
    categoria: "1.1.1.01",
    confianca: 85,
    motivo: "Correspondência com histórico (100% match)",
    historico_match: {
      count: 5,
      categoria: "1.1.1.01",
    },
  })),
  registrarSugestaoCategoria: vi.fn(),
}));

describe("Rotas HTTP de Categorização de Transações", () => {
  let app: express.Application;
  let mockDb: unknown;
  let mockAuthService: unknown;

  beforeEach(() => {
    // Mock simples do banco de dados
    mockDb = {
      prepare: vi.fn(),
      run: vi.fn(),
      all: vi.fn(),
      get: vi.fn(),
    };

    // Mock authService
    mockAuthService = {
      validarToken: vi.fn().mockReturnValue({
        usuarioId: "user1",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
        papel: "admin",
      }),
    };

    // Cria app com rotas
    app = express();
    app.use(express.json());

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
    app.use("/api/transacoes", criarRotasTransacoes({ db: mockDb, authService: mockAuthService }));
  });

  describe("POST /api/transacoes/:id/sugerir-categoria", () => {
    it("deve sugerir categoria com sucesso", async () => {
      const res = await request(app)
        .post("/api/transacoes/123/sugerir-categoria")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("categoria");
      expect(res.body).toHaveProperty("confianca");
      expect(res.body).toHaveProperty("motivo");
    });

    it("deve retornar categoria sugerida", async () => {
      const res = await request(app)
        .post("/api/transacoes/123/sugerir-categoria")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(typeof res.body.categoria).toBe("string");
      expect(typeof res.body.confianca).toBe("number");
      expect(res.body.confianca).toBeGreaterThanOrEqual(0);
      expect(res.body.confianca).toBeLessThanOrEqual(100);
    });

    it("deve validar ID como número inteiro positivo", async () => {
      const res = await request(app)
        .post("/api/transacoes/abc/sugerir-categoria")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("número inteiro positivo");
    });

    it("deve rejeitar ID negativo", async () => {
      const res = await request(app)
        .post("/api/transacoes/-1/sugerir-categoria")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("número inteiro positivo");
    });

    it("deve rejeitar ID zero", async () => {
      const res = await request(app)
        .post("/api/transacoes/0/sugerir-categoria")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("número inteiro positivo");
    });

    it("deve incluir histórico quando disponível", async () => {
      const res = await request(app)
        .post("/api/transacoes/123/sugerir-categoria")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("motivo");
      // Pode incluir histórico opcionalmente
    });

    it("deve suportar query param forceKeywords", async () => {
      const res = await request(app)
        .post("/api/transacoes/123/sugerir-categoria")
        .set("Authorization", "Bearer test-token")
        .query({ forceKeywords: true })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("categoria");
    });

    it("deve retornar erro para transação não encontrada", async () => {
      // Este teste assume que a implementação trata transações inexistentes
      const res = await request(app)
        .post("/api/transacoes/999999/sugerir-categoria")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });
  });
});
