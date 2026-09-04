import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { pluggy, normalizarTransacao } from "./pluggy.js";

if (!process.env.API_KEY) {
  throw new Error(
    "Defina API_KEY no .env (veja .env.example — gere um valor aleatório, ex: openssl rand -hex 32) antes de iniciar o servidor. " +
      "Sem isso, qualquer pessoa que descubra a URL deste backend consegue ler seus extratos bancários — ver auditoria de segurança.",
  );
}
const API_KEY = process.env.API_KEY;

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());

// Limite de requisições por IP — protege contra força bruta de itemId/accountId (agravaria o
// achado abaixo se não houvesse chave) e contra estourar a cota paga da API da Pluggy.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

/** Extrai só a mensagem do erro pro log, nunca o objeto inteiro: erros do Axios (usado
 * internamente pelo pluggy-sdk) carregam `config`/`request`, que pode conter o CLIENT_SECRET
 * usado na autenticação com a Pluggy — logar o objeto completo arriscaria vazar o segredo em
 * qualquer plataforma de hospedagem que agregue/exponha logs. */
function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** Exige a mesma chave (X-API-Key) configurada no .env em toda rota de dados — CORS por si só
 * não protege nada aqui: é imposto pelo navegador, não pelo servidor, então qualquer chamada
 * feita fora de um navegador (curl, script) o ignora completamente. Sem essa checagem, quem
 * descobrisse a URL pública deste backend (ex: hospedado em Render/Railway) conseguiria listar
 * contas e transações de qualquer itemId/accountId que adivinhasse ou visse vazar em algum
 * lugar — sem credencial nenhuma (achado crítico de auditoria de segurança). */
function exigirChaveApi(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.header("X-API-Key") !== API_KEY) {
    res.status(401).json({ erro: "Chave de API ausente ou inválida" });
    return;
  }
  next();
}

/** Cria um Connect Token de curta duração para o widget do navegador abrir o
 * Pluggy Connect. O Client Secret nunca sai daqui — é por isso que este
 * endpoint existe em vez do app web chamar a Pluggy direto. */
app.post("/api/connect-token", exigirChaveApi, async (req, res) => {
  try {
    const { clientUserId } = req.body ?? {};
    const connectToken = await pluggy.createConnectToken(undefined, clientUserId ? { clientUserId } : undefined);
    res.json({ accessToken: connectToken.accessToken });
  } catch (erro) {
    console.error("Erro ao criar connect token:", mensagemErro(erro));
    res.status(500).json({ erro: "Falha ao criar connect token" });
  }
});

/** Lista as contas (banco e cartão) de um item já conectado. */
app.get("/api/accounts", exigirChaveApi, async (req, res) => {
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
    console.error("Erro ao buscar contas:", mensagemErro(erro));
    res.status(500).json({ erro: "Falha ao buscar contas" });
  }
});

/** Busca todas as transações de uma conta no período, já normalizadas para o
 * formato que o app web importa (mesmo shape usado por OFX/CSV/PDF). */
app.get("/api/transactions", exigirChaveApi, async (req, res) => {
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
    console.error("Erro ao buscar transações:", mensagemErro(erro));
    res.status(500).json({ erro: "Falha ao buscar transações" });
  }
});

/** Recebe eventos de ciclo de vida do item (item/created, item/updated,
 * item/error). Responde rápido (a Pluggy exige 2XX em até 5s) — o app web
 * hoje busca contas/transações sob demanda depois do onSuccess do widget,
 * então este endpoint é só um log por enquanto; fica pronto para acionar
 * uma sincronização em segundo plano no futuro.
 *
 * Autenticidade: a Pluggy chama esta URL diretamente (não é o navegador do
 * usuário), então não dá pra usar o header X-API-Key das outras rotas — em vez
 * disso, a própria URL registrada no dashboard da Pluggy carrega a chave como
 * query string (?key=...), conferida abaixo. Registre
 * "https://SEU-DOMINIO/api/webhooks/pluggy?key=SUA_API_KEY" no dashboard, não
 * a URL sem o parâmetro — sem isso, qualquer um que descubra a URL pode
 * enviar eventos forjados. */
app.post("/api/webhooks/pluggy", (req, res) => {
  if (req.query.key !== API_KEY) {
    res.status(401).json({ erro: "Chave de API ausente ou inválida" });
    return;
  }
  const evento = req.body;
  console.log("Webhook Pluggy recebido:", evento?.event, evento?.itemId ?? evento?.eventId);
  res.status(200).json({ recebido: true });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/** Middleware de erro — precisa ser o ÚLTIMO app.use() (Express identifica middleware de erro
 * pela assinatura de 4 parâmetros). Sem isso, um erro não tratado (ex: JSON malformado
 * chegando em express.json(), que roda ANTES de exigirChaveApi em toda rota — alcançável sem
 * autenticação nenhuma) cai no handler padrão do Express, que em desenvolvimento (NODE_ENV
 * != "production", o padrão se a variável nunca for definida — confirmado empiricamente
 * nesta auditoria) devolve o stack trace COMPLETO no corpo da resposta, incluindo caminhos
 * absolutos do servidor — reconhecimento útil para quem for atacar, sem precisar da API_KEY
 * pra ver isso. Não depende de configurar NODE_ENV corretamente em cada lugar onde isto for
 * hospedado: sempre responde genérico, não importa o ambiente. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 4º parâmetro obrigatório: é só pela aridade que o Express reconhece isto como middleware de erro
app.use((erro: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Erro não tratado:", mensagemErro(erro));
  const status = (erro as { status?: number; statusCode?: number })?.status ?? (erro as { statusCode?: number })?.statusCode ?? 500;
  res.status(status).json({ erro: "Requisição inválida ou falha interna." });
});

const porta = Number(process.env.PORT) || 8787;
app.listen(porta, () => {
  console.log(`Servidor de integração Pluggy rodando em http://localhost:${porta}`);
});
