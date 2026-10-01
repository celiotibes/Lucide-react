/**
 * Orquestração, do lado do CLIENTE, do disparo de notificação (e-mail/WhatsApp/Telegram)
 * quando uma cobrança Asaas é emitida ou um comunicado genérico é enviado.
 *
 * Por que a orquestração completa (resolver destinatário + persistir tentativa/resultado)
 * vive aqui e não em `server/src/domain/notificacoes/despacho.ts`: só o cliente tem acesso
 * ao banco de negócio (sql.js/IndexedDB) onde moram tanto os dados para RESOLVER o
 * destinatário (`resolverDestinatarios.ts`) quanto a tabela `notificacoes_enviadas` onde
 * a tentativa/resultado é GRAVADA (`notificacoes-db.ts`). O servidor (`despacho.ts` lá)
 * só executa o envio de fato pelos 3 canais externos — ver o relatório da tarefa para o
 * detalhe completo desta decisão de arquitetura.
 *
 * Fluxo de `dispararNotificacaoCobranca`/`dispararNotificacaoComunicado`:
 *   1. resolve (ou recebe, já resolvido) `{ email?, whatsappE164?, telegramChatId? }`;
 *   2. para cada canal SEM destinatário -> resultado `pulado` imediato, SEM registrar
 *      tentativa (não é falha, é "não aplicável" — mesmo critério usado no servidor);
 *   3. para cada canal COM destinatário -> `registrarTentativa` (status 'pendente') antes
 *      de chamar a rede, para nunca perder o registro de que a tentativa aconteceu;
 *   4. chama `POST /api/notificacoes/disparar` (via `apiClient`) só com os canais que têm
 *      destinatário;
 *   5. aplica o resultado de cada canal (`marcarEnviado`/`marcarFalha`) na tentativa
 *      correspondente;
 *   6. devolve a lista completa (pulados + tentados), na ordem email/whatsapp/telegram.
 */
import type { Database } from "sql.js";
import {
  registrarTentativa,
  marcarEnviado,
  marcarFalha,
  type OrigemNotificacao,
  type CanalNotificacao,
} from "./notificacoes-db";
import { resolverDestinatariosPorCobrancaId, type DestinatariosResolvidos } from "./resolverDestinatarios";

export type StatusDisparo = "enviado" | "falha" | "pulado";

export interface ResultadoDisparo {
  canal: CanalNotificacao;
  destinatario: string;
  status: StatusDisparo;
  motivo?: string;
}

export interface DestinatariosNotificacao {
  email?: string;
  whatsappE164?: string;
  telegramChatId?: string;
}

/** Porta que este módulo depende — a implementação real chama o PRÓPRIO servidor
 * (`POST /api/notificacoes/disparar`) com o Bearer token da sessão (mesmo padrão de
 * `AsaasApiClient` em `src/domain/integracoes/asaasCobranca.ts`); testes usam um fake em
 * memória. */
export interface NotificacoesApiClient {
  disparar(dados: {
    origemTipo: OrigemNotificacao;
    origemId: number | null;
    assunto?: string;
    mensagem: string;
    destinatarios: DestinatariosNotificacao;
  }): Promise<{ resultados: ResultadoDisparo[] }>;
}

const SEM_DESTINATARIO = "(nenhum)";
const MOTIVO_SEM_EMAIL = "Nenhum e-mail cadastrado para este destinatário";
const MOTIVO_SEM_WHATSAPP = "Nenhum telefone cadastrado para este destinatário";
const MOTIVO_SEM_TELEGRAM = "Destinatário sem Telegram vinculado — locatários/clientes ainda não têm como vincular um chat_id próprio (ver README do módulo de notificações)";

interface OpcoesDisparo {
  origemTipo: OrigemNotificacao;
  origemId: number | null;
  assunto?: string;
  mensagem: string;
  destinatarios: DestinatariosResolvidos;
}

/**
 * Função central (não exportada por engano — é a base de `dispararNotificacaoCobranca` e
 * `dispararNotificacaoComunicado`, mas também serve quem já tem os destinatários
 * resolvidos por outro caminho).
 */
export async function dispararNotificacao(
  db: Database,
  apiClient: NotificacoesApiClient,
  { origemTipo, origemId, assunto, mensagem, destinatarios }: OpcoesDisparo,
): Promise<ResultadoDisparo[]> {
  const resultados: ResultadoDisparo[] = [];
  const paraEnviar: DestinatariosNotificacao = {};
  // canal -> id da tentativa já registrada em notificacoes_enviadas (status 'pendente').
  const tentativaPorCanal = new Map<CanalNotificacao, number>();

  function prepararCanal(canal: CanalNotificacao, destinatario: string | undefined, motivoPulado: string, chaveApi: keyof DestinatariosNotificacao) {
    if (!destinatario) {
      resultados.push({ canal, destinatario: SEM_DESTINATARIO, status: "pulado", motivo: motivoPulado });
      return;
    }
    const tentativa = registrarTentativa(db, { origemTipo, origemId, canal, destinatario, assunto, mensagem });
    tentativaPorCanal.set(canal, tentativa.id);
    paraEnviar[chaveApi] = destinatario;
  }

  prepararCanal("email", destinatarios.email, MOTIVO_SEM_EMAIL, "email");
  prepararCanal("whatsapp", destinatarios.whatsappE164, MOTIVO_SEM_WHATSAPP, "whatsappE164");
  prepararCanal("telegram", destinatarios.telegramChatId, MOTIVO_SEM_TELEGRAM, "telegramChatId");

  // Nenhum canal com destinatário -> nada para chamar no servidor; devolve só os pulados.
  if (tentativaPorCanal.size === 0) {
    return ordenar(resultados);
  }

  const { resultados: resultadosServidor } = await apiClient.disparar({ origemTipo, origemId, assunto, mensagem, destinatarios: paraEnviar });

  for (const resultado of resultadosServidor) {
    const tentativaId = tentativaPorCanal.get(resultado.canal);
    if (tentativaId === undefined) continue; // canal que nem foi enviado (não deveria acontecer, mas não deve lançar)
    if (resultado.status === "enviado") {
      marcarEnviado(db, tentativaId);
    } else if (resultado.status === "falha") {
      marcarFalha(db, tentativaId, resultado.motivo ?? "Falha desconhecida ao enviar");
    }
    // 'pulado' vindo do servidor não deveria ocorrer para um canal que enviamos com
    // destinatário preenchido — mas se ocorrer, não mexe na tentativa (fica 'pendente',
    // visível no histórico para investigação, nunca mascarado como sucesso).
    resultados.push(resultado);
  }

  return ordenar(resultados);
}

const ORDEM_CANAL: CanalNotificacao[] = ["email", "whatsapp", "telegram"];
function ordenar(resultados: ResultadoDisparo[]): ResultadoDisparo[] {
  return [...resultados].sort((a, b) => ORDEM_CANAL.indexOf(a.canal) - ORDEM_CANAL.indexOf(b.canal));
}

/**
 * Dispara a notificação de uma cobrança Asaas já emitida (`cobrancas_asaas.id`),
 * resolvendo o destinatário automaticamente (ver `resolverDestinatarios.ts`).
 */
export async function dispararNotificacaoCobranca(
  db: Database,
  apiClient: NotificacoesApiClient,
  cobrancaAsaasId: number,
  { assunto, mensagem }: { assunto?: string; mensagem: string },
): Promise<ResultadoDisparo[]> {
  const destinatarios = resolverDestinatariosPorCobrancaId(db, cobrancaAsaasId);
  return dispararNotificacao(db, apiClient, {
    origemTipo: "cobranca_asaas",
    origemId: cobrancaAsaasId,
    assunto,
    mensagem,
    destinatarios,
  });
}

/**
 * Dispara um comunicado genérico (sem origem ligada a uma cobrança) — `destinatarios` é
 * sempre explícito aqui: não há cobrança nenhuma para resolver automaticamente a partir
 * dela (ver `criarRotasNotificacoes`/rota do servidor, que também exige isso).
 */
export async function dispararNotificacaoComunicado(
  db: Database,
  apiClient: NotificacoesApiClient,
  destinatarios: DestinatariosNotificacao,
  { assunto, mensagem }: { assunto?: string; mensagem: string },
): Promise<ResultadoDisparo[]> {
  return dispararNotificacao(db, apiClient, {
    origemTipo: "comunicado_generico",
    origemId: null,
    assunto,
    mensagem,
    destinatarios,
  });
}
