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
// Helper: Notificações de Vencimento de Contrato
// ============================================================================

export interface ContratoVencimento {
  id: string;
  imovel_identificacao: string;
  locatario_nome: string;
  locatario_email: string;
  locador_nome: string;
  locador_email: string;
  data_fim: string;
  aviso_previo_dias: number;
  valor_aluguel: number;
  status: string;
}

export interface ResultadoNotificacaoVencimento {
  contrato_id: string;
  sucesso: boolean;
  erro?: string;
  email_locatario?: string;
  email_locador?: string;
}

/**
 * Envia notificações de vencimento de contrato (unificado com Notificador)
 * Substitui enviarEmailVencimento.ts
 */
export async function notificarVencimentoContrato(
  contratos: ContratoVencimento[],
): Promise<ResultadoNotificacaoVencimento[]> {
  const notificador = criarNotificador();
  const resultados: ResultadoNotificacaoVencimento[] = [];

  for (const contrato of contratos) {
    try {
      const dataFim = new Date(contrato.data_fim);
      const dataFormatada = dataFim.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const agora = new Date();
      const diasAteVencimento = Math.ceil(
        (dataFim.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24),
      );

      const template: TemplateNotificacao = {
        titulo: `⏰ Seu contrato vence em ${diasAteVencimento} dias`,
        corpo: `
Olá {{locatario_nome}},

Seu contrato de locação vence em {{dias}} dias ({{data_fmt}}).

Imóvel: {{imovel}}
Valor do Aluguel: R$ {{aluguel}}
Proprietário: {{locador}}

Próximos passos:
- Se deseja renovar o contrato, entre em contato com o proprietário assim que possível
- Se deseja desocupar o imóvel, comunique formalmente com antecedência de {{aviso}} dias
- Confira pendências financeiras antes do vencimento

Acesse o portal para mais detalhes.`,
        acaoUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'}/portal`,
        acaoTexto: 'Ver Detalhes no Portal',
      };

      const variaveis = {
        locatario_nome: contrato.locatario_nome,
        dias: diasAteVencimento,
        data_fmt: dataFormatada,
        imovel: contrato.imovel_identificacao,
        aluguel: contrato.valor_aluguel.toFixed(2).replace('.', ','),
        locador: contrato.locador_nome,
        aviso: contrato.aviso_previo_dias,
      };

      let emailLocatarioEnviado = false;
      let emailLocadorEnviado = false;

      // Enviar para locatário
      if (contrato.locatario_email) {
        try {
          const resultados_locatario = await notificador.enviar({
            canais: ['email'],
            destinatario: {
              email: contrato.locatario_email,
              nome: contrato.locatario_nome,
            },
            template,
            variaveis,
          });
          emailLocatarioEnviado = resultados_locatario.some((r) => r.sucesso);
        } catch (err) {
          console.error(
            `Erro ao enviar email de vencimento para locatário ${contrato.locatario_email}:`,
            err,
          );
        }
      }

      // Enviar para locador também (informativo)
      if (
        contrato.locador_email &&
        contrato.locador_email !== contrato.locatario_email
      ) {
        try {
          const templateLocador: TemplateNotificacao = {
            titulo: `📋 Contrato de {{imovel}} vencendo em {{dias}} dias`,
            corpo: `
Prezado {{locador}},

Informamos que o contrato do imóvel {{imovel}} vence em {{dias}} dias ({{data_fmt}}).

Locatário: {{locatario}}
Aluguel Mensal: R$ {{aluguel}}

Recomendamos tomar as providências necessárias para renovação ou encerramento do contrato dentro do prazo adequado.`,
            acaoUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'}/admin`,
            acaoTexto: 'Acessar Admin',
          };

          const variaveisLocador = {
            ...variaveis,
            locador: contrato.locador_nome,
            locatario: contrato.locatario_nome,
          };

          const resultados_locador = await notificador.enviar({
            canais: ['email'],
            destinatario: {
              email: contrato.locador_email,
              nome: contrato.locador_nome,
            },
            template: templateLocador,
            variaveis: variaveisLocador,
          });
          emailLocadorEnviado = resultados_locador.some((r) => r.sucesso);
        } catch (err) {
          console.error(
            `Erro ao enviar email de vencimento para locador ${contrato.locador_email}:`,
            err,
          );
        }
      }

      resultados.push({
        contrato_id: contrato.id,
        sucesso: emailLocatarioEnviado || emailLocadorEnviado,
        email_locatario: contrato.locatario_email,
        email_locador: contrato.locador_email,
      });
    } catch (erro) {
      resultados.push({
        contrato_id: contrato.id,
        sucesso: false,
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      });
    }
  }

  return resultados;
}

// ============================================================================
// Factory
// ============================================================================

export function criarNotificador(): Notificador {
  return new Notificador();
}
