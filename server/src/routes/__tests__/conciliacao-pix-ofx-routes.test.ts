/**
 * Testes das rotas HTTP de Reconciliação PIX↔OFX
 * Total: 5 testes cobrindo POST /reconciliar-agora, GET /status, GET /discrepancias
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasConciliacaoPixOFX } from "../conciliacao-pix-ofx-routes";

describe("Rotas HTTP de Conciliação PIX↔OFX", () => {
  let app: express.Application;
  let db: Database.Database;
  let mockAuthService: any;

  beforeEach(() => {
    // Cria banco de dados em memória
    db = new Database(":memory:");

    // Setup schema
    db.exec(`
      CREATE TABLE conciliacoes_pix_ofx (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asaas_charge_id TEXT,
        valor_asaas REAL,
        valor_ofx REAL,
        data_asaas TEXT,
        data_ofx TEXT,
        status TEXT DEFAULT 'conciliada',
        discrepancia_flag INTEGER DEFAULT 0,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE conciliacao_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conciliadas INTEGER,
        discrepancias INTEGER,
        pendentes INTEGER,
        expiradas INTEGER,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insere dados de teste
    db.prepare(`
      INSERT INTO conciliacoes_pix_ofx (
        asaas_charge_id, valor_asaas, valor_ofx, data_asaas, data_ofx, status, discrepancia_flag
      ) VALUES
        ('charge_1', 100.00, 100.00, '2024-10-01', '2024-10-01', 'conciliada', 0),
        ('charge_2', 200.00, 150.00, '2024-10-02', '2024-10-02', 'discrepancia', 1)
    `).run();

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
    app.use("/api/conciliacao", criarRotasConciliacaoPixOFX({ db, authService: mockAuthService }));
  });

  describe("POST /api/conciliacao/reconciliar-agora", () => {
    it("deve executar reconciliação com sucesso", async () => {
      const res = await request(app)
        .post("/api/conciliacao/reconciliar-agora")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sucesso");
      expect(res.body.sucesso).toBe(true);
      expect(res.body).toHaveProperty("resultado");
    });

    it("deve retornar resultado com métricas", async () => {
      const res = await request(app)
        .post("/api/conciliacao/reconciliar-agora")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      const resultado = res.body.resultado;
      expect(resultado).toHaveProperty("conciliadas");
      expect(resultado).toHaveProperty("discrepancias");
      expect(resultado).toHaveProperty("pendentes");
      expect(resultado).toHaveProperty("expiradas");
    });
  });

  describe("GET /api/conciliacao/status", () => {
    it("deve retornar status de conciliação com sucesso", async () => {
      const res = await request(app)
        .get("/api/conciliacao/status")
        .set("Authorization", "Bearer test-token")
        .query({ dias: 30 })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sucesso");
      expect(res.body.sucesso).toBe(true);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("periodo");
    });

    it("deve retornar status com período padrão", async () => {
      const res = await request(app)
        .get("/api/conciliacao/status")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.periodo.dias).toBe(30);
    });

    it("deve validar dias como número", async () => {
      const res = await request(app)
        .get("/api/conciliacao/status")
        .set("Authorization", "Bearer test-token")
        .query({ dias: "invalido" })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.periodo.dias).toBe(30); // Usa default se inválido
    });

    it("deve retornar estatísticas corretas", async () => {
      const res = await request(app)
        .get("/api/conciliacao/status")
        .set("Authorization", "Bearer test-token")
        .query({ dias: 30 })
        .send({});

      expect(res.status).toBe(200);
      const status = res.body.status;
      expect(typeof status.conciliadas).toBe("number");
      expect(typeof status.discrepancias).toBe("number");
      expect(typeof status.pendentes).toBe("number");
      expect(typeof status.expiradas).toBe("number");
    });
  });

  describe("GET /api/conciliacao/discrepancias", () => {
    it("deve listar discrepâncias com sucesso", async () => {
      const res = await request(app)
        .get("/api/conciliacao/discrepancias")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sucesso");
      expect(res.body.sucesso).toBe(true);
      expect(res.body).toHaveProperty("discrepancias");
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("paginacao");
    });

    it("deve retornar lista vazia se não há discrepâncias", async () => {
      // Limpa a tabela
      db.prepare("DELETE FROM conciliacoes_pix_ofx WHERE discrepancia_flag = 1").run();

      const res = await request(app)
        .get("/api/conciliacao/discrepancias")
        .set("Authorization", "Bearer test-token")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.discrepancias).toEqual([]);
    });

    it("deve suportar paginação com limite e offset", async () => {
      const res = await request(app)
        .get("/api/conciliacao/discrepancias")
        .set("Authorization", "Bearer test-token")
        .query({ limite: 10, offset: 0 })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.paginacao.limite).toBe(10);
      expect(res.body.paginacao.offset).toBe(0);
    });

    it("deve retornar paginação correta", async () => {
      const res = await request(app)
        .get("/api/conciliacao/discrepancias")
        .set("Authorization", "Bearer test-token")
        .query({ limite: 50, offset: 0 })
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.paginacao).toHaveProperty("limite");
      expect(res.body.paginacao).toHaveProperty("offset");
      expect(res.body.paginacao).toHaveProperty("totalPaginas");
    });
  });
});
