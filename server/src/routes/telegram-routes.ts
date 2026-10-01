/**
 * Rotas HTTP do bot do Telegram para captura rápida (texto ou foto de recibo/nota) — a
 * alternativa barata a um app mobile completo (decisão já tomada: o app completo fica para
 * depois de tudo configurado). O bot não lança nada como fato: toda mensagem recebida de um
 * chat vinculado é só enfileirada no inbox genérico de eventos externos (ver
 * eventos-externos-db.ts/eventos-externos-routes.ts), do mesmo jeito que o webhook da
 * Asaas — o cliente consome por polling e decide o que fazer, sempre com confirmação humana
 * antes de qualquer coisa virar transação/documento definitivo (ver
 * src/domain/integracoes/capturasPendentes.ts no client).
 *
 * Duas rotas, dois modelos de autenticação bem diferentes:
 *
 *   - `POST /gerar-codigo-vinculo` — chamada pelo APP, com sessão de usuário normal
 *     (`criarMiddlewareAutenticacao`, igual a toda outra rota autenticada do sistema).
 *
 *   - `POST /webhook` — chamada pelo próprio TELEGRAM, que não manda `Authorization: Bearer`
 *     nenhum. Autenticada pelo mecanismo oficial da Bot API: o header
 *     `X-Telegram-Bot-Api-Secret-Token`, que o Telegram ecoa em toda chamada de webhook
 *     quando um `secret_token` foi configurado no `setWebhook` — comparado aqui contra
 *     `TELEGRAM_WEBHOOK_SECRET`. Preferido a um segredo na própria URL (também sugerido na
 *     tarefa) porque é suportado nativamente pela Bot API, não aparece em log de acesso por
 *     URL, e não precisa ser reconstruído em nenhum outro lugar do código.
 *
 * O vínculo chat_id <-> usuario_id (tabela `telegram_vinculos`, ver
 * migrations-phase3-integracoes.sql) é feito por código de uso único: o usuário pede um
 * código na tela do app (`gerar-codigo-vinculo`) e manda "/vincular CODIGO" ao bot — o
 * webhook resolve o código e preenche `chat_id`/`vinculado_em`. Até isso acontecer, qualquer
 * outra mensagem do mesmo chat é recusada (orientando a vincular primeiro) — nunca enfileira
 * um evento sem usuario_id resolvido para esta integração (diferente do webhook da Asaas,
 * que não tem como saber o usuário antes de consumir: aqui o chat_id já resolve isso).
 */
import express from "express";
import { randomUUID, randomInt } from "crypto";
import type Database from "better-sqlite3";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import type { EventosExternosServiceDB } from "../domain/integracoes/eventos-externos-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import {
  enviarMensagemTelegram,
  baixarArquivoTelegram,
  TelegramConfiguracaoAusenteError,
  type AtualizacaoTelegram,
  type MensagemTelegram,
} from "../telegram-bot.js";

export interface TelegramRoutesDeps {
  authService: AuthServiceDB;
  eventosService: EventosExternosServiceDB;
  db: Database.Database;
}

const DURACAO_CODIGO_MINUTOS = 15;
const TENTATIVAS_CODIGO_UNICO = 5;

/** Payload gravado em `eventos_externos_pendentes.payload_json` para `tipo =
 * 'captura_telegram'` — o cliente (src/domain/integracoes/capturasPendentes.ts) espera
 * exatamente este shape. `foto`, quando presente, já traz os bytes em base64 (ver
 * telegram-bot.ts para por quê, em vez de só a URL temporária do Telegram). */
export interface PayloadCapturaTelegram {
  chatId: string;
  mensagemTelegramId: number;
  /** ISO 8601, convertido do unix seconds que o Telegram manda em `message.date`. */
  dataMensagem: string;
  texto?: string;
  legenda?: string;
  foto?: { fileId: string; mimeType: string; base64: string };
}

interface LinhaVinculo {
  id: string;
  usuario_id: string;
  codigo_vinculo: string;
  chat_id: string | null;
  vinculado_em: string | null;
  expira_em: string;
}

function gerarCodigo6Digitos(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Formato 'YYYY-MM-DD HH:MM:SS' (UTC) — o mesmo que `CURRENT_TIMESTAMP` do SQLite produz,
 * para que a comparação lexicográfica `expira_em > CURRENT_TIMESTAMP` funcione. */
function timestampSqliteEmMinutos(minutosAPartirDeAgora: number): string {
  return new Date(Date.now() + minutosAPartirDeAgora * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

/** Insere um vínculo pendente (sem chat_id ainda) com um código de 6 dígitos garantidamente
 * único entre os códigos cadastrados — colisão é extremamente rara (poucos códigos ativos
 * por vez contra 1 milhão de combinações), mas um UNIQUE failure vira apenas uma nova
 * tentativa com outro código em vez de estourar a requisição. */
function inserirVinculoComCodigoUnico(db: Database.Database, usuarioId: string): string {
  const expiraEm = timestampSqliteEmMinutos(DURACAO_CODIGO_MINUTOS);
  const inserir = db.prepare(
    `INSERT INTO telegram_vinculos (id, usuario_id, codigo_vinculo, expira_em) VALUES (?, ?, ?, ?)`,
  );
  for (let tentativa = 0; tentativa < TENTATIVAS_CODIGO_UNICO; tentativa++) {
    const codigo = gerarCodigo6Digitos();
    try {
      inserir.run(randomUUID(), usuarioId, codigo, expiraEm);
      return codigo;
    } catch {
      // UNIQUE(codigo_vinculo) — tenta de novo com outro código.
    }
  }
  throw new Error("Não foi possível gerar um código de vínculo único após múltiplas tentativas");
}

function buscarVinculoPorChatId(db: Database.Database, chatId: string): LinhaVinculo | undefined {
  return db.prepare(`SELECT * FROM telegram_vinculos WHERE chat_id = ?`).get(chatId) as LinhaVinculo | undefined;
}

function buscarVinculoPendentePorCodigo(db: Database.Database, codigo: string): LinhaVinculo | undefined {
  return db
    .prepare(
      `SELECT * FROM telegram_vinculos WHERE codigo_vinculo = ? AND chat_id IS NULL AND expira_em > strftime('%Y-%m-%d %H:%M:%S', 'now')`,
    )
    .get(codigo) as LinhaVinculo | undefined;
}

/** Trata "/vincular CODIGO" — resolve o código (não expirado, ainda sem chat_id), preenche
 * chat_id/vinculado_em, e sempre responde ao usuário (sucesso ou motivo da recusa). */
async function tratarComandoVincular(db: Database.Database, chatId: string, texto: string): Promise<void> {
  const codigo = texto.trim().split(/\s+/)[1];
  if (!codigo) {
    await enviarMensagemTelegram(chatId, "Uso: /vincular CODIGO — gere o código na tela do app (Capturas via Telegram).");
    return;
  }

  const vinculo = buscarVinculoPendentePorCodigo(db, codigo);
  if (!vinculo) {
    await enviarMensagemTelegram(chatId, "Código inválido, já usado ou expirado. Gere um novo código na tela do app.");
    return;
  }

  try {
    db.prepare(`UPDATE telegram_vinculos SET chat_id = ?, vinculado_em = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE id = ?`).run(
      chatId,
      vinculo.id,
    );
  } catch {
    // UNIQUE(chat_id) — este chat já está vinculado a OUTRO código/usuário.
    await enviarMensagemTelegram(chatId, "Este chat já está vinculado a uma conta.");
    return;
  }

  await enviarMensagemTelegram(
    chatId,
    "Vinculado! A partir de agora, texto ou foto de recibo/nota que você mandar aqui entra na fila de triagem do app.",
  );
}

/** Monta o payload do evento a partir da mensagem recebida — baixa a foto (se houver) ANTES
 * de enfileirar, porque o evento pode ficar pendente de consumo por tempo indeterminado (o
 * cliente só consome quando o app é aberto) e o `file_path` temporário do Telegram expira. */
async function montarPayloadCaptura(mensagem: MensagemTelegram): Promise<PayloadCapturaTelegram> {
  const payload: PayloadCapturaTelegram = {
    chatId: String(mensagem.chat.id),
    mensagemTelegramId: mensagem.message_id,
    dataMensagem: new Date(mensagem.date * 1000).toISOString(),
  };
  if (mensagem.text) payload.texto = mensagem.text;
  if (mensagem.caption) payload.legenda = mensagem.caption;
  if (mensagem.photo && mensagem.photo.length > 0) {
    // Resoluções vêm da menor para a maior — a última é a de melhor qualidade para OCR.
    const maiorResolucao = mensagem.photo[mensagem.photo.length - 1];
    const arquivo = await baixarArquivoTelegram(maiorResolucao.file_id);
    payload.foto = { fileId: maiorResolucao.file_id, mimeType: arquivo.mimeType, base64: arquivo.base64 };
  }
  return payload;
}

/** Trata qualquer mensagem que não seja "/vincular" — só de um chat JÁ vinculado; enfileira
 * a captura com o usuario_id já resolvido pelo vínculo. */
async function tratarCaptura(
  db: Database.Database,
  eventosService: EventosExternosServiceDB,
  mensagem: MensagemTelegram,
): Promise<void> {
  const chatId = String(mensagem.chat.id);
  const vinculo = buscarVinculoPorChatId(db, chatId);
  if (!vinculo) {
    await enviarMensagemTelegram(
      chatId,
      "Este chat ainda não está vinculado a uma conta. Gere um código na tela do app e mande aqui: /vincular CODIGO",
    );
    return;
  }

  if (!mensagem.text && !mensagem.caption && !mensagem.photo?.length) {
    // Tipo de mensagem fora de escopo (sticker, áudio, localização...) — nada a capturar.
    await enviarMensagemTelegram(chatId, "Mande um texto ou uma foto de recibo/nota — outros tipos de mensagem não são suportados ainda.");
    return;
  }

  const payload = await montarPayloadCaptura(mensagem);
  eventosService.registrarEvento("captura_telegram", payload, vinculo.usuario_id);
  await enviarMensagemTelegram(chatId, "Recebido — vai entrar na fila de triagem para você revisar no app.");
}

export function criarRotasTelegram({ authService, eventosService, db }: TelegramRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  // Avisos de boot (nunca impedem o resto do servidor de subir — ver cabeçalho da tarefa):
  // sem TELEGRAM_BOT_TOKEN o bot não consegue mandar/baixar nada da API do Telegram; sem
  // TELEGRAM_WEBHOOK_SECRET o webhook recusa toda chamada (ver abaixo) até ser configurado.
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn(
      "[telegram-routes] TELEGRAM_BOT_TOKEN não definido — o bot de captura rápida do Telegram está desativado. " +
        "POST /gerar-codigo-vinculo responderá 503 e POST /webhook não enviará respostas ao usuário até a " +
        "variável ser configurada (ver .env.example). O resto do servidor continua funcionando normalmente.",
    );
  }
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    console.warn(
      "[telegram-routes] TELEGRAM_WEBHOOK_SECRET não definido — POST /webhook vai recusar TODA chamada (401) até " +
        "a variável ser configurada e o mesmo valor definido como secret_token na chamada setWebhook do Telegram.",
    );
  }

  /**
   * POST /gerar-codigo-vinculo
   * Header: Authorization: Bearer <token>
   *
   * Gera um código de 6 dígitos, válido por 15 minutos, para o usuário autenticado vincular
   * seu chat do Telegram mandando "/vincular CODIGO" ao bot. Gerar um novo código não
   * invalida códigos anteriores ainda não expirados — o primeiro a ser confirmado vale.
   */
  router.post("/gerar-codigo-vinculo", exigirAutenticacao, (req, res) => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      res.status(503).json({
        erro: "Bot do Telegram não configurado neste servidor (falta TELEGRAM_BOT_TOKEN) — peça para configurar antes de gerar um código de vínculo.",
      });
      return;
    }
    const usuarioId = req.auth!.usuario!.id;
    try {
      const codigo = inserirVinculoComCodigoUnico(db, usuarioId);
      res.status(201).json({ codigo, expiraEmMinutos: DURACAO_CODIGO_MINUTOS });
    } catch (erro) {
      res.status(500).json({ erro: erro instanceof Error ? erro.message : "Falha ao gerar código de vínculo" });
    }
  });

  /**
   * POST /webhook
   * (SEM autenticação de sessão — ver cabeçalho do arquivo)
   *
   * Autenticado pelo header `X-Telegram-Bot-Api-Secret-Token`, comparado contra
   * `TELEGRAM_WEBHOOK_SECRET`. Diferente do webhook da Asaas (asaas-routes.ts), aqui a
   * ausência da env var NUNCA abre a rota sem validação — sem o secret configurado dos dois
   * lados (aqui e no setWebhook do Telegram), qualquer um que descubra esta URL conseguiria
   * injetar eventos em nome de qualquer chat_id já vinculado.
   */
  router.post("/webhook", async (req, res) => {
    const segredoEsperado = process.env.TELEGRAM_WEBHOOK_SECRET;
    const segredoRecebido = req.header("X-Telegram-Bot-Api-Secret-Token");
    if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
      res.status(401).json({ erro: "Secret token do webhook ausente ou inválido" });
      return;
    }

    const atualizacao = (req.body ?? {}) as AtualizacaoTelegram;
    const mensagem = atualizacao.message;
    if (!mensagem) {
      // Outros tipos de Update (edited_message, callback_query, etc.) — fora de escopo desta
      // integração; o Telegram espera 200 mesmo assim para não reenviar o Update.
      res.status(200).json({ ok: true });
      return;
    }

    try {
      const texto = mensagem.text?.trim();
      if (texto && /^\/vincular\b/i.test(texto)) {
        await tratarComandoVincular(db, String(mensagem.chat.id), texto);
      } else {
        await tratarCaptura(db, eventosService, mensagem);
      }
    } catch (erro) {
      // Nunca deixa uma falha (ex: download da foto, API do Telegram fora do ar) propagar
      // como 500 pro Telegram ficar reenviando o mesmo Update indefinidamente — loga e
      // responde 200 de qualquer forma; quem perde a captura pode reenviar a mensagem.
      console.error(
        "[telegram-routes] erro ao processar atualização do webhook:",
        erro instanceof TelegramConfiguracaoAusenteError ? erro.message : erro,
      );
    }

    res.status(200).json({ ok: true });
  });

  return router;
}
