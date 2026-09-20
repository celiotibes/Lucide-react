/**
 * Approval Workflow Engine
 *
 * Multi-level approval workflows with sequential, parallel, and conditional routing.
 * Implements time-based escalation and dynamic approval routing based on amount/type/requestor.
 *
 * Database Tables:
 * - workflow_instances: Active workflow executions
 * - approval_steps: Individual approval steps with status tracking
 * - workflow_history: Immutable audit trail
 * - approval_rules: Dynamic routing configurations
 *
 * @example
 * const engine = new FluxoAprovacaoEngine();
 * const fluxoId = await engine.criarFluxoAprovacao({
 *   tipo: 'expense',
 *   valor: 5000,
 *   solicitante_id: 'user-1',
 *   descricao: 'Travel expenses for conference'
 * });
 * await engine.submeterAprovacao(fluxoId);
 * const resultado = await engine.aprovarOuRejeitar(fluxoId, 'approval-step-1', true, 'Approved');
 */

export interface ConfiguracaoFluxoAprovacao {
  id?: string;
  tipo: 'payment' | 'expense' | 'contract' | 'correction' | 'report';
  nome?: string;
  descricao?: string;
  nivel_sequencial?: number;
  suporta_paralelo?: boolean;
  limite_valor_automatico?: number;
  tempo_escalacao_horas?: number;
}

export interface FluxoAprovacao {
  id: string;
  tipo: 'payment' | 'expense' | 'contract' | 'correction' | 'report';
  solicitante_id: string;
  valor: number;
  descricao: string;
  status: 'pending' | 'approved' | 'rejected' | 'recalled' | 'paused' | 'completed';
  prioridade: 'low' | 'medium' | 'high' | 'urgent';
  data_criacao: string;
  data_atualizacao: string;
  data_vencimento?: string;
  metadados?: Record<string, any>;
}

export interface PassoAprovacao {
  id: string;
  fluxo_id: string;
  ordem: number;
  tipo_passo: 'sequential' | 'parallel' | 'conditional';
  aprovador_id?: string;
  grupo_aprovadores?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'escalated' | 'skipped';
  condicao?: (fluxo: FluxoAprovacao) => boolean;
  tempo_limite_horas?: number;
  data_assinacao?: string;
  data_vencimento?: string;
  comentario?: string;
  metadata?: Record<string, any>;
}

export interface RegraRoteamento {
  id: string;
  tipo_documento: 'payment' | 'expense' | 'contract' | 'correction' | 'report';
  condicao: (fluxo: FluxoAprovacao) => boolean;
  rota_aprovadores: string[];
  descricao?: string;
  ativo: boolean;
  prioridade: number;
}

export interface EventoFluxo {
  id: string;
  fluxo_id: string;
  // 'completed' faltava aqui: verificarConclusaoFluxo() já registra esse evento em
  // runtime (workflow concluído com sucesso), o union só não refletia essa variante.
  tipo: 'created' | 'submitted' | 'approved' | 'rejected' | 'escalated' | 'recalled' | 'paused' | 'resumed' | 'completed';
  usuario_id: string;
  timestamp: string;
  mensagem?: string;
  dados_adicionais?: Record<string, any>;
}

export interface ConfiguracaoEscalacao {
  tempo_horas: number;
  escalador_para: string; // manager, director, cfo
  notificar?: boolean;
  criar_tarefa_acompanhamento?: boolean;
}

export class FluxoAprovacaoEngine {
  private fluxos: Map<string, FluxoAprovacao> = new Map();
  private passos: Map<string, PassoAprovacao[]> = new Map();
  private historico: Map<string, EventoFluxo[]> = new Map();
  private regras_roteamento: RegraRoteamento[] = [];
  private timers_escalacao: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Create a new approval workflow
   */
  async criarFluxoAprovacao(config: {
    tipo: 'payment' | 'expense' | 'contract' | 'correction' | 'report';
    valor: number;
    solicitante_id: string;
    descricao: string;
    prioridade?: 'low' | 'medium' | 'high' | 'urgent';
    data_vencimento?: string;
    metadados?: Record<string, any>;
  }): Promise<string> {
    const id = this.gerarUUID();
    const agora = new Date().toISOString();

    const fluxo: FluxoAprovacao = {
      id,
      tipo: config.tipo,
      solicitante_id: config.solicitante_id,
      valor: config.valor,
      descricao: config.descricao,
      status: 'pending',
      prioridade: config.prioridade || 'medium',
      data_criacao: agora,
      data_atualizacao: agora,
      data_vencimento: config.data_vencimento,
      metadados: config.metadados
    };

    this.fluxos.set(id, fluxo);
    this.passos.set(id, []);
    this.historico.set(id, []);

    // Log event
    await this.registrarEvento(id, 'created', config.solicitante_id, 'Workflow created');

    return id;
  }

  /**
   * Submit workflow for approval
   */
  async submeterAprovacao(fluxo_id: string): Promise<void> {
    const fluxo = this.fluxos.get(fluxo_id);
    if (!fluxo) throw new Error(`Fluxo ${fluxo_id} não encontrado`);
    if (fluxo.status !== 'pending') throw new Error(`Fluxo deve estar em status 'pending'`);

    // Determine approval route based on amount and type
    const rota = await this.determinarRota(fluxo);

    // Create approval steps
    const passos = await this.criarPassosAprovacao(fluxo, rota);
    this.passos.set(fluxo_id, passos);

    // Update workflow status
    fluxo.status = 'approved'; // Will be updated based on step approvals
    fluxo.data_atualizacao = new Date().toISOString();

    // Log event
    await this.registrarEvento(fluxo_id, 'submitted', fluxo.solicitante_id, `Routed to ${rota.length} approvers`);

    // Schedule escalation timers
    this.agendarEscalacoes(fluxo_id, passos);
  }

  /**
   * Approve or reject an approval step
   */
  async aprovarOuRejeitar(
    fluxo_id: string,
    passo_id: string,
    aprovado: boolean,
    comentario?: string
  ): Promise<boolean> {
    const fluxo = this.fluxos.get(fluxo_id);
    const passos = this.passos.get(fluxo_id);

    if (!fluxo || !passos) throw new Error(`Fluxo ${fluxo_id} não encontrado`);

    const passo = passos.find(p => p.id === passo_id);
    if (!passo) throw new Error(`Passo ${passo_id} não encontrado`);

    passo.status = aprovado ? 'approved' : 'rejected';
    passo.data_assinacao = new Date().toISOString();
    passo.comentario = comentario;

    fluxo.data_atualizacao = new Date().toISOString();

    // Log event
    await this.registrarEvento(
      fluxo_id,
      aprovado ? 'approved' : 'rejected',
      passo.aprovador_id || 'system',
      comentario || (aprovado ? 'Approved' : 'Rejected')
    );

    // Check if workflow is complete
    await this.verificarConclusaoFluxo(fluxo_id);

    return aprovado;
  }

  /**
   * Escalate approval to higher level after timeout
   */
  async escalarAprovacao(fluxo_id: string, passo_id: string, escalador_para: string): Promise<void> {
    const fluxo = this.fluxos.get(fluxo_id);
    const passos = this.passos.get(fluxo_id);

    if (!fluxo || !passos) throw new Error(`Fluxo ${fluxo_id} não encontrado`);

    const passo = passos.find(p => p.id === passo_id);
    if (!passo) throw new Error(`Passo ${passo_id} não encontrado`);

    if (passo.status !== 'pending') throw new Error('Apenas passos pendentes podem ser escalados');

    // Create new escalation step
    const novo_passo: PassoAprovacao = {
      id: this.gerarUUID(),
      fluxo_id,
      ordem: passo.ordem + 0.5,
      tipo_passo: 'sequential',
      aprovador_id: escalador_para,
      status: 'pending',
      tempo_limite_horas: 4,
      data_vencimento: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    };

    passos.push(novo_passo);
    passos.sort((a, b) => a.ordem - b.ordem);

    passo.status = 'escalated';
    passo.data_assinacao = new Date().toISOString();

    fluxo.status = 'pending';
    fluxo.data_atualizacao = new Date().toISOString();

    await this.registrarEvento(fluxo_id, 'escalated', 'system', `Escalated to ${escalador_para}`);
  }

  /**
   * Recall workflow
   */
  async recallarFluxo(fluxo_id: string, motivo?: string): Promise<void> {
    const fluxo = this.fluxos.get(fluxo_id);
    if (!fluxo) throw new Error(`Fluxo ${fluxo_id} não encontrado`);
    if (fluxo.status === 'completed') throw new Error('Não é possível recallar um fluxo completado');

    fluxo.status = 'recalled';
    fluxo.data_atualizacao = new Date().toISOString();

    const passos = this.passos.get(fluxo_id);
    if (passos) {
      passos.forEach(p => {
        if (p.status === 'pending' || p.status === 'escalated') {
          p.status = 'skipped';
        }
      });
    }

    // Clear escalation timers
    const timerKey = `escalacao_${fluxo_id}`;
    if (this.timers_escalacao.has(timerKey)) {
      clearTimeout(this.timers_escalacao.get(timerKey));
      this.timers_escalacao.delete(timerKey);
    }

    await this.registrarEvento(fluxo_id, 'recalled', 'system', motivo || 'Workflow recalled');
  }

  /**
   * Pause workflow
   */
  async pausarFluxo(fluxo_id: string): Promise<void> {
    const fluxo = this.fluxos.get(fluxo_id);
    if (!fluxo) throw new Error(`Fluxo ${fluxo_id} não encontrado`);

    fluxo.status = 'paused';
    fluxo.data_atualizacao = new Date().toISOString();

    await this.registrarEvento(fluxo_id, 'paused', 'system', 'Workflow paused');
  }

  /**
   * Resume paused workflow
   */
  async resumirFluxo(fluxo_id: string): Promise<void> {
    const fluxo = this.fluxos.get(fluxo_id);
    if (!fluxo) throw new Error(`Fluxo ${fluxo_id} não encontrado`);
    if (fluxo.status !== 'paused') throw new Error('Apenas fluxos pausados podem ser retomados');

    fluxo.status = 'approved'; // Back to processing
    fluxo.data_atualizacao = new Date().toISOString();

    await this.registrarEvento(fluxo_id, 'resumed', 'system', 'Workflow resumed');
  }

  /**
   * Get workflow status
   */
  async obterStatusFluxo(fluxo_id: string): Promise<{
    fluxo: FluxoAprovacao | null;
    passos: PassoAprovacao[];
    progresso: number;
    proxima_acao?: string;
  }> {
    const fluxo = this.fluxos.get(fluxo_id);
    const passos = this.passos.get(fluxo_id) || [];

    if (!fluxo) return { fluxo: null, passos: [], progresso: 0 };

    const total = passos.length || 1;
    const concluidos = passos.filter(p => p.status !== 'pending' && p.status !== 'escalated').length;
    const progresso = (concluidos / total) * 100;

    const proxima = passos.find(p => p.status === 'pending' || p.status === 'escalated');

    return {
      fluxo,
      passos,
      progresso,
      proxima_acao: proxima ? `Aguardando aprovação de ${proxima.aprovador_id}` : undefined
    };
  }

  /**
   * Get workflow history
   */
  async obterHistoricoFluxo(fluxo_id: string): Promise<EventoFluxo[]> {
    return this.historico.get(fluxo_id) || [];
  }

  /**
   * Determine approval route based on amount and type
   */
  private async determinarRota(fluxo: FluxoAprovacao): Promise<string[]> {
    // Find applicable rules
    const regra_aplicavel = this.regras_roteamento.find(r =>
      r.tipo_documento === fluxo.tipo && r.condicao(fluxo) && r.ativo
    );

    if (regra_aplicavel) {
      return regra_aplicavel.rota_aprovadores;
    }

    // Default routing by amount
    if (fluxo.valor > 10000) {
      return ['director', 'cfo'];
    } else if (fluxo.valor > 5000) {
      return ['manager', 'director'];
    } else {
      return ['manager'];
    }
  }

  /**
   * Create approval steps based on route
   */
  private async criarPassosAprovacao(
    fluxo: FluxoAprovacao,
    rota: string[]
  ): Promise<PassoAprovacao[]> {
    return rota.map((aprovador, index) => ({
      id: this.gerarUUID(),
      fluxo_id: fluxo.id,
      ordem: index + 1,
      tipo_passo: 'sequential',
      aprovador_id: aprovador,
      status: 'pending',
      tempo_limite_horas: 24,
      data_vencimento: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }));
  }

  /**
   * Schedule escalation timers
   */
  private agendarEscalacoes(fluxo_id: string, passos: PassoAprovacao[]): void {
    passos.forEach(passo => {
      if (passo.status === 'pending' && passo.tempo_limite_horas) {
        const timerKey = `escalacao_${passo.id}`;
        const timeout = setTimeout(() => {
          this.escalarAprovacao(fluxo_id, passo.id, 'director');
        }, passo.tempo_limite_horas * 60 * 60 * 1000);

        this.timers_escalacao.set(timerKey, timeout);
      }
    });
  }

  /**
   * Check if workflow is complete
   */
  private async verificarConclusaoFluxo(fluxo_id: string): Promise<void> {
    const fluxo = this.fluxos.get(fluxo_id);
    const passos = this.passos.get(fluxo_id);

    if (!fluxo || !passos) return;

    // Check if all steps are completed
    const todos_concluidos = passos.every(p => p.status !== 'pending' && p.status !== 'escalated');

    if (todos_concluidos) {
      // Check if all are approved
      const algum_rejeitado = passos.some(p => p.status === 'rejected');
      fluxo.status = algum_rejeitado ? 'rejected' : 'completed';
      fluxo.data_atualizacao = new Date().toISOString();

      // Clear escalation timers
      passos.forEach(p => {
        const timerKey = `escalacao_${p.id}`;
        if (this.timers_escalacao.has(timerKey)) {
          clearTimeout(this.timers_escalacao.get(timerKey));
          this.timers_escalacao.delete(timerKey);
        }
      });

      await this.registrarEvento(fluxo_id, 'completed', 'system', `Workflow completed with status: ${fluxo.status}`);
    }
  }

  /**
   * Register routing rule
   */
  registrarRegraRoteamento(regra: RegraRoteamento): void {
    this.regras_roteamento.push(regra);
    this.regras_roteamento.sort((a, b) => b.prioridade - a.prioridade);
  }

  /**
   * Register workflow event
   */
  private async registrarEvento(
    fluxo_id: string,
    tipo: EventoFluxo['tipo'],
    usuario_id: string,
    mensagem?: string
  ): Promise<void> {
    const evento: EventoFluxo = {
      id: this.gerarUUID(),
      fluxo_id,
      tipo,
      usuario_id,
      timestamp: new Date().toISOString(),
      mensagem
    };

    const historico = this.historico.get(fluxo_id) || [];
    historico.push(evento);
    this.historico.set(fluxo_id, historico);
  }

  /**
   * Generate UUID
   */
  private gerarUUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
