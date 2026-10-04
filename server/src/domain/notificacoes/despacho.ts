import type { OpcoesEnviarWhatsapp } from "../../notificacoes/whatsapp.js";

/**
 * Orquestração do disparo de notificação pelos 3 canais (e-mail, WhatsApp, Telegram).
 *
 * DECISÃO DE ARQUITETURA — por quê este módulo é ESTATELESS (nunca grava em banco, ao
 * contrário do que o enunciado original da tarefa descrevia para `despacho.ts`): a tabela
 * `notificacoes_enviadas` vive em `contabilidade-reconstituicao/schema.sql`, o banco
 * sql.js/IndexedDB do CLIENTE (navegador) — o mesmo banco de `cobrancas_asaas`,
 * `aluguel_competencias`, `entidades_legais` etc. O servidor (`server/`, Express +
 * better-sqlite3) NUNCA tem acesso a esse banco; só o navegador do usuário tem (mesmo
 * motivo documentado em `migrations-phase3-integracoes.sql` e em
 * `server/src/routes/asaas-routes.ts`: "só o cliente tem acesso ao banco local
 * sql.js/IndexedDB"). Por isso a persistência da trilha de notificação
 * (`registrarTentativa`/`marcarEnviado`/`marcarFalha`) vive no CLIENTE
 * (`src/domain/notificacoes/despachoCliente.ts`), que chama a rota HTTP deste servidor
 * como "mensageiro" puro e grava o resultado localmente depois — ver relatório da tarefa
 * para o detalhe completo desta decisão.
 *
 * O que ESTE módulo garante (a parte que de fato é responsabilidade do servidor):
 *   - cada canal é tentado de forma INDEPENDENTE — falha num (ex: SMTP fora do ar) nunca
 *     impede a tentativa dos outros dois;
 *   - canal sem destinatário informado é "pulado" (não aplicável), nunca "falha";
 *   - erro de qualquer sender é capturado aqui (nunca propaga) e vira um resultado
 *     `falha` com a mensagem do erro, para o chamador decidir o que fazer (e, no cliente,
 *     persistir via NotificacoesServiceDB.marcarFalha).
 */

export type CanalNotificacao = "email" | "whatsapp" | "telegram";
export type StatusDisparo = "enviado" | "falha" | "pulado";

export interface ResultadoDisparo {
  canal: CanalNotificacao;
  /** Endereço/telefone/chat_id tentado — "(nenhum)" quando o canal foi pulado por falta
   * de destinatário. */
  destinatario: string;
  status: StatusDisparo;
  /** Preenchido em `falha` (mensagem do erro) e em `pulado` (motivo da não aplicabilidade) — nunca em `enviado`. */
  motivo?: string;
}

export interface DestinatariosNotificacao {
  email?: string;
  whatsappE164?: string;
  telegramChatId?: string;
}

/** As 3 funções de envio reais (ou fakes de teste) — mesmo padrão de porta/adapter de
 * `AsaasApiClient` em `src/domain/integracoes/asaasCobranca.ts`, só que aqui a
 * implementação real roda no próprio processo do servidor (os 3 senders em
 * `server/src/notificacoes/`), não atrás de uma chamada HTTP adicional. */
export interface SendersNotificacao {
  enviarEmail: (opcoes: { destinatario: string; assunto: string; corpo: string }) => Promise<void>;
  enviarWhatsapp: (opcoes: OpcoesEnviarWhatsapp) => Promise<void>;
  enviarTelegram: (opcoes: { chatId: string; mensagem: string }) => Promise<void>;
}

export interface OpcoesDisparoNotificacao {
  assunto?: string;
  mensagem: string;
  destinatarios: DestinatariosNotificacao;
}

const SEM_DESTINATARIO = "(nenhum)";

async function tentarCanal(
  canal: CanalNotificacao,
  destinatario: string | undefined,
  motivoPulado: string,
  enviar: (destinatario: string) => Promise<void>,
): Promise<ResultadoDisparo> {
  if (!destinatario) {
    return { canal, destinatario: SEM_DESTINATARIO, status: "pulado", motivo: motivoPulado };
  }
  try {
    await enviar(destinatario);
    return { canal, destinatario, status: "enviado" };
  } catch (erro) {
    return {
      canal,
      destinatario,
      status: "falha",
      motivo: erro instanceof Error ? erro.message : `Erro desconhecido ao enviar por ${canal}`,
    };
  }
}

/**
 * Dispara a notificação pelos 3 canais, cada um independente (ver cabeçalho do arquivo).
 * Sempre devolve exatamente 3 resultados (um por canal), nunca lança — qualquer falha de
 * canal já vira um `ResultadoDisparo` com `status: 'falha'`.
 */
export async function dispararNotificacao(
  senders: SendersNotificacao,
  { assunto, mensagem, destinatarios }: OpcoesDisparoNotificacao,
): Promise<ResultadoDisparo[]> {
  const [email, whatsapp, telegram] = await Promise.all([
    tentarCanal("email", destinatarios.email, "Nenhum e-mail informado para este destinatário", (destinatario) =>
      senders.enviarEmail({ destinatario, assunto: assunto ?? "", corpo: mensagem }),
    ),
    tentarCanal("whatsapp", destinatarios.whatsappE164, "Nenhum telefone/WhatsApp informado para este destinatário", (destinatarioE164) =>
      senders.enviarWhatsapp({ destinatarioE164, mensagem }),
    ),
    tentarCanal("telegram", destinatarios.telegramChatId, "Nenhum chat_id do Telegram informado para este destinatário", (chatId) =>
      senders.enviarTelegram({ chatId, mensagem }),
    ),
  ]);

  return [email, whatsapp, telegram];
}
