/**
 * Alert Service — Gerencia notificações de falhas de backup
 *
 * Responsabilidades:
 * - Enviar alertas via email (Nodemailer)
 * - Enviar alertas via Slack (webhook)
 * - Rastrear estado de alertas para evitar duplicação
 * - Incluir contexto de erro e instruções de recuperação
 *
 * Variáveis de ambiente:
 * - BACKUP_ALERT_EMAILS: emails separados por vírgula (ex: "admin@example.com,ops@example.com")
 * - SLACK_WEBHOOK_URL: URL do webhook Slack para alertas
 * - SMTP_HOST: host SMTP (padrão: localhost)
 * - SMTP_PORT: porta SMTP (padrão: 587)
 * - SMTP_USER: usuário SMTP (opcional)
 * - SMTP_PASS: senha SMTP (opcional)
 * - SMTP_FROM: email de origem (padrão: noreply@backup-scheduler.local)
 *
 * Logs: estruturados em "[AlertService]" para fácil busca
 */

import { logger } from './logger-service.js';
import nodemailer from 'nodemailer';
import https from 'https';

interface AlertState {
  backupId: string;
  timestamp: Date;
  errorMessage: string;
  alertsSent: {
    email: boolean;
    slack: boolean;
  };
  retryCount: number;
}

interface AlertPayload {
  backupName: string;
  errorMessage: string;
  timestamp: Date;
  details?: Record<string, any>;
  severity: 'critical' | 'warning';
  recoverySteps?: string[];
}

export class AlertService {
  private alertStates: Map<string, AlertState> = new Map();
  private emailTransporter: nodemailer.Transporter | null = null;
  private alertEmails: string[] = [];
  private slackWebhookUrl: string | null = null;
  private alertCooldown: Map<string, Date> = new Map(); // Prevenir spam: 1 alerta por backup por hora
  private readonly COOLDOWN_MS = 60 * 60 * 1000; // 1 hora

  constructor() {
    this.initializeEmailTransporter();
    this.loadConfiguration();
  }

  /**
   * Inicializa o transporte de email via Nodemailer
   */
  private initializeEmailTransporter(): void {
    const host = process.env.SMTP_HOST || 'localhost';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === 'true';

    try {
      this.emailTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
      });

      logger.info('[AlertService] Email transporter inicializado', { host, port, secure });
    } catch (error) {
      logger.warn('[AlertService] Erro ao inicializar email transporter:', error);
      this.emailTransporter = null;
    }
  }

  /**
   * Carrega configuração de variáveis de ambiente
   */
  private loadConfiguration(): void {
    // Carregar emails
    const emailsEnv = process.env.BACKUP_ALERT_EMAILS || '';
    this.alertEmails = emailsEnv
      .split(',')
      .map(e => e.trim())
      .filter(e => e.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    // Carregar webhook Slack
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || null;

    logger.info('[AlertService] Configuração carregada', {
      emailsConfigured: this.alertEmails.length > 0,
      emailCount: this.alertEmails.length,
      slackConfigured: !!this.slackWebhookUrl,
    });
  }

  /**
   * Verifica se pode enviar alerta (controle de spam/cooldown)
   */
  private canSendAlert(backupId: string): boolean {
    const lastAlert = this.alertCooldown.get(backupId);
    if (!lastAlert) return true;

    const now = new Date();
    const timeSinceLastAlert = now.getTime() - lastAlert.getTime();

    return timeSinceLastAlert > this.COOLDOWN_MS;
  }

  /**
   * Marca que um alerta foi enviado (para cooldown)
   */
  private markAlertSent(backupId: string): void {
    this.alertCooldown.set(backupId, new Date());
  }

  /**
   * Envia alerta de falha de backup (email + Slack)
   */
  async enviarAlertaFalhaBackup(payload: AlertPayload): Promise<void> {
    const backupId = payload.backupName;

    // Verificar cooldown
    if (!this.canSendAlert(backupId)) {
      logger.debug('[AlertService] Alerta para backup em cooldown, ignorando', { backupId });
      return;
    }

    logger.info('[AlertService] Enviando alerta de falha de backup', { backupName: backupId });

    const state: AlertState = {
      backupId,
      timestamp: new Date(),
      errorMessage: payload.errorMessage,
      alertsSent: {
        email: false,
        slack: false,
      },
      retryCount: 0,
    };

    // Enviar email se configurado
    if (this.alertEmails.length > 0 && this.emailTransporter) {
      try {
        await this.enviarAlertaEmail(payload);
        state.alertsSent.email = true;
        logger.info('[AlertService] Alerta de email enviado com sucesso', { backupId });
      } catch (error) {
        logger.error('[AlertService] Erro ao enviar alerta de email:', error);
        state.alertsSent.email = false;
      }
    }

    // Enviar Slack se configurado
    if (this.slackWebhookUrl) {
      try {
        await this.enviarAlertaSlack(payload);
        state.alertsSent.slack = true;
        logger.info('[AlertService] Alerta de Slack enviado com sucesso', { backupId });
      } catch (error) {
        logger.error('[AlertService] Erro ao enviar alerta de Slack:', error);
        state.alertsSent.slack = false;
      }
    }

    // Armazenar estado
    this.alertStates.set(backupId, state);
    this.markAlertSent(backupId);

    // Log de resultado
    if (!state.alertsSent.email && !state.alertsSent.slack) {
      logger.warn('[AlertService] Nenhum alerta foi enviado (email/Slack não configurados)');
    }
  }

  /**
   * Envia alerta de falha de verificação de restauração
   */
  async enviarAlertaVerificacaoFalhou(
    backupId: string,
    erro: string,
    detalhes?: Record<string, any>
  ): Promise<void> {
    const payload: AlertPayload = {
      backupName: backupId,
      errorMessage: erro,
      timestamp: new Date(),
      severity: 'critical',
      details: detalhes,
      recoverySteps: [
        'Verificar o arquivo de backup no disco',
        'Revisar logs do sistema para erros de I/O',
        'Validar a chave de criptografia configurada',
        'Tentar restaurar manualmente em ambiente de teste',
        'Se o problema persistir, contactar suporte',
      ],
    };

    await this.enviarAlertaFalhaBackup(payload);
  }

  /**
   * Envia alerta de falha de cópia NAS
   */
  async enviarAlertaCopiaFalhou(
    backupId: string,
    erro: string,
    nasPath: string
  ): Promise<void> {
    const payload: AlertPayload = {
      backupName: backupId,
      errorMessage: `Falha ao copiar backup para NAS em ${nasPath}: ${erro}`,
      timestamp: new Date(),
      severity: 'warning',
      details: {
        nasPath,
        type: 'NAS_COPY_FAILURE',
      },
      recoverySteps: [
        'Verificar conectividade com NAS/storage externo',
        'Verificar permissões de escrita no diretório NAS',
        'Validar espaço disponível no NAS',
        'Tentar cópia manual: cp -r /path/to/backup/dir /path/to/nas/',
      ],
    };

    await this.enviarAlertaFalhaBackup(payload);
  }

  /**
   * Envia alerta via email usando Nodemailer
   */
  private async enviarAlertaEmail(payload: AlertPayload): Promise<void> {
    if (!this.emailTransporter || this.alertEmails.length === 0) {
      logger.debug('[AlertService] Email não configurado, ignorando envio');
      return;
    }

    const fromEmail = process.env.SMTP_FROM || 'noreply@backup-scheduler.local';
    const subject = `[ALERTA] Falha de Backup - ${payload.backupName}`;

    const htmlBody = this.gerarCorpoEmailHTML(payload);
    const textBody = this.gerarCorpoEmailTexto(payload);

    try {
      const info = await this.emailTransporter.sendMail({
        from: fromEmail,
        to: this.alertEmails.join(','),
        subject,
        text: textBody,
        html: htmlBody,
      });

      logger.info('[AlertService] Email enviado com sucesso', {
        messageId: info.messageId,
        recipients: this.alertEmails.length,
      });
    } catch (error) {
      logger.error('[AlertService] Erro ao enviar email:', error);
      throw error;
    }
  }

  /**
   * Envia alerta via Slack webhook
   */
  private async enviarAlertaSlack(payload: AlertPayload): Promise<void> {
    if (!this.slackWebhookUrl) {
      logger.debug('[AlertService] Slack não configurado, ignorando envio');
      return;
    }

    const color = payload.severity === 'critical' ? '#d62728' : '#ff7f0e'; // Vermelho ou laranja
    const emoji = payload.severity === 'critical' ? ':rotating_light:' : ':warning:';

    const message = {
      attachments: [
        {
          color,
          title: `${emoji} Falha de Backup: ${payload.backupName}`,
          fields: [
            {
              title: 'Timestamp',
              value: payload.timestamp.toISOString(),
              short: true,
            },
            {
              title: 'Severidade',
              value: payload.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Mensagem de Erro',
              value: `\`\`\`${payload.errorMessage}\`\`\``,
              short: false,
            },
          ],
          footer: 'Backup Scheduler Alert System',
          ts: Math.floor(payload.timestamp.getTime() / 1000),
        },
      ],
    };

    // Adicionar detalhes se existirem
    if (payload.details && Object.keys(payload.details).length > 0) {
      message.attachments[0].fields.push({
        title: 'Detalhes',
        value: `\`\`\`${JSON.stringify(payload.details, null, 2)}\`\`\``,
        short: false,
      });
    }

    // Adicionar instruções de recuperação se existirem
    if (payload.recoverySteps && payload.recoverySteps.length > 0) {
      const stepsText = payload.recoverySteps
        .map((step, i) => `${i + 1}. ${step}`)
        .join('\n');
      message.attachments[0].fields.push({
        title: 'Passos de Recuperação',
        value: stepsText,
        short: false,
      });
    }

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(message);

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(this.slackWebhookUrl!, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            logger.info('[AlertService] Alerta Slack enviado com sucesso');
            resolve();
          } else {
            const error = new Error(`Slack webhook retornou ${res.statusCode}: ${data}`);
            logger.error('[AlertService] Erro ao enviar para Slack:', error);
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        logger.error('[AlertService] Erro de conexão ao Slack:', error);
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Gera corpo do email em HTML
   */
  private gerarCorpoEmailHTML(payload: AlertPayload): string {
    const timestamp = payload.timestamp.toLocaleString('pt-BR');
    const stepsHTML = payload.recoverySteps
      ? `
      <h3>Passos de Recuperação:</h3>
      <ol>
        ${payload.recoverySteps.map(step => `<li>${this.escaparHTML(step)}</li>`).join('')}
      </ol>
    `
      : '';

    const detalhesHTML = payload.details
      ? `
      <h3>Detalhes Técnicos:</h3>
      <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">
${this.escaparHTML(JSON.stringify(payload.details, null, 2))}
      </pre>
    `
      : '';

    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #d62728; color: white; padding: 20px; border-radius: 4px 4px 0 0; }
          .content { border: 1px solid #ddd; padding: 20px; border-radius: 0 0 4px 4px; }
          .severity { font-weight: bold; color: #d62728; }
          pre { background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
          h3 { color: #333; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Alerta de Falha de Backup</h1>
          </div>
          <div class="content">
            <p><strong>Backup:</strong> ${this.escaparHTML(payload.backupName)}</p>
            <p><strong>Timestamp:</strong> ${this.escaparHTML(timestamp)}</p>
            <p><strong class="severity">Severidade:</strong> ${this.escaparHTML(payload.severity.toUpperCase())}</p>

            <h3>Mensagem de Erro:</h3>
            <pre>${this.escaparHTML(payload.errorMessage)}</pre>

            ${detalhesHTML}
            ${stepsHTML}

            <p style="margin-top: 30px; color: #999; font-size: 12px;">
              Este é um alerta automático do Sistema de Backup Scheduler.
            </p>
          </div>
        </div>
      </body>
    </html>
    `;
  }

  /**
   * Gera corpo do email em texto plano
   */
  private gerarCorpoEmailTexto(payload: AlertPayload): string {
    const timestamp = payload.timestamp.toLocaleString('pt-BR');
    const steps =
      payload.recoverySteps && payload.recoverySteps.length > 0
        ? `\nPassos de Recuperação:\n${payload.recoverySteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        : '';

    const details =
      payload.details && Object.keys(payload.details).length > 0
        ? `\nDetalhes Técnicos:\n${JSON.stringify(payload.details, null, 2)}`
        : '';

    return `
ALERTA DE FALHA DE BACKUP
========================

Backup: ${payload.backupName}
Timestamp: ${timestamp}
Severidade: ${payload.severity.toUpperCase()}

Mensagem de Erro:
${payload.errorMessage}

${details}
${steps}

---
Este é um alerta automático do Sistema de Backup Scheduler.
    `.trim();
  }

  /**
   * Escapa caracteres HTML para evitar XSS
   */
  private escaparHTML(texto: string): string {
    const mapa: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return texto.replace(/[&<>"']/g, char => mapa[char]);
  }

  /**
   * Retorna estado dos alertas (para debugging)
   */
  getAlertStatus(): Record<string, AlertState> {
    const result: Record<string, AlertState> = {};
    this.alertStates.forEach((state, key) => {
      result[key] = state;
    });
    return result;
  }

  /**
   * Limpa estado de alertas antigos (mais de 24 horas)
   */
  cleanupOldAlerts(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas

    for (const [key, state] of this.alertStates.entries()) {
      const age = now.getTime() - state.timestamp.getTime();
      if (age > maxAge) {
        this.alertStates.delete(key);
      }
    }

    // Limpar cooldown também
    for (const [key, time] of this.alertCooldown.entries()) {
      const age = now.getTime() - time.getTime();
      if (age > maxAge) {
        this.alertCooldown.delete(key);
      }
    }
  }
}

// Singleton instance
let alertServiceInstance: AlertService | null = null;

export function getAlertService(): AlertService {
  if (!alertServiceInstance) {
    alertServiceInstance = new AlertService();
  }
  return alertServiceInstance;
}

export default AlertService;
