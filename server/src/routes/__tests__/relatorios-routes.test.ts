/**
 * Testes para as rotas de análise de margens por propriedade
 * Total: 6 testes de rota + integração
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import express, { type Express } from "express";
import request from "supertest";
import { criarRotasRelatorios } from "../relatorios-routes.js";
import type { AuthServiceDB } from "../../domain/auth/auth-service-db.js";
import { gravarMargensImovel } from "../../domain/relatorios/margensPorPropriedade.js";

let app: Express;
let db: Database.Database;
let mockAuthService: AuthServiceDB;

beforeEach(() => {
  // Setup banco de dados
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL
    );

    CREATE TABLE imoveis (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      status TEXT DEFAULT 'ATIVO'
    );

    CREATE TABLE margens_propriedades_periodo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periodo TEXT NOT NULL,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      imovel_id INTEGER NOT NULL,
      receita DECIMAL(15, 2) NOT NULL,
      despesa DECIMAL(15, 2) NOT NULL,
      margem DECIMAL(5, 2) NOT NULL,
      status TEXT NOT NULL,
      calculado_em DATETIME NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(imovel_id, ano, mes),
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id)
    );
  `);

  // Inserir dados de teste
  db.prepare("INSERT INTO imoveis (id, nome) VALUES (?, ?)").run(1, "Apto 101");
  db.prepare("INSERT INTO imoveis (id, nome) VALUES (?, ?)").run(2, "Casa 42");

  // Mock auth service
  mockAuthService = {
    validarToken: async (token: string) => ({
      usuarioId: 1,
      email: "test@example.com",
      papel: "titular",
    }),
  } as any;

  // Setup Express
  app = express();
  app.use(express.json());

  // Middleware de autenticação mock
  app.use((req, res, next) => {
    (req as any).usuario = { usuarioId: 1, email: "test@example.com", papel: "titular" };
    next();
  });

  const router = criarRotasRelatorios({ authService: mockAuthService, db });
  app.use("/api/relatorios", router);
});

afterEach(() => {
  db.close();
});

describe("Rotas de Margens por Propriedade", () => {
  it("deve retornar histórico de margens para um imóvel", async () => {
    // Inserir margens de teste
    gravarMargensImovel(db, 2026, 10, {
      imovelId: 1,
      nomeProriedade: "Apto 101",
      periodo: "2026-10",
      receita: 1000,
      despesa: 300,
      margem: 70,
      status: "OK",
      calculadoEm: new Date().toISOString(),
    });

    const response = await request(app)
      .get("/api/relatorios/margens?imovelId=1&dataInicio=2026-01-01&dataFim=2026-12-31")
      .expect(200);

    expect(response.body).toHaveProperty("imovelId", 1);
    expect(response.body).toHaveProperty("nomePropriedade");
    expect(Array.isArray(response.body.periodos)).toBe(true);
    expect(response.body.periodos[0].margem).toBe(70);
  });

  it("deve retornar erro 400 se imovelId não for fornecido", async () => {
    const response = await request(app)
      .get("/api/relatorios/margens?dataInicio=2026-01-01")
      .expect(400);

    expect(response.body).toHaveProperty("erro");
    expect(response.body.erro).toContain("imovelId");
  });

  it("deve retornar ranking com top 5 e bottom 5", async () => {
    // Inserir margens para 3 imóveis
    for (let i = 1; i <= 2; i++) {
      gravarMargensImovel(db, 2026, 10, {
        imovelId: i,
        nomeProriedade: `Imóvel ${i}`,
        periodo: "2026-10",
        receita: 1000,
        despesa: 300 + i * 50,
        margem: 70 - i * 10,
        status: "OK",
        calculadoEm: new Date().toISOString(),
      });
    }

    const response = await request(app)
      .get("/api/relatorios/margens/ranking?periodoMes=2026-10")
      .expect(200);

    expect(response.body).toHaveProperty("periodo", "2026-10");
    expect(Array.isArray(response.body.top5)).toBe(true);
    expect(Array.isArray(response.body.bottom5)).toBe(true);
  });

  it("deve retornar erro 400 se periodoMes for inválido", async () => {
    const response = await request(app)
      .get("/api/relatorios/margens/ranking?periodoMes=2026-13")
      .expect(400);

    expect(response.body).toHaveProperty("erro");
  });

  it("deve calcular e gravar margens de um período", async () => {
    const response = await request(app)
      .post("/api/relatorios/margens/calcular")
      .send({ ano: 2026, mes: 10 })
      .expect(200);

    expect(response.body).toHaveProperty("periodo", "2026-10");
    expect(response.body).toHaveProperty("totalImoveisCalculados");
    expect(Array.isArray(response.body.margens)).toBe(true);
  });

  it("deve retornar a última margem calculada de um imóvel", async () => {
    gravarMargensImovel(db, 2026, 10, {
      imovelId: 1,
      nomeProriedade: "Apto 101",
      periodo: "2026-10",
      receita: 1000,
      despesa: 300,
      margem: 70,
      status: "OK",
      calculadoEm: new Date().toISOString(),
    });

    const response = await request(app)
      .get("/api/relatorios/margens/imovel/1/ultimo")
      .expect(200);

    expect(response.body).toHaveProperty("imovelId", 1);
    expect(response.body).toHaveProperty("periodo", "2026-10");
    expect(response.body).toHaveProperty("margem", 70);
  });
});
