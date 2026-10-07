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
import { criarRotasCarimbo } from "../carimbo-routes";
import { tokenDoCookie } from "./token-cookie";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, `test-carimbo-${process.pid}.db`);
const SENHA = "senha-correta-123";
const HASH = "b".repeat(64);
const tsrOk = Buffer.from("300730030201003000", "hex");

const fetchOk = (async () => ({ ok: true, status: 200, arrayBuffer: async () => tsrOk.buffer.slice(tsrOk.byteOffset, tsrOk.byteOffset + tsrOk.byteLength) })) as unknown as typeof fetch;
const fetchFalha = (async () => { throw new Error("sem rede"); }) as unknown as typeof fetch;

describe("POST /api/carimbo-tempo", () => {
  let db: Database.Database;
  let authService: AuthServiceDB;
  let auditService: AuditTrailServiceDB;

  const montar = (fetchImpl: typeof fetch) => {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", criarRotasAuth({ authService, auditService, permissoesService: { listarMatriz: () => [] } as unknown }));
    app.use("/api/carimbo-tempo", criarRotasCarimbo({ authService, opcoesTsa: { urls: ["https://tsa.teste/tsr"], fetchImpl } }));
    return app;
  };
  const login = async (app: express.Express, email: string) => {
    const r = await request(app).post("/api/auth/login").send({ email, senha: SENHA });
    expect(r.status).toBe(200);
    return tokenDoCookie(r);
  };

  beforeEach(async () => {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    db = new Database(DB_PATH);
    db.pragma("foreign_keys = ON");
    db.exec(fs.readFileSync(path.join(__dirname, "../../migrations-phase2-auth.sql"), "utf-8"));
    const hash = await gerarHashSenha(SENHA);
    const ins = db.prepare(`INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao) VALUES (?, ?, ?, ?, ?, true, '2026-01-01')`);
    ins.run("u_titular", "Titular", "titular@example.com", hash, "titular");
    ins.run("u_inq", "Inquilino", "inq@example.com", hash, "inquilino");
    authService = new AuthServiceDB(db);
    auditService = new AuditTrailServiceDB(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  });

  it("401 sem sessão", async () => {
    const r = await request(montar(fetchOk)).post("/api/carimbo-tempo").send({ hashHex: HASH });
    expect(r.status).toBe(401);
  });

  it("nega papel externo (inquilino)", async () => {
    const app = montar(fetchOk);
    const token = await login(app, "inq@example.com");
    const r = await request(app).post("/api/carimbo-tempo").set("Cookie", `session_token=${token}`).send({ hashHex: HASH });
    expect([401, 403]).toContain(r.status);
  });

  it("400 para hash inválido", async () => {
    const app = montar(fetchOk);
    const token = await login(app, "titular@example.com");
    const r = await request(app).post("/api/carimbo-tempo").set("Cookie", `session_token=${token}`).send({ hashHex: "curto" });
    expect(r.status).toBe(400);
  });

  it("200 com o carimbo da TSA", async () => {
    const app = montar(fetchOk);
    const token = await login(app, "titular@example.com");
    const r = await request(app).post("/api/carimbo-tempo").set("Cookie", `session_token=${token}`).send({ hashHex: HASH });
    expect(r.status).toBe(200);
    expect(r.body.resultados).toHaveLength(1);
    expect(r.body.resultados[0].tsa_url).toBe("https://tsa.teste/tsr");
  });

  it("502 quando nenhuma TSA responde", async () => {
    const app = montar(fetchFalha);
    const token = await login(app, "titular@example.com");
    const r = await request(app).post("/api/carimbo-tempo").set("Cookie", `session_token=${token}`).send({ hashHex: HASH });
    expect(r.status).toBe(502);
  });
});
