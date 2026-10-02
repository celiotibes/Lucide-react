import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
import { criarRotasTelegram } from "../telegram-routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-telegram-routes-${process.pid}.db`);
const SENHA_PADRAO = "senha-correta-123";
const WEBHOOK_SECRET = "segredo-webhook-de-teste";

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
  db.exec(resolverSchema("migrations-phase4-vinculos-externos.sql"));
  return db;
}

async function criarAppDeTeste(db: Database.Database) {
  const authService = new AuthServiceDB(db);
  const eventosService = new EventosExternosServiceDB(db);
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
  app.use("/api/telegram", criarRotasTelegram({ authService, eventosService, db }));
  return { app, eventosService };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return resp.body.token;
}

function fetchOkTelegramPadrao() {
  // Mock genérico pras chamadas que o webhook faz à API do Telegram (sendMessage) — basta
  // responder `ok` para o fluxo não falhar; os testes que verificam o conteúdo da mensagem
  // inspecionam `fetchMock.mock.calls` diretamente.
  return vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}", json: async () => ({ ok: true }) });
}

describe("Rotas HTTP do bot do Telegram (/api/telegram)", () => {
  let db: Database.Database;
  let app: express.Express;
  let eventosService: EventosExternosServiceDB;
  const envOriginal = { ...process.env };

  beforeEach(async () => {
    db = createTestDatabase();
    const hash = await gerarHashSenha(SENHA_PADRAO);
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_titular_1', 'Titular Teste', 'titular@example.com', ?, 'titular', true, '2026-01-01')`,
    ).run(hash);

    process.env.TELEGRAM_BOT_TOKEN = "token-de-teste";
    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    ({ app, eventosService } = await criarAppDeTeste(db));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    process.env = { ...envOriginal };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("POST /api/telegram/gerar-codigo-vinculo", () => {
    it("rejects without a valid session token", async () => {
      const resp = await request(app).post("/api/telegram/gerar-codigo-vinculo");
      expect(resp.status).toBe(401);
    });

    it("returns 503 with a clear message when TELEGRAM_BOT_TOKEN is not configured", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      const token = await login(app, "titular@example.com");
      const resp = await request(app).post("/api/telegram/gerar-codigo-vinculo").set("Authorization", `Bearer ${token}`);
      expect(resp.status).toBe(503);
      expect(resp.body.erro).toContain("TELEGRAM_BOT_TOKEN");
    });

    it("generates a 6-digit code valid for 15 minutes and persists it for the authenticated user", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app).post("/api/telegram/gerar-codigo-vinculo").set("Authorization", `Bearer ${token}`);
      expect(resp.status).toBe(201);
      expect(resp.body.codigo).toMatch(/^\d{6}$/);
      expect(resp.body.expiraEmMinutos).toBe(15);

      const linha = db.prepare("SELECT * FROM telegram_vinculos WHERE codigo_vinculo = ?").get(resp.body.codigo) as any;
      expect(linha).toBeTruthy();
      expect(linha.usuario_id).toBe("user_titular_1");
      expect(linha.chat_id).toBeNull();
    });
  });

  describe("POST /api/telegram/webhook", () => {
    it("rejects without the secret token header", async () => {
      const resp = await request(app)
        .post("/api/telegram/webhook")
        .send({ update_id: 1, message: { message_id: 1, date: 1700000000, chat: { id: 111, type: "private" }, text: "oi" } });
      expect(resp.status).toBe(401);
    });

    it("rejects a wrong secret token header", async () => {
      const resp = await request(app)
        .post("/api/telegram/webhook")
        .set("X-Telegram-Bot-Api-Secret-Token", "segredo-errado")
        .send({ update_id: 1, message: { message_id: 1, date: 1700000000, chat: { id: 111, type: "private" }, text: "oi" } });
      expect(resp.status).toBe(401);
    });

    it("links a chat on a valid /vincular CODIGO and confirms via sendMessage", async () => {
      const token = await login(app, "titular@example.com");
      const gerar = await request(app).post("/api/telegram/gerar-codigo-vinculo").set("Authorization", `Bearer ${token}`);
      const codigo = gerar.body.codigo;

      const fetchMock = fetchOkTelegramPadrao();
      vi.stubGlobal("fetch", fetchMock);

      const resp = await request(app)
        .post("/api/telegram/webhook")
        .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
        .send({
          update_id: 1,
          message: { message_id: 1, date: 1700000000, chat: { id: 555, type: "private" }, text: `/vincular ${codigo}` },
        });
      expect(resp.status).toBe(200);

      const linha = db.prepare("SELECT * FROM telegram_vinculos WHERE codigo_vinculo = ?").get(codigo) as any;
      expect(linha.chat_id).toBe("555");
      expect(linha.vinculado_em).toBeTruthy();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/sendMessage");
      const corpoEnviado = JSON.parse(init.body);
      expect(corpoEnviado.chat_id).toBe("555");
      expect(corpoEnviado.text).toContain("Vinculado");
    });

    it("does not link an expired code, and queues it as an external pending link instead", async () => {
      // Insere um vínculo já expirado direto no banco (sem passar por /gerar-codigo-vinculo,
      // que sempre gera um código válido por 15 minutos a partir de agora).
      db.prepare(
        `INSERT INTO telegram_vinculos (id, usuario_id, codigo_vinculo, expira_em) VALUES ('v1', 'user_titular_1', '000111', '2000-01-01 00:00:00')`,
      ).run();

      const fetchMock = fetchOkTelegramPadrao();
      vi.stubGlobal("fetch", fetchMock);

      const resp = await request(app)
        .post("/api/telegram/webhook")
        .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
        .send({
          update_id: 2,
          message: { message_id: 2, date: 1700000000, chat: { id: 777, type: "private" }, text: "/vincular 000111" },
        });
      expect(resp.status).toBe(200);

      // Nunca linkado como usuário do sistema (código expirado para esse fim)...
      const linha = db.prepare("SELECT * FROM telegram_vinculos WHERE id = 'v1'").get() as any;
      expect(linha.chat_id).toBeNull();

      // ...mas o servidor não sabe se é inválido ou um código de contato externo legítimo —
      // só enfileira, sem tentar resolver (ver cabeçalho de telegram-routes.ts).
      const pendenteExterno = db
        .prepare("SELECT * FROM vinculos_externos_telegram_pendentes WHERE codigo_vinculo = '000111'")
        .get() as any;
      expect(pendenteExterno).toBeTruthy();
      expect(pendenteExterno.chat_id).toBe("777");
      expect(pendenteExterno.consumido).toBe(0);

      const [, init] = fetchMock.mock.calls[0];
      const corpoEnviado = JSON.parse(init.body);
      expect(corpoEnviado.text).toContain("recebido");
      expect(corpoEnviado.text).not.toContain("inválido");
    });

    it("queues an unresolved /vincular code as an external pending link (not in telegram_vinculos)", async () => {
      const fetchMock = fetchOkTelegramPadrao();
      vi.stubGlobal("fetch", fetchMock);

      const resp = await request(app)
        .post("/api/telegram/webhook")
        .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
        .send({
          update_id: 99,
          message: { message_id: 99, date: 1700000000, chat: { id: 4242, type: "private" }, text: "/vincular 654321" },
        });
      expect(resp.status).toBe(200);

      expect(db.prepare("SELECT * FROM telegram_vinculos WHERE codigo_vinculo = '654321'").get()).toBeUndefined();

      const pendenteExterno = db
        .prepare("SELECT * FROM vinculos_externos_telegram_pendentes WHERE codigo_vinculo = '654321'")
        .get() as any;
      expect(pendenteExterno).toBeTruthy();
      expect(pendenteExterno.chat_id).toBe("4242");

      const [, init] = fetchMock.mock.calls[0];
      const corpoEnviado = JSON.parse(init.body);
      expect(corpoEnviado.chat_id).toBe("4242");
      expect(corpoEnviado.text).toContain("recebido");
    });

    it("queues an event with the correct usuario_id for a message from a linked chat", async () => {
      db.prepare(
        `INSERT INTO telegram_vinculos (id, usuario_id, codigo_vinculo, chat_id, vinculado_em, expira_em)
         VALUES ('v2', 'user_titular_1', '222333', '999', datetime('now'), datetime('now', '+15 minutes'))`,
      ).run();

      const fetchMock = fetchOkTelegramPadrao();
      vi.stubGlobal("fetch", fetchMock);

      const resp = await request(app)
        .post("/api/telegram/webhook")
        .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
        .send({
          update_id: 3,
          message: {
            message_id: 10,
            date: 1700000000,
            chat: { id: 999, type: "private" },
            text: "Paguei 150 reais de conserto do portão hoje",
          },
        });
      expect(resp.status).toBe(200);

      const pendentes = eventosService.listarPendentes("user_titular_1", "captura_telegram");
      expect(pendentes).toHaveLength(1);
      expect(pendentes[0].usuarioId).toBe("user_titular_1");
      expect((pendentes[0].payload as any).texto).toContain("conserto do portão");
      expect((pendentes[0].payload as any).chatId).toBe("999");
    });

    it("does not queue anything for a message from an unlinked chat", async () => {
      const fetchMock = fetchOkTelegramPadrao();
      vi.stubGlobal("fetch", fetchMock);

      const resp = await request(app)
        .post("/api/telegram/webhook")
        .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
        .send({
          update_id: 4,
          message: { message_id: 11, date: 1700000000, chat: { id: 123456, type: "private" }, text: "oi, aqui é um recibo" },
        });
      expect(resp.status).toBe(200);

      const pendentes = eventosService.listarPendentes("user_titular_1", "captura_telegram");
      expect(pendentes).toHaveLength(0);

      const [, init] = fetchMock.mock.calls[0];
      const corpoEnviado = JSON.parse(init.body);
      expect(corpoEnviado.text).toContain("/vincular");
    });
  });

  describe("GET/POST /api/telegram/vinculos-externos-pendentes", () => {
    async function enfileirarPendenteExterno(codigo: string, chatId: string): Promise<void> {
      const fetchMock = fetchOkTelegramPadrao();
      vi.stubGlobal("fetch", fetchMock);
      const resp = await request(app)
        .post("/api/telegram/webhook")
        .set("X-Telegram-Bot-Api-Secret-Token", WEBHOOK_SECRET)
        .send({
          update_id: Math.floor(Math.random() * 1_000_000),
          message: { message_id: 1, date: 1700000000, chat: { id: chatId, type: "private" }, text: `/vincular ${codigo}` },
        });
      expect(resp.status).toBe(200);
      vi.unstubAllGlobals();
    }

    it("rejects both routes without a valid session token", async () => {
      const respGet = await request(app).get("/api/telegram/vinculos-externos-pendentes");
      expect(respGet.status).toBe(401);

      const respPost = await request(app).post("/api/telegram/vinculos-externos-pendentes/algum-id/consumir");
      expect(respPost.status).toBe(401);
    });

    it("lists pending external links queued by the webhook", async () => {
      await enfileirarPendenteExterno("111222", "5001");

      const token = await login(app, "titular@example.com");
      const resp = await request(app).get("/api/telegram/vinculos-externos-pendentes").set("Authorization", `Bearer ${token}`);
      expect(resp.status).toBe(200);
      expect(resp.body.pendentes).toHaveLength(1);
      expect(resp.body.pendentes[0]).toMatchObject({ codigoVinculo: "111222", chatId: "5001", consumido: false });
    });

    it("marks a pending external link as consumed, and it no longer appears in the listing", async () => {
      await enfileirarPendenteExterno("333444", "5002");

      const token = await login(app, "titular@example.com");
      const listagem = await request(app).get("/api/telegram/vinculos-externos-pendentes").set("Authorization", `Bearer ${token}`);
      const id = listagem.body.pendentes[0].id;

      const consumir = await request(app)
        .post(`/api/telegram/vinculos-externos-pendentes/${id}/consumir`)
        .set("Authorization", `Bearer ${token}`);
      expect(consumir.status).toBe(200);
      expect(consumir.body.sucesso).toBe(true);

      const depois = await request(app).get("/api/telegram/vinculos-externos-pendentes").set("Authorization", `Bearer ${token}`);
      expect(depois.body.pendentes).toHaveLength(0);
    });

    it("returns 404 when consuming an unknown or already-consumed id", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/telegram/vinculos-externos-pendentes/id-inexistente/consumir")
        .set("Authorization", `Bearer ${token}`);
      expect(resp.status).toBe(404);
    });
  });
});
