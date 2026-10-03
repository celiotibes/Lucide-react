import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../domain/auth/auth-service-db";
import { gerarHashSenha } from "../domain/auth/password";
import { criarRotasAuth, criarMiddlewareAutenticacao } from "../routes/auth-routes";
import { criarExigirPosse } from "../middleware/posse-recurso";
import { tokenDoCookie } from "../routes/__tests__/token-cookie.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-posse-${process.pid}.db`);
const SENHA_PADRAO = "senha-correta-123";

function resolverSchema(nomeArquivo: string): string {
  const candidatos = [
    path.join(__dirname, `../../${nomeArquivo}`),
    path.join(process.cwd(), `server/src/${nomeArquivo}`),
    path.join(process.cwd(), `src/${nomeArquivo}`),
  ];
  const encontrado = candidatos.find((p) => fs.existsSync(p));
  if (!encontrado) throw new Error(`Schema não encontrado: ${nomeArquivo}`);
  return fs.readFileSync(encontrado, "utf-8");
}

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");
  db.exec(resolverSchema("migrations-phase2-auth.sql"));
  db.exec(resolverSchema("migrations-phase13-acl-recursos.sql"));
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

  const exigirPosse = criarExigirPosse(db);

  const exigirAutenticacao = criarMiddlewareAutenticacao(authService, { permitirPapeisExternos: true });
  app.get("/api/teste/cobranca/:id", exigirAutenticacao, exigirPosse("cobranca", "id"), (_req: express.Request, res: express.Response) => {
    res.json({ ok: true });
  });

  return { app, db };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return tokenDoCookie(resp);
}

describe("Middleware de Posse de Recurso", () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDatabase();
    const hash = await gerarHashSenha(SENHA_PADRAO);

    // Criar usuário titular (papel interno)
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_titular_1', 'Titular Teste', 'titular@example.com', ?, 'titular', true, '2026-01-01')`,
    ).run(hash);

    // Criar usuário inquilino (papel externo)
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_inquilino_1', 'Inquilino Teste', 'inquilino@example.com', ?, 'inquilino', true, '2026-01-01')`,
    ).run(hash);

    ({ app, db } = await criarAppDeTeste(db));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe("Papel Interno (Titular)", () => {
    it("permite acesso sem necessidade de ACL", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .get("/api/teste/cobranca/cob_123")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.ok).toBe(true);
    });
  });

  describe("Papel Externo (Inquilino)", () => {
    it("nega acesso sem ACL — retorna 404", async () => {
      const token = await login(app, "inquilino@example.com");
      const resp = await request(app)
        .get("/api/teste/cobranca/cob_123")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(404);
      expect(resp.body.erro).toContain("Recurso não encontrado");
    });

    it("permite acesso com ACL ativa", async () => {
      const cobrancaId = "cob_123";

      // Conceder acesso
      db.prepare(
        `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por, concedido_em)
         VALUES (?, 'cobranca', ?, 'user_titular_1', datetime('now'))`,
      ).run("user_inquilino_1", cobrancaId);

      const token = await login(app, "inquilino@example.com");
      const resp = await request(app)
        .get("/api/teste/cobranca/cob_123")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.ok).toBe(true);
    });

    it("nega acesso se ACL foi revogada", async () => {
      const cobrancaId = "cob_123";

      // Conceder e depois revogar
      db.prepare(
        `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por, concedido_em, revogado_em)
         VALUES (?, 'cobranca', ?, 'user_titular_1', datetime('now'), datetime('now'))`,
      ).run("user_inquilino_1", cobrancaId);

      const token = await login(app, "inquilino@example.com");
      const resp = await request(app)
        .get("/api/teste/cobranca/cob_123")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(404);
      expect(resp.body.erro).toContain("Recurso não encontrado");
    });

    it("nega acesso de outro inquilino mesmo com ACL dele", async () => {
      const cobrancaId = "cob_123";

      // Conceder a inquilino_1
      db.prepare(
        `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por, concedido_em)
         VALUES (?, 'cobranca', ?, 'user_titular_1', datetime('now'))`,
      ).run("user_inquilino_1", cobrancaId);

      // Criar outro inquilino
      const hash = await gerarHashSenha(SENHA_PADRAO);
      db.prepare(
        `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
         VALUES ('user_inquilino_2', 'Inquilino 2', 'inquilino2@example.com', ?, 'inquilino', true, '2026-01-01')`,
      ).run(hash);

      const token = await login(app, "inquilino2@example.com");
      const resp = await request(app)
        .get("/api/teste/cobranca/cob_123")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(404);
      expect(resp.body.erro).toContain("Recurso não encontrado");
    });
  });

  describe("Autenticação", () => {
    it("rejeita requisição sem token — retorna 401", async () => {
      const resp = await request(app).get("/api/teste/cobranca/cob_123");

      expect(resp.status).toBe(401);
    });
  });
});
