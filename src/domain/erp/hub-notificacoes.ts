/**
 * Notification & Communication Hub
 *
 * Multi-channel messaging with email, SMS, Slack, Teams, WhatsApp support.
 * Template-based messages with variable substitution.
 * Message queuing, delivery tracking, and retry logic with exponential backoff.
 *
 * @example
 * const hub = new HubNotificacoes();
 * await hub.enviarNotificacao({
 *   canal: 'email',
 *   destinatarios: ['user@example.com'],
 *   template: 'expense_approved',
 *   variaveis: { valor: 1000, categoria: 'travel' }
 * });
 */

export type CanalNotificacao = 'email' | 'sms' | 'slack' | 'teams' | 'whatsapp';
export type StatusEntrega = 'queued' | 'sending' | 'delivered' | 'failed' | 'bounced';
export type TipoTemplate = 'expense_submitted' | 'expense_approved' | 'expense_rejected' | 'payment_processed' | 'invoice_received' | 'workflow_completed' | 'compliance_alert' | 'custom';

export interface TemplateNotificacao {
  id: string;
  tipo: TipoTemplate;
  nome: string;
  canais: CanalNotificacao[];
  conteudo: {
    [canal in CanalNotificacao]?: {
      assunto?: string;
      corpo: string;
      html?: string;
      anexos?: { nome: string; conteudo: Buffer }[];
    };
  };
  variaveis_permitidas: string[];
  descricao?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface MensagemNotificacao {
  id: string;
  template_id?: string;
  tipo?: TipoTemplate;
  canal: CanalNotificacao;
  destinatarios: string[];
  cco?: string[];
  assunto?: string;
  corpo: string;
  html?: string;
  anexos?: { nome: string; conteudo: Buffer }[];
  variaveis?: Record<string, any>;
  status: StatusEntrega;
  timestamp_criacao: string;
  timestamp_envio?: string;
  timestamp_entrega?: string;
  tentativas: number;
  proximo_retry?: string;
  erro?: string;
  resultado_entrega?: Record<string, any>;
  prioridade: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
}

export interface RastreamentoEntrega {
  id: string;
  mensagem_id: string;
  timestamp: string;
  status: StatusEntrega;
  detalhes?: Record<string, any>;
  codigo_evento?: string;
  destinatario?: string;
}

export interface ConfiguracaoRetry {
  tentativas_maximas: number;
  delay_inicial_segundos: number;
  multiplier_exponencial: number; // 2 for exponential backoff
  delay_maximo_segundos: number;
}

export interface ConfiguracaoCanal {
  ativo: boolean;
  credenciais?: Record<string, string>;
  configuracao?: Record<string, any>;
}

export class HubNotificacoes {
  private templates: Map<string, TemplateNotificacao> = new Map();
  private fila_mensagens: MensagemNotificacao[] = [];
  private rastreamento: Map<string, RastreamentoEntrega[]> = new Map();
  private configuracao_canais: Map<CanalNotificacao, ConfiguracaoCanal> = new Map();
  private config_retry: ConfiguracaoRetry = {
    tentativas_maximas: 5,
    delay_inicial_segundos: 60,
    multiplier_exponencial: 2,
    delay_maximo_segundos: 3600
  };
  private timers_retry: Map<string, NodeJS.Timeout> = new Map();
  private historico_entrega: RastreamentoEntrega[] = [];

  constructor() {
    // Initialize channel configurations
    const canais: CanalNotificacao[] = ['email', 'sms', 'slack', 'teams', 'whatsapp'];
    canais.forEach(canal => {
      this.configuracao_canais.set(canal, { ativo: false });
    });
  }

  /**
   * Send notification
   */
  async enviarNotificacao(config: {
    canal: CanalNotificacao | CanalNotificacao[];
    destinatarios: string[];
    template?: TipoTemplate;
    template_id?: string;
    assunto?: string;
    corpo?: string;
    html?: string;
    variaveis?: Record<string, any>;
    anexos?: { nome: string; conteudo: Buffer }[];
    prioridade?: 'low' | 'normal' | 'high' | 'urgent';
    cco?: string[];
    tags?: string[];
  }): Promise<string[]> {
    const canais = Array.isArray(config.canal) ? config.canal : [config.canal];
    const mensagem_ids: string[] = [];

    for (const canal of canais) {
      const config_canal = this.configuracao_canais.get(canal);
      if (!config_canal?.ativo) {
        console.warn(`Canal ${canal} não está ativo`);
        continue;
      }

      let corpo = config.corpo || '';
      let assunto = config.assunto;
      let html = config.html;

      // Load template if specified
      if (config.template || config.template_id) {
        const template_id = config.template_id || this.findTemplateId(config.template!);
        if (template_id) {
          const template = this.templates.get(template_id);
          if (template) {
            const conteudo_canal = template.conteudo[canal];
            if (conteudo_canal) {
              corpo = conteudo_canal.corpo;
              assunto = conteudo_canal.assunto || assunto;
              html = conteudo_canal.html || html;
            }
          }
        }
      }

      // Substitute variables
      if (config.variaveis) {
        corpo = this.substituirVariaveis(corpo, config.variaveis);
        if (assunto) assunto = this.substituirVariaveis(assunto, config.variaveis);
        if (html) html = this.substituirVariaveis(html, config.variaveis);
      }

      // Create message
      const mensagem: MensagemNotificacao = {
        id: this.gerarUUID(),
        template_id: config.template_id,
        tipo: config.template,
        canal,
        destinatarios: config.destinatarios,
        cco: config.cco,
        assunto,
        corpo,
        html,
        anexos: config.anexos,
        variaveis: config.variaveis,
        status: 'queued',
        timestamp_criacao: new Date().toISOString(),
        tentativas: 0,
        prioridade: config.prioridade || 'normal',
        tags: config.tags
      };

      this.fila_mensagens.push(mensagem);
      mensagem_ids.push(mensagem.id);

      // Enqueue for processing
      await this.processarMensagem(mensagem);
    }

    return mensagem_ids;
  }

  /**
   * Process message and send
   */
  private async processarMensagem(mensagem: MensagemNotificacao): Promise<void> {
    const tempo_inicio = Date.now();
    mensagem.status = 'sending';
    mensagem.timestamp_envio = new Date().toISOString();

    try {
      const resultado = await this.enviarPorCanal(mensagem);

      mensagem.status = 'delivered';
      mensagem.timestamp_entrega = new Date().toISOString();
      mensagem.resultado_entrega = resultado;

      await this.registrarRastreamento(mensagem.id, 'delivered', resultado);
    } catch (erro) {
      mensagem.status = 'failed';
      mensagem.erro = erro instanceof Error ? erro.message : String(erro);
      mensagem.tentativas++;

      await this.registrarRastreamento(mensagem.id, 'failed', {
        erro: mensagem.erro,
        tentativa: mensagem.tentativas
      });

      // Schedule retry if within limit
      if (mensagem.tentativas < this.config_retry.tentativas_maximas) {
        const delay_ms = this.calcularDelayRetry(mensagem.tentativas);
        mensagem.proximo_retry = new Date(Date.now() + delay_ms).toISOString();

        const timerKey = `retry_${mensagem.id}`;
        const timeout = setTimeout(() => {
          this.processarMensagem(mensagem);
          this.timers_retry.delete(timerKey);
        }, delay_ms);

        this.timers_retry.set(timerKey, timeout);
      } else {
        mensagem.status = 'bounced';
      }
    }
  }

  /**
   * Send via specific channel
   */
  private async enviarPorCanal(mensagem: MensagemNotificacao): Promise<Record<string, any>> {
    switch (mensagem.canal) {
      case 'email':
        return this.enviarEmail(mensagem);
      case 'sms':
        return this.enviarSMS(mensagem);
      case 'slack':
        return this.enviarSlack(mensagem);
      case 'teams':
        return this.enviarTeams(mensagem);
      case 'whatsapp':
        return this.enviarWhatsApp(mensagem);
      default:
        throw new Error(`Canal desconhecido: ${mensagem.canal}`);
    }
  }

  /**
   * Track delivery
   */
  async rastrearEntrega(mensagem_id: string): Promise<RastreamentoEntrega[]> {
    return this.rastreamento.get(mensagem_id) || [];
  }

  /**
   * Resend message
   */
  async resendirMensagem(mensagem_id: string): Promise<void> {
    const mensagem = this.fila_mensagens.find(m => m.id === mensagem_id);
    if (!mensagem) throw new Error(`Mensagem ${mensagem_id} não encontrada`);

    // Reset state for retry
    mensagem.status = 'queued';
    mensagem.tentativas = 0;
    mensagem.timestamp_envio = undefined;
    mensagem.timestamp_entrega = undefined;
    mensagem.proximo_retry = undefined;
    mensagem.erro = undefined;

    await this.processarMensagem(mensagem);
  }

  /**
   * Register template
   */
  async registrarTemplate(config: {
    tipo: TipoTemplate;
    nome: string;
    canais: CanalNotificacao[];
    conteudo: TemplateNotificacao['conteudo'];
    variaveis_permitidas: string[];
    descricao?: string;
  }): Promise<string> {
    const id = this.gerarUUID();
    const agora = new Date().toISOString();

    const template: TemplateNotificacao = {
      id,
      tipo: config.tipo,
      nome: config.nome,
      canais: config.canais,
      conteudo: config.conteudo,
      variaveis_permitidas: config.variaveis_permitidas,
      descricao: config.descricao,
      criado_em: agora,
      atualizado_em: agora
    };

    this.templates.set(id, template);
    return id;
  }

  /**
   * Configure channel
   */
  configurarCanal(canal: CanalNotificacao, config: ConfiguracaoCanal): void {
    this.configuracao_canais.set(canal, config);
  }

  /**
   * Get message status
   */
  obterStatusMensagem(mensagem_id: string): MensagemNotificacao | null {
    return this.fila_mensagens.find(m => m.id === mensagem_id) || null;
  }

  /**
   * Get delivery history
   */
  obterHistoricoEntrega(filtro?: {
    canal?: CanalNotificacao;
    status?: StatusEntrega;
    dias?: number;
  }): MensagemNotificacao[] {
    let mensagens = [...this.fila_mensagens];

    if (filtro?.canal) {
      mensagens = mensagens.filter(m => m.canal === filtro.canal);
    }

    if (filtro?.status) {
      mensagens = mensagens.filter(m => m.status === filtro.status);
    }

    if (filtro?.dias) {
      const data_limite = new Date(Date.now() - filtro.dias * 24 * 60 * 60 * 1000);
      mensagens = mensagens.filter(m =>
        new Date(m.timestamp_criacao) >= data_limite
      );
    }

    return mensagens.sort((a, b) =>
      new Date(b.timestamp_criacao).getTime() - new Date(a.timestamp_criacao).getTime()
    );
  }

  /**
   * Get delivery metrics
   */
  obterMetricasEntrega(): {
    total: number;
    entregues: number;
    falhadas: number;
    bounced: number;
    taxa_sucesso: number;
  } {
    const total = this.fila_mensagens.length;
    const entregues = this.fila_mensagens.filter(m => m.status === 'delivered').length;
    const falhadas = this.fila_mensagens.filter(m => m.status === 'failed').length;
    const bounced = this.fila_mensagens.filter(m => m.status === 'bounced').length;

    return {
      total,
      entregues,
      falhadas,
      bounced,
      taxa_sucesso: total > 0 ? (entregues / total) * 100 : 0
    };
  }

  /**
   * Substitute variables in template
   */
  private substituirVariaveis(texto: string, variaveis: Record<string, any>): string {
    let resultado = texto;
    for (const [chave, valor] of Object.entries(variaveis)) {
      const regex = new RegExp(`{{${chave}}}`, 'g');
      resultado = resultado.replace(regex, String(valor));
    }
    return resultado;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calcularDelayRetry(tentativa: number): number {
    const delay = this.config_retry.delay_inicial_segundos *
      Math.pow(this.config_retry.multiplier_exponencial, tentativa - 1);

    return Math.min(delay, this.config_retry.delay_maximo_segundos) * 1000;
  }

  /**
   * Find template ID by type
   */
  private findTemplateId(tipo: TipoTemplate): string | null {
    for (const [id, template] of this.templates.entries()) {
      if (template.tipo === tipo) return id;
    }
    return null;
  }

  /**
   * Register delivery tracking
   */
  private async registrarRastreamento(
    mensagem_id: string,
    status: StatusEntrega,
    detalhes?: Record<string, any>
  ): Promise<void> {
    const rastreamento_id = `${mensagem_id}-${Date.now()}`;

    if (!this.rastreamento.has(mensagem_id)) {
      this.rastreamento.set(mensagem_id, []);
    }

    const evento: RastreamentoEntrega = {
      id: rastreamento_id,
      mensagem_id,
      timestamp: new Date().toISOString(),
      status,
      detalhes
    };

    this.rastreamento.get(mensagem_id)!.push(evento);
    this.historico_entrega.push(evento);
  }

  /**
   * Mock implementations for sending
   */
  private async enviarEmail(mensagem: MensagemNotificacao): Promise<Record<string, any>> {
    // In production, integrate with SendGrid, AWS SES, etc.
    console.log(`Enviando email para ${mensagem.destinatarios.join(', ')}`);
    return { provider: 'email', message_id: this.gerarUUID() };
  }

  private async enviarSMS(mensagem: MensagemNotificacao): Promise<Record<string, any>> {
    // In production, integrate with Twilio, AWS SNS, etc.
    console.log(`Enviando SMS para ${mensagem.destinatarios.join(', ')}`);
    return { provider: 'sms', message_id: this.gerarUUID() };
  }

  private async enviarSlack(mensagem: MensagemNotificacao): Promise<Record<string, any>> {
    // In production, integrate with Slack API
    console.log(`Enviando Slack para ${mensagem.destinatarios.join(', ')}`);
    return { provider: 'slack', message_id: this.gerarUUID() };
  }

  private async enviarTeams(mensagem: MensagemNotificacao): Promise<Record<string, any>> {
    // In production, integrate with Teams API
    console.log(`Enviando Teams para ${mensagem.destinatarios.join(', ')}`);
    return { provider: 'teams', message_id: this.gerarUUID() };
  }

  private async enviarWhatsApp(mensagem: MensagemNotificacao): Promise<Record<string, any>> {
    // In production, integrate with Twilio, WhatsApp API, etc.
    console.log(`Enviando WhatsApp para ${mensagem.destinatarios.join(', ')}`);
    return { provider: 'whatsapp', message_id: this.gerarUUID() };
  }

  /**
   * Generate UUID
   */
  private gerarUUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
