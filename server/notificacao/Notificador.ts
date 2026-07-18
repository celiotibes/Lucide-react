// ============================================================================
// Framework de Notificações (Email/WhatsApp/SMS)
// ============================================================================
// Abstração para enviar notificações por múltiplos canais.
// Suporta templates com variáveis dinâmicas {{variável}}.

export interface DestinatarioNotificacao {
  email?: string;
  telefone?: string; // Format: +5548999887766
  nome: string;
}

export interface TemplateNotificacao {
  titulo: string;
  corpo: string;
  acaoUrl?: string;
  acaoTexto?: string;
}

export interface ConfigNotificacao {
  canais: ('email' | 'whatsapp' | 'sms')[];
  destinatario: DestinatarioNotificacao;
  template: TemplateNotificacao;
  variaveis?: Record<string, string | number>;
}

export interface ResultadoNotificacao {
  canal: 'email' | 'whatsapp' | 'sms';
  sucesso: boolean;
  id?: string; // ID da mensagem no provedor
  erro?: string;
}

// ============================================================================
// Abstração Base
// ============================================================================

export abstract class ProvedorNotificacao {
  abstract enviar(config: ConfigNotificacao): Promise<ResultadoNotificacao>;

  /** Substitui variáveis no texto: {{variavel}} -> valor */
  protected substituirVariaveis(texto: string, variaveis?: Record<string, string | number>): string {
    if (!variaveis) return texto;

    let resultado = texto;
    Object.entries(variaveis).forEach(([chave, valor]) => {
      const regex = new RegExp(`{{${chave}}}`, 'g');
      resultado = resultado.replace(regex, String(valor));
    });

    return resultado;
  }

  protected formatar(template: TemplateNotificacao, variaveis?: Record<string, string | number>): {
    titulo: string;
    corpo: string;
  } {
    return {
      titulo: this.substituirVariaveis(template.titulo, variaveis),
      corpo: this.substituirVariaveis(template.corpo, variaveis),
    };
  }
}

// ============================================================================
// Implementações
// ============================================================================

/**
 * Email via Resend (já existe no projeto)
 */
export class ProvedorEmail extends ProvedorNotificacao {
  private resendApiKey: string;

  constructor(resendApiKey?: string) {
    super();
    this.resendApiKey = resendApiKey || process.env.RESEND_API_KEY || '';
    if (!this.resendApiKey) {
      throw new Error('RESEND_API_KEY não configurado');
    }
  }

  async enviar(config: ConfigNotificacao): Promise<ResultadoNotificacao> {
    if (!config.destinatario.email) {
      return { canal: 'email', sucesso: false, erro: 'Email do destinatário não informado' };
    }

    const { titulo, corpo } = this.formatar(config.template, config.variaveis);

    try {
      // Chamar Resend API diretamente ou via biblioteca
      // Para este exemplo, usamos a biblioteca @resend/react que já está integrada
      const resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.resendApiKey}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@crmt.dev',
          to: config.destinatario.email,
          subject: titulo,
          html: this.gerarHtmlEmail(titulo, corpo, config.template.acaoUrl, config.template.acaoTexto),
        }),
      });

      if (!resposta.ok) {
        throw new Error(`Resend retornou ${resposta.status}`);
      }

      const { id } = (await resposta.json()) as { id: string };

      return { canal: 'email', sucesso: true, id };
    } catch (erro) {
      return {
        canal: 'email',
        sucesso: false,
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      };
    }
  }

  private gerarHtmlEmail(titulo: string, corpo: string, acaoUrl?: string, acaoTexto?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .action { text-align: center; margin-top: 20px; }
          .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${titulo}</h2>
          </div>
          <div class="content">
            <p>${corpo.replace(/\n/g, '<br>')}</p>
            ${
              acaoUrl
                ? `<div class="action">
                   <a href="${acaoUrl}" class="button">${acaoTexto || 'Acessar'}</a>
                 </div>`
                : ''
            }
          </div>
          <div class="footer">
            <p>© 2026 CRMT. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

/**
 * WhatsApp via Twilio
 */
export class ProvedorWhatsApp extends ProvedorNotificacao {
  private accountSid: string;
  private authToken: string;
  private numeroOrigem: string;

  constructor(accountSid?: string, authToken?: string, numeroOrigem?: string) {
    super();
    this.accountSid = accountSid || process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = authToken || process.env.TWILIO_AUTH_TOKEN || '';
    this.numeroOrigem = numeroOrigem || process.env.TWILIO_WHATSAPP_NUMBER || '';

    if (!this.accountSid || !this.authToken || !this.numeroOrigem) {
      throw new Error('Credenciais Twilio incompletas');
    }
  }

  async enviar(config: ConfigNotificacao): Promise<ResultadoNotificacao> {
    if (!config.destinatario.telefone) {
      return { canal: 'whatsapp', sucesso: false, erro: 'Telefone do destinatário não informado' };
    }

    const { titulo, corpo } = this.formatar(config.template, config.variaveis);
    const mensagem = `*${titulo}*\n\n${corpo}`;

    try {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const resposta = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
          },
          body: new URLSearchParams({
            From: this.numeroOrigem,
            To: `whatsapp:${config.destinatario.telefone}`,
            Body: mensagem,
          }).toString(),
        }
      );

      if (!resposta.ok) {
        throw new Error(`Twilio retornou ${resposta.status}`);
      }

      const { sid } = (await resposta.json()) as { sid: string };

      return { canal: 'whatsapp', sucesso: true, id: sid };
    } catch (erro) {
      return {
        canal: 'whatsapp',
        sucesso: false,
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      };
    }
  }
}

/**
 * SMS via Twilio
 */
export class ProvedorSMS extends ProvedorNotificacao {
  private accountSid: string;
  private authToken: string;
  private numeroOrigem: string;

  constructor(accountSid?: string, authToken?: string, numeroOrigem?: string) {
    super();
    this.accountSid = accountSid || process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = authToken || process.env.TWILIO_AUTH_TOKEN || '';
    this.numeroOrigem = numeroOrigem || process.env.TWILIO_SMS_NUMBER || '';

    if (!this.accountSid || !this.authToken || !this.numeroOrigem) {
      throw new Error('Credenciais Twilio incompletas');
    }
  }

  async enviar(config: ConfigNotificacao): Promise<ResultadoNotificacao> {
    if (!config.destinatario.telefone) {
      return { canal: 'sms', sucesso: false, erro: 'Telefone do destinatário não informado' };
    }

    const { titulo, corpo } = this.formatar(config.template, config.variaveis);
    // SMS é limitado a 160 caracteres
    const mensagem = `${titulo}: ${corpo}`.substring(0, 160);

    try {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const resposta = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
          },
          body: new URLSearchParams({
            From: this.numeroOrigem,
            To: config.destinatario.telefone,
            Body: mensagem,
          }).toString(),
        }
      );

      if (!resposta.ok) {
        throw new Error(`Twilio retornou ${resposta.status}`);
      }

      const { sid } = (await resposta.json()) as { sid: string };

      return { canal: 'sms', sucesso: true, id: sid };
    } catch (erro) {
      return {
        canal: 'sms',
        sucesso: false,
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      };
    }
  }
}

// ============================================================================
// Orquestrador (envia para múltiplos canais)
// ============================================================================

export class Notificador {
  private provedores: Map<string, ProvedorNotificacao>;

  constructor() {
    this.provedores = new Map();

    // Inicializar provedores disponíveis
    try {
      this.provedores.set('email', new ProvedorEmail());
    } catch (e) {
      console.warn('Provedor Email não disponível:', e);
    }

    try {
      this.provedores.set('whatsapp', new ProvedorWhatsApp());
    } catch (e) {
      console.warn('Provedor WhatsApp não disponível:', e);
    }

    try {
      this.provedores.set('sms', new ProvedorSMS());
    } catch (e) {
      console.warn('Provedor SMS não disponível:', e);
    }
  }

  async enviar(config: ConfigNotificacao): Promise<ResultadoNotificacao[]> {
    const resultados: ResultadoNotificacao[] = [];

    for (const canal of config.canais) {
      const provedor = this.provedores.get(canal);

      if (!provedor) {
        resultados.push({
          canal: canal as 'email' | 'whatsapp' | 'sms',
          sucesso: false,
          erro: `Provedor ${canal} não disponível`,
        });
        continue;
      }

      const resultado = await provedor.enviar(config);
      resultados.push(resultado);
    }

    return resultados;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function criarNotificador(): Notificador {
  return new Notificador();
}
