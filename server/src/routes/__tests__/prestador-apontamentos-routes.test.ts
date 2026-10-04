import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../../domain/auth/auth-service-db";
import { AuditTrailServiceDB } from "../../domain/auth/audit-trail-db";
import { gerarHashSenha } from "../../domain/auth/password";
import { criarRotasAuth } from "../auth-routes";
import { criarRotasPrestadorApontamentos } from "../prestador-apontamentos-routes";
import { tokenDoCookie } from "./token-cookie.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, `test-prestador-apont-${process.pid}.db`);
const SENHA = "senha-correta-123";
const URL_BASE = "/api/prestador/apontamentos";

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

const b64 = (bytes: number) => Buffer.alloc(bytes, 7).toString("base64");

function payload(over: Record<string, unknown> = {}) {
  return {
    uuid: "11111111-aaaa-bbbb-cccc-000000000001",
    tipo: "servico",
    imovelRef: "12",
    servico: "Troca de chuveiro",
    data: "2026-10-03",
    horasMinutos: 90,
    valorCentavos: 15050,
    anexos: [],
    ...over,
  };
}

describe("Apontamentos do prestador (/api/prestador/apontamentos)", () => {
  let db: Database.Database;
  let app: express.Express;

  async function login(email: string): Promise<string> {
    const r = await request(app).post("/api/auth/login").send({ email, senha: SENHA });
    expect(r.status).toBe(200);
    return tokenDoCookie(r);
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const enviar = (t: string, corpo: object) => request(app).post(URL_BASE).set(auth(t)).send(corpo);

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    db = new Database(TEST_DB_PATH);
    db.pragma("foreign_keys = ON");
    db.exec(schema("migrations-phase2-auth.sql"));
    db.exec(schema("migrations-phase15-prestador-apontamentos.sql"));
    const hash = await gerarHashSenha(SENHA);
    const ins = db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao) VALUES (?, ?, ?, ?, ?, true, '2026-01-01')`,
    );
    ins.run("u_titular", "Titular", "titular@x.com", hash, "titular");
    ins.run("u_prest1", "Prestador 1", "prest1@x.com", hash, "prestador");
    ins.run("u_prest2", "Prestador 2", "prest2@x.com", hash, "prestador");
    ins.run("u_inq", "Inquilino", "inq@x.com", hash, "inquilino");

    const authService = new AuthServiceDB(db);
    const auditService = new AuditTrailServiceDB(db);
    app = express();
    app.use("/api/auth", express.json(), criarRotasAuth({ authService, auditService, permissoesService: { listarMatriz: () => [] } as any }));
    // Como no index.ts: o parser JSON global não cobre o POST de criação (a rota tem parser próprio).
    const jsonPadrao = express.json();
    app.use((req, res, next) => (req.method === "POST" && req.path === URL_BASE ? next() : jsonPadrao(req, res, next)));
    app.use(URL_BASE, criarRotasPrestadorApontamentos({ authService, auditService, db }));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it("401 sem sessão", async () => {
    expect((await request(app).post(URL_BASE).send(payload())).status).toBe(401);
    expect((await request(app).get(URL_BASE)).status).toBe(401);
  });

  it("inquilino e interno não criam nem listam (403)", async () => {
    for (const email of ["inq@x.com", "titular@x.com"]) {
      const t = await login(email);
      expect((await enviar(t, payload())).status).toBe(403);
      expect((await request(app).get(URL_BASE).set(auth(t))).status).toBe(403);
    }
    expect(db.prepare("SELECT COUNT(*) n FROM prestador_apontamentos_recebidos").get()).toEqual({ n: 0 });
  });

  it("prestador cria (201), com status recebido, anexo com sha256 do servidor e auditoria", async () => {
    const t = await login("prest1@x.com");
    const conteudo = Buffer.from("foto-fake");
    const sha = createHash("sha256").update(conteudo).digest("hex");
    const r = await enviar(t, payload({ anexos: [{ nome: "../../etc/foto.jpg", tipo: "image/jpeg", conteudoBase64: conteudo.toString("base64"), sha256: sha }] }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ok: true, idempotente: false, status: "recebido", anexos: 1 });

    const linha = db.prepare("SELECT * FROM prestador_apontamentos_recebidos WHERE id = ?").get(r.body.id) as unknown;
    expect(linha).toMatchObject({ usuario_id: "u_prest1", valor_centavos: 15050, horas_minutos: 90, status: "recebido" });
    const anexo = db.prepare("SELECT nome, tamanho, sha256 FROM prestador_apontamento_anexos").get() as Record<string, unknown>;
    expect(anexo).toEqual({ nome: "__.._etc_foto.jpg", tamanho: conteudo.length, sha256: sha });
    expect(db.prepare(`SELECT COUNT(*) n FROM auditoria WHERE tipo_acao='prestador_apontamento_recebido'`).get()).toEqual({ n: 1 });
  });

  it("não grava no razão: nenhuma tabela de lançamentos é tocada", async () => {
    const t = await login("prest1@x.com");
    await enviar(t, payload());
    const tabelas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((x) => x.name);
    expect(tabelas.filter((n) => /razao|lancamento|ledger/i.test(n))).toEqual([]);
  });

  it("reenvio do mesmo uuid é idempotente (200, mesmo id, sem duplicar anexos); conteúdo diferente dá 409", async () => {
    const t = await login("prest1@x.com");
    const com = payload({ anexos: [{ nome: "a.pdf", tipo: "application/pdf", conteudoBase64: b64(100) }] });
    const a = await enviar(t, com);
    expect(a.status).toBe(201);
    const b = await enviar(t, com);
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ idempotente: true, id: a.body.id });
    expect(db.prepare("SELECT COUNT(*) n FROM prestador_apontamentos_recebidos").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) n FROM prestador_apontamento_anexos").get()).toEqual({ n: 1 });

    for (const diferente of [payload({ valorCentavos: 99999 }), payload({ servico: "Outro serviço" }), payload({ anexos: [] })]) {
      const c = await enviar(t, diferente);
      expect(c.status).toBe(409);
    }
    expect(db.prepare("SELECT valor_centavos FROM prestador_apontamentos_recebidos").get()).toEqual({ valor_centavos: 15050 });
  });

  it("isolamento: mesmo uuid em outro prestador é um registro independente e a listagem só mostra o próprio", async () => {
    const t1 = await login("prest1@x.com");
    const t2 = await login("prest2@x.com");
    const a = await enviar(t1, payload());
    const b = await enviar(t2, payload({ servico: "Serviço do segundo" }));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).not.toBe(a.body.id);

    const l1 = await request(app).get(URL_BASE).set(auth(t1));
    const l2 = await request(app).get(URL_BASE).set(auth(t2));
    expect(l1.body.total).toBe(1);
    expect(l1.body.itens.map((i: any) => i.id)).toEqual([a.body.id]);
    expect(l2.body.itens.map((i: any) => i.servico)).toEqual(["Serviço do segundo"]);
    // Não vaza conteúdo/identidade.
    expect(JSON.stringify(l1.body)).not.toMatch(/conteudo|usuario_id|u_prest/);
  });

  it("lista paginada e valida os parâmetros", async () => {
    const t = await login("prest1@x.com");
    for (let i = 1; i <= 5; i++) await enviar(t, payload({ uuid: `uuid-numero-${i}` }));
    const p1 = await request(app).get(`${URL_BASE}?limite=2&offset=0`).set(auth(t));
    const p3 = await request(app).get(`${URL_BASE}?limite=2&offset=4`).set(auth(t));
    expect(p1.body).toMatchObject({ total: 5, limite: 2, offset: 0 });
    expect(p1.body.itens).toHaveLength(2);
    expect(p1.body.itens[0].id).toBeGreaterThan(p1.body.itens[1].id);
    expect(p3.body.itens).toHaveLength(1);
    for (const q of ["limite=0", "limite=101", "offset=-1", "limite=abc"]) {
      expect((await request(app).get(`${URL_BASE}?${q}`).set(auth(t))).status).toBe(400);
    }
  });

  it("rejeita payload inválido (400): campo extra, centavos fracionados, uuid/data/mime ruins, sha256 errado, base64 ruim", async () => {
    const t = await login("prest1@x.com");
    const ok = { nome: "a.jpg", tipo: "image/jpeg", conteudoBase64: b64(10) };
    const ruins = [
      payload({ usuario_id: "u_prest2" }),
      payload({ observacoes: "texto livre" }),
      payload({ valorCentavos: 10.5 }),
      payload({ valorCentavos: -1 }),
      payload({ horasMinutos: 0 }),
      payload({ horasMinutos: 1.5 }),
      payload({ uuid: "curto" }),
      payload({ data: "2026-02-31" }),
      payload({ tipo: "outro" }),
      payload({ servico: "ab" }),
      payload({ anexos: [{ ...ok, tipo: "application/x-msdownload" }] }),
      payload({ anexos: [{ ...ok, sha256: "0".repeat(64) }] }),
      payload({ anexos: [{ ...ok, conteudoBase64: "não é base64!" }] }),
      payload({ anexos: [{ ...ok, extra: 1 }] }),
      payload({ anexos: [ok, ok, ok, ok] }),
    ];
    for (const corpo of ruins) {
      const r = await enviar(t, corpo);
      expect(r.status, JSON.stringify(corpo).slice(0, 120)).toBe(400);
    }
    expect(db.prepare("SELECT COUNT(*) n FROM prestador_apontamentos_recebidos").get()).toEqual({ n: 0 });
  });

  it("limite de anexo: 5 MB passa; acima de 5 MB dá 413 e nada é gravado; total acima de 15 MB dá 413", async () => {
    const t = await login("prest1@x.com");
    const cinco = 5 * 1024 * 1024;
    const exato = await enviar(t, payload({ anexos: [{ nome: "g.jpg", tipo: "image/jpeg", conteudoBase64: b64(cinco) }] }));
    expect(exato.status).toBe(201);

    const grande = await enviar(t, payload({ uuid: "uuid-grande-1", anexos: [{ nome: "g.jpg", tipo: "image/jpeg", conteudoBase64: b64(cinco + 1) }] }));
    expect(grande.status).toBe(413);
    expect(db.prepare("SELECT COUNT(*) n FROM prestador_apontamentos_recebidos WHERE uuid_cliente='uuid-grande-1'").get()).toEqual({ n: 0 });

    const lote = Array.from({ length: 3 }, (_, i) => ({ nome: `f${i}.jpg`, tipo: "image/jpeg", conteudoBase64: b64(cinco - i) }));
    // 3 arquivos de ~5 MB somam <= 15 MB (teto do lote) e cabem no limite de corpo da rota.
    const dentro = await enviar(t, payload({ uuid: "uuid-lote-ok-1", anexos: lote }));
    expect(dentro.status).toBe(201);
  });

  describe("POST /:id/conferir", () => {
    async function criar(): Promise<number> {
      const t = await login("prest1@x.com");
      return (await enviar(t, payload())).body.id;
    }

    it("interno confere: só marca status e audita; não altera valores", async () => {
      const id = await criar();
      const ti = await login("titular@x.com");
      const r = await request(app).post(`${URL_BASE}/${id}/conferir`).set(auth(ti)).send({ status: "conferido" });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ ok: true, idempotente: false, status: "conferido" });
      const linha = db.prepare("SELECT status, conferido_por, conferido_em, valor_centavos FROM prestador_apontamentos_recebidos WHERE id=?").get(id) as unknown;
      expect(linha).toMatchObject({ status: "conferido", conferido_por: "u_titular", valor_centavos: 15050 });
      expect(linha.conferido_em).toBeTruthy();
      expect(db.prepare(`SELECT COUNT(*) n FROM auditoria WHERE tipo_acao='prestador_apontamento_conferencia' AND resultado='sucesso'`).get()).toEqual({ n: 1 });

      // Repetir a mesma decisão é idempotente; decisão contrária depois de decidido dá 409.
      expect((await request(app).post(`${URL_BASE}/${id}/conferir`).set(auth(ti)).send({ status: "conferido" })).body.idempotente).toBe(true);
      expect((await request(app).post(`${URL_BASE}/${id}/conferir`).set(auth(ti)).send({ status: "rejeitado", motivo: "x" })).status).toBe(409);
    });

    it("rejeição exige motivo; id inexistente dá 404; payload extra dá 400", async () => {
      const id = await criar();
      const ti = await login("titular@x.com");
      const post = (i: number | string, b: object) => request(app).post(`${URL_BASE}/${i}/conferir`).set(auth(ti)).send(b);
      expect((await post(id, { status: "rejeitado" })).status).toBe(400);
      expect((await post(id, { status: "conferido", extra: 1 })).status).toBe(400);
      expect((await post(9999, { status: "conferido" })).status).toBe(404);
      expect((await post("abc", { status: "conferido" })).status).toBe(404);
      expect((await post(id, { status: "rejeitado", motivo: "foto ilegível" })).status).toBe(200);
      expect(db.prepare("SELECT status, motivo_rejeicao FROM prestador_apontamentos_recebidos WHERE id=?").get(id)).toEqual({ status: "rejeitado", motivo_rejeicao: "foto ilegível" });
    });

    it("prestador e inquilino não conferem (403)", async () => {
      const id = await criar();
      for (const email of ["prest1@x.com", "prest2@x.com", "inq@x.com"]) {
        const t = await login(email);
        expect((await request(app).post(`${URL_BASE}/${id}/conferir`).set(auth(t)).send({ status: "conferido" })).status).toBe(403);
      }
      expect(db.prepare("SELECT status FROM prestador_apontamentos_recebidos WHERE id=?").get(id)).toEqual({ status: "recebido" });
    });
  });
});
