import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
import { criarRotasAcl } from "../acl-routes";
import { tokenDoCookie } from "./token-cookie.js";

// Mock types for auth route dependencies
interface MockPermissoesService {
  listarMatriz: () => unknown[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-acl-routes-${process.pid}.db`);
const SENHA_PADRAO = "senha-correta-123";

function resolverSchema(nomeArquivo: string): string {
  const candidatos = [
    path.join(__dirname, `../../../${nomeArquivo}`),
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
  const auditService = new AuditTrailServiceDB(db);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/auth",
    criarRotasAuth({
      authService,
      auditService,
      permissoesService: { listarMatriz: () => [] } as MockPermissoesService,
    }),
  );
  app.use("/api/acl", criarRotasAcl({ authService, auditService, db }));
  return { app, auditService };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return tokenDoCookie(resp);
}

describe("Rotas de ACL (/api/acl)", () => {
  let db: Database.Database;
  let app: express.Express;
  let auditService: AuditTrailServiceDB;

  beforeEach(async () => {
    db = createTestDatabase();
    const hash = await gerarHashSenha(SENHA_PADRAO);

    // Criar usuário titular
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_titular_1', 'Titular Teste', 'titular@example.com', ?, 'titular', true, '2026-01-01')`,
    ).run(hash);

    // Criar usuário administrador
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_admin_1', 'Admin Teste', 'admin@example.com', ?, 'administrador', true, '2026-01-01')`,
    ).run(hash);

    // Criar usuário contador (papel interno — não pode gerenciar ACL)
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_contador_1', 'Contador Teste', 'contador@example.com', ?, 'contador', true, '2026-01-01')`,
    ).run(hash);

    // Criar usuário inquilino (papel externo)
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_inquilino_1', 'Inquilino Teste', 'inquilino@example.com', ?, 'inquilino', true, '2026-01-01')`,
    ).run(hash);

    // Criar outro usuário prestador
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_prestador_1', 'Prestador Teste', 'prestador@example.com', ?, 'prestador', true, '2026-01-01')`,
    ).run(hash);

    ({ app, auditService } = await criarAppDeTeste(db));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    vi.restoreAllMocks();
  });

  describe("POST /api/acl — Concessão", () => {
    it("rejeita sem autenticação", async () => {
      const resp = await request(app).post("/api/acl").send({
        usuarioId: "user_inquilino_1",
        tipoRecurso: "cobranca",
        recursoId: "cob_123",
      });

      expect(resp.status).toBe(401);
    });

    it("rejeita papel não-titular/admin (contador=403)", async () => {
      const token = await login(app, "contador@example.com");
      const resp = await request(app)
        .post("/api/acl")
        .set("Authorization", `Bearer ${token}`)
        .send({
          usuarioId: "user_inquilino_1",
          tipoRecurso: "cobranca",
          recursoId: "cob_123",
        });

      expect(resp.status).toBe(403);
      expect(resp.body.erro).toContain("Sem permissão");
    });

    it("concede acesso a papel externo com título/admin", async () => {
      const auditSpy = vi.spyOn(auditService, "registrarAcao");
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/acl")
        .set("Authorization", `Bearer ${token}`)
        .send({
          usuarioId: "user_inquilino_1",
          tipoRecurso: "cobranca",
          recursoId: "cob_123",
        });

      expect(resp.status).toBe(201);
      expect(resp.body.ok).toBe(true);
      expect(auditSpy).toHaveBeenCalled();

      // Verificar que foi gravado no banco
      const acl = db.prepare("SELECT * FROM acl_recursos WHERE usuario_id = ? AND recurso_id = ?").get("user_inquilino_1", "cob_123");
      expect(acl).toBeDefined();
    });

    it("rejeita concessão a papel interno — retorna 400", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/acl")
        .set("Authorization", `Bearer ${token}`)
        .send({
          usuarioId: "user_contador_1", // papel interno
          tipoRecurso: "cobranca",
          recursoId: "cob_123",
        });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("papel interno");
    });

    it("rejeita tipoRecurso inválido — retorna 400", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/acl")
        .set("Authorization", `Bearer ${token}`)
        .send({
          usuarioId: "user_inquilino_1",
          tipoRecurso: "INVALIDO",
          recursoId: "cob_123",
        });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("tipoRecurso inválido");
    });

    it("rejeita usuário não-encontrado", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/acl")
        .set("Authorization", `Bearer ${token}`)
        .send({
          usuarioId: "user_inexistente",
          tipoRecurso: "cobranca",
          recursoId: "cob_123",
        });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("não encontrado");
    });

    it("reativa ACL revogada — idempotente", async () => {
      // Criar concessão já revogada
      db.prepare(
        `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por, concedido_em, revogado_em)
         VALUES ('user_inquilino_1', 'cobranca', 'cob_123', 'user_titular_1', datetime('now'), datetime('now'))`,
      ).run();

      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/acl")
        .set("Authorization", `Bearer ${token}`)
        .send({
          usuarioId: "user_inquilino_1",
          tipoRecurso: "cobranca",
          recursoId: "cob_123",
        });

      expect(resp.status).toBe(200);
      expect(resp.body.mensagem).toContain("reativado");

      // Verificar que revogado_em foi limpo
      const acl = db.prepare("SELECT revogado_em FROM acl_recursos WHERE usuario_id = ? AND recurso_id = ?").get("user_inquilino_1", "cob_123") as unknown as { revogado_em: string | null };
      expect(acl.revogado_em).toBeNull();
    });

    it("é idempotente — segunda concessão retorna 200", async () => {
      const token = await login(app, "titular@example.com");

      // Primeira concessão
      const resp1 = await request(app)
        .post("/api/acl")
        .set("Authorization", `Bearer ${token}`)
        .send({
          usuarioId: "user_inquilino_1",
          tipoRecurso: "cobranca",
          recursoId: "cob_123",
        });
      expect(resp1.status).toBe(201);

      // Segunda tentativa
      const resp2 = await request(app)
        .post("/api/acl")
        .set("Authorization", `Bearer ${token}`)
        .send({
          usuarioId: "user_inquilino_1",
          tipoRecurso: "cobranca",
          recursoId: "cob_123",
        });
      expect(resp2.status).toBe(200);
    });
  });

  describe("GET /api/acl — Listagem", () => {
    it("lista ACLs com filtro por usuarioId", async () => {
      // Inserir algumas ACLs
      db.prepare(
        `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por)
         VALUES (?, 'cobranca', ?, 'user_titular_1')`,
      ).run("user_inquilino_1", "cob_123");

      db.prepare(
        `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por)
         VALUES (?, 'contrato', ?, 'user_titular_1')`,
      ).run("user_inquilino_1", "ctr_456");

      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .get("/api/acl?usuarioId=user_inquilino_1")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.acls).toHaveLength(2);
      expect(resp.body.acls[0].usuario_id).toBe("user_inquilino_1");
    });

    it("rejeita lista sem autenticação", async () => {
      const resp = await request(app).get("/api/acl");

      expect(resp.status).toBe(401);
    });

    it("rejeita lista de papel não-titular/admin", async () => {
      const token = await login(app, "contador@example.com");
      const resp = await request(app).get("/api/acl").set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(403);
    });
  });

  describe("DELETE /api/acl/:id — Revogação", () => {
    it("revoga uma ACL ativa", async () => {
      // Inserir ACL
      const resultado = db
        .prepare(
          `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por)
         VALUES (?, 'cobranca', ?, 'user_titular_1')`,
        )
        .run("user_inquilino_1", "cob_123");

      const aclId = resultado.lastInsertRowid;

      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .delete(`/api/acl/${aclId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.ok).toBe(true);

      // Verificar que foi revogada
      const acl = db.prepare("SELECT revogado_em FROM acl_recursos WHERE id = ?").get(aclId) as unknown as { revogado_em: string | null };
      expect(acl.revogado_em).not.toBeNull();
    });

    it("é idempotente — revogação dupla retorna 200", async () => {
      // Inserir e revogar
      const resultado = db
        .prepare(
          `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por)
         VALUES (?, 'cobranca', ?, 'user_titular_1')`,
        )
        .run("user_inquilino_1", "cob_123");

      const aclId = resultado.lastInsertRowid;

      const token = await login(app, "titular@example.com");

      // Primeira revogação
      const resp1 = await request(app)
        .delete(`/api/acl/${aclId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(resp1.status).toBe(200);

      // Segunda tentativa
      const resp2 = await request(app)
        .delete(`/api/acl/${aclId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(resp2.status).toBe(200);
      expect(resp2.body.mensagem).toContain("já estava revogada");
    });

    it("rejeita ACL não-encontrada", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .delete("/api/acl/999999")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(404);
    });

    it("rejeita revoção de papel não-titular/admin", async () => {
      const resultado = db
        .prepare(
          `INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por)
         VALUES (?, 'cobranca', ?, 'user_titular_1')`,
        )
        .run("user_inquilino_1", "cob_123");

      const aclId = resultado.lastInsertRowid;

      const token = await login(app, "contador@example.com");
      const resp = await request(app)
        .delete(`/api/acl/${aclId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(403);
    });
  });
});
