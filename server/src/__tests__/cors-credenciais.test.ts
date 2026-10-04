/**
 * CORS com credenciais por allowlist (CORS_ORIGINS), CSRF cross-origin e política do cookie de
 * sessão (SameSite=Lax por padrão; None+Secure só com COOKIE_CROSS_SITE=true).
 *
 * Monta o MESMO encadeamento do index.ts (cors -> json -> sessão -> csurf -> XSRF-TOKEN ->
 * /api/auth) com os módulos reais, sem subir porta nem o resto do servidor.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../domain/auth/auth-service-db";
import { AuditTrailServiceDB } from "../domain/auth/audit-trail-db";
import { PermissoesServiceDB } from "../domain/auth/permissoes-db";
import { gerarHashSenha } from "../domain/auth/password";
import { criarRotasAuth } from "../routes/auth-routes";
import {
  criarMiddlewareSession,
  criarMiddlewareCSRF,
  adicionarTokenCSRFAoResponse,
  erroCSRF,
} from "../middleware/csrf-middleware";
import {
  criarMiddlewareCors,
  interpretarOrigensCors,
  atributosCookieSessao,
} from "../middleware/cors-middleware";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SENHA = "senha-correta-123";
const ORIGEM_OK = "https://app.exemplo.com";
const ORIGEM_FORA = "https://malicioso.example";

function criarBanco(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  let esquema = path.join(__dirname, "../migrations-phase2-auth.sql");
  if (!fs.existsSync(esquema)) esquema = path.join(process.cwd(), "server/src/migrations-phase2-auth.sql");
  db.exec(fs.readFileSync(esquema, "utf-8"));
  return db;
}

async function criarApp(origens: string[]) {
  const db = criarBanco();
  const hash = await gerarHashSenha(SENHA);
  db.prepare(
    `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
     VALUES ('u1', 'Titular', 'titular@example.com', ?, 'titular', true, '2026-01-01')`,
  ).run(hash);
  const app = express();
  app.set("trust proxy", 1); // permite simular TLS terminado no proxy (X-Forwarded-Proto)
  app.use(criarMiddlewareCors(origens));
  app.use(express.json());
  app.use(criarMiddlewareSession("segredo-de-teste"));
  app.use(criarMiddlewareCSRF());
  app.use(adicionarTokenCSRFAoResponse);
  app.use(
    "/api/auth",
    criarRotasAuth({
      authService: new AuthServiceDB(db),
      auditService: new AuditTrailServiceDB(db),
      permissoesService: new PermissoesServiceDB(db),
    }),
  );
  app.use(erroCSRF);
  return { app, db };
}

const cookiesDe = (resp: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat((resp.headers["set-cookie"] as string[] | string | undefined) ?? []);

describe("interpretarOrigensCors", () => {
  it("normaliza, remove duplicatas e descarta '*' e lixo (nunca vira 'liberar tudo')", () => {
    const { origens, descartadas } = interpretarOrigensCors(
      " https://a.com/ , https://a.com, *, ftp://x.com, nao-e-url, ,http://localhost:5173 ",
    );
    expect(origens).toEqual(["https://a.com", "http://localhost:5173"]);
    expect(descartadas).toEqual(["*", "ftp://x.com", "nao-e-url"]);
  });

  it("sem valor devolve lista vazia", () => {
    expect(interpretarOrigensCors(undefined).origens).toEqual([]);
    expect(interpretarOrigensCors("").origens).toEqual([]);
  });
});

describe("CORS com credenciais (allowlist CORS_ORIGINS)", () => {
  let db: Database.Database;
  afterEach(() => {
    db?.close();
  });

  it("origem permitida recebe a origem refletida, Allow-Credentials e expõe XSRF-TOKEN", async () => {
    const criado = await criarApp([ORIGEM_OK]);
    db = criado.db;
    const resp = await request(criado.app).get("/api/auth/me").set("Origin", ORIGEM_OK);
    expect(resp.headers["access-control-allow-origin"]).toBe(ORIGEM_OK);
    expect(resp.headers["access-control-allow-credentials"]).toBe("true");
    expect(resp.headers["access-control-expose-headers"]).toMatch(/XSRF-TOKEN/i);
    expect(resp.headers["vary"]).toMatch(/Origin/i);
    // O token CSRF chega mesmo na resposta 401 (é assim que o cliente o obtém antes do login).
    expect(resp.status).toBe(401);
    expect(String(resp.headers["xsrf-token"] ?? "").length).toBeGreaterThan(10);
  });

  it("origem fora da lista não recebe cabeçalhos CORS (nem '*')", async () => {
    const criado = await criarApp([ORIGEM_OK]);
    db = criado.db;
    const resp = await request(criado.app).get("/api/auth/me").set("Origin", ORIGEM_FORA);
    expect(resp.headers["access-control-allow-origin"]).toBeUndefined();
    expect(resp.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("sem CORS_ORIGINS (padrão mesmo domínio) nenhuma origem recebe cabeçalhos CORS", async () => {
    const criado = await criarApp([]);
    db = criado.db;
    const resp = await request(criado.app).get("/api/auth/me").set("Origin", ORIGEM_OK);
    expect(Object.keys(resp.headers).filter((h) => h.startsWith("access-control-"))).toEqual([]);
    const pre = await request(criado.app)
      .options("/api/auth/login")
      .set("Origin", ORIGEM_OK)
      .set("Access-Control-Request-Method", "POST");
    expect(pre.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("preflight de origem permitida: 204 com métodos, X-XSRF-TOKEN permitido e credenciais, sem exigir cookie/CSRF", async () => {
    const criado = await criarApp([ORIGEM_OK]);
    db = criado.db;
    const resp = await request(criado.app)
      .options("/api/auth/login")
      .set("Origin", ORIGEM_OK)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-xsrf-token");
    expect(resp.status).toBe(204);
    expect(resp.headers["access-control-allow-origin"]).toBe(ORIGEM_OK);
    expect(resp.headers["access-control-allow-credentials"]).toBe("true");
    expect(resp.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(resp.headers["access-control-allow-headers"]).toMatch(/X-XSRF-TOKEN/i);
    expect(resp.headers["access-control-allow-headers"]).toMatch(/X-CSRF-Token/i);
  });

  it("preflight de origem fora da lista não ganha permissão alguma", async () => {
    const criado = await criarApp([ORIGEM_OK]);
    db = criado.db;
    const resp = await request(criado.app)
      .options("/api/auth/login")
      .set("Origin", ORIGEM_FORA)
      .set("Access-Control-Request-Method", "POST");
    expect(resp.headers["access-control-allow-origin"]).toBeUndefined();
    expect(resp.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(resp.headers["access-control-allow-headers"]).toBeUndefined();
  });

  it("fluxo cross-origin completo: token CSRF no GET, login com X-XSRF-TOKEN e sessão via cookie", async () => {
    const criado = await criarApp([ORIGEM_OK]);
    db = criado.db;
    const agente = request.agent(criado.app);

    const get = await agente.get("/api/auth/me").set("Origin", ORIGEM_OK);
    const token = String(get.headers["xsrf-token"]);

    const semToken = await agente
      .post("/api/auth/login")
      .set("Origin", ORIGEM_OK)
      .send({ email: "titular@example.com", senha: SENHA });
    expect(semToken.status).toBe(403);

    const login = await agente
      .post("/api/auth/login")
      .set("Origin", ORIGEM_OK)
      .set("X-XSRF-TOKEN", token)
      .send({ email: "titular@example.com", senha: SENHA });
    expect(login.status).toBe(200);
    expect(login.headers["access-control-allow-credentials"]).toBe("true");

    const me = await agente.get("/api/auth/me").set("Origin", ORIGEM_OK);
    expect(me.status).toBe(200);
    expect(me.body.usuario.email).toBe("titular@example.com");
    expect(me.body.usuario.senha_hash).toBeUndefined();
  });
});

describe("cookie de sessão: SameSite conforme a topologia", () => {
  let db: Database.Database;
  const original = process.env.COOKIE_CROSS_SITE;
  afterEach(() => {
    db?.close();
    if (original === undefined) delete process.env.COOKIE_CROSS_SITE;
    else process.env.COOKIE_CROSS_SITE = original;
  });
  beforeEach(() => {
    delete process.env.COOKIE_CROSS_SITE;
  });

  /** Carrega o cookie de sessão à mão (como o navegador faria): o cookiejar do superagent não
   * reenvia cookies Secure por HTTP simples, e aqui o TLS é só simulado via X-Forwarded-Proto. */
  async function login(app: express.Express, extraHeaders: Record<string, string> = {}) {
    const get = await request(app).get("/api/auth/me").set(extraHeaders);
    const cookie = cookiesDe(get).map((c) => c.split(";")[0]).join("; ");
    return request(app)
      .post("/api/auth/login")
      .set(extraHeaders)
      .set("Cookie", cookie)
      .set("X-XSRF-TOKEN", String(get.headers["xsrf-token"]))
      .send({ email: "titular@example.com", senha: SENHA });
  }

  it("padrão (mesmo domínio): SameSite=Lax, HttpOnly, sem SameSite=None", async () => {
    const criado = await criarApp([]);
    db = criado.db;
    const resp = await login(criado.app);
    expect(resp.status).toBe(200);
    const sessao = cookiesDe(resp).find((c) => c.startsWith("session_token="))!;
    expect(sessao).toMatch(/HttpOnly/i);
    expect(sessao).toMatch(/SameSite=Lax/i);
    expect(sessao).not.toMatch(/SameSite=None/i);
    expect(cookiesDe(resp).join("\n")).not.toMatch(/SameSite=None/i);
  });

  it("COOKIE_CROSS_SITE ausente ou diferente de 'true' mantém Lax, mesmo com CORS_ORIGINS", async () => {
    process.env.COOKIE_CROSS_SITE = "false";
    const criado = await criarApp([ORIGEM_OK]);
    db = criado.db;
    const resp = await login(criado.app, { Origin: ORIGEM_OK });
    expect(cookiesDe(resp).find((c) => c.startsWith("session_token="))).toMatch(/SameSite=Lax/i);
  });

  it("COOKIE_CROSS_SITE=true: SameSite=None; Secure em todos os cookies de sessão/CSRF", async () => {
    process.env.COOKIE_CROSS_SITE = "true";
    const criado = await criarApp([ORIGEM_OK]);
    db = criado.db;
    const resp = await login(criado.app, { Origin: ORIGEM_OK, "X-Forwarded-Proto": "https" });
    expect(resp.status).toBe(200);
    const cookies = cookiesDe(resp);
    for (const prefixo of ["session_token=", "csrf_token="]) {
      const c = cookies.find((x) => x.startsWith(prefixo))!;
      expect(c).toMatch(/SameSite=None/i);
      expect(c).toMatch(/Secure/i);
    }
    expect(cookies.find((c) => c.startsWith("session_token="))).toMatch(/HttpOnly/i);
  });

  it("atributosCookieSessao: Secure só em produção no modo mesmo domínio; sempre Secure no cross-site", () => {
    expect(atributosCookieSessao({ NODE_ENV: "production" })).toEqual({ sameSite: "lax", secure: true });
    expect(atributosCookieSessao({ NODE_ENV: "development" })).toEqual({ sameSite: "lax", secure: false });
    expect(atributosCookieSessao({ NODE_ENV: "development", COOKIE_CROSS_SITE: "true" })).toEqual({
      sameSite: "none",
      secure: true,
    });
  });
});
