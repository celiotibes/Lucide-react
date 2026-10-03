import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../../domain/auth/auth-service-db";
import { AuditTrailServiceDB } from "../../domain/auth/audit-trail-db";
import { PermissoesServiceDB } from "../../domain/auth/permissoes-db";
import { matrizPadrao } from "../../domain/auth/permissoes";
import { gerarHashSenha } from "../../domain/auth/password";
import { criarRotasAuth } from "../auth-routes";
import { tokenDoCookie } from "./token-cookie.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-auth-routes-${process.pid}.db`);
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

/** Mesma semente padrão que `database-init.ts` grava num banco novo — ver
 * nota equivalente em permissoes-db.test.ts. */
function seedMatrizPadrao(db: Database.Database): void {
  const inserir = db.prepare(
    `INSERT OR IGNORE INTO permissoes_papel (papel, funcao, habilitado, limite_valor, atualizado_em, atualizado_por)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)`,
  );
  for (const e of matrizPadrao()) {
    inserir.run(e.papel, e.funcao, e.habilitado ? 1 : 0, e.limite_valor);
  }
}

/** Monta um app Express minimal, só com as rotas de auth — não sobe porta
 * real nem depende de API_KEY/Pluggy (isso é responsabilidade de index.ts,
 * fora do escopo deste teste). */
function criarAppDeTeste(db: Database.Database) {
  const authService = new AuthServiceDB(db);
  const auditService = new AuditTrailServiceDB(db);
  const permissoesService = new PermissoesServiceDB(db);
  const app = express();
  app.use(express.json());
  app.use("/api/auth", criarRotasAuth({ authService, auditService, permissoesService }));
  return { app, authService, auditService, permissoesService };
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
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_contador_1', 'Contador Teste', 'contador@example.com', ?, 'contador', true, '2026-01-01')`,
    ).run(hash);
    seedMatrizPadrao(db);
    ({ app } = criarAppDeTeste(db));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("POST /api/auth/login", () => {
    it("sets an httpOnly session cookie, never returns the token in the body, and the cookie authenticates", async () => {
      const resposta = await request(app)
        .post("/api/auth/login")
        .send({ email: "titular@example.com", senha: SENHA_PADRAO });

      expect(resposta.status).toBe(200);
      expect(resposta.body.token).toBeUndefined(); // SEC-015: token só no cookie httpOnly
      const setCookie = ([] as string[]).concat(resposta.headers["set-cookie"] ?? []);
      expect(setCookie.find((c) => c.startsWith("session_token="))).toMatch(/HttpOnly/i);
      const me = await request(app).get("/api/auth/me").set("Cookie", `session_token=${tokenDoCookie(resposta)}`);
      expect(me.status).toBe(200);
      expect(me.body.usuario.email).toBe("titular@example.com");
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
      const token = tokenDoCookie(login);

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
      const token = tokenDoCookie(login);

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
      await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${tokenDoCookie(login)}`);

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

  /** Token de sessão para o contador seedado no beforeEach — usado nos
   * testes abaixo para exercitar a rejeição de quem não é titular/administrador. */
  async function tokenContador(): Promise<string> {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "contador@example.com", senha: SENHA_PADRAO });
    return tokenDoCookie(login);
  }

  async function tokenTitular(): Promise<string> {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "titular@example.com", senha: SENHA_PADRAO });
    return tokenDoCookie(login);
  }

  describe("GET /api/auth/permissoes", () => {
    it("returns the full matrix, the function catalog and the valid roles for titular", async () => {
      const token = await tokenTitular();
      const resposta = await request(app).get("/api/auth/permissoes").set("Authorization", `Bearer ${token}`);

      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body.matriz)).toBe(true);
      expect(resposta.body.matriz.length).toBeGreaterThan(0);
      expect(Array.isArray(resposta.body.catalogoFuncoes)).toBe(true);
      expect(resposta.body.papeis).toContain("administrador");
      expect(resposta.body.papeis).toContain("economista");
    });

    it("rejects a contador (not titular/administrador)", async () => {
      const token = await tokenContador();
      const resposta = await request(app).get("/api/auth/permissoes").set("Authorization", `Bearer ${token}`);
      expect(resposta.status).toBe(403);
    });

    it("rejects a request without a valid session token", async () => {
      const resposta = await request(app).get("/api/auth/permissoes");
      expect(resposta.status).toBe(401);
    });

    it("records the refusal in the audit trail as acesso_negado", async () => {
      const token = await tokenContador();
      await request(app).get("/api/auth/permissoes").set("Authorization", `Bearer ${token}`);

      const registro = db.prepare("SELECT * FROM auditoria WHERE tipo_acao = 'acesso_negado'").get();
      expect(registro).toBeDefined();
    });
  });

  describe("PUT /api/auth/permissoes", () => {
    it("updates the matrix for titular", async () => {
      const token = await tokenTitular();
      const resposta = await request(app)
        .put("/api/auth/permissoes")
        .set("Authorization", `Bearer ${token}`)
        .send({ entradas: [{ papel: "perito", funcao: "ver_indicadores_gestao", habilitado: true, limite_valor: null }] });

      expect(resposta.status).toBe(200);
      const entrada = (resposta.body.matriz as { papel: string; funcao: string; habilitado: boolean }[]).find(
        (e) => e.papel === "perito" && e.funcao === "ver_indicadores_gestao",
      );
      expect(entrada?.habilitado).toBe(true);
    });

    it("rejects a contador (not titular/administrador)", async () => {
      const token = await tokenContador();
      const resposta = await request(app)
        .put("/api/auth/permissoes")
        .set("Authorization", `Bearer ${token}`)
        .send({ entradas: [{ papel: "perito", funcao: "ver_indicadores_gestao", habilitado: true, limite_valor: null }] });
      expect(resposta.status).toBe(403);
    });

    it("refuses to disable gerenciar_permissoes for titular (self-lock protection)", async () => {
      const token = await tokenTitular();
      const resposta = await request(app)
        .put("/api/auth/permissoes")
        .set("Authorization", `Bearer ${token}`)
        .send({ entradas: [{ papel: "titular", funcao: "gerenciar_permissoes", habilitado: false, limite_valor: null }] });

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toContain("gerenciar_permissoes");
    });

    it("refuses to disable gerenciar_permissoes for administrador too", async () => {
      const token = await tokenTitular();
      const resposta = await request(app)
        .put("/api/auth/permissoes")
        .set("Authorization", `Bearer ${token}`)
        .send({ entradas: [{ papel: "administrador", funcao: "gerenciar_permissoes", habilitado: false, limite_valor: null }] });

      expect(resposta.status).toBe(400);
    });

    it("rejects an invalid entrada with a 400 and writes nothing", async () => {
      const token = await tokenTitular();
      const resposta = await request(app)
        .put("/api/auth/permissoes")
        .set("Authorization", `Bearer ${token}`)
        .send({ entradas: [{ papel: "papel-inexistente", funcao: "importar_documentos", habilitado: true }] });

      expect(resposta.status).toBe(400);
    });

    it("records a successful update in the audit trail with old and new values", async () => {
      const token = await tokenTitular();
      await request(app)
        .put("/api/auth/permissoes")
        .set("Authorization", `Bearer ${token}`)
        .send({ entradas: [{ papel: "advogado", funcao: "ver_indicadores_gestao", habilitado: true, limite_valor: null }] });

      const registro = db
        .prepare("SELECT * FROM auditoria WHERE tipo_acao = 'atualizar_permissoes' AND resultado = 'sucesso'")
        .get() as { valores_antigos: string; valores_novos: string } | undefined;
      expect(registro).toBeDefined();
      expect(JSON.parse(registro!.valores_novos).entradas[0].habilitado).toBe(true);
    });
  });

  describe("POST /api/auth/usuarios", () => {
    it("creates a user with a new role (administrador) when called by titular", async () => {
      const token = await tokenTitular();
      const resposta = await request(app)
        .post("/api/auth/usuarios")
        .set("Authorization", `Bearer ${token}`)
        .send({ nome: "Nova Administradora", email: "nova-admin@example.com", senha: "uma-senha-forte-123", role: "administrador" });

      expect(resposta.status).toBe(201);
      expect(resposta.body.usuario.role).toBe("administrador");
      expect(resposta.body.usuario.senha_hash).toBeUndefined();

      // A conta criada consegue logar de verdade com a senha informada.
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "nova-admin@example.com", senha: "uma-senha-forte-123" });
      expect(login.status).toBe(200);
    });

    it("creates a user with role economista", async () => {
      const token = await tokenTitular();
      const resposta = await request(app)
        .post("/api/auth/usuarios")
        .set("Authorization", `Bearer ${token}`)
        .send({ nome: "Nova Economista", email: "nova-economista@example.com", senha: "uma-senha-forte-123", role: "economista" });

      expect(resposta.status).toBe(201);
      expect(resposta.body.usuario.role).toBe("economista");
    });

    it("rejects a contador (not titular/administrador)", async () => {
      const token = await tokenContador();
      const resposta = await request(app)
        .post("/api/auth/usuarios")
        .set("Authorization", `Bearer ${token}`)
        .send({ nome: "X", email: "x@example.com", senha: "uma-senha-forte-123", role: "perito" });
      expect(resposta.status).toBe(403);
    });

    it("rejects an invalid role", async () => {
      const token = await tokenTitular();
      const resposta = await request(app)
        .post("/api/auth/usuarios")
        .set("Authorization", `Bearer ${token}`)
        .send({ nome: "X", email: "x2@example.com", senha: "uma-senha-forte-123", role: "estagiario" });
      expect(resposta.status).toBe(400);
    });

    it("rejects a password shorter than 8 characters", async () => {
      const token = await tokenTitular();
      const resposta = await request(app)
        .post("/api/auth/usuarios")
        .set("Authorization", `Bearer ${token}`)
        .send({ nome: "X", email: "x3@example.com", senha: "curta", role: "perito" });
      expect(resposta.status).toBe(400);
    });

    it("rejects a duplicate email with a friendly message", async () => {
      const token = await tokenTitular();
      const resposta = await request(app)
        .post("/api/auth/usuarios")
        .set("Authorization", `Bearer ${token}`)
        .send({ nome: "Duplicado", email: "contador@example.com", senha: "uma-senha-forte-123", role: "perito" });
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toContain("Já existe um usuário");
    });

    it("records the creation in the audit trail", async () => {
      const token = await tokenTitular();
      await request(app)
        .post("/api/auth/usuarios")
        .set("Authorization", `Bearer ${token}`)
        .send({ nome: "Novo Advogado", email: "novo-advogado@example.com", senha: "uma-senha-forte-123", role: "advogado" });

      const registro = db
        .prepare("SELECT * FROM auditoria WHERE tipo_acao = 'criar_usuario' AND resultado = 'sucesso' AND recurso_id != 'user_titular_1'")
        .get();
      expect(registro).toBeDefined();
    });
  });
});
