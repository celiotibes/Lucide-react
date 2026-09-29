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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, "test-auth-routes.db");
const SENHA_PADRAO = "senha-correta-123";

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");

  let schemaPath = path.join(__dirname, "../../../migrations-phase2-auth.sql");
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), "server/src/migrations-phase2-auth.sql");
  }
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), "src/migrations-phase2-auth.sql");
  }
  db.exec(fs.readFileSync(schemaPath, "utf-8"));
  return db;
}

/** Monta um app Express minimal, só com as rotas de auth — não sobe porta
 * real nem depende de API_KEY/Pluggy (isso é responsabilidade de index.ts,
 * fora do escopo deste teste). */
function criarAppDeTeste(db: Database.Database) {
  const authService = new AuthServiceDB(db);
  const auditService = new AuditTrailServiceDB(db);
  const app = express();
  app.use(express.json());
  app.use("/api/auth", criarRotasAuth({ authService, auditService }));
  return { app, authService, auditService };
}

describe("Rotas HTTP de autenticação (/api/auth)", () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDatabase();
    const hash = await gerarHashSenha(SENHA_PADRAO);
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_titular_1', 'Titular Teste', 'titular@example.com', ?, 'titular', true, '2026-01-01')`,
    ).run(hash);
    ({ app } = criarAppDeTeste(db));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("POST /api/auth/login", () => {
    it("returns a token and the user on correct credentials", async () => {
      const resposta = await request(app)
        .post("/api/auth/login")
        .send({ email: "titular@example.com", senha: SENHA_PADRAO });

      expect(resposta.status).toBe(200);
      expect(resposta.body.token).toBeDefined();
      expect(resposta.body.usuario.email).toBe("titular@example.com");
      expect(resposta.body.usuario.senha_hash).toBeUndefined();
    });

    it("returns the same generic error for a wrong password as for an unknown email", async () => {
      const senhaErrada = await request(app)
        .post("/api/auth/login")
        .send({ email: "titular@example.com", senha: "senha_errada" });
      const emailInexistente = await request(app)
        .post("/api/auth/login")
        .send({ email: "nao-existe@example.com", senha: "qualquer" });

      expect(senhaErrada.status).toBe(401);
      expect(emailInexistente.status).toBe(401);
      expect(senhaErrada.body.erro).toBe(emailInexistente.body.erro);
      // A resposta nunca pode conter o detalhe interno (motivoInterno) —
      // só a mensagem genérica.
      expect(JSON.stringify(senhaErrada.body)).not.toMatch(/nao_encontrado|invalida/);
    });

    it("rejects a request missing email or senha", async () => {
      const resposta = await request(app).post("/api/auth/login").send({ email: "x@example.com" });
      expect(resposta.status).toBe(400);
    });

    it("records both a successful and a failed login attempt in the audit trail", async () => {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "titular@example.com", senha: SENHA_PADRAO });
      await request(app)
        .post("/api/auth/login")
        .send({ email: "titular@example.com", senha: "errada" });
      await request(app)
        .post("/api/auth/login")
        .send({ email: "fantasma@example.com", senha: "errada" });

      const registros = db
        .prepare("SELECT tipo_acao, resultado, usuario_id, motivo_falha FROM auditoria WHERE tipo_acao = 'login' ORDER BY rowid ASC")
        .all() as { tipo_acao: string; resultado: string; usuario_id: string | null; motivo_falha: string | null }[];

      expect(registros.length).toBe(3);
      expect(registros[0].resultado).toBe("sucesso");
      expect(registros[0].usuario_id).toBe("user_titular_1");

      expect(registros[1].resultado).toBe("falha");
      // Login com senha errada para um e-mail que EXISTE: a auditoria sabe
      // qual usuário foi (usuario_id preenchido), mesmo a resposta HTTP
      // nunca revelando isso ao chamador.
      expect(registros[1].usuario_id).toBe("user_titular_1");
      expect(registros[1].motivo_falha).toBe("senha_invalida");

      expect(registros[2].resultado).toBe("falha");
      // E-mail que não existe: nada para vincular, fica null (não uma
      // string inventada) — nunca quebra a FOREIGN KEY.
      expect(registros[2].usuario_id).toBeNull();
      expect(registros[2].motivo_falha).toBe("usuario_nao_encontrado");
    });

    it("blocks further login attempts from the same caller after the rate limit is hit", async () => {
      const tentativas = Array.from({ length: 10 }, () =>
        request(app).post("/api/auth/login").send({ email: "titular@example.com", senha: "errada" }),
      );
      const respostas = await Promise.all(tentativas);

      const bloqueadas = respostas.filter((r) => r.status === 429);
      expect(bloqueadas.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns the authenticated user's data for a valid token", async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "titular@example.com", senha: SENHA_PADRAO });
      const token = login.body.token as string;

      const resposta = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.usuario.email).toBe("titular@example.com");
      expect(resposta.body.usuario.role).toBe("titular");
    });

    it("rejects a missing Authorization header", async () => {
      const resposta = await request(app).get("/api/auth/me");
      expect(resposta.status).toBe(401);
    });

    it("rejects an invalid token", async () => {
      const resposta = await request(app).get("/api/auth/me").set("Authorization", "Bearer token_invalido");
      expect(resposta.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("invalidates the session server-side (stateful logout)", async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "titular@example.com", senha: SENHA_PADRAO });
      const token = login.body.token as string;

      const logout = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${token}`);
      expect(logout.status).toBe(200);

      // O MESMO token não funciona mais depois do logout — não é "só o
      // cliente esquecer o token", a sessão foi revogada no servidor.
      const depoisDoLogout = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
      expect(depoisDoLogout.status).toBe(401);
    });

    it("records the logout in the audit trail", async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "titular@example.com", senha: SENHA_PADRAO });
      await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${login.body.token}`);

      const registro = db.prepare("SELECT * FROM auditoria WHERE tipo_acao = 'logout'").get();
      expect(registro).toBeDefined();
    });
  });

  describe("POST /api/auth/bootstrap", () => {
    it("creates the first titular on a fresh database", async () => {
      const dbVazio = createTestDatabase();
      const { app: appVazio } = criarAppDeTeste(dbVazio);

      const resposta = await request(appVazio)
        .post("/api/auth/bootstrap")
        .send({ nome: "Primeiro Titular", email: "primeiro@example.com", senha: "uma-senha-bem-forte" });

      expect(resposta.status).toBe(201);
      expect(resposta.body.usuario.role).toBe("titular");

      dbVazio.close();
    });

    it("refuses a second bootstrap once a titular already exists", async () => {
      // `db`/`app` do beforeEach já têm um titular seedado.
      const resposta = await request(app)
        .post("/api/auth/bootstrap")
        .send({ nome: "Outro", email: "outro@example.com", senha: "uma-senha-bem-forte" });

      expect(resposta.status).toBe(403);

      const contagem = db.prepare("SELECT COUNT(*) as count FROM usuarios WHERE role = 'titular'").get() as {
        count: number;
      };
      expect(contagem.count).toBe(1);
    });
  });
});
