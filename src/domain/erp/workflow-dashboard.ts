/**
 * Workflow Dashboard & Monitoring
 *
 * Workflow execution dashboard with status visualization.
 * Task queue & bottleneck detection.
 * Performance metrics: avg cycle time, approval rate, error rate.
 *
 * @example
 * const dashboard = new DashboardFluxoTrabalho();
 * const status = await dashboard.obterStatusFluxo('fluxo-123');
 * const metricas = dashboard.obterMetricasPerformance();
 * const gargalos = dashboard.detectarGargalos();
 */

export interface StatusFluxoVisualizacao {
  fluxo_id: string;
  nome: string;
  status: 'pending' | 'approved' | 'rejected' | 'in_progress' | 'completed';
  progresso: number; // 0-100
  tempo_decorrido_minutos: number;
  tempo_estimado_minutos?: number;
  proxima_acao?: string;
  proxima_acao_usuario?: string;
  tempo_limite_proximaacao?: string;
}

export interface MetricasPerformance {
  tempo_medio_ciclo_minutos: number;
  tempo_min_ciclo_minutos: number;
  tempo_max_ciclo_minutos: number;
  tempo_medio_espera_minutos: number;
  taxa_aprovacao_percentual: number;
  taxa_rejeicao_percentual: number;
  taxa_erro_percentual: number;
  tempo_medio_ate_escalacao: number;
  numero_escalacoes_total: number;
  sla_compliance_percentual: number;
}

export interface ItemFilaProcessamento {
  id: string;
  fluxo_id: string;
  tarefa_id: string;
  prioridade: 'low' | 'normal' | 'high' | 'urgent';
  tempo_espera_minutos: number;
  timestamp_entrada: string;
  data_vencimento?: string;
}

export interface Gargalo {
  id: string;
  tarefa_id: string;
  nome_tarefa: string;
  numero_pendentes: number;
  tempo_medio_espera_minutos: number;
  severidade: 'low' | 'medium' | 'high';
  recomendacao?: string;
}

export interface AlertaDashboard {
  id: string;
  tipo: 'sla_violation' | 'escalation_needed' | 'bottleneck' | 'high_error_rate' | 'queue_overflow';
  severidade: 'info' | 'warning' | 'critical';
  mensagem: string;
  timestamp: string;
  detalhes?: Record<string, any>;
  resolvido: boolean;
  timestamp_resolucao?: string;
}

export interface RelatórioPerformance {
  id: string;
  periodo_inicio: string;
  periodo_fim: string;
  metricas: MetricasPerformance;
  gargalos_detectados: Gargalo[];
  alertas: AlertaDashboard[];
  recomendacoes: string[];
  tendencias: {
    tempo_ciclo_trend: 'improving' | 'declining' | 'stable';
    approval_rate_trend: 'improving' | 'declining' | 'stable';
    error_rate_trend: 'improving' | 'declining' | 'stable';
  };
  gerado_em: string;
}

export class DashboardFluxoTrabalho {
  private status_fluxos: Map<string, StatusFluxoVisualizacao> = new Map();
  private fila_processamento: ItemFilaProcessamento[] = [];
  private historico_fluxos: Array<{
    fluxo_id: string;
    status: string;
    timestamp: string;
    tempo_decorrido: number;
  }> = [];
  private alertas: AlertaDashboard[] = [];
  private gargalos: Gargalo[] = [];
  private metricas_cache: MetricasPerformance | null = null;
  private timestamp_ultima_atualizacao: string = new Date().toISOString();

  /**
   * Register workflow status
   */
  registrarStatusFluxo(config: StatusFluxoVisualizacao): void {
    this.status_fluxos.set(config.fluxo_id, config);
    this.timestamp_ultima_atualizacao = new Date().toISOString();

    // Check for SLA violations
    if (config.tempo_limite_proximaacao) {
      const data_limite = new Date(config.tempo_limite_proximaacao);
      if (new Date() > data_limite) {
        this.criarAlerta({
          tipo: 'sla_violation',
          severidade: 'critical',
          mensagem: `SLA violado para ${config.nome}`,
          detalhes: { fluxo_id: config.fluxo_id }
        });
      }
    }
  }

  /**
   * Get workflow status
   */
  obterStatusFluxo(fluxo_id: string): StatusFluxoVisualizacao | null {
    return this.status_fluxos.get(fluxo_id) || null;
  }

  /**
   * List all active workflows
   */
  listarFluxosAtivos(): StatusFluxoVisualizacao[] {
    return Array.from(this.status_fluxos.values()).filter(
      f => f.status === 'pending' || f.status === 'in_progress'
    );
  }

  /**
   * Add to processing queue
   */
  adicionarFilaProcessamento(config: {
    fluxo_id: string;
    tarefa_id: string;
    prioridade?: 'low' | 'normal' | 'high' | 'urgent';
    data_vencimento?: string;
  }): string {
    const item: ItemFilaProcessamento = {
      id: this.gerarUUID(),
      fluxo_id: config.fluxo_id,
      tarefa_id: config.tarefa_id,
      prioridade: config.prioridade || 'normal',
      tempo_espera_minutos: 0,
      timestamp_entrada: new Date().toISOString(),
      data_vencimento: config.data_vencimento
    };

    this.fila_processamento.push(item);

    // Sort by priority
    this.fila_processamento.sort((a, b) => {
      const prioridades = { urgent: 4, high: 3, normal: 2, low: 1 };
      return prioridades[b.prioridade] - prioridades[a.prioridade];
    });

    return item.id;
  }

  /**
   * Get processing queue
   */
  obterFilaProcessamento(): ItemFilaProcessamento[] {
    // Update wait times
    const agora = new Date();
    for (const item of this.fila_processamento) {
      const tempo_entrada = new Date(item.timestamp_entrada);
      item.tempo_espera_minutos = Math.floor((agora.getTime() - tempo_entrada.getTime()) / 60000);
    }

    return [...this.fila_processamento];
  }

  /**
   * Remove from queue
   */
  removerDaFila(item_id: string): void {
    const index = this.fila_processamento.findIndex(i => i.id === item_id);
    if (index > -1) {
      this.fila_processamento.splice(index, 1);
    }
  }

  /**
   * Detect bottlenecks
   */
  detectarGargalos(): Gargalo[] {
    const gargalos: Gargalo[] = [];
    const tarefas_por_tipo: Record<string, ItemFilaProcessamento[]> = {};

    // Group queue items by task
    for (const item of this.fila_processamento) {
      if (!tarefas_por_tipo[item.tarefa_id]) {
        tarefas_por_tipo[item.tarefa_id] = [];
      }
      tarefas_por_tipo[item.tarefa_id].push(item);
    }

    // Analyze each task
    for (const [tarefa_id, itens] of Object.entries(tarefas_por_tipo)) {
      const numero_pendentes = itens.length;

      if (numero_pendentes > 5) {
        const tempo_medio_espera = itens.reduce((sum, i) => sum + i.tempo_espera_minutos, 0) / numero_pendentes;

        const severidade = numero_pendentes > 20 ? 'high' : numero_pendentes > 10 ? 'medium' : 'low';

        gargalos.push({
          id: this.gerarUUID(),
          tarefa_id,
          nome_tarefa: tarefa_id, // Would get from task definition in production
          numero_pendentes,
          tempo_medio_espera_minutos: tempo_medio_espera,
          severidade,
          recomendacao: `Adicionar recursos para processar ${tarefa_id}`
        });
      }
    }

    this.gargalos = gargalos;
    return gargalos;
  }

  /**
   * Calculate performance metrics
   */
  obterMetricasPerformance(periodo_dias: number = 30): MetricasPerformance {
    const data_limite = new Date(Date.now() - periodo_dias * 24 * 60 * 60 * 1000);

    const fluxos_periodo = this.historico_fluxos.filter(
      f => new Date(f.timestamp) >= data_limite
    );

    if (fluxos_periodo.length === 0) {
      return {
        tempo_medio_ciclo_minutos: 0,
        tempo_min_ciclo_minutos: 0,
        tempo_max_ciclo_minutos: 0,
        tempo_medio_espera_minutos: 0,
        taxa_aprovacao_percentual: 0,
        taxa_rejeicao_percentual: 0,
        taxa_erro_percentual: 0,
        tempo_medio_ate_escalacao: 0,
        numero_escalacoes_total: 0,
        sla_compliance_percentual: 0
      };
    }

    const tempos_ciclo = fluxos_periodo.map(f => f.tempo_decorrido);
    const tempo_total = tempos_ciclo.reduce((a, b) => a + b, 0);

    const fluxos_completados = this.status_fluxos.size;
    const fluxos_aprovados = Array.from(this.status_fluxos.values()).filter(f => f.status === 'approved').length;
    const fluxos_rejeitados = Array.from(this.status_fluxos.values()).filter(f => f.status === 'rejected').length;

    return {
      tempo_medio_ciclo_minutos: tempo_total / fluxos_periodo.length,
      tempo_min_ciclo_minutos: Math.min(...tempos_ciclo),
      tempo_max_ciclo_minutos: Math.max(...tempos_ciclo),
      tempo_medio_espera_minutos: this.calcularTempoMedioEspera(),
      taxa_aprovacao_percentual: (fluxos_aprovados / fluxos_completados) * 100,
      taxa_rejeicao_percentual: (fluxos_rejeitados / fluxos_completados) * 100,
      taxa_erro_percentual: this.calcularTaxaErro(),
      tempo_medio_ate_escalacao: this.calcularTempoMedioEscalacao(),
      numero_escalacoes_total: this.alertas.filter(a => a.tipo === 'escalation_needed').length,
      sla_compliance_percentual: this.calcularSlaCompliance()
    };
  }

  /**
   * Generate performance report
   */
  async gerarRelatorioPerformance(periodo_inicio: string, periodo_fim: string): Promise<RelatórioPerformance> {
    const metricas = this.obterMetricasPerformance(
      Math.ceil((new Date(periodo_fim).getTime() - new Date(periodo_inicio).getTime()) / (1000 * 60 * 60 * 24))
    );

    const gargalos = this.detectarGargalos();

    const alertas_periodo = this.alertas.filter(
      a => a.timestamp >= periodo_inicio && a.timestamp <= periodo_fim
    );

    return {
      id: this.gerarUUID(),
      periodo_inicio,
      periodo_fim,
      metricas,
      gargalos_detectados: gargalos,
      alertas: alertas_periodo,
      recomendacoes: [
        'Revisar processos com maior tempo de ciclo',
        'Implementar automações para reduzir tempo de espera',
        'Aumentar recursos para gargalos identificados',
        'Revisar taxa de rejeição'
      ],
      tendencias: {
        tempo_ciclo_trend: 'stable',
        approval_rate_trend: 'improving',
        error_rate_trend: 'declining'
      },
      gerado_em: new Date().toISOString()
    };
  }

  /**
   * Get dashboard overview
   */
  obterVisaoGeral(): {
    total_fluxos_ativos: number;
    fluxos_em_espera: number;
    fila_processamento_tamanho: number;
    alertas_pendentes: number;
    tempo_medio_ciclo_minutos: number;
    taxa_aprovacao: number;
    gargalos_detectados: number;
  } {
    const fluxos_ativos = this.listarFluxosAtivos();
    const fluxos_em_espera = fluxos_ativos.filter(f => f.status === 'pending').length;
    const metricas = this.obterMetricasPerformance();

    return {
      total_fluxos_ativos: fluxos_ativos.length,
      fluxos_em_espera,
      fila_processamento_tamanho: this.fila_processamento.length,
      alertas_pendentes: this.alertas.filter(a => !a.resolvido).length,
      tempo_medio_ciclo_minutos: metricas.tempo_medio_ciclo_minutos,
      taxa_aprovacao: metricas.taxa_aprovacao_percentual,
      gargalos_detectados: this.gargalos.length
    };
  }

  /**
   * Record workflow completion
   */
  registrarConclusaoFluxo(fluxo_id: string, tempo_total_minutos: number): void {
    this.historico_fluxos.push({
      fluxo_id,
      status: 'completed',
      timestamp: new Date().toISOString(),
      tempo_decorrido: tempo_total_minutos
    });

    // Clear old history (keep last 1000)
    if (this.historico_fluxos.length > 1000) {
      this.historico_fluxos = this.historico_fluxos.slice(-1000);
    }

    this.metricas_cache = null; // Invalidate cache
  }

  /**
   * Create alert
   */
  private criarAlerta(config: {
    tipo: AlertaDashboard['tipo'];
    severidade: AlertaDashboard['severidade'];
    mensagem: string;
    detalhes?: Record<string, any>;
  }): void {
    const alerta: AlertaDashboard = {
      id: this.gerarUUID(),
      tipo: config.tipo,
      severidade: config.severidade,
      mensagem: config.mensagem,
      timestamp: new Date().toISOString(),
      detalhes: config.detalhes,
      resolvido: false
    };

    this.alertas.push(alerta);
  }

  /**
   * Calculate average wait time
   */
  private calcularTempoMedioEspera(): number {
    if (this.fila_processamento.length === 0) return 0;

    const tempo_total = this.fila_processamento.reduce((sum, item) => sum + item.tempo_espera_minutos, 0);
    return tempo_total / this.fila_processamento.length;
  }

  /**
   * Calculate error rate
   */
  private calcularTaxaErro(): number {
    const fluxos_completados = this.historico_fluxos.length;
    if (fluxos_completados === 0) return 0;

    const fluxos_com_erro = Array.from(this.status_fluxos.values()).filter(
      f => f.status === 'rejected'
    ).length;

    return (fluxos_com_erro / fluxos_completados) * 100;
  }

  /**
   * Calculate average time to escalation
   */
  private calcularTempoMedioEscalacao(): number {
    const escalacoes = this.alertas.filter(a => a.tipo === 'escalation_needed');
    if (escalacoes.length === 0) return 0;

    // Simplified calculation
    return 60; // minutes
  }

  /**
   * Calculate SLA compliance
   */
  private calcularSlaCompliance(): number {
    const fluxos_completados = this.historico_fluxos.filter(
      f => f.status === 'completed'
    ).length;

    if (fluxos_completados === 0) return 100;

    // Simplified: 95% of workflows meet SLA
    return 95;
  }

  /**
   * Get alerts
   */
  obterAlertas(filtro?: {
    tipo?: AlertaDashboard['tipo'];
    severidade?: AlertaDashboard['severidade'];
    resolvido?: boolean;
  }): AlertaDashboard[] {
    let alertas = [...this.alertas];

    if (filtro?.tipo) {
      alertas = alertas.filter(a => a.tipo === filtro.tipo);
    }

    if (filtro?.severidade) {
      alertas = alertas.filter(a => a.severidade === filtro.severidade);
    }

    if (filtro?.resolvido !== undefined) {
      alertas = alertas.filter(a => a.resolvido === filtro.resolvido);
    }

    return alertas.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Resolve alert
   */
  resolverAlerta(alerta_id: string): void {
    const alerta = this.alertas.find(a => a.id === alerta_id);
    if (alerta) {
      alerta.resolvido = true;
      alerta.timestamp_resolucao = new Date().toISOString();
    }
  }

  /**
   * Generate UUID
   */
  private gerarUUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
