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
import { criarRotasLembretesAgendados } from "../lembretes-agendados-routes";
import { LembretesAgendadosServiceDB } from "../../domain/notificacoes/lembretes-agendados-db";
import { tokenDoCookie } from "./token-cookie.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-lembretes-agendados-routes-${process.pid}.db`);
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
  db.exec(resolverSchema("migrations-phase5-lembretes-agendados.sql"));
  return db;
}

async function criarAppDeTeste(db: Database.Database) {
  const authService = new AuthServiceDB(db);
  const service = new LembretesAgendadosServiceDB(db);
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
  app.use("/api/lembretes-agendados", criarRotasLembretesAgendados({ authService, service }));
  return { app, service };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return tokenDoCookie(resp);
}

function itemValido(overrides: Record<string, unknown> = {}) {
  return {
    origemId: 1,
    tipoLembrete: "no_dia",
    canal: "email",
    destinatario: "locatario@example.com",
    assunto: "Vencimento HOJE",
    mensagem: "Seu aluguel vence hoje.",
    dataDisparoPrevista: "2026-11-10",
    ...overrides,
  };
}

describe("Rotas HTTP de lembretes agendados (/api/lembretes-agendados)", () => {
  let db: Database.Database;
  let app: express.Express;
  let service: LembretesAgendadosServiceDB;

  beforeEach(async () => {
    db = createTestDatabase();
    const hash = await gerarHashSenha(SENHA_PADRAO);
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_titular_1', 'Titular Teste', 'titular@example.com', ?, 'titular', true, '2026-01-01')`,
    ).run(hash);
    ({ app, service } = await criarAppDeTeste(db));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe("POST /sincronizar", () => {
    it("rejects without a valid token", async () => {
      const resp = await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .send({ origemTipo: "lembrete_aluguel", lembretes: [itemValido()] });
      expect(resp.status).toBe(401);
    });

    it("sincroniza com sucesso e grava as linhas", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: [itemValido({ origemId: 1 }), itemValido({ origemId: 2 })] });

      expect(resp.status).toBe(200);
      expect(resp.body).toMatchObject({ sucesso: true, origemTipo: "lembrete_aluguel", total: 2 });
      expect(service.listarTodos()).toHaveLength(2);
    });

    it("segunda sincronização cancela a chave que não aparece mais no payload", async () => {
      const token = await login(app, "titular@example.com");
      await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: [itemValido({ origemId: 1 }), itemValido({ origemId: 2 })] });

      await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: [itemValido({ origemId: 1 })] });

      const todos = service.listarTodos();
      expect(todos.find((l) => l.origemId === 1)?.status).toBe("pendente");
      expect(todos.find((l) => l.origemId === 2)?.status).toBe("cancelado");
    });

    it("rejeita origemTipo inválido", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lixo", lembretes: [] });
      expect(resp.status).toBe(400);
    });

    it("rejeita quando lembretes não é um array", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: "não é array" });
      expect(resp.status).toBe(400);
    });

    it("rejeita item com canal inválido", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: [itemValido({ canal: "fax" })] });
      expect(resp.status).toBe(400);
      expect(service.listarTodos()).toHaveLength(0);
    });

    it("rejeita item com dataDisparoPrevista fora do formato YYYY-MM-DD", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: [itemValido({ dataDisparoPrevista: "10/11/2026" })] });
      expect(resp.status).toBe(400);
    });

    it("aceita array vazio (cancela tudo que estava pendente)", async () => {
      const token = await login(app, "titular@example.com");
      await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: [itemValido()] });

      const resp = await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: [] });

      expect(resp.status).toBe(200);
      expect(service.listarTodos().every((l) => l.status === "cancelado")).toBe(true);
    });
  });

  describe("GET /", () => {
    it("rejects without a valid token", async () => {
      const resp = await request(app).get("/api/lembretes-agendados");
      expect(resp.status).toBe(401);
    });

    it("lista tudo quando nenhum status é informado", async () => {
      const token = await login(app, "titular@example.com");
      await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: [itemValido({ origemId: 1 }), itemValido({ origemId: 2 })] });

      const resp = await request(app).get("/api/lembretes-agendados").set("Authorization", `Bearer ${token}`);
      expect(resp.status).toBe(200);
      expect(resp.body.lembretes).toHaveLength(2);
    });

    it("filtra por status via query string", async () => {
      const token = await login(app, "titular@example.com");
      await request(app)
        .post("/api/lembretes-agendados/sincronizar")
        .set("Authorization", `Bearer ${token}`)
        .send({ origemTipo: "lembrete_aluguel", lembretes: [itemValido({ origemId: 1 }), itemValido({ origemId: 2 })] });
      const [primeiro] = service.listarTodos();
      service.marcarEnviado(primeiro.id);

      const resp = await request(app).get("/api/lembretes-agendados?status=enviado").set("Authorization", `Bearer ${token}`);
      expect(resp.status).toBe(200);
      expect(resp.body.lembretes).toHaveLength(1);
      expect(resp.body.lembretes[0].status).toBe("enviado");
    });

    it("rejeita status inválido na query string", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app).get("/api/lembretes-agendados?status=lixo").set("Authorization", `Bearer ${token}`);
      expect(resp.status).toBe(400);
    });
  });
});
