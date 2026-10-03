/**
 * Cliente fino para a API HTTP do Telegram Bot (Bot API) — usado pelo webhook/rotas de
 * captura rápida (ver telegram-routes.ts). Só `fetch` nativo, nenhum SDK: a Bot API é REST
 * simples o bastante (3 chamadas usadas aqui — sendMessage, getFile, download do arquivo)
 * para não justificar trazer uma dependência nova — mesmo raciocínio de server/src/asaas.ts.
 *
 * REGRA DE OURO DE SEGURANÇA: `TELEGRAM_BOT_TOKEN` só é lido DENTRO de cada função, no
 * momento da chamada — nunca no topo do módulo. Importar este arquivo (em qualquer teste,
 * ou na inicialização do servidor) não exige a env var configurada; o resto do app continua
 * funcionando sem o bot configurado, e só a chamada de fato falha, com mensagem clara. O
 * token nunca é lido nem referenciado por código do cliente (`src/`) — nenhum arquivo deste
 * módulo é importado pelo bundle do navegador.
 */

/** Lançado quando TELEGRAM_BOT_TOKEN não está configurado no ambiente do servidor — nunca
 * no boot (ver aviso em telegram-routes.ts), só no momento em que uma função deste módulo é
 * de fato chamada. */
export class TelegramConfiguracaoAusenteError extends Error {
  constructor() {
    super(
      "TELEGRAM_BOT_TOKEN não está configurado no ambiente do servidor — defina-o no .env antes de usar o bot do " +
        "Telegram (ver .env.example). O resto do servidor continua funcionando normalmente sem ele.",
    );
    this.name = "TelegramConfiguracaoAusenteError";
  }
}

function tokenOuFalhar(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramConfiguracaoAusenteError();
  return token;
}

function baseUrlApi(token: string): string {
  return `https://api.telegram.org/bot${token}`;
}

/**
 * Shape relevante do corpo que o Telegram envia no webhook (`Update`) — só os campos que
 * esta integração usa, não o objeto completo da Bot API. Ver
 * https://core.telegram.org/bots/api#update e #message para o shape completo.
 */
export interface FotoTelegram {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface MensagemTelegram {
  message_id: number;
  /** Unix seconds (hora do servidor do Telegram, não do navegador/servidor deste app). */
  date: number;
  chat: { id: number | string; type: string };
  text?: string;
  /** Legenda de uma foto/documento enviado junto — Telegram nunca manda `text` E `caption`
   * na mesma mensagem. */
  caption?: string;
  /** Várias resoluções da mesma foto, da menor para a maior — a última é a de melhor
   * qualidade, a que usamos (ver telegram-routes.ts). */
  photo?: FotoTelegram[];
}

export interface AtualizacaoTelegram {
  update_id: number;
  message?: MensagemTelegram;
}

/**
 * Envia uma mensagem de texto simples a um chat — usado para confirmar/recusar
 * `/vincular CODIGO` e para orientar quem manda mensagem a um chat ainda não vinculado.
 * Lança `TelegramConfiguracaoAusenteError` se o token não estiver configurado, ou `Error`
 * com o status/corpo se a API do Telegram responder erro.
 */
export async function enviarMensagemTelegram(chatId: string | number, texto: string): Promise<void> {
  const token = tokenOuFalhar();
  const resposta = await fetch(`${baseUrlApi(token)}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Telegram sendMessage retornou ${resposta.status} para o chat ${chatId}: ${corpo.slice(0, 300)}`);
  }
}

export interface ArquivoBaixadoTelegram {
  /** Conteúdo do arquivo, em base64 — o payload do evento externo (`eventos_externos_pendentes.payload_json`)
   * é um JSON serializado, então os bytes crus da foto não cabem ali sem codificação. */
  base64: string;
  mimeType: string;
}

/** Deduz o content-type pela extensão do `file_path` que o Telegram devolve — fotos enviadas
 * ao bot normalmente chegam como .jpg (a Bot API reencoda para JPEG antes de servir), mas
 * cobrimos os dois outros formatos que a API já documentou retornar em casos raros (stickers
 * estáticos/.webp, documentos enviados como foto em alguns clientes/.png). Desconhecido cai
 * para jpeg — nunca bloqueia o download por falta de extensão reconhecida. */
function mimeTypePorExtensao(filePath: string): string {
  const extensao = filePath.split(".").pop()?.toLowerCase();
  if (extensao === "png") return "image/png";
  if (extensao === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Baixa um arquivo (foto) enviado ao bot. O Telegram manda só o `file_id` no `Update` — o
 * conteúdo exige uma segunda chamada (`getFile`, que resolve um `file_path` temporário,
 * válido por um tempo limitado) seguida de um GET no domínio de arquivos
 * (`https://api.telegram.org/file/bot<token>/<file_path>`), que é separado da API normal.
 *
 * Decisão registrada (pedida explicitamente pela tarefa): os bytes vêm embutidos em base64
 * no payload do evento externo, em vez de só a URL temporária — o `file_path` do Telegram
 * expira (tipicamente ~1h) e o evento pode ficar pendente de consumo pelo cliente por mais
 * tempo que isso (o cliente só puxa quando o app é aberto); gravar a URL arriscaria o
 * usuário abrir o app depois da expiração e a foto já não existir mais para baixar.
 */
export async function baixarArquivoTelegram(fileId: string): Promise<ArquivoBaixadoTelegram> {
  const token = tokenOuFalhar();

  const respGetFile = await fetch(`${baseUrlApi(token)}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!respGetFile.ok) {
    const corpo = await respGetFile.text().catch(() => "");
    throw new Error(`Telegram getFile retornou ${respGetFile.status} para file_id ${fileId}: ${corpo.slice(0, 300)}`);
  }
  const corpoGetFile = (await respGetFile.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = corpoGetFile.result?.file_path;
  if (!corpoGetFile.ok || !filePath) {
    throw new Error(`Telegram getFile não retornou file_path para file_id ${fileId}`);
  }

  const respArquivo = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!respArquivo.ok) {
    throw new Error(`Download do arquivo do Telegram (${filePath}) retornou ${respArquivo.status}`);
  }
  const bytes = Buffer.from(await respArquivo.arrayBuffer());
  return { base64: bytes.toString("base64"), mimeType: mimeTypePorExtensao(filePath) };
}
