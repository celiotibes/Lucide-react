import "dotenv/config";
import express from "express";
import cors from "cors";
import { pluggy, normalizarTransacao } from "./pluggy.js";

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());

/** Cria um Connect Token de curta duração para o widget do navegador abrir o
 * Pluggy Connect. O Client Secret nunca sai daqui — é por isso que este
 * endpoint existe em vez do app web chamar a Pluggy direto. */
app.post("/api/connect-token", async (req, res) => {
  try {
    const { clientUserId } = req.body ?? {};
    const connectToken = await pluggy.createConnectToken(undefined, clientUserId ? { clientUserId } : undefined);
    res.json({ accessToken: connectToken.accessToken });
  } catch (erro) {
    console.error("Erro ao criar connect token:", erro);
    res.status(500).json({ erro: "Falha ao criar connect token" });
  }
});

/** Lista as contas (banco e cartão) de um item já conectado. */
app.get("/api/accounts", async (req, res) => {
  const itemId = req.query.itemId;
  if (typeof itemId !== "string") {
    res.status(400).json({ erro: "itemId é obrigatório" });
    return;
  }
  try {
    const { results } = await pluggy.fetchAccounts(itemId);
    res.json(
      results.map((conta) => ({
        id: conta.id,
        nome: conta.marketingName ?? conta.name,
        numero: conta.number,
        tipo: conta.type,
        subtipo: conta.subtype,
        saldo: conta.balance,
      })),
    );
  } catch (erro) {
    console.error("Erro ao buscar contas:", erro);
    res.status(500).json({ erro: "Falha ao buscar contas" });
  }
});

/** Busca todas as transações de uma conta no período, já normalizadas para o
 * formato que o app web importa (mesmo shape usado por OFX/CSV/PDF). */
app.get("/api/transactions", async (req, res) => {
  const { accountId, from, to } = req.query;
  if (typeof accountId !== "string") {
    res.status(400).json({ erro: "accountId é obrigatório" });
    return;
  }
  try {
    const transacoes = await pluggy.fetchAllTransactions(accountId, {
      dateFrom: typeof from === "string" ? from : undefined,
      dateTo: typeof to === "string" ? to : undefined,
    });
    res.json(transacoes.map(normalizarTransacao));
  } catch (erro) {
    console.error("Erro ao buscar transações:", erro);
    res.status(500).json({ erro: "Falha ao buscar transações" });
  }
});

/** Recebe eventos de ciclo de vida do item (item/created, item/updated,
 * item/error). Responde rápido (a Pluggy exige 2XX em até 5s) — o app web
 * hoje busca contas/transações sob demanda depois do onSuccess do widget,
 * então este endpoint é só um log por enquanto; fica pronto para acionar
 * uma sincronização em segundo plano no futuro. */
app.post("/api/webhooks/pluggy", (req, res) => {
  const evento = req.body;
  console.log("Webhook Pluggy recebido:", evento?.event, evento?.itemId ?? evento?.eventId);
  res.status(200).json({ recebido: true });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const porta = Number(process.env.PORT) || 8787;
app.listen(porta, () => {
  console.log(`Servidor de integração Pluggy rodando em http://localhost:${porta}`);
});
