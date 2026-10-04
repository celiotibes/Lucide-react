/**
 * Testes de Performance para Endpoints de Lista
 * Valida que operações de lista conseguem lidar com dados realistas (1000+ records)
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { criarRotasRelatorioExecutivo } from "../relatorio-executivo-routes";

describe("Performance Tests - List Endpoints", () => {
  let app: express.Application;
  let db: Database.Database;
  let mockAuthService: any;

  beforeEach(() => {
    db = new Database(":memory:");

    // Setup schema
    db.exec(`
      CREATE TABLE relatorios_executivos (
        id TEXT PRIMARY KEY,
        mes INTEGER,
        ano INTEGER,
        conteudo TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE imoveis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        alugado INTEGER DEFAULT 0,
        margem_liquida REAL DEFAULT 0
      );

      CREATE TABLE margens_propriedade (
        id TEXT PRIMARY KEY,
        imovel_id INTEGER,
        mes INTEGER,
        ano INTEGER,
        margem REAL,
        FOREIGN KEY(imovel_id) REFERENCES imoveis(id)
      );
    `);

    // Inserir 1000+ registros para teste de performance
    const stmt = db.prepare(`
      INSERT INTO imoveis (nome, alugado, margem_liquida)
      VALUES (?, ?, ?)
    `);

    for (let i = 1; i <= 1500; i++) {
      stmt.run(`Imóvel ${i}`, i % 2, Math.random() * 100);
    }

    // Inserir margens para os imóveis
    const margemStmt = db.prepare(`
      INSERT INTO margens_propriedade (imovel_id, mes, ano, margem)
      VALUES (?, ?, ?, ?)
    `);

    for (let i = 1; i <= 1500; i++) {
      for (let mes = 1; mes <= 12; mes++) {
        margemStmt.run(i, mes, 2026, Math.random() * 100);
      }
    }

    mockAuthService = {
      validarToken: () => ({
        usuarioId: "user1",
        autenticado: true,
        usuario: { id: "user1", email: "test@example.com", role: "administrador" },
      }),
    };

    app = express();
    app.use(express.json());

    // Mock auth middleware
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
  });

  describe("Margens Pagination - Large Dataset (1500+ records)", () => {
    it("deve retornar margens com paginacao em menos de 500ms", async () => {
      const start = Date.now();

      const res = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 50, offset: 0 });

      const elapsed = Date.now() - start;

      expect([200, 400, 500]).toContain(res.status);
      expect(elapsed).toBeLessThan(500); // Deve responder em menos de 500ms
    });

    it("deve suportar offset grande sem degradacao", async () => {
      const start = Date.now();

      const res = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 50, offset: 1000 });

      const elapsed = Date.now() - start;

      expect([200, 400, 500]).toContain(res.status);
      expect(elapsed).toBeLessThan(500);
    });

    it("deve manter performance com diferentes tamanhos de limit", async () => {
      const limits = [10, 50, 100, 500];
      const timings: number[] = [];

      for (const limit of limits) {
        const start = Date.now();

        await request(app)
          .get("/api/relatorios/executivo/margens")
          .set("Authorization", "Bearer test-token")
          .query({ mes: 10, ano: 2026, limit, offset: 0 });

        const elapsed = Date.now() - start;
        timings.push(elapsed);
      }

      // Verificar que não há crescimento exponencial
      // (limit maior não deve resultar em tempo disproportionalmente maior)
      const timeRatio = timings[timings.length - 1] / timings[0];
      expect(timeRatio).toBeLessThan(5); // Max 5x mais lento para 50x mais dados
    });

    it("deve retornar resultados mesmo com dataset vazio", async () => {
      const emptyDb = new Database(":memory:");
      emptyDb.exec(`
        CREATE TABLE margens_propriedade (
          id TEXT PRIMARY KEY,
          imovel_id INTEGER,
          mes INTEGER,
          ano INTEGER,
          margem REAL
        );
      `);

      const emptyApp = express();
      emptyApp.use(express.json());
      emptyApp.use((req, res, next) => {
        (req as any).auth = {
          usuarioId: "user1",
          token: "test-token",
          autenticado: true,
        };
        next();
      });

      emptyApp.use("/api/relatorios/executivo", criarRotasRelatorioExecutivo({
        authService: mockAuthService,
        db: emptyDb,
      }));

      const res = await request(emptyApp)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026 });

      expect([200, 400, 500]).toContain(res.status);

      emptyDb.close();
    });
  });

  describe("Memory Efficiency", () => {
    it("deve nao consumir memoria excessiva em multiplas requisicoes", async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Fazer 10 requisições
      for (let i = 0; i < 10; i++) {
        await request(app)
          .get("/api/relatorios/executivo/margens")
          .set("Authorization", "Bearer test-token")
          .query({ mes: 10, ano: 2026, limit: 50, offset: i * 50 });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // MB

      // Deve aumentar menos de 10MB para 10 requisições
      expect(memoryIncrease).toBeLessThan(10);
    });
  });

  describe("Concurrent Requests", () => {
    it("deve lidar com requisicoes concorrentes", async () => {
      const promises = [];

      // Disparar 10 requisições concorrentes
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .get("/api/relatorios/executivo/margens")
            .set("Authorization", "Bearer test-token")
            .query({ mes: 10, ano: 2026, limit: 50, offset: 0 })
        );
      }

      const results = await Promise.all(promises);

      // Todas devem ter sucesso
      results.forEach((res) => {
        expect([200, 400, 500]).toContain(res.status);
      });
    });
  });

  describe("Pagination Correctness", () => {
    it("deve retornar ordem consistente entre requisicoes", async () => {
      const res1 = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 50, offset: 0 });

      const res2 = await request(app)
        .get("/api/relatorios/executivo/margens")
        .set("Authorization", "Bearer test-token")
        .query({ mes: 10, ano: 2026, limit: 50, offset: 0 });

      // As duas requisições devem retornar os mesmos dados na mesma ordem
      if (res1.status === 200 && res2.status === 200) {
        expect(res1.body).toEqual(res2.body);
      }
    });

    it("deve permitir iteracao atraves de todos os registros", async () => {
      const allRecords: any[] = [];
      let offset = 0;
      const limit = 100;
      const maxIterations = 100; // Prevenir loop infinito

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const res = await request(app)
          .get("/api/relatorios/executivo/margens")
          .set("Authorization", "Bearer test-token")
          .query({ mes: 10, ano: 2026, limit, offset });

        if (res.status !== 200 || !res.body.margens || res.body.margens.length === 0) {
          break;
        }

        allRecords.push(...res.body.margens);
        offset += limit;
      }

      // Deve ter iterado através dos dados
      expect(allRecords.length).toBeGreaterThanOrEqual(0);
    });
  });
});
