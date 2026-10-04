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
import crypto from "crypto";
import { randomUUID } from "crypto";
import { logger } from '../services/logger-service.js';
import type Database from "better-sqlite3";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type { EventosExternosServiceDB } from "../domain/integracoes/eventos-externos-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { criarExigirPosse } from "../middleware/posse-recurso.js";
import { validateTokenSafely } from "../utils/security-helpers.js";
import {
  criarClienteAsaas,
  criarCobranca,
  consultarCobranca,
  atualizarCobranca,
  AsaasConfiguracaoAusenteError,
  AsaasApiError,
  type TipoCobrancaAsaas,
} from "../asaas.js";
import { processarReembolsoAsaas, obterReembolsosPorChargeId } from "../domain/integracoes/asaasReembolsos.js";
import { sincronizarStatusTaxaAsaas } from "../domain/integracoes/pagamentos-reconciliador.js";

export interface AsaasRoutesDeps {
  authService: AuthServiceDB;
  eventosService: EventosExternosServiceDB;
  db?: Database.Database; // Opcional para passar o banco ao reconciliador
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

export function criarRotasAsaas({ authService, eventosService, db }: AsaasRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  const exigirAutenticacaoComExternos = criarMiddlewareAutenticacao(authService, { permitirPapeisExternos: true });
  const exigirPosse = db ? criarExigirPosse(db) : undefined;

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
      return res.status(400).json({ erro: "nome é obrigatório" });
    }
    if (typeof cpfCnpj !== "string" || !cpfCnpj.trim()) {
      return res.status(400).json({ erro: "cpfCnpj é obrigatório" });
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
      return res.status(400).json({ erro: "customer (asaasCustomerId) é obrigatório" });
    }
    if (typeof billingType !== "string" || !TIPOS_COBRANCA_VALIDOS.includes(billingType as TipoCobrancaAsaas)) {
      return res.status(400).json({ erro: `billingType inválido — precisa ser um de: ${TIPOS_COBRANCA_VALIDOS.join(", ")}` });
    }
    if (typeof value !== "number" || !(value > 0)) {
      return res.status(400).json({ erro: "value precisa ser um número maior que zero" });
    }
    if (typeof dueDate !== "string" || !dueDate) {
      return res.status(400).json({ erro: "dueDate é obrigatório (AAAA-MM-DD)" });
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
   *
   * Permite usuários externos (inquilino, prestador) desde que tenham acesso via ACL.
   */
  router.get(
    "/cobrancas/:asaasChargeId",
    exigirAutenticacaoComExternos,
    exigirPosse ? exigirPosse("cobranca", "asaasChargeId") : (_, res) => res.status(500).json({ erro: "Database unavailable" }),
    async (req, res) => {
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
    }
  );

  /**
   * PUT /api/asaas/cobrancas/:asaasChargeId
   * Header: Authorization: Bearer <token>
   * Body: { description?: string, dueDate?: string (YYYY-MM-DD) }
   *
   * Atualiza metadados de uma cobrança (descrição, data de vencimento).
   * Campos como valor e tipo de cobrança não são atualizáveis via API.
   */
  router.put("/cobrancas/:asaasChargeId", exigirAutenticacao, async (req, res) => {
    const chargeId = req.params.asaasChargeId?.trim();
    const { description, dueDate } = req.body ?? {};

    if (!chargeId) {
      res.status(400).json({ erro: "chargeId é obrigatório (via URL)" });
      return;
    }

    // Valida que pelo menos um campo foi fornecido
    if (description === undefined && dueDate === undefined) {
      res.status(400).json({ erro: "Forneça pelo menos um campo para atualizar (description, dueDate)" });
      return;
    }

    // Valida dueDate se fornecido
    if (dueDate !== undefined && (typeof dueDate !== "string" || !dueDate.match(/^\d{4}-\d{2}-\d{2}$/))) {
      res.status(400).json({ erro: "dueDate deve estar no formato YYYY-MM-DD" });
      return;
    }

    try {
      // Verifica se a cobrança existe
      await consultarCobranca(chargeId);

      // Monta payload com apenas os campos fornecidos
      const payload: any = {};
      if (description !== undefined) payload.description = description;
      if (dueDate !== undefined) payload.dueDate = dueDate;

      const cobrancaAtualizada = await atualizarCobranca(chargeId, payload);

      res.json({
        asaasChargeId: cobrancaAtualizada.id,
        status: cobrancaAtualizada.status,
        billingType: cobrancaAtualizada.billingType,
        boletoUrl: cobrancaAtualizada.bankSlipUrl ?? cobrancaAtualizada.invoiceUrl ?? null,
        linhaDigitavel: cobrancaAtualizada.identificationField ?? null,
        pixQrCode: cobrancaAtualizada.pixQrCodeId ?? null,
      });
    } catch (erro) {
      if (erro instanceof AsaasApiError && erro.status === 404) {
        res.status(404).json({ erro: "Cobrança não encontrada" });
        return;
      }
      tratarErroAsaas(erro, res);
    }
  });

  /**
   * POST /api/asaas/webhooks/asaas
   * (SEM autenticação de sessão — ver cabeçalho do arquivo)
   *
   * A Asaas assina/identifica a chamada pelo header `asaas-access-token`, configurado no
   * dashboard da Asaas ao cadastrar a URL do webhook. FALHA FECHADO: sem
   * `ASAAS_WEBHOOK_TOKEN` configurado o endpoint responde 503 e não aceita eventos (antes aceitava
   * qualquer chamada, o que deixava a rota aberta a eventos forjados). Com o token definido, header
   * ausente ou errado = 401.
   *
   * SEC-011B: Usa validateTokenSafely para comparação timing-safe do token.
   *
   * Idempotência: verifica asaas_webhook_eventos para evitar reprocessamento.
   * O corpo é enfileirado apenas se o evento não foi visto antes.
   *
   * O cliente consome por polling em GET /api/eventos-externos/pendentes?tipo=webhook_asaas
   * (ver aplicarEventosWebhookAsaas em src/domain/integracoes/asaasCobranca.ts).
   */
  router.post("/webhooks/asaas", (req, res) => {
    const tokenEsperado = process.env.ASAAS_WEBHOOK_TOKEN;
    const tokenRecebido = req.header("asaas-access-token") ?? "";

    // Falha fechado: sem segredo configurado não há como autenticar o chamador.
    if (!tokenEsperado) {
      logger.error("[asaas-routes] ASAAS_WEBHOOK_TOKEN não configurado — webhook recusado (503).");
      res.status(503).json({ erro: "Webhook indisponível: token de webhook não configurado no servidor" });
      return;
    }

    // SEC-011B: comparação timing-safe do token
    if (!validateTokenSafely(tokenRecebido, tokenEsperado)) {
      res.status(401).json({ erro: "Token de webhook ausente ou inválido" });
      return;
    }

    // Valida formato mínimo do payload: campos obrigatórios event e payment.id
    const body = req.body ?? {};
    if (typeof body.event !== "string" || !body.event.trim()) {
      res.status(400).json({ erro: "Campo 'event' obrigatório no payload" });
      return;
    }

    const payment = body.payment ?? {};
    if (typeof payment.id !== "string" || !payment.id.trim()) {
      res.status(400).json({ erro: "Campo 'payment.id' obrigatório no payload" });
      return;
    }

    // Idempotência + enfileiramento em UMA transação (padrão outbox): a marca de "já visto" e o evento
    // pendente nascem juntos ou nenhum dos dois. Em duas operações soltas, uma queda entre elas deixaria
    // o evento marcado como visto e nunca enfileirado — e a reentrega do Asaas seria descartada como
    // duplicata, perdendo o pagamento. Qualquer falha desfaz tudo e responde 500 (o Asaas reenvia).
    //
    // A chave é o id do evento (body.id) ou, na falta dele, o hash do corpo. NUNCA payment.id: uma mesma
    // cobrança gera vários eventos distintos (criada, confirmada, recebida, estornada).
    try {
      if (db) {
        const payloadHash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
        const chaveEvento = typeof body.id === "string" && body.id.trim() ? body.id : payloadHash;
        const registrarAtomicamente = db.transaction(() => {
          const inserido = db
            .prepare(
              `INSERT OR IGNORE INTO asaas_webhook_eventos (id, id_evento_asaas, tipo, payment_id, payload_hash)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(randomUUID(), chaveEvento, body.event, payment.id, payloadHash);
          if (inserido.changes === 0) return false;
          eventosService.registrarEvento("webhook_asaas", body);
          return true;
        });
        if (!registrarAtomicamente()) {
          logger.info(`[asaas-routes] Webhook duplicado (chave ${chaveEvento.slice(0, 12)}…) — 200 sem reprocessar`);
          res.json({ recebido: true, duplicado: true });
          return;
        }
      } else {
        eventosService.registrarEvento("webhook_asaas", body);
      }
    } catch (erro) {
      logger.error("[asaas-routes] Falha ao registrar o evento do webhook:", erro instanceof Error ? erro.message : erro);
      res.status(500).json({ erro: "Falha ao registrar o evento; tente novamente" });
      return;
    }

    res.json({ recebido: true });
  });

  /**
   * POST /api/asaas/cobrancas/:chargeId/processar-devolucao
   * Header: Authorization: Bearer <token>
   * Body: { motivo: string, tipoForce?: 'reversao' | 'devolucao' }
   *
   * Processa um reembolso para uma cobrança já paga. A lógica de negócio fica no módulo
   * de domínio (asaasReembolsos.ts), o servidor só valida inputs, chama a função e
   * devolve o resultado. Idempotência garantida por UNIQUE constraint na tabela.
   */
  router.post("/cobrancas/:chargeId/processar-devolucao", exigirAutenticacao, async (req, res) => {
    const { motivo, tipoForce } = req.body ?? {};
    const chargeId = req.params.chargeId?.trim();

    if (!chargeId) {
      res.status(400).json({ erro: "chargeId é obrigatório (via URL)" });
      return;
    }

    if (typeof motivo !== "string" || !motivo.trim()) {
      res.status(400).json({ erro: "motivo é obrigatório (corpo)" });
      return;
    }

    if (tipoForce && !["reversao", "devolucao"].includes(tipoForce)) {
      res.status(400).json({ erro: "tipoForce inválido — precisa ser 'reversao' ou 'devolucao'" });
      return;
    }

    try {
      const db = (req as any).db;
      const reembolso = await processarReembolsoAsaas(db, {
        chargeId,
        motivo: motivo.trim(),
        tipoForce: tipoForce as "reversao" | "devolucao" | undefined,
      });

      res.status(201).json({
        id: reembolso.id,
        asaasChargeId: reembolso.asaasChargeId,
        motivo: reembolso.motivo,
        tipo: reembolso.tipo,
        status: reembolso.status,
        dataProcessamento: reembolso.dataProcessamento,
        origemTipo: reembolso.origemTipo,
        origemId: reembolso.origemId,
      });
    } catch (erro) {
      if (erro instanceof Error && erro.message.includes("não encontrada")) {
        res.status(404).json({ erro: erro.message });
        return;
      }
      if (erro instanceof Error && erro.message.includes("status")) {
        res.status(400).json({ erro: erro.message });
        return;
      }
      throw erro;
    }
  });

  /**
   * GET /api/asaas/cobrancas/:chargeId/reembolsos
   * Header: Authorization: Bearer <token>
   *
   * Lista reembolsos associados a uma cobrança específica.
   */
  router.get("/cobrancas/:chargeId/reembolsos", exigirAutenticacao, async (req, res) => {
    const chargeId = req.params.chargeId?.trim();

    if (!chargeId) {
      res.status(400).json({ erro: "chargeId é obrigatório (via URL)" });
      return;
    }

    try {
      const dbLocal = (req as any).db;
      const reembolsos = obterReembolsosPorChargeId(dbLocal, chargeId);

      res.json({
        chargeId,
        reembolsos: reembolsos.map((r) => ({
          id: r.id,
          tipo: r.tipo,
          status: r.status,
          motivo: r.motivo,
          dataProcessamento: r.dataProcessamento,
          criadoEm: r.criadoEm,
          mensagemErro: r.mensagemErro,
        })),
      });
    } catch (erro) {
      throw erro;
    }
  });

  /**
   * POST /api/asaas/reconciliar-agora
   * Header: Authorization: Bearer <token>
   *
   * Trigger manual para reconciliação imediata de todas as cobranças Asaas.
   * Útil para forçar uma sincronização fora do horário do loop automático (a cada 1h).
   * Retorna: { atualizadas, discrepancias, erros, detalhes }
   */
  router.post("/reconciliar-agora", exigirAutenticacao, async (req, res) => {
    if (!db) {
      res.status(503).json({ erro: "Banco de dados não disponível para reconciliação" });
      return;
    }

    try {
      const resultado = await sincronizarStatusTaxaAsaas(db);
      res.json({
        atualizadas: resultado.atualizadas,
        discrepancias: resultado.discrepancias,
        erros: resultado.erros,
        detalhes: resultado.detalhes,
      });
    } catch (erro) {
      logger.error("[asaas-routes] Erro ao reconciliar manualmente:", erro instanceof Error ? erro.message : erro);
      res.status(500).json({
        erro: "Erro ao reconciliar cobranças Asaas",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  return router;
}
