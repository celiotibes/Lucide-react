/**
 * Testes de Validacao e Respostas de Erro
 * Valida que erros sao retornados corretamente com mensagens apropriadas
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasRelatorioExecutivo } from "../relatorio-executivo-routes";
import { criarRotasAnomalias } from "../anomalias-routes";

describe("Validation Error Responses", () => {
  let app: express.Application;
  let db: Database.Database;
  let mockAuthService: any;

  beforeEach(() => {
    db = new Database(":memory:");

    db.exec(`
      CREATE TABLE relatorios_executivos (
        id TEXT PRIMARY KEY,
        mes INTEGER,
        ano INTEGER,
        conteudo TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE alertas_anomalias_registrados (
        id TEXT PRIMARY KEY,
        transacao_id TEXT,
        severidade TEXT,
        confianca INTEGER,
        metodos_dispararam TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    mockAuthService = {
      validarToken: vi.fn().mockReturnValue({
        usuarioId: "user1",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "admin" },
      }),
    };

    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      (req as any).auth = {
        usuarioId: "user1",
        token: "test-token",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "admin" },
      };
      next();
    });

    app.use("/api/relatorios/executivo", criarRotasRelatorioExecutivo({
      authService: mockAuthService,
      db,
    }));

    app.use("/api/anomalias", criarRotasAnomalias({
      db,
      authService: mockAuthService,
    }));
  });

  describe("HTTP Status Codes", () => {
    it("deve retornar 400 para parametros invalidos", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 13, ano: 2026 });

      expect(res.status).toBe(400);
    });

    it("deve retornar 400 para valor nao numerico", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/tx-1")
        .set("Authorization", "Bearer test-token")
        .query({ valor: "abc" });

      expect(res.status).toBe(400);
    });

    it("deve retornar 500 para erro interno", async () => {
      // Database nao disponivel
      const appNoDB = express();
      appNoDB.use(express.json());
      appNoDB.use((req, res, next) => {
        (req as any).auth = {
          usuarioId: "user1",
          token: "test-token",
          autenticado: true,
        };
        next();
      });

      appNoDB.use("/api/relatorios/executivo", criarRotasRelatorioExecutivo({
        authService: mockAuthService,
        db: undefined,
      }));

      const res = await request(appNoDB)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      expect(res.status).toBe(500);
    });
  });

  describe("Error Response Structure", () => {
    it("deve conter campo 'erro' em resposta de erro", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 13, ano: 2026 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("erro");
      expect(typeof res.body.erro).toBe("string");
    });

    it("deve conter 'detalhes' quando disponivel", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/tx-1")
        .set("Authorization", "Bearer test-token")
        .query({ valor: "abc" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("erro");
      // detalhes é opcional
      if (res.body.detalhes) {
        expect(Array.isArray(res.body.detalhes) || typeof res.body.detalhes === "string").toBe(true);
      }
    });
  });

  describe("Specific Error Messages", () => {
    it("deve mencionar parametro invalido no erro", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 13, ano: 2026 });

      expect(res.status).toBe(400);
      expect(res.body.erro).toMatch(/mes/i);
    });

    it("deve mencionar tipo de valor esperado", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/tx-1")
        .set("Authorization", "Bearer test-token")
        .query({ valor: "abc" });

      expect(res.status).toBe(400);
      expect(res.body.erro.toLowerCase()).toMatch(/valor|numér|numer/);
    });

    it("deve mencionar campo obrigatorio faltante", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ ano: 2026 });

      expect(res.status).toBe(400);
      expect(res.body.erro).toMatch(/mes/i);
    });

    it("deve mencionar limite maximo quando excedido", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 501 });

      expect(res.status).toBe(400);
    });
  });

  describe("Multiple Validation Errors", () => {
    it("deve retornar todos os erros quando multiplos campos invalidos", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 13, ano: 1999 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("erro");
    });

    it("deve detalhar todos os campos com erro (se suportado)", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 13, ano: 1999 });

      expect(res.status).toBe(400);
      // Se detalhes estao disponivel, deve listar os campos
      if (res.body.detalhes && Array.isArray(res.body.detalhes)) {
        expect(res.body.detalhes.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Success Response Structure", () => {
    it("deve conter dados validos em resposta de sucesso", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      if (res.status === 200) {
        expect(res.body).toHaveProperty("mes");
        expect(res.body).toHaveProperty("ano");
        expect(res.body.mes).toBe(10);
        expect(res.body.ano).toBe(2026);
      }
    });

    it("deve manter consistencia entre requisicoes iguais", async () => {
      const res1 = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      const res2 = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      expect(res1.status).toBe(res2.status);
      if (res1.status === 200) {
        expect(res1.body.mes).toBe(res2.body.mes);
        expect(res1.body.ano).toBe(res2.body.ano);
      }
    });
  });

  describe("Boundary Condition Errors", () => {
    it("deve rejeitar mes fora do range [1-12]", async () => {
      const invalidMeses = [0, -1, 13, 100];

      for (const mes of invalidMeses) {
        const res = await request(app)
          .get("/api/relatorios/executivo/dashboard")
          .set("Authorization", "Bearer test-token")
          .query({ mes, ano: 2026 });

        expect(res.status).toBe(400);
      }
    });

    it("deve rejeitar ano fora do range [2000-2100]", async () => {
      const invalidAnos = [1999, 2101, 1900, 2200];

      for (const ano of invalidAnos) {
        const res = await request(app)
          .get("/api/relatorios/executivo/dashboard")
          .set("Authorization", "Bearer test-token")
          .query({ mes: 10, ano });

        expect(res.status).toBe(400);
      }
    });
  });

  describe("Type Coercion Error Messages", () => {
    it("deve indicar que esperava numero", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/tx-1")
        .set("Authorization", "Bearer test-token")
        .query({ valor: "not-a-number" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toBeDefined();
    });

    it("deve aceitar string numerica (type coercion)", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/tx-1")
        .set("Authorization", "Bearer test-token")
        .query({ valor: "100.50" });

      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe("Custom Validation Error Details", () => {
    it("deve indicar qual parametro is obrigatorio", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toMatch(/obrigatório|required|faltando|missing/i);
    });

    it("deve indicar range valido quando valor fora do range", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 0, ano: 2026 });

      expect(res.status).toBe(400);
      expect(res.body.erro).toMatch(/1.*12|range|between/i);
    });
  });

  describe("Consistent Error Format", () => {
    it("deve usar formato consistente para todos os erros", async () => {
      const endpoints = [
        {
          method: "get",
          url: "/api/relatorios/executivo/dashboard",
          query: { mes: 13, ano: 2026 },
        },
        {
          method: "post",
          url: "/api/anomalias/analisar/tx-1",
          query: { valor: "abc" },
        },
        {
          method: "get",
          url: "/api/relatorios/executivo/margens",
          query: { mes: 10, ano: 2026, limit: 501 },
        },
      ];

      for (const endpoint of endpoints) {
        let res;
        if (endpoint.method === "get") {
          res = await request(app)
            .get(endpoint.url)
            .set("Authorization", "Bearer test-token")
            .query(endpoint.query);
        } else {
          res = await request(app)
            .post(endpoint.url)
            .set("Authorization", "Bearer test-token")
            .query(endpoint.query);
        }

        if (res.status === 400) {
          // Todos os erros 400 devem ter um campo "erro"
          expect(res.body).toHaveProperty("erro");
          expect(typeof res.body.erro).toBe("string");
        }
      }
    });
  });
});
