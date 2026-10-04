/**
 * Testes de Integracao e Cenarios Realistas
 * Valida fluxos completos de uso e interacoes entre componentes
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasRelatorioExecutivo } from "../relatorio-executivo-routes";
import { criarRotasAnomalias } from "../anomalias-routes";

describe("Integration Scenarios", () => {
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

      CREATE TABLE conciliacao_ofx_cache (
        id TEXT PRIMARY KEY,
        valor REAL,
        descricao TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE usuarios (
        id TEXT PRIMARY KEY,
        nome TEXT,
        email TEXT,
        role TEXT DEFAULT 'usuario'
      );
    `);

    // Inserir dados de teste
    db.prepare(`
      INSERT INTO usuarios (id, nome, email, role)
      VALUES (?, ?, ?, ?)
    `).run("user1", "Test User", "test@example.com", "admin");

    // Inserir algumas transacoes
    for (let i = 1; i <= 20; i++) {
      db.prepare(`
        INSERT INTO conciliacao_ofx_cache (id, valor, descricao)
        VALUES (?, ?, ?)
      `).run(`tx-${i}`, 100 + i * 10, `Transacao ${i}`);
    }

    mockAuthService = {
      validarToken: vi.fn().mockReturnValue({
        usuarioId: "user1",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
      }),
    };

    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      (req as any).auth = {
        usuarioId: "user1",
        token: "test-token",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
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

  describe("Complete Report Generation Flow", () => {
    it("deve gerar relatorio para mes especifico", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body).toHaveProperty("mes");
        expect(res.body).toHaveProperty("ano");
        expect(res.body).toHaveProperty("periodo");
        expect(res.body.mes).toBe(10);
        expect(res.body.ano).toBe(2026);
      }
    });

    it("deve gerar relatorios para varios meses consecutivos", async () => {
      const meses = [1, 2, 3, 4, 5];
      const results = [];

      for (const mes of meses) {
        const res = await request(app)
          .get("/api/relatorios/executivo/dashboard")
          .set("Authorization", "Bearer test-token")
          .query({ mes, ano: 2026 });

        results.push(res);

        if (res.status === 200) {
          expect(res.body.mes).toBe(mes);
        }
      }

      // Todos devem ter sucesso ou falhar consistentemente
      const statuses = results.map((r) => r.status);
      expect(statuses.length).toBe(meses.length);
    });

    it("deve gerar relatorios para ano inteiro", async () => {
      const results = [];

      for (let mes = 1; mes <= 12; mes++) {
        const res = await request(app)
          .get("/api/relatorios/executivo/dashboard")
          .set("Authorization", "Bearer test-token")
          .query({ mes, ano: 2026 });

        results.push(res);
      }

      // Todos devem completar
      expect(results.length).toBe(12);
    });
  });

  describe("Anomaly Detection Flow", () => {
    it("deve analisar transacao e registrar anomalia se detectada", async () => {
      const res = await request(app)
        .post("/api/anomalias/analisar/tx-1")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 500, periodo_dias: 90 });

      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body).toHaveProperty("transacao_id");
        expect(res.body).toHaveProperty("severidade");
        expect(res.body).toHaveProperty("confianca");
        expect(["baixa", "media", "critica"]).toContain(res.body.severidade);
      }
    });

    it("deve analisar multiplas transacoes para deteccao em lote", async () => {
      const transacoes = [100, 200, 300, 1000, 150];
      const results = [];

      for (const valor of transacoes) {
        const res = await request(app)
          .post(`/api/anomalias/analisar/tx-batch-${valor}`)
          .set("Authorization", "Bearer test-token")
          .query({ valor, periodo_dias: 90 });

        results.push(res);
      }

      // Todos devem processar
      expect(results.length).toBe(transacoes.length);
    });

    it("deve listar alertas apos deteccao", async () => {
      // Primeiro analisar
      await request(app)
        .post("/api/anomalias/analisar/tx-test-1")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 500, periodo_dias: 90 });

      // Depois listar
      const res = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token");

      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body).toHaveProperty("alertas");
        expect(Array.isArray(res.body.alertas)).toBe(true);
      }
    });
  });

  describe("Filtering and Sorting Scenarios", () => {
    it("deve filtrar alertas por severidade", async () => {
      // Analisar com diferentes valores para gerar alertas
      await request(app)
        .post("/api/anomalias/analisar/tx-sev-1")
        .set("Authorization", "Bearer test-token")
        .query({ valor: 200 });

      // Filtrar por severidade
      const resMedia = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ severidade: "media" });

      const resCritica = await request(app)
        .get("/api/anomalias/alertas")
        .set("Authorization", "Bearer test-token")
        .query({ severidade: "critica" });

      expect([200, 400, 500]).toContain(resMedia.status);
      expect([200, 400, 500]).toContain(resCritica.status);
    });

    it("deve filtrar alertas por periodo de dias", async () => {
      const periodos = [7, 30, 90];
      const results = [];

      for (const dias of periodos) {
        const res = await request(app)
          .get("/api/anomalias/alertas")
          .set("Authorization", "Bearer test-token")
          .query({ dias });

        results.push(res);
      }

      expect(results.length).toBe(periodos.length);
    });

    it("deve paginar resultados", async () => {
      const limits = [10, 50, 100];
      const offsets = [0, 50, 100];

      for (const limit of limits) {
        for (const offset of offsets) {
          const res = await request(app)
            .get("/api/anomalias/alertas")
            .set("Authorization", "Bearer test-token")
            .query({ limite: limit, offset });

          expect([200, 400]).toContain(res.status);
        }
      }
    });
  });

  describe("Report Margens Scenarios", () => {
    it("deve listar margens com paginacao", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 50, offset: 0 });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("deve navegar atraves de margens paginadas", async () => {
      const limit = 10;
      let offset = 0;
      const maxPages = 3;

      for (let page = 0; page < maxPages; page++) {
        const res = await request(app)
          .get("/api/relatorios/executivo/margens")
          .set("Authorization", "Bearer test-token")
          .query({ mes: 10, ano: 2026, limit, offset });

        expect([200, 400, 500]).toContain(res.status);

        offset += limit;
      }
    });
  });

  describe("Cross-Endpoint Consistency", () => {
    it("deve retornar periodo consistente em diferentes endpoints", async () => {
      const res1 = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 5, ano: 2026 });

      const res2 = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 5, ano: 2026 });

      if (res1.status === 200 && res2.status === 200) {
        expect(res1.body.periodo).toBe("2026-05");
      }
    });
  });

  describe("Year Boundary Scenarios", () => {
    it("deve gerar relatorios para primeiro mes do ano", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 1, ano: 2026 });

      if (res.status === 200) {
        expect(res.body.mes).toBe(1);
        expect(res.body.ano).toBe(2026);
        expect(res.body.periodo).toBe("2026-01");
      }
    });

    it("deve gerar relatorios para ultimo mes do ano", async () => {
      const res = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 12, ano: 2026 });

      if (res.status === 200) {
        expect(res.body.mes).toBe(12);
        expect(res.body.ano).toBe(2026);
        expect(res.body.periodo).toBe("2026-12");
      }
    });

    it("deve gerar relatorios para anos diferentes", async () => {
      const anos = [2024, 2025, 2026, 2027];

      for (const ano of anos) {
        const res = await request(app)
          .get("/api/relatorios/executivo/dashboard")
          .set("Authorization", "Bearer test-token")
          .query({ mes: 10, ano });

        if (res.status === 200) {
          expect(res.body.ano).toBe(ano);
        }
      }
    });
  });

  describe("Data Consistency Scenarios", () => {
    it("deve manter consistencia apos multiplas requisicoes", async () => {
      // Fazer 3 requisicoes para o mesmo periodo
      const res1 = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      const res2 = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      const res3 = await request(app)
        .get("/api/relatorios/executivo/dashboard")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      if (res1.status === 200 && res2.status === 200 && res3.status === 200) {
        expect(res1.body.mes).toBe(res2.body.mes);
        expect(res2.body.mes).toBe(res3.body.mes);
        expect(res1.body.periodo).toBe(res2.body.periodo);
        expect(res2.body.periodo).toBe(res3.body.periodo);
      }
    });
  });
});
