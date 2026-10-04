import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AuthServiceDB } from "../../domain/auth/auth-service-db";
import { gerarHashSenha } from "../../domain/auth/password";
import { criarRotasAuth } from "../auth-routes";
import { criarRotasNotificacoes } from "../notificacoes-routes";
import type { SendersNotificacao } from "../../domain/notificacoes/despacho";
import { tokenDoCookie } from "./token-cookie.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-notificacoes-routes-${process.pid}.db`);
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

/** Fakes dos 3 senders — nunca tocam rede real nem exigem env vars de produção. Cada
 * teste decide o comportamento (sucesso/falha) via `vi.fn()`. */
function criarSendersFake(): SendersNotificacao & {
  enviarEmail: ReturnType<typeof vi.fn>;
  enviarWhatsapp: ReturnType<typeof vi.fn>;
  enviarTelegram: ReturnType<typeof vi.fn>;
} {
  return {
    enviarEmail: vi.fn().mockResolvedValue(undefined),
    enviarWhatsapp: vi.fn().mockResolvedValue(undefined),
    enviarTelegram: vi.fn().mockResolvedValue(undefined),
  };
}

async function criarAppDeTeste(db: Database.Database, senders: SendersNotificacao) {
  const authService = new AuthServiceDB(db);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/auth",
    criarRotasAuth({
      authService,
      auditService: { registrarAcao: () => {}, registrarAcessoNegado: () => {} } as unknown,
      permissoesService: { listarMatriz: () => [] } as unknown,
    }),
  );
  app.use("/api/notificacoes", criarRotasNotificacoes({ authService, senders }));
  return { app };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return tokenDoCookie(resp);
}

describe("Rotas HTTP de notificações (/api/notificacoes)", () => {
  let db: Database.Database;
  let app: express.Express;
  let senders: ReturnType<typeof criarSendersFake>;

  beforeEach(async () => {
    db = createTestDatabase();
    const hash = await gerarHashSenha(SENHA_PADRAO);
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES ('user_titular_1', 'Titular Teste', 'titular@example.com', ?, 'titular', true, '2026-01-01')`,
    ).run(hash);
    senders = criarSendersFake();
    ({ app } = await criarAppDeTeste(db, senders));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it("rejects without a valid token", async () => {
    const resp = await request(app)
      .post("/api/notificacoes/disparar")
      .send({ origemTipo: "comunicado_generico", mensagem: "oi", destinatarios: { email: "a@b.com" } });
    expect(resp.status).toBe(401);
    expect(senders.enviarEmail).not.toHaveBeenCalled();
  });

  it("dispara com sucesso em todos os canais informados", async () => {
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .post("/api/notificacoes/disparar")
      .set("Authorization", `Bearer ${token}`)
      .send({
        origemTipo: "cobranca_asaas",
        origemId: 42,
        assunto: "Boleto disponível",
        mensagem: "Seu boleto de aluguel está disponível.",
        destinatarios: { email: "locatario@example.com", whatsappE164: "+5511987654321", telegramChatId: "999888" },
      });

    expect(resp.status).toBe(200);
    expect(resp.body.origemId).toBe(42);
    const resultados = resp.body.resultados;
    expect(resultados).toHaveLength(3);
    expect(resultados.find((r: any) => r.canal === "email")).toMatchObject({ status: "enviado", destinatario: "locatario@example.com" });
    expect(resultados.find((r: any) => r.canal === "whatsapp")).toMatchObject({ status: "enviado", destinatario: "+5511987654321" });
    expect(resultados.find((r: any) => r.canal === "telegram")).toMatchObject({ status: "enviado", destinatario: "999888" });

    expect(senders.enviarEmail).toHaveBeenCalledWith({
      destinatario: "locatario@example.com",
      assunto: "Boleto disponível",
      corpo: "Seu boleto de aluguel está disponível.",
    });
    expect(senders.enviarWhatsapp).toHaveBeenCalledWith({
      destinatarioE164: "+5511987654321",
      mensagem: "Seu boleto de aluguel está disponível.",
    });
    expect(senders.enviarTelegram).toHaveBeenCalledWith({ chatId: "999888", mensagem: "Seu boleto de aluguel está disponível." });
  });

  it("pula (status 'pulado') o canal sem destinatário informado, sem chamar o sender", async () => {
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .post("/api/notificacoes/disparar")
      .set("Authorization", `Bearer ${token}`)
      .send({
        origemTipo: "comunicado_generico",
        mensagem: "Aviso importante",
        destinatarios: { email: "cliente@example.com" }, // sem whatsappE164 nem telegramChatId
      });

    expect(resp.status).toBe(200);
    const resultados = resp.body.resultados;
    expect(resultados.find((r: any) => r.canal === "email")).toMatchObject({ status: "enviado" });
    expect(resultados.find((r: any) => r.canal === "whatsapp")).toMatchObject({ status: "pulado", destinatario: "(nenhum)" });
    expect(resultados.find((r: any) => r.canal === "telegram")).toMatchObject({ status: "pulado", destinatario: "(nenhum)" });
    expect(senders.enviarWhatsapp).not.toHaveBeenCalled();
    expect(senders.enviarTelegram).not.toHaveBeenCalled();
  });

  it("marca falha quando um sender lança erro, e continua tentando os outros canais", async () => {
    senders.enviarWhatsapp.mockRejectedValue(new Error("WhatsApp Cloud API respondeu 500: fora do ar"));
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .post("/api/notificacoes/disparar")
      .set("Authorization", `Bearer ${token}`)
      .send({
        origemTipo: "comunicado_generico",
        mensagem: "Aviso importante",
        destinatarios: { email: "cliente@example.com", whatsappE164: "+5511999990000", telegramChatId: "123" },
      });

    expect(resp.status).toBe(200);
    const resultados = resp.body.resultados;
    expect(resultados.find((r: any) => r.canal === "email")).toMatchObject({ status: "enviado" });
    expect(resultados.find((r: any) => r.canal === "whatsapp")).toMatchObject({
      status: "falha",
      motivo: "WhatsApp Cloud API respondeu 500: fora do ar",
    });
    // Os outros 2 canais são tentados independentemente da falha do WhatsApp.
    expect(resultados.find((r: any) => r.canal === "telegram")).toMatchObject({ status: "enviado" });
    expect(senders.enviarEmail).toHaveBeenCalledTimes(1);
    expect(senders.enviarTelegram).toHaveBeenCalledTimes(1);
  });

  it("rejeita quando nenhum destinatário é informado", async () => {
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .post("/api/notificacoes/disparar")
      .set("Authorization", `Bearer ${token}`)
      .send({ origemTipo: "comunicado_generico", mensagem: "oi", destinatarios: {} });
    expect(resp.status).toBe(400);
  });

  it("rejeita origemTipo inválido", async () => {
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .post("/api/notificacoes/disparar")
      .set("Authorization", `Bearer ${token}`)
      .send({ origemTipo: "lixo", mensagem: "oi", destinatarios: { email: "a@b.com" } });
    expect(resp.status).toBe(400);
  });

  it("rejeita mensagem ausente/vazia", async () => {
    const token = await login(app, "titular@example.com");
    const resp = await request(app)
      .post("/api/notificacoes/disparar")
      .set("Authorization", `Bearer ${token}`)
      .send({ origemTipo: "comunicado_generico", mensagem: "   ", destinatarios: { email: "a@b.com" } });
    expect(resp.status).toBe(400);
  });
});
