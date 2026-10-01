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

// Mocka o PluggyClient (pluggy-sdk) inteiro — nenhum teste aqui deve tocar a rede real. As
// três chamadas que `pluggy-meu.ts` faz (fetchItem, fetchAccounts, fetchAllTransactions) ficam
// como funções mock controláveis por teste, criadas com `vi.hoisted` porque a fábrica de
// `vi.mock` roda antes dos `imports` do arquivo (hoisting do próprio vitest).
const { fetchItemMock, fetchAccountsMock, fetchAllTransactionsMock, pluggyClientConstructorMock } = vi.hoisted(() => ({
  fetchItemMock: vi.fn(),
  fetchAccountsMock: vi.fn(),
  fetchAllTransactionsMock: vi.fn(),
  pluggyClientConstructorMock: vi.fn(),
}));

vi.mock("pluggy-sdk", () => ({
  PluggyClient: vi.fn().mockImplementation((params: unknown) => {
    pluggyClientConstructorMock(params);
    return {
      fetchItem: fetchItemMock,
      fetchAccounts: fetchAccountsMock,
      fetchAllTransactions: fetchAllTransactionsMock,
    };
  }),
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, "test-pluggy-meu-routes.db");
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
  return db;
}

/** Monta o app de teste. Recebe a factory de rotas MeuPluggy como parâmetro (em vez de um
 * import estático fixo) para que o teste de "faltam as variáveis de ambiente" possa passar
 * uma versão do módulo recém-importada depois de `vi.resetModules()` — necessário porque
 * `pluggy-meu.ts` guarda o PluggyClient num cache de módulo (ver comentário em
 * `obterClientePluggyMeu`), então uma vez criado com sucesso ele não voltaria a checar as
 * variáveis de ambiente dentro do mesmo registro de módulos. */
async function criarAppDeTeste(
  db: Database.Database,
  criarRotasPluggyMeu: (deps: { authService: AuthServiceDB }) => express.Router,
) {
  const authService = new AuthServiceDB(db);
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
  app.use("/api/pluggy-meu", criarRotasPluggyMeu({ authService }));
  return { app };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app).post("/api/auth/login").send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return resp.body.token;
}

async function criarUsuarioTitular(db: Database.Database) {
  const hash = await gerarHashSenha(SENHA_PADRAO);
  db.prepare(
    `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
     VALUES ('user_titular_1', 'Titular Teste', 'titular@example.com', ?, 'titular', true, '2026-01-01')`,
  ).run(hash);
}

describe("Rotas HTTP do fluxo MeuPluggy (/api/pluggy-meu)", () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createTestDatabase();
    await criarUsuarioTitular(db);
    fetchItemMock.mockReset();
    fetchAccountsMock.mockReset();
    fetchAllTransactionsMock.mockReset();
    pluggyClientConstructorMock.mockReset();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    delete process.env.PLUGGY_MEU_CLIENT_ID;
    delete process.env.PLUGGY_MEU_CLIENT_SECRET;
    delete process.env.PLUGGY_MEU_ITEM_IDS;
  });

  it("rejeita GET /contas sem token válido", async () => {
    const { criarRotasPluggyMeu } = await import("../pluggy-meu-routes");
    const { app } = await criarAppDeTeste(db, criarRotasPluggyMeu);
    const resp = await request(app).get("/api/pluggy-meu/contas");
    expect(resp.status).toBe(401);
  });

  it("rejeita GET /contas/:accountId/transacoes sem token válido", async () => {
    const { criarRotasPluggyMeu } = await import("../pluggy-meu-routes");
    const { app } = await criarAppDeTeste(db, criarRotasPluggyMeu);
    const resp = await request(app).get("/api/pluggy-meu/contas/acc-1/transacoes");
    expect(resp.status).toBe(401);
  });

  // Este teste precisa rodar com um módulo `pluggy-meu.ts` "zerado" (nunca chamou
  // obterClientePluggyMeu com sucesso antes), porque o cache do cliente dentro desse módulo
  // sobrevive entre testes do mesmo arquivo — ver comentário em criarAppDeTeste.
  it("retorna erro claro quando PLUGGY_MEU_CLIENT_ID/PLUGGY_MEU_CLIENT_SECRET não estão definidos", async () => {
    vi.resetModules();
    delete process.env.PLUGGY_MEU_CLIENT_ID;
    delete process.env.PLUGGY_MEU_CLIENT_SECRET;

    const { criarRotasPluggyMeu } = await import("../pluggy-meu-routes");
    const { app } = await criarAppDeTeste(db, criarRotasPluggyMeu);
    const token = await login(app, "titular@example.com");

    const resp = await request(app).get("/api/pluggy-meu/contas").set("Authorization", `Bearer ${token}`);
    expect(resp.status).toBe(500);
    expect(resp.body.erro).toMatch(/PLUGGY_MEU_CLIENT_ID/);
    expect(pluggyClientConstructorMock).not.toHaveBeenCalled();
  });

  it("retorna erro claro quando PLUGGY_MEU_ITEM_IDS não está definido", async () => {
    vi.resetModules();
    process.env.PLUGGY_MEU_CLIENT_ID = "id-de-teste";
    process.env.PLUGGY_MEU_CLIENT_SECRET = "secret-de-teste";
    delete process.env.PLUGGY_MEU_ITEM_IDS;

    const { criarRotasPluggyMeu } = await import("../pluggy-meu-routes");
    const { app } = await criarAppDeTeste(db, criarRotasPluggyMeu);
    const token = await login(app, "titular@example.com");

    const resp = await request(app).get("/api/pluggy-meu/contas").set("Authorization", `Bearer ${token}`);
    expect(resp.status).toBe(500);
    expect(resp.body.erro).toMatch(/PLUGGY_MEU_ITEM_IDS/);
  });

  describe("com credenciais e Item IDs configurados", () => {
    beforeEach(() => {
      vi.resetModules();
      process.env.PLUGGY_MEU_CLIENT_ID = "id-de-teste";
      process.env.PLUGGY_MEU_CLIENT_SECRET = "secret-de-teste";
      process.env.PLUGGY_MEU_ITEM_IDS = "item-1, item-2";
    });

    it("lista as contas de todos os Items configurados, normalizadas", async () => {
      fetchItemMock.mockImplementation(async (itemId: string) => ({
        id: itemId,
        status: "UPDATED",
        connector: { name: itemId === "item-1" ? "Banco Um" : "Banco Dois" },
      }));
      fetchAccountsMock.mockImplementation(async (itemId: string) => ({
        results: [
          {
            id: `${itemId}-conta-1`,
            itemId,
            type: "BANK",
            subtype: "CHECKING_ACCOUNT",
            number: "0001-2",
            balance: 1234.56,
            name: "Conta Corrente",
            marketingName: null,
          },
        ],
      }));

      const { criarRotasPluggyMeu } = await import("../pluggy-meu-routes");
      const { app } = await criarAppDeTeste(db, criarRotasPluggyMeu);
      const token = await login(app, "titular@example.com");

      const resp = await request(app).get("/api/pluggy-meu/contas").set("Authorization", `Bearer ${token}`);
      expect(resp.status).toBe(200);
      expect(resp.body.contas).toHaveLength(2);
      expect(resp.body.contas[0]).toMatchObject({
        itemId: "item-1",
        nomeInstituicao: "Banco Um",
        statusItem: "UPDATED",
        contaId: "item-1-conta-1",
        numero: "0001-2",
        tipo: "BANK",
        saldo: 1234.56,
      });
      expect(resp.body.contas[1].itemId).toBe("item-2");
      expect(fetchItemMock).toHaveBeenCalledWith("item-1");
      expect(fetchItemMock).toHaveBeenCalledWith("item-2");
    });

    it("busca e normaliza as transações de uma conta no período pedido", async () => {
      fetchAllTransactionsMock.mockResolvedValue([
        {
          id: "tx-1",
          date: "2026-01-15T00:00:00.000Z",
          amount: 150.5,
          type: "CREDIT",
          description: "PIX recebido",
          descriptionRaw: "PIX recebido",
          paymentData: null,
        },
        {
          id: "tx-2",
          date: "2026-01-16T00:00:00.000Z",
          amount: 40,
          type: "DEBIT",
          description: "Conta de luz",
          descriptionRaw: "Conta de luz",
          paymentData: null,
        },
      ]);

      const { criarRotasPluggyMeu } = await import("../pluggy-meu-routes");
      const { app } = await criarAppDeTeste(db, criarRotasPluggyMeu);
      const token = await login(app, "titular@example.com");

      const resp = await request(app)
        .get("/api/pluggy-meu/contas/conta-xyz/transacoes?dataInicio=2026-01-01&dataFim=2026-01-31")
        .set("Authorization", `Bearer ${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.transacoes).toEqual([
        { data: "2026-01-15", valor: 150.5, descricaoOriginal: "PIX recebido", fitid: "tx-1" },
        { data: "2026-01-16", valor: -40, descricaoOriginal: "Conta de luz", fitid: "tx-2" },
      ]);
      expect(fetchAllTransactionsMock).toHaveBeenCalledWith("conta-xyz", {
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
      });
    });

    it("devolve 500 com a mensagem de erro quando a chamada à Pluggy falha", async () => {
      fetchAllTransactionsMock.mockRejectedValue(new Error("Item ainda sincronizando"));

      const { criarRotasPluggyMeu } = await import("../pluggy-meu-routes");
      const { app } = await criarAppDeTeste(db, criarRotasPluggyMeu);
      const token = await login(app, "titular@example.com");

      const resp = await request(app)
        .get("/api/pluggy-meu/contas/conta-xyz/transacoes")
        .set("Authorization", `Bearer ${token}`);
      expect(resp.status).toBe(500);
      expect(resp.body.erro).toBe("Item ainda sincronizando");
    });
  });
});
