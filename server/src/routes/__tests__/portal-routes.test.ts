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
import { criarRotasPortal } from "../portal-routes";
import { tokenDoCookie } from "./token-cookie.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, `test-portal-routes-${process.pid}.db`);
const SENHA = "senha-correta-123";

function schema(nome: string): string {
  const candidatos = [
    path.join(__dirname, `../../../${nome}`),
    path.join(process.cwd(), `server/src/${nome}`),
    path.join(process.cwd(), `src/${nome}`),
  ];
  const f = candidatos.find((p) => fs.existsSync(p));
  if (!f) throw new Error(`Schema não encontrado: ${nome}`);
  return fs.readFileSync(f, "utf-8");
}

function payload(over: Record<string, unknown> = {}) {
  return {
    usuarioId: "u_inq1",
    contratoRef: "contrato-1",
    versao: 1,
    imovelApelido: "Kitnet 302",
    valorAluguelCentavos: 150050,
    diaVencimento: 10,
    dataInicio: "2026-01-01",
    dataFim: null,
    cobrancas: [
      { cobrancaRef: "c1", competencia: "2026-01", vencimento: "2026-01-10", valorCentavos: 150050, status: "paga", dataPagamento: "2026-01-09" },
      { cobrancaRef: "c2", competencia: "2026-02", vencimento: "2026-02-10", valorCentavos: 150050, status: "pendente" },
    ],
    ...over,
  };
}

describe("Rotas do portal do inquilino (/api/portal)", () => {
  let db: Database.Database;
  let app: express.Express;

  async function login(email: string): Promise<string> {
    const r = await request(app).post("/api/auth/login").send({ email, senha: SENHA });
    expect(r.status).toBe(200);
    return tokenDoCookie(r);
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const conceder = (usuario: string, contrato: string) =>
    db
      .prepare(`INSERT INTO acl_recursos (usuario_id, tipo_recurso, recurso_id, concedido_por) VALUES (?, 'contrato', ?, 'u_titular')`)
      .run(usuario, contrato);

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    db = new Database(TEST_DB_PATH);
    db.pragma("foreign_keys = ON");
    db.exec(schema("migrations-phase2-auth.sql"));
    db.exec(schema("migrations-phase13-acl-recursos.sql"));
    db.exec(schema("migrations-phase14-portal-inquilino.sql"));
    const hash = await gerarHashSenha(SENHA);
    const ins = db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao) VALUES (?, ?, ?, ?, ?, true, '2026-01-01')`,
    );
    ins.run("u_titular", "Titular", "titular@x.com", hash, "titular");
    ins.run("u_contador", "Contador", "contador@x.com", hash, "contador");
    ins.run("u_inq1", "Inq 1", "inq1@x.com", hash, "inquilino");
    ins.run("u_inq2", "Inq 2", "inq2@x.com", hash, "inquilino");
    ins.run("u_prest", "Prestador", "prest@x.com", hash, "prestador");

    const authService = new AuthServiceDB(db);
    const auditService = new AuditTrailServiceDB(db);
    app = express();
    app.use(express.json());
    app.use("/api/auth", criarRotasAuth({ authService, auditService, permissoesService: { listarMatriz: () => [] } as any }));
    app.use("/api/portal", criarRotasPortal({ authService, auditService, db }));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe("POST /publicar", () => {
    it("401 sem sessão", async () => {
      expect((await request(app).post("/api/portal/publicar").send(payload())).status).toBe(401);
    });

    it("interno publica (201) e audita", async () => {
      const t = await login("contador@x.com");
      const r = await request(app).post("/api/portal/publicar").set(auth(t)).send(payload());
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ ok: true, idempotente: false, cobrancas: 2 });
      const a = db.prepare(`SELECT resultado FROM auditoria WHERE tipo_acao='portal_publicacao'`).all();
      expect(a).toHaveLength(1);
    });

    it("prestador e inquilino não publicam (403)", async () => {
      for (const email of ["prest@x.com", "inq1@x.com"]) {
        const t = await login(email);
        expect((await request(app).post("/api/portal/publicar").set(auth(t)).send(payload())).status).toBe(403);
      }
      expect(db.prepare("SELECT COUNT(*) n FROM portal_inquilino_contratos").get()).toEqual({ n: 0 });
    });

    it("rejeita payload inválido (400): campo extra, centavos fracionados, usuário não inquilino", async () => {
      const t = await login("titular@x.com");
      const ruins = [
        payload({ cpf: "123" }),
        payload({ valorAluguelCentavos: 1500.5 }),
        payload({ dataInicio: "01/01/2026" }),
        payload({ usuarioId: "u_contador" }),
        payload({ usuarioId: "inexistente" }),
        payload({ cobrancas: [payload().cobrancas[0], payload().cobrancas[0]] }),
      ];
      for (const corpo of ruins) {
        const r = await request(app).post("/api/portal/publicar").set(auth(t)).send(corpo);
        expect(r.status).toBe(400);
      }
    });

    it("é idempotente por contratoRef+versão; versão nova substitui; obsoleta/divergente dá 409", async () => {
      const t = await login("titular@x.com");
      const pub = (b: object) => request(app).post("/api/portal/publicar").set(auth(t)).send(b);
      expect((await pub(payload())).status).toBe(201);

      const repetido = await pub(payload());
      expect(repetido.status).toBe(200);
      expect(repetido.body.idempotente).toBe(true);
      expect(db.prepare("SELECT COUNT(*) n FROM portal_inquilino_cobrancas").get()).toEqual({ n: 2 });

      expect((await pub(payload({ imovelApelido: "Outro" }))).status).toBe(409); // mesma versão, conteúdo diferente

      const v2 = await pub(payload({ versao: 2, cobrancas: [payload().cobrancas[1]] }));
      expect(v2.status).toBe(200);
      expect(v2.body.idempotente).toBe(false);
      expect(db.prepare("SELECT COUNT(*) n FROM portal_inquilino_cobrancas").get()).toEqual({ n: 1 });
      expect(db.prepare("SELECT versao FROM portal_inquilino_contratos").get()).toEqual({ versao: 2 });

      expect((await pub(payload({ versao: 1 }))).status).toBe(409); // obsoleta
      expect(db.prepare("SELECT versao FROM portal_inquilino_contratos").get()).toEqual({ versao: 2 });
    });
  });

  describe("GET (inquilino)", () => {
    beforeEach(async () => {
      const t = await login("titular@x.com");
      await request(app).post("/api/portal/publicar").set(auth(t)).send(payload());
      await request(app)
        .post("/api/portal/publicar")
        .set(auth(t))
        .send(payload({ usuarioId: "u_inq2", contratoRef: "contrato-2", imovelApelido: "Kitnet 101" }));
    });

    it("404 sem concessão ACL (mesmo sendo dono do espelho), em ambas as rotas", async () => {
      const t = await login("inq1@x.com");
      expect((await request(app).get("/api/portal/meus-contratos").set(auth(t))).status).toBe(404);
      expect((await request(app).get("/api/portal/minhas-cobrancas").set(auth(t))).status).toBe(404);
    });

    it("isola inquilinos: cada um vê só o seu; contratoRef alheio dá 404", async () => {
      conceder("u_inq1", "contrato-1");
      conceder("u_inq2", "contrato-2");
      const t1 = await login("inq1@x.com");
      const r1 = await request(app).get("/api/portal/meus-contratos").set(auth(t1));
      expect(r1.status).toBe(200);
      expect(r1.body.itens.map((c: any) => c.contratoRef)).toEqual(["contrato-1"]);
      expect(r1.body.itens[0]).toMatchObject({ imovelApelido: "Kitnet 302", valorAluguelCentavos: 150050 });
      expect(Object.keys(r1.body.itens[0])).not.toContain("usuario_id");

      const c1 = await request(app).get("/api/portal/minhas-cobrancas").set(auth(t1));
      expect(c1.status).toBe(200);
      expect(c1.body.total).toBe(2);
      expect(c1.body.itens.every((c: any) => c.contratoRef === "contrato-1")).toBe(true);

      const alheio = await request(app).get("/api/portal/minhas-cobrancas?contratoRef=contrato-2").set(auth(t1));
      expect(alheio.status).toBe(404);
      const inexistente = await request(app).get("/api/portal/minhas-cobrancas?contratoRef=nao-existe").set(auth(t1));
      expect(inexistente.status).toBe(404);
      expect(inexistente.body).toEqual(alheio.body); // indistinguível
    });

    it("concessão revogada volta a 404; concessão para outro usuário não vaza", async () => {
      conceder("u_inq2", "contrato-1"); // ACL de outro usuário para o contrato do inq1
      conceder("u_inq1", "contrato-1");
      const t = await login("inq1@x.com");
      expect((await request(app).get("/api/portal/meus-contratos").set(auth(t))).status).toBe(200);
      db.prepare("UPDATE acl_recursos SET revogado_em = datetime('now') WHERE usuario_id='u_inq1'").run();
      expect((await request(app).get("/api/portal/meus-contratos").set(auth(t))).status).toBe(404);
      const t2 = await login("inq2@x.com"); // tem ACL de contrato-1 mas o espelho não é dele
      expect((await request(app).get("/api/portal/meus-contratos").set(auth(t2))).status).toBe(404);
    });

    it("prestador e interno não leem o portal do inquilino (403); sem sessão 401", async () => {
      conceder("u_inq1", "contrato-1");
      for (const email of ["prest@x.com", "titular@x.com"]) {
        const t = await login(email);
        expect((await request(app).get("/api/portal/meus-contratos").set(auth(t))).status).toBe(403);
        expect((await request(app).get("/api/portal/minhas-cobrancas").set(auth(t))).status).toBe(403);
      }
      expect((await request(app).get("/api/portal/meus-contratos")).status).toBe(401);
    });

    it("pagina cobranças (limite/offset) e valida parâmetros", async () => {
      conceder("u_inq1", "contrato-1");
      const t = await login("inq1@x.com");
      const p1 = await request(app).get("/api/portal/minhas-cobrancas?limite=1&offset=0").set(auth(t));
      const p2 = await request(app).get("/api/portal/minhas-cobrancas?limite=1&offset=1").set(auth(t));
      expect(p1.body).toMatchObject({ total: 2, limite: 1, offset: 0 });
      expect(p1.body.itens).toHaveLength(1);
      expect(p1.body.itens[0].competencia).toBe("2026-02"); // mais recente primeiro
      expect(p2.body.itens[0].competencia).toBe("2026-01");
      expect((await request(app).get("/api/portal/minhas-cobrancas?limite=0").set(auth(t))).status).toBe(400);
      expect((await request(app).get("/api/portal/minhas-cobrancas?limite=101").set(auth(t))).status).toBe(400);
      expect((await request(app).get("/api/portal/meus-contratos?offset=abc").set(auth(t))).status).toBe(400);
    });

    it("traz PIX/linha de asaas_cobrancas quando existir, sem copiá-los para o espelho", async () => {
      db.exec(`CREATE TABLE asaas_cobrancas (aluguel_id TEXT, status TEXT, qr_code_pix TEXT, linha_digitavel TEXT, data_criacao TEXT)`);
      db.prepare(`INSERT INTO asaas_cobrancas VALUES ('c2','aberta','PIX-COPIA-COLA','0001.2345','2026-02-01')`).run();
      conceder("u_inq1", "contrato-1");
      const t = await login("inq1@x.com");
      const r = await request(app).get("/api/portal/minhas-cobrancas").set(auth(t));
      const c2 = r.body.itens.find((c: any) => c.cobrancaRef === "c2");
      const c1 = r.body.itens.find((c: any) => c.cobrancaRef === "c1");
      expect(c2).toMatchObject({ qrCodePix: "PIX-COPIA-COLA", linhaDigitavel: "0001.2345" });
      expect(c1.qrCodePix).toBeNull();
    });
  });
});
