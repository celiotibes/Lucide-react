/**
 * Testes das rotas HTTP de Detecção de Anomalias em Fluxo de Caixa
 * Total: 5 testes cobrindo POST /analisar, GET /alertas, GET /estatisticas, PATCH /alertas/:id/revisar
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasAnomalias } from "../anomalias-routes";

describe("Rotas HTTP de Anomalias", () => {
  let app: express.Application;
  let db: Database.Database;
  let mockAuthService: any;

  beforeEach(() => {
    // Cria banco de dados em memória
    db = new Database(":memory:");

    // Setup schema
    db.exec(`
      CREATE TABLE transacoes (
        id INTEGER PRIMARY KEY,
        descricao TEXT,
        valor REAL,
        data TEXT
      );

      CREATE TABLE alertas_anomalias (
        id TEXT PRIMARY KEY,
        transacao_id INTEGER,
        severidade TEXT,
        confianca INTEGER,
        metodos_dispararam TEXT,
        scores_individuais TEXT,
        revisado INTEGER DEFAULT 0,
        revisado_em TEXT,
        motivo_revisao TEXT,
        usuario_revisou TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Mock authService
    mockAuthService = {
      validarToken: vi.fn().mockReturnValue({
        usuarioId: "user1",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "admin" },
        papel: "admin",
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
    app.use("/api/anomalias", criarRotasAnomalias({ db, authService: mockAuthService }));
  });

  describe("POST /api/anomalias/analisar/:transacaoId", () => {
    it("deve analisar anomalia com sucesso", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 1500.50, periodo_dias: 90 })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.transacao_id).toBe("123");
      expect(res.body).toHaveProperty("severidade");
      expect(res.body).toHaveProperty("confianca");
      expect(["baixa", "media", "critica"]).toContain(res.body.severidade);
    });

    it("deve validar parâmetro 'valor' obrigatório", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({})
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("valor");
    });

    it("deve validar se valor é numérico", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: "abc" })
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("numérico");
    });

    it("deve usar período padrão de 90 dias", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 1000 })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("confianca");
    });
  });

  describe("GET /api/anomalias/alertas", () => {
    beforeEach(() => {
      // Insere um alerta de teste
      db.prepare(`
        INSERT INTO alertas_anomalias (
          id, transacao_id, severidade, confianca, metodos_dispararam,
          scores_individuais, criado_em
        ) VALUES (
          'alerta_1', 1, 'media', 75, '["sigma_2"]', '{}', datetime('now')
        )
      `).run();
    });

    it("deve listar alertas com sucesso", async () => {
      const res = await request(app).get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token").send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("alertas");
      expect(res.body).toHaveProperty("total");
      expect(res.body.alertas).toBeInstanceOf(Array);
    });

    it("deve filtrar alertas por severidade", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ severidade: "media" })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.filtros.severidade).toBe("media");
    });

    it("deve rejeitar severidade inválida", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ severidade: "invalida" })
        .send({});

      expect(res.status).toBe(200);
      // Filtro inválido é ignorado silenciosamente
      expect(res.body.filtros.severidade).toBeUndefined();
    });
  });

  describe("GET /api/anomalias/estatisticas", () => {
    it("deve retornar estatísticas com sucesso", async () => {
      const res = await request(app)
        .get("/api/anomalias/estatisticas")
        .set("Authorization", "Bearer test-token")
        .query({ dias: 30 })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("periodo_dias");
      expect(res.body.periodo_dias).toBe(30);
    });

    it("deve usar período padrão de 30 dias", async () => {
      const res = await request(app).get("/api/anomalias/estatisticas")
        .set("Authorization", "Bearer test-token").send({});

      expect(res.status).toBe(200);
      expect(res.body.periodo_dias).toBe(30);
    });
  });

  describe("PATCH /api/anomalias/alertas/:id/revisar", () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO alertas_anomalias (
          id, transacao_id, severidade, confianca, metodos_dispararam,
          scores_individuais, revisado, criado_em
        ) VALUES (
          'alerta_1', 1, 'media', 75, '["sigma_2"]', '{}', 0, datetime('now')
        )
      `).run();
    });

    it("deve marcar alerta como revisado com sucesso", async () => {
      const res = await request(app)
        .patch("/api/anomalias/alertas/alerta_1/revisar")
        .set("Authorization", "Bearer test-token")
        .send({
          usuario_id: "user123",
          motivo: "falso positivo",
        });

      expect(res.status).toBe(200);
      expect(res.body.alerta_id).toBe("alerta_1");
      expect(res.body.revisado).toBe(1);
      expect(res.body.motivo).toBe("falso positivo");
    });

    it("deve validar usuario_id obrigatório", async () => {
      const res = await request(app)
        .patch("/api/anomalias/alertas/alerta_1/revisar")
        .set("Authorization", "Bearer test-token")
        .send({ motivo: "falso positivo" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("usuario_id");
    });

    it("deve validar motivo obrigatório", async () => {
      const res = await request(app)
        .patch("/api/anomalias/alertas/alerta_1/revisar")
        .set("Authorization", "Bearer test-token")
        .send({ usuario_id: "user123" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("motivo");
    });

    it("deve retornar 404 para alerta inexistente", async () => {
      const res = await request(app)
        .patch("/api/anomalias/alertas/inexistente/revisar")
        .set("Authorization", "Bearer test-token")
        .send({
          usuario_id: "user123",
          motivo: "falso positivo",
        });

      expect(res.status).toBe(404);
      expect(res.body.erro).toContain("não encontrado");
    });
  });
});
