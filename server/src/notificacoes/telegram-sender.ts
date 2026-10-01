/**
 * Client HTTP MÍNIMO e INDEPENDENTE para enviar mensagem de texto via Telegram Bot API —
 * usado como canal de notificação (cobrança/comunicado) para quem já tem um chat_id do
 * Telegram vinculado (ver `telegram_vinculos` em migrations-phase3-integracoes.sql e a
 * limitação documentada em `src/domain/notificacoes/resolverDestinatarios.ts`).
 *
 * NÃO É RELACIONADO ao bot de captura rápida de documentos (`server/src/telegram-bot.ts`
 * / `server/src/routes/telegram-routes.ts`), que está sendo construído por outro agente em
 * paralelo — este arquivo NÃO importa nada de lá e não depende dele existir. É só um
 * `fetch` simples para o endpoint `sendMessage` da Bot API, usando a mesma variável de
 * ambiente `TELEGRAM_BOT_TOKEN` (o token do bot é um recurso único do titular, comum aos
 * dois usos — captura rápida e notificação — mas os dois módulos nunca se chamam).
 *
 * Mesma regra de ouro dos outros 2 senders: `TELEGRAM_BOT_TOKEN` só é lido DENTRO de
 * `enviarTelegram`, no momento da chamada — nunca no topo do módulo/boot do servidor.
 */

/** Lançado quando TELEGRAM_BOT_TOKEN não está configurado — nunca no boot, só na chamada
 * de `enviarTelegram`. */
export class TelegramSenderConfiguracaoAusenteError extends Error {
  constructor() {
    super(
      "TELEGRAM_BOT_TOKEN não está configurado no ambiente do servidor — defina-o no .env antes de enviar notificação via Telegram (ver .env.example).",
    );
    this.name = "TelegramSenderConfiguracaoAusenteError";
  }
}

export interface OpcoesEnviarTelegram {
  /** chat_id do destinatário — hoje, na prática, só o chat_id do PRÓPRIO usuário do
   * sistema (titular/administrador/contador) vinculado via `telegram_vinculos`; locatários
   * e clientes da advocacia não têm (ainda) um jeito de vincular um chat_id próprio — ver
   * resolverDestinatarios.ts. Esta função é genérica de propósito (recebe o chat_id já
   * resolvido por quem chama) e não sabe nem precisa saber de onde ele veio. */
  chatId: string;
  mensagem: string;
}

/** Envia uma mensagem de texto via `sendMessage` da Telegram Bot API. Lança erro claro se
 * TELEGRAM_BOT_TOKEN estiver ausente ou se a API do Telegram responder com erro. */
export async function enviarTelegram({ chatId, mensagem }: OpcoesEnviarTelegram): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramSenderConfiguracaoAusenteError();

  const resposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: mensagem }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Telegram Bot API respondeu ${resposta.status}: ${corpo}`);
  }
}
