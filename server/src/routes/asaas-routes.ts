/**
 * Rotas HTTP para emissão de boleto/PIX via Asaas — inquilinos (aluguel) e clientes da
 * advocacia (honorários). O servidor é só o mensageiro: quem decide QUANDO emitir e para
 * QUAL competência/honorário é o módulo de domínio do cliente (ver
 * src/domain/integracoes/asaasCobranca.ts), que chama estas rotas através de um
 * `AsaasApiClient` com o mesmo Bearer token de sessão de todo o resto do app.
 *
 * Por quê a emissão passa pelo servidor e não vai direto do navegador para a Asaas:
 * `ASAAS_API_KEY` é a credencial que move dinheiro (emite cobrança em nome do titular) —
 * nunca pode ir para o bundle do cliente. Mesmo motivo de `CLIENT_SECRET` da Pluggy
 * (server/src/pluggy.ts) e de `API_KEY` (server/src/index.ts).
 *
 * `POST /webhooks/asaas` é a ÚNICA rota deste arquivo que NÃO usa
 * `criarMiddlewareAutenticacao` — é a própria Asaas quem chama essa URL, sem sessão de
 * usuário nenhuma, então a autenticação aqui é por um segredo compartilhado
 * (ASAAS_WEBHOOK_TOKEN) no header `asaas-access-token`, não por Bearer token.
 */
import express from "express";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type { EventosExternosServiceDB } from "../domain/integracoes/eventos-externos-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import {
  criarClienteAsaas,
  criarCobranca,
  consultarCobranca,
  AsaasConfiguracaoAusenteError,
  AsaasApiError,
  type TipoCobrancaAsaas,
} from "../asaas.js";

export interface AsaasRoutesDeps {
  authService: AuthServiceDB;
  eventosService: EventosExternosServiceDB;
}

/** Erros esperados (config ausente, Asaas recusou o payload) virar uma resposta HTTP
 * decente em vez de 500 genérico; qualquer outro erro continua subindo para o middleware
 * de erro central de index.ts. */
function tratarErroAsaas(erro: unknown, res: express.Response): void {
  if (erro instanceof AsaasConfiguracaoAusenteError) {
    res.status(503).json({ erro: erro.message });
    return;
  }
  if (erro instanceof AsaasApiError) {
    res.status(erro.status >= 400 && erro.status < 500 ? 400 : 502).json({ erro: erro.message, detalhe: erro.corpo });
    return;
  }
  throw erro;
}

const TIPOS_COBRANCA_VALIDOS: TipoCobrancaAsaas[] = ["BOLETO", "PIX"];

export function criarRotasAsaas({ authService, eventosService }: AsaasRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * POST /api/asaas/clientes
   * Header: Authorization: Bearer <token>
   * Body: { nome, cpfCnpj, email?, telefone? }
   *
   * Cria o cliente na Asaas. Não grava nada localmente — quem chama (asaasCobranca.ts)
   * é responsável por persistir o `asaasCustomerId` em `asaas_clientes_externos`, porque
   * só o cliente (navegador) tem acesso ao banco local sql.js/IndexedDB.
   */
  router.post("/clientes", exigirAutenticacao, async (req, res) => {
    const { nome, cpfCnpj, email, telefone } = req.body ?? {};
    if (typeof nome !== "string" || !nome.trim()) {
      res.status(400).json({ erro: "nome é obrigatório" });
      return;
    }
    if (typeof cpfCnpj !== "string" || !cpfCnpj.trim()) {
      res.status(400).json({ erro: "cpfCnpj é obrigatório" });
      return;
    }

    try {
      const cliente = await criarClienteAsaas({
        nome: nome.trim(),
        cpfCnpj: cpfCnpj.trim(),
        email: typeof email === "string" ? email : undefined,
        telefone: typeof telefone === "string" ? telefone : undefined,
      });
      res.status(201).json({ asaasCustomerId: cliente.id });
    } catch (erro) {
      tratarErroAsaas(erro, res);
    }
  });

  /**
   * POST /api/asaas/cobrancas
   * Header: Authorization: Bearer <token>
   * Body: { customer, billingType ('BOLETO'|'PIX'), value, dueDate, description?,
   *         fine?: { value }, interest?: { value } }
   *
   * `fine`/`interest` fazem a PRÓPRIA Asaas calcular e cobrar multa/juros de atraso —
   * nunca recalculados por este sistema (ver nota em cobrancas_asaas, schema.sql).
   */
  router.post("/cobrancas", exigirAutenticacao, async (req, res) => {
    const { customer, billingType, value, dueDate, description, fine, interest } = req.body ?? {};
    if (typeof customer !== "string" || !customer.trim()) {
      res.status(400).json({ erro: "customer (asaasCustomerId) é obrigatório" });
      return;
    }
    if (typeof billingType !== "string" || !TIPOS_COBRANCA_VALIDOS.includes(billingType as TipoCobrancaAsaas)) {
      res.status(400).json({ erro: `billingType inválido — precisa ser um de: ${TIPOS_COBRANCA_VALIDOS.join(", ")}` });
      return;
    }
    if (typeof value !== "number" || !(value > 0)) {
      res.status(400).json({ erro: "value precisa ser um número maior que zero" });
      return;
    }
    if (typeof dueDate !== "string" || !dueDate) {
      res.status(400).json({ erro: "dueDate é obrigatório (AAAA-MM-DD)" });
      return;
    }

    try {
      const cobranca = await criarCobranca({
        customer: customer.trim(),
        billingType: billingType as TipoCobrancaAsaas,
        value,
        dueDate,
        description: typeof description === "string" ? description : undefined,
        fine: fine && typeof fine.value === "number" ? { value: fine.value } : undefined,
        interest: interest && typeof interest.value === "number" ? { value: interest.value } : undefined,
      });
      res.status(201).json({
        asaasChargeId: cobranca.id,
        status: cobranca.status,
        billingType: cobranca.billingType,
        boletoUrl: cobranca.bankSlipUrl ?? cobranca.invoiceUrl ?? null,
        linhaDigitavel: cobranca.identificationField ?? null,
        pixQrCode: cobranca.pixQrCodeId ?? null,
      });
    } catch (erro) {
      tratarErroAsaas(erro, res);
    }
  });

  /**
   * GET /api/asaas/cobrancas/:asaasChargeId
   * Header: Authorization: Bearer <token>
   *
   * Consulta pontual — o fluxo normal de atualização de status é o webhook (abaixo), esta
   * rota serve para conferência manual ou para preencher o estado inicial de uma tela.
   */
  router.get("/cobrancas/:asaasChargeId", exigirAutenticacao, async (req, res) => {
    try {
      const cobranca = await consultarCobranca(req.params.asaasChargeId);
      res.json({
        asaasChargeId: cobranca.id,
        status: cobranca.status,
        billingType: cobranca.billingType,
        boletoUrl: cobranca.bankSlipUrl ?? cobranca.invoiceUrl ?? null,
        linhaDigitavel: cobranca.identificationField ?? null,
        pixQrCode: cobranca.pixQrCodeId ?? null,
      });
    } catch (erro) {
      tratarErroAsaas(erro, res);
    }
  });

  /**
   * POST /api/asaas/webhooks/asaas
   * (SEM autenticação de sessão — ver cabeçalho do arquivo)
   *
   * A Asaas assina/identifica a chamada pelo header `asaas-access-token`, configurado no
   * dashboard da Asaas ao cadastrar a URL do webhook. Quando `ASAAS_WEBHOOK_TOKEN` não
   * está definido no servidor, a chamada é ACEITA mesmo assim (apenas logando um aviso) —
   * de propósito: em sandbox/desenvolvimento é comum ainda não ter configurado um webhook
   * na Asaas (nem token nenhum), e recusar aqui travaria qualquer teste manual do fluxo
   * antes desse passo existir. Assim que `ASAAS_WEBHOOK_TOKEN` for definido, a validação
   * passa a ser estrita (header ausente ou errado = 401).
   *
   * O corpo é só enfileirado (eventosService.registrarEvento) — este servidor não tem
   * acesso ao banco local do cliente para já atualizar `cobrancas_asaas` aqui; o cliente
   * consome por polling em GET /api/eventos-externos/pendentes?tipo=webhook_asaas (ver
   * aplicarEventosWebhookAsaas em src/domain/integracoes/asaasCobranca.ts).
   */
  router.post("/webhooks/asaas", (req, res) => {
    const tokenEsperado = process.env.ASAAS_WEBHOOK_TOKEN;
    const tokenRecebido = req.header("asaas-access-token");

    if (tokenEsperado) {
      if (tokenRecebido !== tokenEsperado) {
        res.status(401).json({ erro: "Token de webhook ausente ou inválido" });
        return;
      }
    } else {
      console.warn(
        "[asaas-routes] ASAAS_WEBHOOK_TOKEN não configurado — aceitando webhook da Asaas sem validação de " +
          "header (esperado em sandbox/desenvolvimento antes do webhook estar configurado; configure a env " +
          "var antes de expor esta rota em produção).",
      );
    }

    eventosService.registrarEvento("webhook_asaas", req.body);
    res.json({ recebido: true });
  });

  return router;
}
