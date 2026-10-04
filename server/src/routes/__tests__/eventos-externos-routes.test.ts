import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../../domain/auth/auth-service-db";
import { EventosExternosServiceDB } from "../../domain/integracoes/eventos-externos-db";
import { gerarHashSenha } from "../../domain/auth/password";
import { criarRotasAuth } from "../auth-routes";
import { criarRotasEventosExternos } from "../eventos-externos-routes";
import { tokenDoCookie } from "./token-cookie.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-eventos-externos-routes-${process.pid}.db`);
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
  db.exec(resolverSchema("migrations-phase3-integracoes.sql"));
  return db;
}

async function criarAppDeTeste(db: Database.Database) {
  const authService = new AuthServiceDB(db);
  const eventosService = new EventosExternosServiceDB(db);
  const app = express();
  app.use(express.json());
  // auditService/permissoesService não importam para este teste — criarRotasAuth
  // só precisa deles para rotas que não exercitamos aqui (login é o suficiente
  // para obter um token). Passamos stubs mínimos.
  app.use(
    "/api/auth",
    criarRotasAuth({
      authService,
      auditService: { registrarAcao: () => {}, registrarAcessoNegado: () => {} } as unknown,
      permissoesService: { listarMatriz: () => [] } as unknown,
    }),
  );
  app.use("/api/eventos-externos", criarRotasEventosExternos({ authService, eventosService }));
  return { app, eventosService };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return tokenDoCookie(resp);
}

describe("Rotas HTTP do inbox de eventos externos (/api/eventos-externos)", () => {
  let db: Database.Database;
  let app: express.Express;
  let eventosService: EventosExternosServiceDB;

  beforeEach(async () => {
    db = createTestDatabase();
    const hash = await gerarHashSenha(SENHA_PADRAO);
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_titular_1', 'Titular Teste', 'titular@example.com', ?, 'titular', true, '2026-01-01')`,
    ).run(hash);
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_titular_2', 'Outro Titular', 'outro@example.com', ?, 'titular', true, '2026-01-01')`,
    ).run(hash);
    ({ app, eventosService } = await criarAppDeTeste(db));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it("rejects without a valid token", async () => {
    const resp = await request(app).get("/api/eventos-externos/pendentes");
    expect(resp.status).toBe(401);
  });

  it("lists events without an owner as pending for any authenticated user", async () => {
    eventosService.registrarEvento("webhook_asaas", { chargeId: "pay_123", status: "RECEIVED" });
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .get("/api/eventos-externos/pendentes")
      .set("Authorization", `Bearer ${token}`);
    expect(resp.status).toBe(200);
    expect(resp.body.eventos).toHaveLength(1);
    expect(resp.body.eventos[0].payload.chargeId).toBe("pay_123");
  });

  it("filters by tipo", async () => {
    eventosService.registrarEvento("webhook_asaas", { a: 1 });
    eventosService.registrarEvento("captura_telegram", { b: 2 });
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .get("/api/eventos-externos/pendentes?tipo=captura_telegram")
      .set("Authorization", `Bearer ${token}`);
    expect(resp.status).toBe(200);
    expect(resp.body.eventos).toHaveLength(1);
    expect(resp.body.eventos[0].tipo).toBe("captura_telegram");
  });

  it("marks an event consumed and assigns it to the consuming user", async () => {
    const evento = eventosService.registrarEvento("webhook_asaas", { chargeId: "pay_999" });
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .post(`/api/eventos-externos/${evento.id}/consumir`)
      .set("Authorization", `Bearer ${token}`);
    expect(resp.status).toBe(200);

    const pendentes = eventosService.listarPendentes("user_titular_1");
    expect(pendentes).toHaveLength(0);
  });

  it("does not allow a second user to consume an event already claimed by another", async () => {
    const evento = eventosService.registrarEvento("webhook_asaas", { chargeId: "pay_1" });
    eventosService.marcarConsumido(evento.id, "user_titular_1");

    const token2 = await login(app, "outro@example.com");
    const resp = await request(app)
      .post(`/api/eventos-externos/${evento.id}/consumir`)
      .set("Authorization", `Bearer ${token2}`);
    expect(resp.status).toBe(404);
  });

  it("rejects an invalid tipo filter", async () => {
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .get("/api/eventos-externos/pendentes?tipo=lixo")
      .set("Authorization", `Bearer ${token}`);
    expect(resp.status).toBe(400);
  });
});
