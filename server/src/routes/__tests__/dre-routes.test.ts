import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../../domain/auth/auth-service-db";
import { AuditTrailServiceDB } from "../../domain/auth/audit-trail-db";
import { gerarHashSenha } from "../../domain/auth/password";
import { criarRotasAuth } from "../auth-routes";
import { criarRotasRelatorios } from "../dre-routes";
import { tokenDoCookie } from "./token-cookie.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-dre-routes-${process.pid}.db`);
const SENHA_PADRAO = "senha-correta-123";

function resolverSchema(nomeArquivo: string): string {
  const candidatos = [
    path.join(__dirname, `../../../${nomeArquivo}`),
    path.join(process.cwd(), `server/src/${nomeArquivo}`),
    path.join(process.cwd(), `src/${nomeArquivo}`),
  ];
  const encontrado = candidatos.find((p) => fs.existsSync(p));
  if (!encontrado) throw new Error(`Schema não encontrado: ${nomeArquivo} (tentei ${candidatos.join(", ")})`);
  return fs.readFileSync(encontrado, "utf-8");
}

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");
  db.exec(resolverSchema("migrations-phase2-auth.sql"));
  db.exec(resolverSchema("migrations-phase6-relatorios-dre.sql"));
  return db;
}

async function criarAppDeTeste(db: Database.Database) {
  const app = express();
  app.use(express.json());
  const authService = new AuthServiceDB(db);
  const auditService = new AuditTrailServiceDB(db);
  app.use(
    "/api/auth",
    criarRotasAuth({
      authService,
      auditService,
      permissoesService: { listarMatriz: () => [] } as unknown,
    }),
  );
  app.use("/api/relatorios", criarRotasRelatorios({ authService, db }));
  return { app, authService };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return tokenDoCookie(resp);
}

describe("Rotas HTTP de DRE (/api/relatorios/dre)", () => {
  let db: Database.Database;
  let app: express.Express;
  let token: string;

  beforeEach(async () => {
    db = createTestDatabase();

    // Insere usuário de teste diretamente (mesmo padrão de lembretes-agendados-routes.test.ts)
    const hash = await gerarHashSenha(SENHA_PADRAO);
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_contador_1', 'Contador Teste', 'testuser@example.com', ?, 'contador', true, '2026-01-01')`,
    ).run(hash);

    const resultado = await criarAppDeTeste(db);
    app = resultado.app;
    authService = resultado.authService;

    token = await login(app, "testuser@example.com");
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe("GET /api/relatorios/dre — On-The-Fly", () => {
    it("T1: Retorna 400 se dataInicio ou dataFim estiver faltando", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre")
        .set("Authorization", `Bearer ${token}`)
        .query({ dataInicio: "2026-10-01" });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("dataInicio e dataFim obrigatórios");
    });

    it("T2: Retorna 400 se formato de data for inválido", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre")
        .set("Authorization", `Bearer ${token}`)
        .query({ dataInicio: "10/01/2026", dataFim: "31/10/2026" });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("Formato inválido");
    });

    it("T3: Retorna 200 com estrutura DRE válida", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre")
        .set("Authorization", `Bearer ${token}`)
        .query({ dataInicio: "2026-10-01", dataFim: "2026-10-31" });

      expect(resp.status).toBe(200);
      expect(resp.body).toHaveProperty("ano", 2026);
      expect(resp.body).toHaveProperty("mes", 10);
      expect(resp.body).toHaveProperty("lucroLiquido");
    });

    it("T4: Retorna 401 se token ausente", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre")
        .query({ dataInicio: "2026-10-01", dataFim: "2026-10-31" });

      expect(resp.status).toBe(401);
    });
  });

  describe("POST /api/relatorios/dre/calcular — Manual trigger", () => {
    it("T1: Calcula e grava DRE", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 9 });

      expect(resp.status).toBe(200);
      expect(resp.body.sucesso).toBe(true);
      expect(resp.body.dreCalculado).toHaveProperty("mes", 9);
    });

    it("T2: Retorna 400 se mes estiver fora de intervalo", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 13 });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("mes deve estar entre 1 e 12");
    });

    it("T3: Retorna 401 se token ausente", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .send({ ano: 2026, mes: 7 });

      expect(resp.status).toBe(401);
    });

    it("T4: Idempotente — segunda chamada atualiza", async () => {
      let resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 8 });

      expect(resp.status).toBe(200);

      resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 8 });

      expect(resp.status).toBe(200);
    });

    it("T5: Retorna 400 se ano/mes não são números", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: "2026", mes: "7" });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("devem ser números");
    });

    it("T6: Retorna estrutura completa de DRE calculado", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 6 });

      expect(resp.status).toBe(200);
      const dre = resp.body.dreCalculado;
      expect(dre).toHaveProperty("receitaAluguel");
      expect(dre).toHaveProperty("despesaFolhaPagamento");
      expect(dre).toHaveProperty("lucroLiquido");
    });
  });

  describe("GET /api/relatorios/dre/historico — Histórico", () => {
    it("T1: Retorna lista vazia quando sem períodos", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre/historico")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.periodos).toEqual([]);
    });

    it("T2: Retorna períodos em ordem decrescente", async () => {
      await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 5 });

      await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 10 });

      const resp = await request(app)
        .get("/api/relatorios/dre/historico")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.periodos.length).toBe(2);
      expect(resp.body.periodos[0].mes).toBe(10);
    });

    it("T3: Retorna 401 se token ausente", async () => {
      const resp = await request(app).get("/api/relatorios/dre/historico");

      expect(resp.status).toBe(401);
    });
  });

  describe("GET /api/relatorios/dre/:ano/:mes — Busca específica", () => {
    it("T1: Retorna 404 se DRE não existe", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre/2026/12")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(404);
      expect(resp.body.sucesso).toBe(false);
    });

    it("T2: Retorna DRE gravado com dados", async () => {
      await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 6 });

      const resp = await request(app)
        .get("/api/relatorios/dre/2026/6")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.sucesso).toBe(true);
      expect(resp.body.dre.ano).toBe(2026);
      expect(resp.body.dre.mes).toBe(6);
    });

    it("T3: Retorna 400 se ano/mes for inválido", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre/abc/10")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("inválidos");
    });

    it("T4: Retorna 400 se mes > 12", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre/2026/13")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(400);
    });

    it("T5: Retorna 401 se token ausente", async () => {
      const resp = await request(app).get("/api/relatorios/dre/2026/11");

      expect(resp.status).toBe(401);
    });

    it("T6: Retorna dados completos do DRE", async () => {
      await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 3 });

      const resp = await request(app)
        .get("/api/relatorios/dre/2026/3")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      const dre = resp.body.dre;
      expect(typeof dre.lucroLiquido).toBe("number");
    });
  });
});
