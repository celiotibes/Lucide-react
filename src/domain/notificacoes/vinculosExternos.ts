/**
 * Vínculo de Telegram para CONTATOS EXTERNOS — locatário (via `contrato_locatarios`,
 * referência `'contrato_locatario'`), cliente da advocacia (via `entidades_legais`,
 * referência `'entidade_legal'`) e prestador de serviço (via `prestadores`, referência
 * `'prestador'`) — sobre a tabela `vinculos_telegram_externos` (ver
 * contabilidade-reconstituicao/schema.sql).
 *
 * POR QUE ISTO VIVE NO CLIENTE e não no servidor, mesmo padrão de `notificacoes-db.ts` e
 * `resolverDestinatarios.ts`: o servidor NUNCA tem acesso ao banco de negócio sql.js/
 * IndexedDB — ele não sabe o que é um "locatário" ou um "prestador", só sabe `usuario_id`
 * (ver `telegram_vinculos`, usado para usuário DO SISTEMA — titular/contador/etc). Por
 * isso o código de vínculo é gerado e RESOLVIDO AQUI, no cliente:
 *
 *   1. `gerarCodigoVinculo` grava um código de 6 dígitos em `vinculos_telegram_externos`,
 *      com `chat_id` ainda `NULL` — a tela mostra "/vincular CODIGO" + o @ do bot (ver
 *      `VincularTelegramExterno.tsx`).
 *   2. O contato manda essa mensagem ao bot. O webhook do servidor (`telegram-routes.ts`)
 *      não reconhece o código (ele só conhece `telegram_vinculos`, de usuário do sistema)
 *      — então só enfileira `{codigo, chatId}` em `vinculos_externos_telegram_pendentes`
 *      (inbox dedicado no banco do SERVIDOR, ver `vinculos-externos-telegram-db.ts`), sem
 *      tentar resolver.
 *   3. Quando o app é aberto, `resolverVinculosExternosPendentes` busca esses pendentes do
 *      servidor, casa cada `codigo_vinculo` contra a própria `vinculos_telegram_externos`
 *      (a única tabela que sabe a quem o código pertence), grava `chat_id`/`vinculado_em`
 *      quando casa, dispara uma mensagem de confirmação ao contato (reusando
 *      `dispararNotificacaoComunicado`, de `despachoCliente.ts` — o mesmo mensageiro que
 *      cobrança/comunicado usam), e manda o servidor marcar o pendente como consumido —
 *      sempre, mesmo quando não casa (não deixa lixo acumulando no inbox do servidor).
 *
 * `apiClient`/`notificacoesApiClient` são injetados de propósito (mesmo padrão de
 * `asaasCobranca.ts`/`capturasPendentes.ts`/`despachoCliente.ts`): produção usa os clientes
 * HTTP reais abaixo (`criarVinculosExternosApiClientHttp`), que chamam o PRÓPRIO backend com
 * o Bearer token de sessão; testes usam fakes em memória, sem rede.
 *
 * Convenção de erro deste módulo: `throw new Error(...)` para falha de uso indevido
 * (parâmetros inválidos); falhas de rede/casamento de código NUNCA travam
 * `resolverVinculosExternosPendentes` (ver comentário na função) — cada pendente é tratado
 * independentemente dos outros.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { dispararNotificacaoComunicado, type NotificacoesApiClient } from "./despachoCliente";
import type { ReferenciaVinculoExterno } from "./resolverDestinatarios";

export type { ReferenciaVinculoExterno };

const DURACAO_CODIGO_MINUTOS = 15;
const TENTATIVAS_CODIGO_UNICO = 5;

/** Formato 'YYYY-MM-DD HH:MM:SS' (UTC) — o mesmo que `CURRENT_TIMESTAMP` do SQLite produz,
 * para que a comparação lexicográfica `expira_em > ?` funcione (mesma convenção de
 * `server/src/routes/telegram-routes.ts`, para o vínculo de usuário do sistema). */
function timestampEmMinutos(minutosAPartirDeAgora: number): string {
  return new Date(Date.now() + minutosAPartirDeAgora * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

function agoraSqlite(): string {
  return timestampEmMinutos(0);
}

function gerarCodigo6Digitos(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export interface CodigoVinculoGerado {
  codigo: string;
  /** 'YYYY-MM-DD HH:MM:SS' UTC — mesmo formato gravado em `expira_em`. */
  expiraEm: string;
}

/**
 * Gera um código de 6 dígitos, válido por 15 minutos, para `(referenciaTipo, referenciaId)`
 * vincular o próprio chat do Telegram mandando "/vincular CODIGO" ao bot. Gerar um novo
 * código não invalida um anterior ainda válido para a mesma referência — o primeiro a ser
 * confirmado vale (mesmo comportamento de `POST /api/telegram/gerar-codigo-vinculo`, para
 * usuário do sistema).
 *
 * `codigo_vinculo` é `UNIQUE` em toda a tabela (entre QUALQUER referência) — colisão entre
 * duas referências diferentes é extremamente rara (poucos códigos ativos por vez contra 1
 * milhão de combinações), mas nunca reusa um código de outra linha: uma falha de UNIQUE
 * vira só uma nova tentativa com outro código, nunca um vínculo cruzado.
 */
export function gerarCodigoVinculo(
  db: Database,
  referenciaTipo: ReferenciaVinculoExterno,
  referenciaId: number,
): CodigoVinculoGerado {
  const expiraEm = timestampEmMinutos(DURACAO_CODIGO_MINUTOS);
  for (let tentativa = 0; tentativa < TENTATIVAS_CODIGO_UNICO; tentativa++) {
    const codigo = gerarCodigo6Digitos();
    try {
      executar(
        db,
        `INSERT INTO vinculos_telegram_externos (referencia_tipo, referencia_id, codigo_vinculo, expira_em) VALUES (?, ?, ?, ?)`,
        [referenciaTipo, referenciaId, codigo, expiraEm],
      );
      return { codigo, expiraEm };
    } catch {
      // UNIQUE(codigo_vinculo) de outra linha — tenta de novo com outro código.
    }
  }
  throw new Error("Não foi possível gerar um código de vínculo único após múltiplas tentativas");
}

export interface EstadoVinculoExterno {
  /** `true` quando já há um `chat_id` confirmado para esta referência — nesse caso
   * `chatId` vem preenchido e `codigo`/`expiraEm` NUNCA vêm (um vínculo confirmado
   * prevalece sobre qualquer código pendente mais recente da mesma referência). */
  vinculado: boolean;
  /** Presente só quando `vinculado === false` E houver um código ainda válido (não
   * expirado) gerado para esta referência — a UI mostra "aguardando confirmação". Ausente
   * quando nunca foi gerado nenhum código, ou só existem códigos já expirados. */
  codigo?: string;
  /** Presente só junto com `codigo` — 'YYYY-MM-DD HH:MM:SS' UTC. */
  expiraEm?: string;
  /** Presente só quando `vinculado === true`. */
  chatId?: string;
}

interface LinhaVinculoExterno {
  codigo_vinculo: string;
  chat_id: string | null;
  expira_em: string;
}

/**
 * Estado atual do vínculo de `(referenciaTipo, referenciaId)` — para a UI mostrar
 * "vinculado" / "aguardando confirmação" / "ainda não vinculado" (ver
 * `VincularTelegramExterno.tsx`). Um vínculo já confirmado (`chat_id` preenchido) sempre
 * prevalece sobre qualquer código pendente mais recente da mesma referência.
 */
export function listarVinculosPendentesEAtivos(
  db: Database,
  referenciaTipo: ReferenciaVinculoExterno,
  referenciaId: number,
): EstadoVinculoExterno {
  const linhas = consultar<LinhaVinculoExterno>(
    db,
    `SELECT codigo_vinculo, chat_id, expira_em FROM vinculos_telegram_externos
     WHERE referencia_tipo = ? AND referencia_id = ?
     ORDER BY criado_em DESC`,
    [referenciaTipo, referenciaId],
  );

  const vinculado = linhas.find((linha) => linha.chat_id !== null);
  if (vinculado) {
    return { vinculado: true, chatId: vinculado.chat_id! };
  }

  const agora = agoraSqlite();
  const pendenteValido = linhas.find((linha) => linha.chat_id === null && linha.expira_em > agora);
  if (pendenteValido) {
    return { vinculado: false, codigo: pendenteValido.codigo_vinculo, expiraEm: pendenteValido.expira_em };
  }

  return { vinculado: false };
}

/** Um código de vínculo externo ainda pendente no inbox do SERVIDOR (`GET
 * /api/telegram/vinculos-externos-pendentes`) — ver `vinculos-externos-telegram-db.ts`.
 * `recebidoEm` é só informativo (exibição na UI, ex: `CapturasTelegramView.tsx`) — a
 * resolução em si usa apenas `codigoVinculo`/`chatId`. */
export interface PendenteVinculoExternoServidor {
  id: string;
  codigoVinculo: string;
  chatId: string;
  recebidoEm?: string;
}

/** Porta que este módulo depende para consumir o inbox do servidor — a implementação real
 * é `criarVinculosExternosApiClientHttp` (chama `GET`/`POST /api/telegram/
 * vinculos-externos-pendentes...`, já existentes em `server/src/routes/telegram-routes.ts`);
 * testes usam um fake em memória. */
export interface VinculosExternosApiClient {
  listarPendentes(): Promise<PendenteVinculoExternoServidor[]>;
  marcarConsumido(id: string): Promise<void>;
}

export interface ResultadoResolucaoVinculosExternos {
  /** Quantos pendentes casaram com uma referência local e foram vinculados. */
  resolvidos: number;
  /** Quantos pendentes não casaram (código inexistente, expirado, já vinculado a outra
   * referência, ou colisão de chat_id) — contabilizado, nunca lançado como erro. */
  naoEncontrados: number;
}

const MENSAGEM_CONFIRMACAO = "Vínculo confirmado! Você vai receber notificações por aqui a partir de agora.";

/**
 * Busca os códigos de vínculo externo ainda pendentes no SERVIDOR (`apiClient.
 * listarPendentes()`) e tenta casar cada um com uma linha de `vinculos_telegram_externos`
 * local — ainda sem `chat_id` e não expirada. Quando casa: grava `chat_id`/`vinculado_em`
 * localmente e dispara uma mensagem de confirmação ao chat (via `dispararNotificacaoComunicado`,
 * reusando o mesmo mensageiro de cobrança/comunicado — `notificacoesApiClient` é a porta
 * dele, ver `despachoCliente.ts`). De um jeito ou de outro — casou ou não — sempre chama
 * `apiClient.marcarConsumido(id)` ao final: um pendente que nunca vai casar (código
 * inválido, ou de outro sistema) não deve acumular no inbox do servidor para sempre.
 *
 * Nunca lança por um pendente individual não casar, nem por falha ao disparar a mensagem de
 * confirmação (best-effort: o vínculo já foi gravado localmente de qualquer forma) — cada
 * pendente é tratado de forma independente, e uma falha pontual só conta como
 * `naoEncontrados`/segue para o próximo, nunca interrompe o lote inteiro.
 */
export async function resolverVinculosExternosPendentes(
  db: Database,
  apiClient: VinculosExternosApiClient,
  notificacoesApiClient: NotificacoesApiClient,
): Promise<ResultadoResolucaoVinculosExternos> {
  const pendentes = await apiClient.listarPendentes();
  let resolvidos = 0;
  let naoEncontrados = 0;

  for (const pendente of pendentes) {
    const casou = tentarCasarPendente(db, pendente);
    if (casou) {
      resolvidos++;
      try {
        await dispararNotificacaoComunicado(
          db,
          notificacoesApiClient,
          { telegramChatId: pendente.chatId },
          { mensagem: MENSAGEM_CONFIRMACAO },
        );
      } catch (erro) {
        // O vínculo já foi gravado localmente — uma falha ao notificar (rede, backend fora
        // do ar) não deve desfazer isso nem travar o resto do lote.
        console.error(
          `resolverVinculosExternosPendentes: vínculo gravado, mas falhou ao disparar confirmação ao chat ${pendente.chatId}:`,
          erro,
        );
      }
    } else {
      naoEncontrados++;
    }

    // Sempre consome — casado ou não — para não acumular no inbox do servidor (ver cabeçalho).
    await apiClient.marcarConsumido(pendente.id);
  }

  return { resolvidos, naoEncontrados };
}

/** Tenta casar UM pendente do servidor com uma linha local ainda sem chat_id e não
 * expirada; grava chat_id/vinculado_em quando casa. Devolve `false` tanto para "nenhuma
 * linha casou" quanto para "casou, mas a gravação falhou" (ex: UNIQUE(chat_id) — o mesmo
 * chat já está vinculado a OUTRA referência) — nenhum dos dois casos deve lançar. */
function tentarCasarPendente(db: Database, pendente: PendenteVinculoExternoServidor): boolean {
  const agora = agoraSqlite();
  const [linha] = consultar<{ id: number }>(
    db,
    `SELECT id FROM vinculos_telegram_externos WHERE codigo_vinculo = ? AND chat_id IS NULL AND expira_em > ? LIMIT 1`,
    [pendente.codigoVinculo, agora],
  );
  if (!linha) return false;

  try {
    executar(
      db,
      `UPDATE vinculos_telegram_externos SET chat_id = ?, vinculado_em = ? WHERE id = ?`,
      [pendente.chatId, agora, linha.id],
    );
    return true;
  } catch (erro) {
    console.error(
      `resolverVinculosExternosPendentes: código '${pendente.codigoVinculo}' casou, mas falhou ao gravar chat_id ${pendente.chatId} (provavelmente já vinculado a outra referência):`,
      erro,
    );
    return false;
  }
}

function cabecalhosAutenticados(token: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function mensagemErroResposta(resposta: Response, acaoDescricao: string): Promise<string> {
  try {
    const corpo = await resposta.json();
    if (typeof corpo?.erro === "string") return corpo.erro;
  } catch {
    /* corpo não é JSON — segue para a mensagem genérica abaixo */
  }
  return `${acaoDescricao} (HTTP ${resposta.status})`;
}

/**
 * Implementação de produção de `VinculosExternosApiClient` — chama o PRÓPRIO backend
 * (`GET`/`POST /api/telegram/vinculos-externos-pendentes...`, já existentes em
 * `server/src/routes/telegram-routes.ts`), com o mesmo Bearer token de sessão do resto do
 * app autenticado. Mesmo padrão de `criarCapturasApiClientHttp`
 * (`src/domain/integracoes/capturasPendentes.ts`).
 */
export function criarVinculosExternosApiClientHttp(backendUrl: string, token: string): VinculosExternosApiClient {
  return {
    async listarPendentes() {
      const resposta = await fetch(`${backendUrl}/api/telegram/vinculos-externos-pendentes`, {
        headers: cabecalhosAutenticados(token),
      });
      if (!resposta.ok) {
        throw new Error(await mensagemErroResposta(resposta, "Falha ao buscar vínculos externos pendentes do Telegram"));
      }
      const corpo: { pendentes: PendenteVinculoExternoServidor[] } = await resposta.json();
      return corpo.pendentes;
    },
    async marcarConsumido(id: string) {
      const resposta = await fetch(`${backendUrl}/api/telegram/vinculos-externos-pendentes/${encodeURIComponent(id)}/consumir`, {
        method: "POST",
        headers: cabecalhosAutenticados(token),
      });
      if (!resposta.ok) {
        throw new Error(await mensagemErroResposta(resposta, "Falha ao marcar vínculo externo como consumido"));
      }
    },
  };
}

/**
 * Implementação de produção de `NotificacoesApiClient` (porta definida em
 * `despachoCliente.ts`) — chama `POST /api/notificacoes/disparar`, já existente em
 * `server/src/routes/notificacoes-routes.ts`. Não existia ainda nenhuma implementação HTTP
 * real desta porta no cliente (só fakes em teste) — vive aqui, e não em `despachoCliente.ts`
 * (fora do conjunto de arquivos liberado para edição nesta rodada), porque é esta função
 * (`resolverVinculosExternosPendentes`) a primeira a precisar de fato chamá-la fora de
 * teste; qualquer outra tela que precisar disparar notificação pode reaproveitá-la.
 */
export function criarNotificacoesApiClientHttp(backendUrl: string, token: string): NotificacoesApiClient {
  return {
    async disparar(dados) {
      const resposta = await fetch(`${backendUrl}/api/notificacoes/disparar`, {
        method: "POST",
        headers: cabecalhosAutenticados(token),
        body: JSON.stringify(dados),
      });
      if (!resposta.ok) {
        throw new Error(await mensagemErroResposta(resposta, "Falha ao disparar notificação"));
      }
      return resposta.json();
    },
  };
}
