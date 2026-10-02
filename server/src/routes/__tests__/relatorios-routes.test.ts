import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../../domain/auth/auth-service-db";
import { gerarHashSenha } from "../../domain/auth/password";
import { criarRotasAuth } from "../auth-routes";
import { criarRotasRelatorios } from "../relatorios-routes";
import { gravarDREPeriodo, calcularDREPeriodo } from "../../domain/relatorios/dre";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-relatorios-routes-${process.pid}.db`);
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
  const authService = new AuthServiceDB(db);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/auth",
    criarRotasAuth({
      authService,
      auditService: { registrarAcao: () => {}, registrarAcessoNegado: () => {} } as any,
      permissoesService: { listarMatriz: () => [] } as any,
    }),
  );
  app.use("/api/relatorios", criarRotasRelatorios({ authService, db }));
  return { app, authService };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return resp.body.token;
}

describe("Rotas HTTP de Relatórios (/api/relatorios)", () => {
  let db: Database.Database;
  let app: express.Express;
  let authService: AuthServiceDB;
  let token: string;

  beforeEach(async () => {
    db = createTestDatabase();
    const resultado = await criarAppDeTeste(db);
    app = resultado.app;
    authService = resultado.authService;

    // Cria usuário de teste e faz login
    const senhaHash = await gerarHashSenha(SENHA_PADRAO);
    authService.criarUsuario("testuser@example.com", senhaHash, "gestor");
    token = await login(app, "testuser@example.com");
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe("GET /api/relatorios/dre — Opção A: On-The-Fly (real-time)", () => {
    it("T1: Retorna 400 se dataInicio ou dataFim estiver faltando", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre")
        .set("Authorization", `Bearer ${token}`)
        .query({ dataInicio: "2026-10-01" });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("dataInicio e dataFim obrigatórios");
    });

    it("T2: Retorna 400 se formato de data for inválido (não YYYY-MM-DD)", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre")
        .set("Authorization", `Bearer ${token}`)
        .query({ dataInicio: "10/01/2026", dataFim: "31/10/2026" });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("Formato inválido");
    });

    it("T3: Retorna 200 com estrutura DRE válida para período válido", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre")
        .set("Authorization", `Bearer ${token}`)
        .query({ dataInicio: "2026-10-01", dataFim: "2026-10-31" });

      expect(resp.status).toBe(200);
      expect(resp.body).toHaveProperty("ano", 2026);
      expect(resp.body).toHaveProperty("mes", 10);
      expect(resp.body).toHaveProperty("receitaAluguel");
      expect(resp.body).toHaveProperty("lucroBruto");
      expect(resp.body).toHaveProperty("lucroLiquido");
    });

    it("T4: Retorna 401 se token ausente ou inválido", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre")
        .query({ dataInicio: "2026-10-01", dataFim: "2026-10-31" });

      expect(resp.status).toBe(401);
    });
  });

  describe("POST /api/relatorios/dre/calcular — Opção B: Manual trigger", () => {
    it("T1: Calcula e grava DRE para período específico (ano/mes)", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 9 });

      expect(resp.status).toBe(200);
      expect(resp.body.sucesso).toBe(true);
      expect(resp.body.dreCalculado).toHaveProperty("ano", 2026);
      expect(resp.body.dreCalculado).toHaveProperty("mes", 9);
      expect(resp.body.mensagem).toContain("calculado e gravado");
    });

    it("T2: Retorna 400 se ano ou mes estiver faltando", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026 });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("ano e mes obrigatórios");
    });

    it("T3: Retorna 400 se mes estiver fora do intervalo 1-12", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 13 });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("mes deve estar entre 1 e 12");
    });

    it("T4: Idempotente — segunda chamada para mesmo ano/mes atualiza registro", async () => {
      // Primeira chamada
      let resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 8 });

      expect(resp.status).toBe(200);
      const dre1 = resp.body.dreCalculado;

      // Segunda chamada (idempotente)
      resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 8 });

      expect(resp.status).toBe(200);
      const dre2 = resp.body.dreCalculado;

      // Ambas devem ter ano/mes iguais (mesma linha atualizada, não duplicada)
      expect(dre2.ano).toBe(dre1.ano);
      expect(dre2.mes).toBe(dre1.mes);
    });

    it("T5: Retorna 401 se token ausente", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .send({ ano: 2026, mes: 7 });

      expect(resp.status).toBe(401);
    });

    it("T6: Retorna 400 se ano/mes não são números", async () => {
      const resp = await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: "2026", mes: "7" });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("devem ser números");
    });
  });

  describe("GET /api/relatorios/dre/historico — Histórico de períodos", () => {
    it("T1: Retorna lista vazia quando não há períodos gravados", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre/historico")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.periodos).toEqual([]);
    });

    it("T2: Retorna períodos gravados em ordem decrescente", async () => {
      // Grava 2 períodos
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
      // Mais recente primeiro
      expect(resp.body.periodos[0].mes).toBe(10);
      expect(resp.body.periodos[1].mes).toBe(5);
    });

    it("T3: Retorna 401 se token ausente", async () => {
      const resp = await request(app).get("/api/relatorios/dre/historico");

      expect(resp.status).toBe(401);
    });
  });

  describe("GET /api/relatorios/dre/:ano/:mes — Busca específica", () => {
    it("T1: Retorna 404 se DRE não foi gravado", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre/2026/12")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(404);
      expect(resp.body.sucesso).toBe(false);
      expect(resp.body.mensagem).toContain("Não encontrado");
    });

    it("T2: Retorna DRE gravado com dados corretos", async () => {
      // Primeiro grava
      await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 6 });

      // Depois busca
      const resp = await request(app)
        .get("/api/relatorios/dre/2026/6")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.sucesso).toBe(true);
      expect(resp.body.dre.ano).toBe(2026);
      expect(resp.body.dre.mes).toBe(6);
      expect(resp.body.dre).toHaveProperty("receitaAluguel");
      expect(resp.body.dre).toHaveProperty("lucroLiquido");
    });

    it("T3: Retorna 400 se ano ou mes for inválido (não número)", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre/abc/10")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("ano e mes inválidos");
    });

    it("T4: Retorna 400 se mes estiver fora do intervalo 1-12", async () => {
      const resp = await request(app)
        .get("/api/relatorios/dre/2026/13")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("inválidos");
    });

    it("T5: Retorna 401 se token ausente", async () => {
      const resp = await request(app).get("/api/relatorios/dre/2026/11");

      expect(resp.status).toBe(401);
    });

    it("T6: Retorna dados completos do DRE (receita, despesa, lucro)", async () => {
      await request(app)
        .post("/api/relatorios/dre/calcular")
        .set("Authorization", `Bearer ${token}`)
        .send({ ano: 2026, mes: 3 });

      const resp = await request(app)
        .get("/api/relatorios/dre/2026/3")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      const dre = resp.body.dre;
      expect(dre).toHaveProperty("receitaAluguel");
      expect(dre).toHaveProperty("receitaHonorario");
      expect(dre).toHaveProperty("despesaFolhaPagamento");
      expect(dre).toHaveProperty("despesaCondominio");
      expect(dre).toHaveProperty("lucroLiquido");
      expect(typeof dre.lucroLiquido).toBe("number");
    });
  });
});
