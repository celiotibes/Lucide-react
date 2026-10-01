/**
 * Rota HTTP para disparar notificação (e-mail/WhatsApp/Telegram) quando uma cobrança é
 * emitida ou um comunicado genérico é enviado (decisão do usuário, 2026-10: toda
 * cobrança/boleto/comunicado deve sair também por e-mail e WhatsApp/Telegram cadastrados,
 * não só ficar visível dentro do sistema).
 *
 * ARQUITETURA — por quê este router NÃO resolve destinatário nenhum e NÃO tem rota de
 * histórico (`GET /origem/...`): a tabela `notificacoes_enviadas`, assim como
 * `cobrancas_asaas`/`aluguel_competencias`/`entidades_legais` etc., vive em
 * `contabilidade-reconstituicao/schema.sql` — o banco sql.js/IndexedDB do CLIENTE
 * (navegador). O servidor NUNCA tem acesso a esse banco (mesmo motivo documentado em
 * `migrations-phase3-integracoes.sql` e em `asaas-routes.ts`: "só o cliente tem acesso ao
 * banco local sql.js/IndexedDB"). Por isso:
 *
 *   - quem RESOLVE o destinatário (e-mail/telefone do locatário ou da entidade legal) é o
 *     CLIENTE, antes de chamar esta rota — ver `src/domain/notificacoes/
 *     resolverDestinatarios.ts`;
 *   - quem GRAVA a tentativa/resultado em `notificacoes_enviadas` é o CLIENTE, depois de
 *     receber a resposta desta rota — ver `src/domain/notificacoes/despachoCliente.ts` e
 *     `notificacoes-db.ts` (mesmo padrão de `asaas-routes.ts`: "Não grava nada
 *     localmente — quem chama é responsável por persistir, porque só o cliente tem acesso
 *     ao banco local");
 *   - o HISTÓRICO (`GET .../origem/...`) é consultado pelo cliente DIRETO no seu próprio
 *     banco local (sem HTTP nenhum) — ver `NotificacoesView.tsx` — então não existe
 *     equivalente nesta rota: o servidor não tem o dado para servir.
 *
 * Este router é, portanto, só o MENSAGEIRO stateless: recebe `destinatarios` JÁ
 * RESOLVIDOS no corpo da requisição, tenta cada canal usando os segredos que só o
 * servidor tem (SMTP_PASS / WHATSAPP_CLOUD_API_TOKEN / TELEGRAM_BOT_TOKEN) e devolve o
 * resultado de cada canal.
 */
import express from "express";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { dispararNotificacao, type SendersNotificacao } from "../domain/notificacoes/despacho.js";
import { enviarEmail } from "../notificacoes/email.js";
import { enviarWhatsapp } from "../notificacoes/whatsapp.js";
import { enviarTelegram } from "../notificacoes/telegram-sender.js";

export interface NotificacoesRoutesDeps {
  authService: AuthServiceDB;
  /** Injeção dos 3 senders — por padrão os reais (SMTP/WhatsApp Cloud API/Telegram Bot
   * API); os testes de rota sobrescrevem com fakes, para nunca tocar rede real nem exigir
   * as env vars de produção configuradas. */
  senders?: SendersNotificacao;
}

const ORIGENS_VALIDAS = ["cobranca_asaas", "comunicado_generico", "lembrete_aluguel", "lembrete_honorario"] as const;
type OrigemNotificacao = (typeof ORIGENS_VALIDAS)[number];

function origemValida(valor: unknown): valor is OrigemNotificacao {
  return typeof valor === "string" && (ORIGENS_VALIDAS as readonly string[]).includes(valor);
}

const sendersPadrao: SendersNotificacao = { enviarEmail, enviarWhatsapp, enviarTelegram };

export function criarRotasNotificacoes({ authService, senders = sendersPadrao }: NotificacoesRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * POST /disparar
   * Header: Authorization: Bearer <token>
   * Body: {
   *   origemTipo: 'cobranca_asaas' | 'comunicado_generico',
   *   origemId?: number | null,     -- só informativo (ecoado na resposta); não é lido de banco algum aqui
   *   assunto?: string,
   *   mensagem: string,
   *   destinatarios: { email?: string, whatsappE164?: string, telegramChatId?: string }  -- JÁ RESOLVIDO por quem chama
   * }
   *
   * `destinatarios` precisa ter ao menos um canal preenchido (senão não há nada para
   * disparar). `origemTipo`/`origemId` não são usados para resolver nem persistir nada
   * aqui — servem só para o chamador (cliente) correlacionar a resposta com a origem,
   * ecoados de volta na resposta.
   */
  router.post("/disparar", exigirAutenticacao, async (req, res) => {
    const { origemTipo, origemId, assunto, mensagem, destinatarios } = req.body ?? {};

    if (!origemValida(origemTipo)) {
      res.status(400).json({ erro: `origemTipo inválido — precisa ser um de: ${ORIGENS_VALIDAS.join(", ")}` });
      return;
    }
    if (origemId !== undefined && origemId !== null && typeof origemId !== "number") {
      res.status(400).json({ erro: "origemId precisa ser number ou nulo" });
      return;
    }
    if (typeof mensagem !== "string" || !mensagem.trim()) {
      res.status(400).json({ erro: "mensagem é obrigatória" });
      return;
    }
    if (assunto !== undefined && typeof assunto !== "string") {
      res.status(400).json({ erro: "assunto precisa ser string" });
      return;
    }
    if (typeof destinatarios !== "object" || destinatarios === null || Array.isArray(destinatarios)) {
      res.status(400).json({ erro: "destinatarios é obrigatório (objeto com email/whatsappE164/telegramChatId)" });
      return;
    }
    const { email, whatsappE164, telegramChatId } = destinatarios as Record<string, unknown>;
    if (
      (email !== undefined && typeof email !== "string") ||
      (whatsappE164 !== undefined && typeof whatsappE164 !== "string") ||
      (telegramChatId !== undefined && typeof telegramChatId !== "string")
    ) {
      res.status(400).json({ erro: "destinatarios.email/whatsappE164/telegramChatId precisam ser string quando informados" });
      return;
    }
    if (!email && !whatsappE164 && !telegramChatId) {
      res.status(400).json({ erro: "informe ao menos um destinatário (email, whatsappE164 ou telegramChatId)" });
      return;
    }

    const resultados = await dispararNotificacao(senders, {
      assunto: typeof assunto === "string" ? assunto : undefined,
      mensagem,
      destinatarios: {
        email: email as string | undefined,
        whatsappE164: whatsappE164 as string | undefined,
        telegramChatId: telegramChatId as string | undefined,
      },
    });

    res.json({ origemTipo, origemId: origemId ?? null, resultados });
  });

  return router;
}
