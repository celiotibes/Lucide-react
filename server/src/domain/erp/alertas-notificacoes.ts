/**
 * Alerts & Notifications Engine (PHASE 5)
 * Real-time alert triggers and multi-channel notifications
 *
 * Tipos de Alerta:
 * - KPI Deviation: quando KPI sai dos limites esperados
 * - Transaction Anomaly: detecção de anomalias em transações
 * - Approval Pending: documentos aguardando aprovação
 * - Compliance Risk: riscos de conformidade
 * - Schedule-based: alertas agendados
 *
 * Canais de Notificação:
 * - Email: SMTP
 * - SMS: Twilio/AWS SNS
 * - In-app: WebSocket
 * - Slack: Webhook
 * - Teams: Webhook
 *
 * Escalação: alertas não reconhecidos escalam após 1h
 */

import { createHash } from "crypto";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export type TipoAlerta =
  | "kpi_deviation"
  | "anomalia_transacao"
  | "aprovacao_pendente"
  | "risco_conformidade"
  | "schedule_based";

export type SeveridadeAlerta = "baixa" | "media" | "alta" | "critica";
export type CanalNotificacao = "email" | "sms" | "in_app" | "slack" | "teams";
export type StatusAlerta = "ativo" | "reconhecido" | "resolvido" | "falso_positivo";

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  severidade: SeveridadeAlerta;
  titulo: string;
  descricao: string;
  usuario_destino_id: string;
  data_criacao: string;
  data_reconhecimento?: string;
  data_resolucao?: string;
  status: StatusAlerta;
  dados_contexto: Record<string, any>;
  hash_verificacao: string;
}

export interface RegraAlerta {
  id: string;
  nome: string;
  tipo: TipoAlerta;
  condicao: Record<string, any>;
  usuarios_notificar: string[];
  canais: CanalNotificacao[];
  severidade: SeveridadeAlerta;
  ativo: boolean;
}

export interface Notificacao {
  id: string;
  alerta_id: string;
  canal: CanalNotificacao;
  destinatario: string;
  conteudo: string;
  data_envio: string;
  data_entrega?: string;
  status: "pendente" | "enviada" | "entregue" | "falhou";
  tentativas: number;
  erro?: string;
}

export interface ConfiguracaoEscalacao {
  tempo_escalacao_ms: number; // padrão: 3600000 (1h)
  usuario_escalacao_id: string;
  notificar_gerente: boolean;
  notificar_diretor: boolean;
}

export interface DashboardAlertas {
  total_alertas: number;
  alertas_criticos: number;
  alertas_altos: number;
  alertas_nao_reconhecidos: number;
  alertas_recentes: Alerta[];
  taxa_resolucao_media: number; // em horas
}

// ============================================================================
// CLASSE: GERENCIADOR DE ALERTAS E NOTIFICAÇÕES
// ============================================================================

export class AlertasNotificacoes {
  private alertas: Map<string, Alerta> = new Map();
  private regras: Map<string, RegraAlerta> = new Map();
  private notificacoes: Map<string, Notificacao> = new Map();
  private escalacoes: Map<string, ConfiguracaoEscalacao> = new Map();
  private historico_alertas: Alerta[] = [];

  /**
   * Cria uma nova regra de alerta
   */
  public criarRegra(config: {
    nome: string;
    tipo: TipoAlerta;
    condicao: Record<string, any>;
    usuarios_notificar: string[];
    canais: CanalNotificacao[];
    severidade: SeveridadeAlerta;
  }): RegraAlerta {
    // Validação
    if (!config.nome || !config.tipo || !config.condicao) {
      throw new Error("Dados de regra incompletos");
    }

    const regra: RegraAlerta = {
      id: `regra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      nome: config.nome,
      tipo: config.tipo,
      condicao: config.condicao,
      usuarios_notificar: config.usuarios_notificar,
      canais: config.canais || ["email", "in_app"],
      severidade: config.severidade,
      ativo: true,
    };

    this.regras.set(regra.id, regra);
    return regra;
  }

  /**
   * Cria um novo alerta
   */
  public criarAlerta(config: {
    tipo: TipoAlerta;
    severidade: SeveridadeAlerta;
    titulo: string;
    descricao: string;
    usuario_destino_id: string;
    dados_contexto: Record<string, any>;
  }): Alerta {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alerta: Alerta = {
      id,
      tipo: config.tipo,
      severidade: config.severidade,
      titulo: config.titulo,
      descricao: config.descricao,
      usuario_destino_id: config.usuario_destino_id,
      data_criacao: new Date().toISOString(),
      status: "ativo",
      dados_contexto: config.dados_contexto,
      hash_verificacao: "",
    };

    alerta.hash_verificacao = this.gerarHashAlerta(alerta);
    this.alertas.set(id, alerta);
    this.historico_alertas.push(alerta);

    return alerta;
  }

  /**
   * Avalia condição e cria alerta se verdadeiro
   */
  public avaliarCondicao(regra_id: string, dados_atuais: Record<string, any>): Alerta | null {
    const regra = this.regras.get(regra_id);
    if (!regra || !regra.ativo) {
      return null;
    }

    // Avaliar condição
    if (!this.avaliarCondicaoRegra(regra.condicao, dados_atuais)) {
      return null;
    }

    // Condição atendida - criar alerta
    const alerta = this.criarAlerta({
      tipo: regra.tipo,
      severidade: regra.severidade,
      titulo: regra.nome,
      descricao: `Regra "${regra.nome}" acionada`,
      usuario_destino_id: regra.usuarios_notificar[0] || "admin",
      dados_contexto: dados_atuais,
    });

    // Enviar notificações
    for (const usuario_id of regra.usuarios_notificar) {
      for (const canal of regra.canais) {
        this.enviarNotificacao(alerta.id, usuario_id, canal);
      }
    }

    return alerta;
  }

  /**
   * Envia notificação via canal específico
   */
  public enviarNotificacao(
    alerta_id: string,
    usuario_id: string,
    canal: CanalNotificacao
  ): Notificacao | null {
    const alerta = this.alertas.get(alerta_id);
    if (!alerta) {
      return null;
    }

    const notificacao: Notificacao = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      alerta_id,
      canal,
      destinatario: usuario_id,
      conteudo: this.gerarConteudoNotificacao(alerta),
      data_envio: new Date().toISOString(),
      status: "pendente",
      tentativas: 0,
    };

    // Simular envio baseado no canal
    const sucesso = this.simularEnvioCanal(canal, usuario_id, notificacao.conteudo);

    if (sucesso) {
      notificacao.status = "enviada";
      notificacao.data_entrega = new Date().toISOString();
      notificacao.tentativas = 1;
    } else {
      notificacao.status = "falhou";
      notificacao.tentativas = 1;
      notificacao.erro = `Falha ao enviar via ${canal}`;
    }

    this.notificacoes.set(notificacao.id, notificacao);
    return notificacao;
  }

  /**
   * Reconhece um alerta (marca como lido)
   */
  public reconhecerAlerta(alerta_id: string, usuario_id: string): Alerta | null {
    const alerta = this.alertas.get(alerta_id);
    if (!alerta) {
      return null;
    }

    // Verificar permissão
    if (alerta.usuario_destino_id !== usuario_id && usuario_id !== "admin") {
      throw new Error("Sem permissão para reconhecer este alerta");
    }

    alerta.status = "reconhecido";
    alerta.data_reconhecimento = new Date().toISOString();

    return alerta;
  }

  /**
   * Resolve um alerta
   */
  public resolverAlerta(alerta_id: string, usuario_id: string): Alerta | null {
    const alerta = this.alertas.get(alerta_id);
    if (!alerta) {
      return null;
    }

    alerta.status = "resolvido";
    alerta.data_resolucao = new Date().toISOString();

    return alerta;
  }

  /**
   * Marca alerta como falso positivo
   */
  public marcarFalsoPositivo(alerta_id: string): Alerta | null {
    const alerta = this.alertas.get(alerta_id);
    if (!alerta) {
      return null;
    }

    alerta.status = "falso_positivo";
    alerta.data_resolucao = new Date().toISOString();

    return alerta;
  }

  /**
   * Obtém dashboard com resumo de alertas
   */
  public obterDashboardAlertas(): DashboardAlertas {
    const alertas_array = Array.from(this.alertas.values());

    const alertas_criticos = alertas_array.filter(
      (a) => a.severidade === "critica"
    ).length;
    const alertas_altos = alertas_array.filter((a) => a.severidade === "alta")
      .length;
    const alertas_nao_reconhecidos = alertas_array.filter(
      (a) => a.status === "ativo"
    ).length;

    // Calcular tempo médio de resolução
    const alertas_resolvidos = alertas_array.filter(
      (a) => a.status === "resolvido"
    );
    let taxa_resolucao_media = 0;

    if (alertas_resolvidos.length > 0) {
      const tempos_resolucao = alertas_resolvidos.map((a) => {
        const tempo_ms =
          new Date(a.data_resolucao!).getTime() -
          new Date(a.data_criacao).getTime();
        return tempo_ms / (1000 * 60 * 60); // converter para horas
      });

      taxa_resolucao_media =
        tempos_resolucao.reduce((a, b) => a + b, 0) / tempos_resolucao.length;
    }

    // Alertas recentes (últimos 10)
    const alertas_recentes = alertas_array
      .sort((a, b) => new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime())
      .slice(0, 10);

    return {
      total_alertas: alertas_array.length,
      alertas_criticos,
      alertas_altos,
      alertas_nao_reconhecidos,
      alertas_recentes,
      taxa_resolucao_media: Math.round(taxa_resolucao_media * 100) / 100,
    };
  }

  /**
   * Obtém alertas de um usuário
   */
  public obterAlertasUsuario(usuario_id: string, status?: StatusAlerta): Alerta[] {
    const alertas_array = Array.from(this.alertas.values()).filter(
      (a) => a.usuario_destino_id === usuario_id
    );

    if (status) {
      return alertas_array.filter((a) => a.status === status);
    }

    return alertas_array;
  }

  /**
   * Configura escalação para um usuário
   */
  public configurarEscalacao(
    usuario_id: string,
    config: ConfiguracaoEscalacao
  ): void {
    this.escalacoes.set(usuario_id, config);

    // Iniciar monitoramento de escalação
    setInterval(() => {
      this.verificarEscalacoes();
    }, 60000); // Verificar a cada minuto
  }

  /**
   * Retrocede alerta (muda status de ativo para falso_positivo)
   */
  public rejeitar Alerta(alerta_id: string): Alerta | null {
    const alerta = this.alertas.get(alerta_id);
    if (!alerta) {
      return null;
    }

    alerta.status = "falso_positivo";
    alerta.data_resolucao = new Date().toISOString();

    return alerta;
  }

  /**
   * Lista histórico de alertas
   */
  public obterHistoricoAlertas(
    filtro?: { tipo?: TipoAlerta; severidade?: SeveridadeAlerta }
  ): Alerta[] {
    let historico = [...this.historico_alertas];

    if (filtro) {
      if (filtro.tipo) {
        historico = historico.filter((a) => a.tipo === filtro.tipo);
      }
      if (filtro.severidade) {
        historico = historico.filter((a) => a.severidade === filtro.severidade);
      }
    }

    return historico;
  }

  // ========================================================================
  // MÉTODOS PRIVADOS
  // ========================================================================

  private avaliarCondicaoRegra(
    condicao: Record<string, any>,
    dados: Record<string, any>
  ): boolean {
    // Avaliação simples de condições
    for (const [chave, valor_esperado] of Object.entries(condicao)) {
      const valor_atual = dados[chave];

      if (typeof valor_esperado === "object") {
        // Comparação por intervalo
        if (valor_esperado.min && valor_atual < valor_esperado.min) {
          return true;
        }
        if (valor_esperado.max && valor_atual > valor_esperado.max) {
          return true;
        }
      } else if (valor_atual !== valor_esperado) {
        return true;
      }
    }

    return false;
  }

  private gerarConteudoNotificacao(alerta: Alerta): string {
    const severidade_emoji = {
      critica: "🔴",
      alta: "🟠",
      media: "🟡",
      baixa: "🟢",
    };

    return `${severidade_emoji[alerta.severidade]} [${alerta.severidade.toUpperCase()}] ${alerta.titulo}\n\n${alerta.descricao}`;
  }

  private simularEnvioCanal(
    canal: CanalNotificacao,
    usuario_id: string,
    conteudo: string
  ): boolean {
    // Simular envio bem-sucedido (90% de taxa de sucesso)
    const sucesso = Math.random() > 0.1;

    if (sucesso) {
      console.log(
        `Notificação enviada via ${canal} para ${usuario_id}: ${conteudo.substring(0, 50)}...`
      );
    }

    return sucesso;
  }

  private verificarEscalacoes(): void {
    const alertas_array = Array.from(this.alertas.values());
    const agora = new Date();

    for (const alerta of alertas_array) {
      if (alerta.status !== "ativo") {
        continue;
      }

      const escalacao = this.escalacoes.get(alerta.usuario_destino_id);
      if (!escalacao) {
        continue;
      }

      const tempo_decorrido =
        agora.getTime() - new Date(alerta.data_criacao).getTime();

      if (tempo_decorrido > escalacao.tempo_escalacao_ms) {
        // Escalar para gerente
        if (escalacao.notificar_gerente) {
          this.enviarNotificacao(alerta.id, escalacao.usuario_escalacao_id, "email");
        }

        // Escalar para diretor (se severidade crítica)
        if (escalacao.notificar_diretor && alerta.severidade === "critica") {
          this.enviarNotificacao(
            alerta.id,
            escalacao.usuario_escalacao_id,
            "email"
          );
        }
      }
    }
  }

  private gerarHashAlerta(alerta: Alerta): string {
    const dados = {
      tipo: alerta.tipo,
      titulo: alerta.titulo,
      severidade: alerta.severidade,
    };
    return createHash("sha256")
      .update(JSON.stringify(dados))
      .digest("hex")
      .substring(0, 16);
  }
}

// ============================================================================
// INSTÂNCIA SINGLETON
// ============================================================================

export const alertasNotificacoes = new AlertasNotificacoes();
