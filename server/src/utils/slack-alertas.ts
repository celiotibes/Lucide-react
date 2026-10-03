/**
 * Alertas via Slack — notificações em tempo real em canal dedicado
 *
 * Workflow:
 * 1. Crie um workspace no Slack (gratuito em https://slack.com)
 * 2. Crie um canal privado #alertas-contabilidade
 * 3. Configure um Incoming Webhook:
 *    - Settings > Integrations > Incoming Webhooks
 *    - Click "Add New Webhook to Workspace"
 *    - Selecione #alertas-contabilidade
 *    - Copie a URL (https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX)
 *    - Configure SLACK_WEBHOOK_URL no .env
 * 4. Opcionalmente, configure thread_ts (ID da mensagem pai) para agrupar alertas num thread
 *
 * Severidade → Cor (padrão visual no Slack):
 * - info: 🔵 azul (#439FE0)
 * - warning: 🟡 amarelo (#FFB600)
 * - critical: 🔴 vermelho (#DC3545)
 *
 * Uso recomendado: combine com email-alertas para redundância
 * (email = lento mas confiável, Slack = rápido mas depende de conectividade/notificação)
 */

export type SeveridadeAlerta = "info" | "warning" | "critical";

export interface OpcoesEnviarAlertaSlack {
  /** Mensagem principal (1-2 linhas, resumo) */
  mensagem: string;
  /** Detalhes opcionais (erro completo, stack trace, etc) */
  detalhes?: string;
  /** Severidade: info (🔵), warning (🟡), critical (🔴) */
  severidade?: SeveridadeAlerta;
  /** Campo adicional tipo { chave: valor } (ex: { "Tentativas": "3", "Próxima em": "10min" }) */
  campos?: Record<string, string>;
  /** Se true, oculta mensagem no editor (não inclui na thread) — default: false */
  silencioso?: boolean;
}

/** Cores Slack para cada severidade (hex color picker) */
const CORES_SEVERIDADE: Record<SeveridadeAlerta, string> = {
  info: "#439FE0", // Azul
  warning: "#FFB600", // Amarelo
  critical: "#DC3545", // Vermelho
};

/** Emojis para cada severidade */
const EMOJIS_SEVERIDADE: Record<SeveridadeAlerta, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
};

/**
 * Envia um alerta para Slack (webhook baseado)
 *
 * @param opcoes Mensagem, detalhes, severidade, campos extras
 *
 * @example
 * // Scheduler de DRE falhou
 * await enviarAlertaSlack({
 *   mensagem: "Falha na geração de DRE mensal",
 *   detalhes: "Query timeout após 30 segundos. Verifique índices do banco.",
 *   severidade: "critical",
 *   campos: {
 *     "Hora": "2026-10-02 09:30:00",
 *     "Banco": "prod-1",
 *     "Próxima tentativa": "10min",
 *   },
 * });
 */
export async function enviarAlertaSlack(opcoes: OpcoesEnviarAlertaSlack): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    // Graceful degradation: nenhum erro, apenas ignora (pode estar em dev)
    return;
  }

  const { mensagem, detalhes, severidade = "warning", campos, silencioso } = opcoes;

  const corSeveridade = CORES_SEVERIDADE[severidade];
  const emojiSeveridade = EMOJIS_SEVERIDADE[severidade];

  // Constrói array de campos para Slack (até 10 campos, 2 colunas)
  const camposSlack = campos
    ? Object.entries(campos).map(([chave, valor]) => ({
        title: chave,
        value: valor,
        short: true, // 2 colunas
      }))
    : [];

  // Adiciona detalhes se existir (campo especial, full-width)
  if (detalhes) {
    camposSlack.push({
      title: "Detalhes",
      value: `\`\`\`${detalhes}\`\`\``, // Slack: backticks = monospace
      short: false,
    });
  }

  const payload = {
    ...(silencioso && { unfurl_links: false }),
    attachments: [
      {
        // Cor lateral do attachment corresponde à severidade
        color: corSeveridade,
        title: `${emojiSeveridade} ${mensagem}`,
        fields: camposSlack,
        ts: Math.floor(Date.now() / 1000), // Timestamp Unix
        footer: "Sistema de monitoramento automático",
      },
    ],
  };

  try {
    const resposta = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resposta.ok) {
      const erro = await resposta.text();
      throw new Error(`Slack webhook erro (${resposta.status}): ${erro}`);
    }

    logger.info(`[SLACK] Alerta enviado (${severidade}): ${mensagem}`);
  } catch (erro) {
    // Falha silenciosa (não quer travar job por Slack)
    const mensagemErro = erro instanceof Error ? erro.message : String(erro);
    logger.error(`[SLACK] Falha ao enviar alerta: ${mensagemErro}`);
  }
}

/**
 * Envia notificação simples de status/health ao Slack (menos verbosa que alerta completo)
 * Útil para:
 * - "Sistema online, DRE sincronizada, reconciliação OK" (daily digest)
 * - "Sincronização PIX iniciada" (info)
 * - "Backup completado com sucesso" (confirmação)
 *
 * @param titulo Título da notificação (ex: "Sincronização concluída")
 * @param status Status em texto (ex: "100% dos lançamentos conciliados")
 * @param severidade Severidade (default: "info")
 *
 * @example
 * await enviarNotificacaoSlack(
 *   "Relatório DRE",
 *   "DRE mensal de setembro gerada com sucesso (1.2s)",
 *   "info"
 * );
 */
export async function enviarNotificacaoSlack(
  titulo: string,
  status: string,
  severidade: SeveridadeAlerta = "info",
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const corSeveridade = CORES_SEVERIDADE[severidade];
  const emojiSeveridade = EMOJIS_SEVERIDADE[severidade];

  const payload = {
    text: `${emojiSeveridade} ${titulo}`,
    attachments: [
      {
        color: corSeveridade,
        text: status,
        ts: Math.floor(Date.now() / 1000),
        footer: "Sistema de monitoramento automático",
      },
    ],
  };

  try {
    const resposta = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resposta.ok) {
      throw new Error(`Slack webhook erro (${resposta.status})`);
    }
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error(`[SLACK] Falha ao enviar notificação: ${mensagem}`);
  }
}

/**
 * Envia um diagrama/status agregado para Slack (ex: KPIs do dia, status de jobs)
 * Útil para daily digest via Slack (alternativa a email)
 *
 * @param blocos Array de blocos [{ titulo, valor }, ...]
 * @param titulo Título do resumo
 * @param timestamp Quando foi gerado (default: agora)
 *
 * @example
 * await enviarResumoSlack(
 *   [
 *     { titulo: "Transações importadas", valor: "156" },
 *     { titulo: "Discrepâncias detectadas", valor: "3" },
 *     { titulo: "Uptime", valor: "99.9%" },
 *   ],
 *   "Resumo Diário - 2026-10-02"
 * );
 */
export async function enviarResumoSlack(
  blocos: { titulo: string; valor: string }[],
  titulo: string,
  timestamp?: string,
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const campos = blocos.map((b) => ({
    title: b.titulo,
    value: b.valor,
    short: true,
  }));

  const payload = {
    attachments: [
      {
        color: "#439FE0", // Azul padrão
        title: `📊 ${titulo}`,
        fields: campos,
        ts: timestamp ? Math.floor(new Date(timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000),
        footer: "Sistema de monitoramento automático",
      },
    ],
  };

  try {
    const resposta = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resposta.ok) {
      throw new Error(`Slack webhook erro (${resposta.status})`);
    }

    logger.info(`[SLACK] Resumo enviado: ${titulo}`);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error(`[SLACK] Falha ao enviar resumo: ${mensagem}`);
  }
}
