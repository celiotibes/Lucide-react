
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
import { criarRotasAsaas } from "../asaas-routes";
import { tokenDoCookie } from "./token-cookie.js";

// Mock types for auth route dependencies
interface MockAuditService {
  registrarAcao: () => void;
  registrarAcessoNegado: () => void;
}

interface MockPermissoesService {
  listarMatriz: () => unknown[];
}

// Mock type for Asaas webhook payload
interface AsaasWebhookPayload {
  event: string;
  payment: {
    id: string;
    [key: string]: unknown;
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-asaas-routes-${process.pid}.db`);
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
  db.exec(resolverSchema("migrations-phase12-asaas-webhook-dedup.sql"));
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
      auditService: { registrarAcao: () => {}, registrarAcessoNegado: () => {} } as MockAuditService,
      permissoesService: { listarMatriz: () => [] } as MockPermissoesService,
    }),
  );
  app.use("/api/asaas", criarRotasAsaas({ authService, eventosService, db }));
  return { app, eventosService };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return tokenDoCookie(resp);
}

describe("Rotas HTTP de emissão Asaas (/api/asaas)", () => {
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
    ({ app, eventosService } = await criarAppDeTeste(db));

    process.env.ASAAS_API_KEY = "chave-de-teste";
    delete process.env.ASAAS_WEBHOOK_TOKEN;
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    process.env = { ...envOriginal };
    vi.restoreAllMocks();
  });

  describe("POST /api/asaas/clientes", () => {
    it("rejects without a valid session token", async () => {
      const resp = await request(app).post("/api/asaas/clientes").send({ nome: "X", cpfCnpj: "123" });
      expect(resp.status).toBe(401);
    });

    it("creates an Asaas customer via the injected fetch and returns asaasCustomerId", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: "cus_000001", name: "Locatário Teste", cpfCnpj: "52998224725" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/asaas/clientes")
        .set("Authorization", `Bearer ${token}`)
        .send({ nome: "Locatário Teste", cpfCnpj: "52998224725", email: "loc@example.com" });

      expect(resp.status).toBe(201);
      expect(resp.body.asaasCustomerId).toBe("cus_000001");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/customers");
      expect((init.headers as Record<string, string>).access_token).toBe("chave-de-teste");
    });

    it("rejects a request missing nome/cpfCnpj with 400, without calling fetch", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const token = await login(app, "titular@example.com");
      const resp = await request(app).post("/api/asaas/clientes").set("Authorization", `Bearer ${token}`).send({ nome: "X" });

      expect(resp.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns 503 with a clear message when ASAAS_API_KEY is not configured", async () => {
      delete process.env.ASAAS_API_KEY;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/asaas/clientes")
        .set("Authorization", `Bearer ${token}`)
        .send({ nome: "X", cpfCnpj: "52998224725" });

      expect(resp.status).toBe(503);
      expect(resp.body.erro).toContain("ASAAS_API_KEY");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/asaas/cobrancas", () => {
    it("rejects without a valid session token", async () => {
      const resp = await request(app).post("/api/asaas/cobrancas").send({});
      expect(resp.status).toBe(401);
    });

    it("creates a boleto charge with multa/juros and returns boletoUrl/linhaDigitavel", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            id: "pay_000001",
            status: "PENDING",
            billingType: "BOLETO",
            value: 1500,
            dueDate: "2026-11-10",
            bankSlipUrl: "https://sandbox.asaas.com/boleto/pay_000001",
            identificationField: "00190.00009 01234.567890 12345.678901 1 23450000150000",
          }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/asaas/cobrancas")
        .set("Authorization", `Bearer ${token}`)
        .send({
          customer: "cus_000001",
          billingType: "BOLETO",
          value: 1500,
          dueDate: "2026-11-10",
          fine: { value: 2 },
          interest: { value: 1 },
        });

      expect(resp.status).toBe(201);
      expect(resp.body.asaasChargeId).toBe("pay_000001");
      expect(resp.body.boletoUrl).toBe("https://sandbox.asaas.com/boleto/pay_000001");
      expect(resp.body.linhaDigitavel).toContain("00190");

      const [, init] = fetchMock.mock.calls[0];
      const corpoEnviado = JSON.parse(init.body);
      expect(corpoEnviado.fine).toEqual({ value: 2 });
      expect(corpoEnviado.interest).toEqual({ value: 1 });
    });

    it("rejects an invalid billingType with 400", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/asaas/cobrancas")
        .set("Authorization", `Bearer ${token}`)
        .send({ customer: "cus_1", billingType: "CARTAO", value: 100, dueDate: "2026-11-10" });
      expect(resp.status).toBe(400);
    });

    it("rejects a non-positive value with 400", async () => {
      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/asaas/cobrancas")
        .set("Authorization", `Bearer ${token}`)
        .send({ customer: "cus_1", billingType: "PIX", value: 0, dueDate: "2026-11-10" });
      expect(resp.status).toBe(400);
    });

    it("forwards an Asaas API error as 400 with the detail", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ errors: [{ description: "Valor inválido" }] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const token = await login(app, "titular@example.com");
      const resp = await request(app)
        .post("/api/asaas/cobrancas")
        .set("Authorization", `Bearer ${token}`)
        .send({ customer: "cus_1", billingType: "PIX", value: 10, dueDate: "2026-11-10" });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("Valor inválido");
    });
  });

  describe("GET /api/asaas/cobrancas/:asaasChargeId", () => {
    it("rejects without a valid session token", async () => {
      const resp = await request(app).get("/api/asaas/cobrancas/pay_1");
      expect(resp.status).toBe(401);
    });

    it("returns the current status of a charge", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: "pay_1", status: "RECEIVED", billingType: "PIX", value: 500, dueDate: "2026-11-10" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const token = await login(app, "titular@example.com");
      const resp = await request(app).get("/api/asaas/cobrancas/pay_1").set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.status).toBe("RECEIVED");
      expect(resp.body.asaasChargeId).toBe("pay_1");
    });
  });

  describe("POST /api/asaas/webhooks/asaas", () => {
    const TOKEN_WEBHOOK = "segredo-teste";
    beforeEach(() => {
      process.env.ASAAS_WEBHOOK_TOKEN = TOKEN_WEBHOOK;
    });

    it("accepts without a session token (not an authenticated route)", async () => {
      const resp = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", TOKEN_WEBHOOK)
        .send({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } });
      expect(resp.status).toBe(200);
      expect(resp.body.recebido).toBe(true);
    });

    it("fails closed (503) and enqueues nothing when ASAAS_WEBHOOK_TOKEN is not configured", async () => {
      delete process.env.ASAAS_WEBHOOK_TOKEN;
      const resp = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .send({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_sem_token" } });
      expect(resp.status).toBe(503);
      const pendentes = eventosService.listarPendentes("user_titular_1", "webhook_asaas");
      expect(pendentes.filter((e) => (e.payload as unknown as AsaasWebhookPayload)?.payment?.id === "pay_sem_token")).toHaveLength(0);
    });

    it("rejects a wrong token when ASAAS_WEBHOOK_TOKEN is configured", async () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo-correto";
      const resp = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", "segredo-errado")
        .send({ event: "PAYMENT_RECEIVED", payment: { id: "pay_3" } });
      expect(resp.status).toBe(401);
    });

    it("rejects a missing token when ASAAS_WEBHOOK_TOKEN is configured", async () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo-correto";
      const resp = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", TOKEN_WEBHOOK)
        .send({ event: "PAYMENT_RECEIVED", payment: { id: "pay_3" } });
      expect(resp.status).toBe(401);
    });

    it("accepts the correct token when ASAAS_WEBHOOK_TOKEN is configured", async () => {
      process.env.ASAAS_WEBHOOK_TOKEN = "segredo-correto";
      const resp = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", "segredo-correto")
        .send({ event: "PAYMENT_RECEIVED", payment: { id: "pay_4" } });
      expect(resp.status).toBe(200);
    });

    it("enqueues the webhook body as a webhook_asaas event, recoverable via EventosExternosServiceDB", async () => {
      await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", TOKEN_WEBHOOK)
        .send({ event: "PAYMENT_RECEIVED", payment: { id: "pay_fila_1", value: 1500 } });

      const pendentes = eventosService.listarPendentes("user_titular_1", "webhook_asaas");
      expect(pendentes).toHaveLength(1);
      const payload = pendentes[0].payload as { event: string; payment: { id: string } };
      expect(payload.payment.id).toBe("pay_fila_1");
      expect(payload.event).toBe("PAYMENT_RECEIVED");
    });

    it("rejects payload without 'event' field (400 Bad Request)", async () => {
      const resp = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", TOKEN_WEBHOOK)
        .send({ payment: { id: "pay_invalid_1" } });
      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("event");
    });

    it("rejects payload without 'payment.id' field (400 Bad Request)", async () => {
      const resp = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", TOKEN_WEBHOOK)
        .send({ event: "PAYMENT_RECEIVED", payment: {} });
      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain("payment.id");
    });

    it("rejects empty event string", async () => {
      const resp = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", TOKEN_WEBHOOK)
        .send({ event: "", payment: { id: "pay_5" } });
      expect(resp.status).toBe(400);
    });

    it("returns 200 and deduplicates repeated webhook (idempotent)", async () => {
      // Primeiro envio
      const resp1 = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", TOKEN_WEBHOOK)
        .send({ event: "PAYMENT_RECEIVED", payment: { id: "pay_dedup_1", value: 500 } });
      expect(resp1.status).toBe(200);
      expect(resp1.body.recebido).toBe(true);

      // Segundo envio do mesmo evento (mesmo payment.id)
      const resp2 = await request(app)
        .post("/api/asaas/webhooks/asaas")
        .set("asaas-access-token", TOKEN_WEBHOOK)
        .send({ event: "PAYMENT_RECEIVED", payment: { id: "pay_dedup_1", value: 500 } });
      expect(resp2.status).toBe(200);
      expect(resp2.body.duplicado).toBe(true);

      // Verifica que só um evento foi enfileirado (não dois)
      const pendentes = eventosService.listarPendentes("user_titular_1", "webhook_asaas");
      const eventsWithPayDedup1 = pendentes.filter(
        (e) => (e.payload as unknown as AsaasWebhookPayload)?.payment?.id === "pay_dedup_1"
      );
      expect(eventsWithPayDedup1).toHaveLength(1);
    });

    it("does NOT drop distinct events of the same payment (created, confirmed, received)", async () => {
      for (const event of ["PAYMENT_CREATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]) {
        const r = await request(app)
          .post("/api/asaas/webhooks/asaas")
          .set("asaas-access-token", TOKEN_WEBHOOK)
          .send({ event, payment: { id: "pay_multi_1", status: event } });
        expect(r.status).toBe(200);
        expect(r.body.duplicado).toBeUndefined();
      }
      const pendentes = eventosService.listarPendentes("user_titular_1", "webhook_asaas");
      const doPagamento = pendentes.filter((e) => (e.payload as unknown as AsaasWebhookPayload)?.payment?.id === "pay_multi_1");
      expect(doPagamento).toHaveLength(3);
    });

    it("uses the Asaas event id (body.id) as dedup key when present", async () => {
      const corpo = { id: "evt_abc123", event: "PAYMENT_RECEIVED", payment: { id: "pay_evt_1" } };
      const r1 = await request(app).post("/api/asaas/webhooks/asaas").set("asaas-access-token", TOKEN_WEBHOOK).send(corpo);
      const r2 = await request(app).post("/api/asaas/webhooks/asaas").set("asaas-access-token", TOKEN_WEBHOOK).send(corpo);
      expect(r1.body.duplicado).toBeUndefined();
      expect(r2.body.duplicado).toBe(true);
    });
  });
});

describe("webhook Asaas: registro atômico (marca de visto + evento pendente)", () => {
  it("se o enfileiramento falha, a marca de deduplicação é desfeita e a reentrega é aceita (nada se perde)", async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = "segredo-teste";
    const db = createTestDatabase();
    const { app, eventosService } = await criarAppDeTeste(db);
    const corpo = { id: "evt_atomico_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_atomico_1" } };

    const original = eventosService.registrarEvento.bind(eventosService);
    let falhar = true;
    (eventosService as unknown as { registrarEvento: (...args: unknown[]) => unknown }).registrarEvento = (...args: unknown[]) => {
      if (falhar) throw new Error("disco cheio");
      return (original as (...args: unknown[]) => unknown)(...args);
    };

    const r1 = await request(app).post("/api/asaas/webhooks/asaas").set("asaas-access-token", "segredo-teste").send(corpo);
    expect(r1.status).toBe(500); // o Asaas vai reenviar
    expect((db.prepare("SELECT COUNT(*) AS n FROM asaas_webhook_eventos").get() as { n: number }).n).toBe(0);

    falhar = false;
    const r2 = await request(app).post("/api/asaas/webhooks/asaas").set("asaas-access-token", "segredo-teste").send(corpo);
    expect(r2.status).toBe(200);
    expect(r2.body.duplicado).toBeUndefined();
    const pendentes = eventosService.listarPendentes("user_titular_1", "webhook_asaas");
    expect(pendentes.filter((e) => (e.payload as unknown as AsaasWebhookPayload)?.payment?.id === "pay_atomico_1")).toHaveLength(1);
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    db.close();
  });
});
