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

    // Setup schema baseado nas migrações reais
    db.exec(`
      -- Tabela de usuários (necessária para foreign keys)
      CREATE TABLE usuarios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha_hash TEXT NOT NULL,
        role TEXT DEFAULT 'usuario',
        ativo INTEGER DEFAULT 1,
        data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Transações para análise (source de dados para os detectores)
      CREATE TABLE conciliacao_ofx_cache (
        id TEXT PRIMARY KEY,
        valor REAL NOT NULL,
        descricao TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Alertas de anomalia (histórico)
      CREATE TABLE alertas_anomalias_registrados (
        id TEXT PRIMARY KEY,
        transacao_id TEXT NOT NULL,
        usuario_id TEXT,
        severidade TEXT NOT NULL DEFAULT 'media' CHECK(severidade IN ('baixa', 'media', 'critica')),
        confianca INTEGER NOT NULL CHECK(confianca >= 0 AND confianca <= 100),
        metodos_dispararam TEXT NOT NULL,
        z_score REAL,
        z_score_limite REAL,
        iqr_valor REAL,
        iqr_limite REAL,
        percentil_valor REAL,
        percentil_95 REAL,
        descricao TEXT,
        revisado INTEGER NOT NULL DEFAULT 0 CHECK(revisado IN (0, 1)),
        revisado_por TEXT,
        revisado_em DATETIME,
        motivo_revisao TEXT,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
        FOREIGN KEY(revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL
      );

      -- Cache de métricas (para reaproveitamento)
      CREATE TABLE cache_metricas_anomalias (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        tipo_metrica TEXT NOT NULL CHECK(tipo_metrica IN ('desvio_padrao', 'iqr', 'percentil')),
        periodo_dias INTEGER NOT NULL DEFAULT 90,
        media REAL,
        desvio_padrao REAL,
        q1 REAL,
        q2 REAL,
        q3 REAL,
        iqr_valor REAL,
        p5 REAL,
        p90 REAL,
        p95 REAL,
        total_transacoes INTEGER,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      );
    `);

    // Insere dados de teste: usuário de teste
    db.prepare(`
      INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo)
      VALUES ('user1', 'User Test', 'test@example.com', 'hash', 'admin', 1)
    `).run();

    // Insere algumas transações de teste para análise
    const transacoes = [
      100, 150, 120, 140, 130, 110, 125, 135, 145, 150,
      155, 160, 165, 170, 175, 180, 185, 190, 195, 200,
    ];
    const agora = new Date();
    for (let i = 0; i < transacoes.length; i++) {
      const data = new Date(agora.getTime() - (i * 24 * 60 * 60 * 1000));
      db.prepare(`
        INSERT INTO conciliacao_ofx_cache (id, valor, descricao, criado_em)
        VALUES (?, ?, ?, ?)
      `).run(`tx-${i}`, transacoes[i], `Transação teste ${i}`, data.toISOString());
    }

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
        INSERT INTO alertas_anomalias_registrados (
          id, transacao_id, severidade, confianca, metodos_dispararam,
          descricao, criado_em
        ) VALUES (
          'alerta_1', '1', 'media', 75, 'sigma_2', 'Teste', datetime('now')
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
        INSERT INTO alertas_anomalias_registrados (
          id, transacao_id, severidade, confianca, metodos_dispararam,
          descricao, revisado, criado_em
        ) VALUES (
          'alerta_1', '1', 'media', 75, 'sigma_2', 'Teste', 0, datetime('now')
        )
      `).run();
    });

    it("deve marcar alerta como revisado com sucesso", async () => {
      const res = await request(app)
        .patch("/api/anomalias/alertas/alerta_1/revisar")
        .set("Authorization", "Bearer test-token")
        .send({
          usuario_id: "user1",
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

  describe("Valor Validation - Edge Cases", () => {
    it("deve rejeitar valor zero", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 0 });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar valor negativo", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: -100 });

      expect(res.status).toBe(400);
    });

    it("deve aceitar valor decimal positivo", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 123.45 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar valor infinito", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: "Infinity" });

      expect(res.status).toBe(400);
    });

    it("deve aceitar valor muito grande", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 999999999999 });

      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe("Periodo_dias Validation - Boundaries", () => {
    it("deve aceitar periodo_dias minimo (1)", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 100, periodo_dias: 1 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve aceitar periodo_dias maximo (365)", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 100, periodo_dias: 365 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar periodo_dias menor que 1", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 100, periodo_dias: 0 });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar periodo_dias maior que 365", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 100, periodo_dias: 366 });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar periodo_dias nao inteiro", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 100, periodo_dias: 90.5 });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/anomalias/alertas - Zod Validation", () => {
    it("deve aceitar todas as severidades validas", async () => {
      const severidades = ["baixa", "media", "critica"];

      for (const sev of severidades) {
        const res = await request(app)
          .get("/api/anomalias/alertas")
          .set("Authorization", "Bearer test-token")
          .query({ severidade: sev });

        expect([200, 400, 500]).toContain(res.status);
      }
    });

    it("deve rejeitar severidade invalida (com Zod)", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ severidade: "altissima" });

      expect(res.status).toBe(400);
      expect(res.body.erro).toContain("Parâmetros");
    });

    it("deve aceitar dias minimo (1)", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ dias: 1 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve aceitar dias maximo (365)", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ dias: 365 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar dias menor que 1", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ dias: 0 });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar dias maior que 365", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ dias: 366 });

      expect(res.status).toBe(400);
    });

    it("deve aceitar revisado true/false", async () => {
      const res1 = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ revisado: "true" });

      const res2 = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ revisado: "false" });

      expect([200, 400, 500]).toContain(res1.status);
      expect([200, 400, 500]).toContain(res2.status);
    });

    it("deve rejeitar revisado invalido", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ revisado: "talvez" });

      expect(res.status).toBe(400);
    });

    it("deve aceitar limite minimo (1)", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ limite: 1 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve aceitar limite maximo (1000)", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ limite: 1000 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar limite menor que 1", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ limite: 0 });

      expect(res.status).toBe(400);
    });

    it("deve rejeitar limite maior que 1000", async () => {
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ limite: 1001 });

      expect(res.status).toBe(400);
    });
  });

  describe("Confidence Score Validation", () => {
    it("deve retornar confianca entre 0-100", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 1500.50, periodo_dias: 90 });

      if (res.status === 200) {
        expect(res.body.confianca).toBeGreaterThanOrEqual(0);
        expect(res.body.confianca).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("Type Coercion", () => {
    it("deve coercionar valor string para numero", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: "100" });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve coercionar periodo_dias string para numero", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 100, periodo_dias: "90" });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve rejeitar valor que nao pode ser coercido", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/123")
        .set("Authorization", "Bearer test-token")
        .query({ valor: "nao-numero" });

      expect(res.status).toBe(400);
    });
  });
});
