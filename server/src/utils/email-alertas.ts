/**
 * Alertas por Email — dispara notificações quando scheduler/jobs falham
 *
 * Utiliza Resend (free tier: 100 emails/dia) ou SendGrid (free tier: 100 emails/dia).
 * Este módulo implementa padrão "carrinho de retentativas": falha na primeira tentativa
 * não bloqueia o job, apenas loga (não quer atrasar relatório só porque email falhou).
 *
 * Casos de uso:
 * 1. DRE diário falha → email pro gestor + admin
 * 2. Reconciliação PIX falha → email avisando discrepâncias não foram conciliadas
 * 3. Pagamento PIX proativo falha → email pro usuário + admin rastreamento
 * 4. Sistema crítico (BD desconectado) → email de alerta imediato
 *
 * Padrão de integração: configure ALERTS_EMAIL_PROVIDER (resend | sendgrid | none) + chave.
 * Se nenhum provider configurado, logs vão só pro stdout (graceful degradation).
 */

export type ProvedorEmail = "resend" | "sendgrid" | "none";
export type SeveridadeAlerta = "info" | "warning" | "critical";

export interface OpcoesEnviarAlerta {
  /** Assunto do email */
  assunto: string;
  /** Corpo em formato de texto simples ou HTML. Se iniciar com <html>, tratado como HTML */
  corpo: string;
  /** Email destinatário (suporta múltiplos: "user1@ex.com, user2@ex.com") */
  destinatario: string;
  /** Severidade para log (info, warning, critical) — default: "warning" */
  severidade?: SeveridadeAlerta;
  /** Se true, trata corpo como HTML (default: false, texto simples) */
  html?: boolean;
}

interface ProvedorAlertasEmail {
  enviar(opcoes: OpcoesEnviarAlerta): Promise<void>;
}

/**
 * Implementação Resend (alternativa premium a SendGrid, ~$20/mês para mais volume)
 * Free tier: 100 emails/dia, 5k/mês, domínio de teste resend.dev
 * Signup: https://resend.com
 */
class ProvedorResend implements ProvedorAlertasEmail {
  constructor(private chave: string) {}

  async enviar(opcoes: OpcoesEnviarAlerta): Promise<void> {
    const { assunto, corpo, destinatario, html } = opcoes;
    const url = "https://api.resend.com/emails";

    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.ALERTS_EMAIL_FROM || "noreply@resend.dev",
        to: destinatario,
        subject: assunto,
        [html ? "html" : "text"]: corpo,
      }),
    });

    if (!resposta.ok) {
      const erro = await resposta.text();
      throw new Error(`Resend API erro (${resposta.status}): ${erro}`);
    }
  }
}

/**
 * Implementação SendGrid (solução consolidada, API v3)
 * Free tier: 100 emails/dia
 * Signup: https://sendgrid.com
 */
class ProvedorSendGrid implements ProvedorAlertasEmail {
  constructor(private chave: string) {}

  async enviar(opcoes: OpcoesEnviarAlerta): Promise<void> {
    const { assunto, corpo, destinatario, html } = opcoes;
    const url = "https://api.sendgrid.com/v3/mail/send";

    const destinatarios = destinatario.split(",").map((d) => ({ email: d.trim() }));

    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: destinatarios }],
        from: { email: process.env.ALERTS_EMAIL_FROM || "noreply@example.com" },
        subject: assunto,
        content: [
          {
            type: html ? "text/html" : "text/plain",
            value: corpo,
          },
        ],
      }),
    });

    if (!resposta.ok) {
      const erro = await resposta.text();
      throw new Error(`SendGrid API erro (${resposta.status}): ${erro}`);
    }
  }
}

/**
 * Mock para dev/testes — apenas loga no stdout, sem fazer chamadas HTTP
 */
class ProvedorMock implements ProvedorAlertasEmail {
  async enviar(opcoes: OpcoesEnviarAlerta): Promise<void> {
    const { assunto, destinatario, severidade = "warning" } = opcoes;
    console.log(`[ALERTA-${severidade.toUpperCase()}] ${assunto} → ${destinatario}`);
  }
}

/**
 * Factory: cria provedor configurado via .env
 * ALERTS_EMAIL_PROVIDER = "resend" | "sendgrid" | "none"
 */
function criarProvedor(): ProvedorAlertasEmail {
  const provider = (process.env.ALERTS_EMAIL_PROVIDER || "none") as ProvedorEmail;
  const chave = process.env.ALERTS_EMAIL_API_KEY || "";

  switch (provider) {
    case "resend":
      if (!chave) throw new Error("ALERTS_EMAIL_API_KEY obrigatória quando ALERTS_EMAIL_PROVIDER=resend");
      return new ProvedorResend(chave);
    case "sendgrid":
      if (!chave) throw new Error("ALERTS_EMAIL_API_KEY obrigatória quando ALERTS_EMAIL_PROVIDER=sendgrid");
      return new ProvedorSendGrid(chave);
    case "none":
    default:
      return new ProvedorMock();
  }
}

let provedor: ProvedorAlertasEmail | null = null;

function obterProvedor(): ProvedorAlertasEmail {
  if (!provedor) {
    provedor = criarProvedor();
  }
  return provedor;
}

/**
 * Envia um alerta por email (scheduler falhou, recurso crítico offline, etc)
 * Não bloqueia a execução se falhar — apenas loga.
 *
 * @param opcoes Assunto, corpo, destinatário(s), severidade
 *
 * @example
 * // Scheduler de DRE falhou
 * await enviarAlertaEmail({
 *   assunto: "❌ Geração de DRE mensal falhou em 2026-10-02 09:30",
 *   corpo: "Erro: Query timeout (> 30s).\nVerifique BD em prod-1.",
 *   destinatario: "gestor@company.com, admin@company.com",
 *   severidade: "critical",
 * });
 */
export async function enviarAlertaEmail(opcoes: OpcoesEnviarAlerta): Promise<void> {
  const { severidade = "warning", assunto } = opcoes;

  try {
    const p = obterProvedor();
    await p.enviar(opcoes);
    console.log(`[EMAIL] Alerta enviado com sucesso: ${assunto}`);
  } catch (erro) {
    // Falha silenciosa (não quer travar job por email)
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`[EMAIL] Falha ao enviar alerta (${severidade}): ${mensagem}`);
    // Aqui poderia logar no Sentry ou incrementar métrica de falha
  }
}

/**
 * Template HTML para alertas críticos
 * Uso: passar como corpo com opcoes.html = true
 *
 * @example
 * const html = templateAlertaCritico({
 *   titulo: "Falha na Reconciliação PIX",
 *   mensagem: "123 lançamentos não foram conciliados.",
 *   detalhes: { timestamp: "2026-10-02T09:30:00Z", tentativas: 3 },
 * });
 * await enviarAlertaEmail({
 *   assunto: "❌ Reconciliação PIX falhou",
 *   corpo: html,
 *   destinatario: "admin@company.com",
 *   html: true,
 *   severidade: "critical",
 * });
 */
export function templateAlertaCritico(opcoes: {
  titulo: string;
  mensagem: string;
  detalhes?: Record<string, unknown>;
  timestamp?: string;
}): string {
  const { titulo, mensagem, detalhes, timestamp = new Date().toISOString() } = opcoes;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .alerta { background-color: #fff3cd; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; }
    .titulo { color: #dc3545; font-size: 20px; font-weight: bold; }
    .detalhes { background-color: #f8f9fa; padding: 10px; border-radius: 4px; margin: 10px 0; }
    .footer { color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="alerta">
      <div class="titulo">🚨 ${titulo}</div>
      <p>${mensagem}</p>
      ${detalhes ? `<div class="detalhes"><strong>Detalhes:</strong><pre>${JSON.stringify(detalhes, null, 2)}</pre></div>` : ""}
    </div>
    <div class="footer">
      Gerado em: ${timestamp}<br>
      Sistema de monitoramento automático
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Reset do provedor (apenas para testes)
 */
export function _resetProvedorParaTestes(): void {
  provedor = null;
}
