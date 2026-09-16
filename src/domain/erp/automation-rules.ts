/**
 * Automation Rules Engine
 *
 * Dynamic rule builder with if-then-else conditions and multiple actions.
 * Supports time-based (cron), event-based, and threshold-based triggers.
 * Complex conditions with AND, OR, NOT logic and nesting.
 *
 * @example
 * const engine = new MecanismoRegraAutomacao();
 * await engine.criarRegra({
 *   nome: 'Auto-approve small expenses',
 *   trigger: { tipo: 'evento', evento: 'expense_submitted' },
 *   condicoes: {
 *     operador: 'AND',
 *     criterios: [
 *       { campo: 'valor', operador: '<', valor: 500 },
 *       { campo: 'categoria', operador: '==', valor: 'travel' }
 *     ]
 *   },
 *   acoes: [
 *     { tipo: 'approve_workflow', parametros: { aprovacao_automatica: true } }
 *   ]
 * });
 */

export type TipoTrigger = 'time' | 'event' | 'threshold' | 'manual';
export type TipoAcao = 'create_entry' | 'send_notification' | 'run_report' | 'archive_data' | 'update_status' | 'execute_workflow' | 'create_task';
export type TipoOperador = 'AND' | 'OR' | 'NOT';
export type OperadorComparacao = '==' | '!=' | '<' | '>' | '<=' | '>=' | 'contains' | 'matches' | 'in' | 'not_in';

export interface CondicaoSimples {
  campo: string;
  operador: OperadorComparacao;
  valor: any;
  tipo_valor?: 'number' | 'string' | 'date' | 'boolean';
}

export interface CondicaoComplexa {
  operador: TipoOperador;
  criterios: (CondicaoSimples | CondicaoComplexa)[];
}

export type Condicao = CondicaoSimples | CondicaoComplexa;

export interface TriggerTempo {
  tipo: 'time';
  cron: string; // "0 9 * * *" for 9 AM daily
  timezone?: string;
}

export interface TriggerEvento {
  tipo: 'event';
  evento: string; // 'expense_submitted', 'invoice_received', etc.
  filtro?: Record<string, any>;
}

export interface TriggerLimiar {
  tipo: 'threshold';
  metrica: string; // 'daily_expenses', 'account_balance', etc.
  operador: '<' | '>' | '==' | '<=' | '>=';
  valor: number;
  verificar_a_cada_minutos?: number;
}

export type Trigger = TriggerTempo | TriggerEvento | TriggerLimiar | { tipo: 'manual' };

export interface Acao {
  tipo: TipoAcao;
  descricao?: string;
  parametros: Record<string, any>;
  condicao_execucao?: Condicao; // Conditional execution of action
}

export interface RegraAutomacao {
  id: string;
  nome: string;
  descricao?: string;
  ativa: boolean;
  versao: number;
  trigger: Trigger;
  condicoes: Condicao;
  acoes: Acao[];
  prioridade: number;
  data_criacao: string;
  data_atualizacao: string;
  criado_por: string;
  atualizado_por: string;
  tags?: string[];
}

export interface ExecucaoRegra {
  id: string;
  regra_id: string;
  dados_entrada: Record<string, any>;
  condicoes_avaliadas: {
    condicao: Condicao;
    resultado: boolean;
    tempo_avaliacao_ms: number;
  };
  acoes_executadas: {
    acao: Acao;
    sucesso: boolean;
    resultado?: any;
    erro?: string;
    tempo_execucao_ms: number;
  }[];
  status: 'success' | 'partial' | 'failed';
  timestamp: string;
  tempo_total_ms: number;
}

export interface HistoricoVersaoRegra {
  id: string;
  regra_id: string;
  versao: number;
  conteudo: RegraAutomacao;
  alterado_por: string;
  timestamp: string;
  motivo?: string;
}

export class MecanismoRegraAutomacao {
  private regras: Map<string, RegraAutomacao> = new Map();
  private historico_execucoes: ExecucaoRegra[] = [];
  private historico_versoes: Map<string, HistoricoVersaoRegra[]> = new Map();
  private callbacks_evento: Map<string, Function[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private versao_contador: Map<string, number> = new Map();

  /**
   * Create a new automation rule
   */
  async criarRegra(config: {
    nome: string;
    descricao?: string;
    trigger: Trigger;
    condicoes: Condicao;
    acoes: Acao[];
    prioridade?: number;
    criado_por: string;
    tags?: string[];
  }): Promise<string> {
    const id = this.gerarUUID();
    const agora = new Date().toISOString();

    const regra: RegraAutomacao = {
      id,
      nome: config.nome,
      descricao: config.descricao,
      ativa: true,
      versao: 1,
      trigger: config.trigger,
      condicoes: config.condicoes,
      acoes: config.acoes,
      prioridade: config.prioridade || 0,
      data_criacao: agora,
      data_atualizacao: agora,
      criado_por: config.criado_por,
      atualizado_por: config.criado_por,
      tags: config.tags
    };

    this.regras.set(id, regra);
    this.versao_contador.set(id, 1);

    // Save version history
    await this.salvarVersaoRegra(regra, config.criado_por, 'Created');

    // Schedule if time-based trigger
    if (regra.trigger.tipo === 'time') {
      this.agendarRegraTemporizada(id, regra.trigger as TriggerTempo);
    }

    return id;
  }

  /**
   * Update rule
   */
  async atualizarRegra(
    regra_id: string,
    atualizacoes: Partial<{
      nome: string;
      descricao: string;
      trigger: Trigger;
      condicoes: Condicao;
      acoes: Acao[];
      prioridade: number;
      ativa: boolean;
    }>,
    atualizado_por: string,
    motivo?: string
  ): Promise<void> {
    const regra = this.regras.get(regra_id);
    if (!regra) throw new Error(`Regra ${regra_id} não encontrada`);

    const versao_anterior = { ...regra };
    Object.assign(regra, atualizacoes);

    regra.versao++;
    regra.data_atualizacao = new Date().toISOString();
    regra.atualizado_por = atualizado_por;

    // Save version history
    await this.salvarVersaoRegra(regra, atualizado_por, motivo || 'Updated');

    // Reschedule if trigger changed
    if (atualizacoes.trigger && atualizacoes.trigger.tipo === 'time') {
      const timerKey = `regra_${regra_id}`;
      if (this.timers.has(timerKey)) {
        clearInterval(this.timers.get(timerKey));
        this.timers.delete(timerKey);
      }
      this.agendarRegraTemporizada(regra_id, atualizacoes.trigger as TriggerTempo);
    }
  }

  /**
   * Delete rule
   */
  async deletarRegra(regra_id: string): Promise<void> {
    const regra = this.regras.get(regra_id);
    if (!regra) throw new Error(`Regra ${regra_id} não encontrada`);

    this.regras.delete(regra_id);

    // Clear timer if exists
    const timerKey = `regra_${regra_id}`;
    if (this.timers.has(timerKey)) {
      clearInterval(this.timers.get(timerKey));
      this.timers.delete(timerKey);
    }
  }

  /**
   * Execute rule manually or triggered
   */
  async executarRegra(regra_id: string, dados_entrada: Record<string, any>): Promise<ExecucaoRegra> {
    const regra = this.regras.get(regra_id);
    if (!regra) throw new Error(`Regra ${regra_id} não encontrada`);
    if (!regra.ativa) throw new Error(`Regra ${regra_id} não está ativa`);

    const tempo_inicio = Date.now();
    const execucao: ExecucaoRegra = {
      id: this.gerarUUID(),
      regra_id,
      dados_entrada,
      condicoes_avaliadas: {
        condicao: regra.condicoes,
        resultado: false,
        tempo_avaliacao_ms: 0
      },
      acoes_executadas: [],
      status: 'success',
      timestamp: new Date().toISOString(),
      tempo_total_ms: 0
    };

    try {
      // Evaluate conditions
      const tempo_inicio_condicoes = Date.now();
      const condicoes_ok = this.avaliarCondicao(regra.condicoes, dados_entrada);
      execucao.condicoes_avaliadas.resultado = condicoes_ok;
      execucao.condicoes_avaliadas.tempo_avaliacao_ms = Date.now() - tempo_inicio_condicoes;

      if (!condicoes_ok) {
        execucao.status = 'success'; // Condition not met, but no error
        execucao.tempo_total_ms = Date.now() - tempo_inicio;
        this.historico_execucoes.push(execucao);
        return execucao;
      }

      // Execute actions
      for (const acao of regra.acoes) {
        const tempo_inicio_acao = Date.now();
        try {
          // Check if action has conditional execution
          let executar_acao = true;
          if (acao.condicao_execucao) {
            executar_acao = this.avaliarCondicao(acao.condicao_execucao, dados_entrada);
          }

          if (!executar_acao) {
            execucao.acoes_executadas.push({
              acao,
              sucesso: true,
              tempo_execucao_ms: Date.now() - tempo_inicio_acao,
              resultado: { pulada: true }
            });
            continue;
          }

          const resultado = await this.executarAcao(acao, dados_entrada);
          execucao.acoes_executadas.push({
            acao,
            sucesso: true,
            resultado,
            tempo_execucao_ms: Date.now() - tempo_inicio_acao
          });
        } catch (erro) {
          execucao.acoes_executadas.push({
            acao,
            sucesso: false,
            erro: erro instanceof Error ? erro.message : String(erro),
            tempo_execucao_ms: Date.now() - tempo_inicio_acao
          });
          execucao.status = 'partial';
        }
      }
    } catch (erro) {
      execucao.status = 'failed';
      console.error(`Erro ao executar regra ${regra_id}:`, erro);
    }

    execucao.tempo_total_ms = Date.now() - tempo_inicio;
    this.historico_execucoes.push(execucao);

    return execucao;
  }

  /**
   * Subscribe to event trigger
   */
  inscreverEvento(evento: string, regra_id: string): void {
    if (!this.callbacks_evento.has(evento)) {
      this.callbacks_evento.set(evento, []);
    }

    const regra = this.regras.get(regra_id);
    if (!regra) throw new Error(`Regra ${regra_id} não encontrada`);

    const callback = async (dados: Record<string, any>) => {
      if (regra.trigger.tipo === 'event' && (regra.trigger as TriggerEvento).evento === evento) {
        await this.executarRegra(regra_id, dados);
      }
    };

    this.callbacks_evento.get(evento)!.push(callback);
  }

  /**
   * Publish event
   */
  async publicarEvento(evento: string, dados: Record<string, any>): Promise<void> {
    const callbacks = this.callbacks_evento.get(evento) || [];
    for (const callback of callbacks) {
      try {
        await callback(dados);
      } catch (erro) {
        console.error(`Erro ao processar evento ${evento}:`, erro);
      }
    }
  }

  /**
   * Get rule
   */
  obterRegra(regra_id: string): RegraAutomacao | null {
    return this.regras.get(regra_id) || null;
  }

  /**
   * List all rules
   */
  listarRegras(filtro?: { ativa?: boolean; tags?: string[] }): RegraAutomacao[] {
    let regras = Array.from(this.regras.values());

    if (filtro?.ativa !== undefined) {
      regras = regras.filter(r => r.ativa === filtro.ativa);
    }

    if (filtro?.tags && filtro.tags.length > 0) {
      regras = regras.filter(r => r.tags && r.tags.some(t => filtro.tags!.includes(t)));
    }

    return regras.sort((a, b) => b.prioridade - a.prioridade);
  }

  /**
   * Get rule execution history
   */
  obterHistoricoExecucoes(regra_id?: string, limite: number = 100): ExecucaoRegra[] {
    let execucoes = [...this.historico_execucoes].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (regra_id) {
      execucoes = execucoes.filter(e => e.regra_id === regra_id);
    }

    return execucoes.slice(0, limite);
  }

  /**
   * Get rule version history
   */
  obterHistoricoVersoes(regra_id: string): HistoricoVersaoRegra[] {
    return this.historico_versoes.get(regra_id) || [];
  }

  /**
   * Evaluate condition (private)
   */
  private avaliarCondicao(condicao: Condicao, dados: Record<string, any>): boolean {
    if ('operador' in condicao && (condicao as CondicaoComplexa).operador) {
      const complexa = condicao as CondicaoComplexa;
      switch (complexa.operador) {
        case 'AND':
          return complexa.criterios.every(c => this.avaliarCondicao(c, dados));
        case 'OR':
          return complexa.criterios.some(c => this.avaliarCondicao(c, dados));
        case 'NOT':
          return !this.avaliarCondicao(complexa.criterios[0], dados);
      }
    }

    const simples = condicao as CondicaoSimples;
    const valor = this.obterValorCampo(simples.campo, dados);

    switch (simples.operador) {
      case '==':
        return valor === simples.valor;
      case '!=':
        return valor !== simples.valor;
      case '<':
        return Number(valor) < Number(simples.valor);
      case '>':
        return Number(valor) > Number(simples.valor);
      case '<=':
        return Number(valor) <= Number(simples.valor);
      case '>=':
        return Number(valor) >= Number(simples.valor);
      case 'contains':
        return String(valor).includes(String(simples.valor));
      case 'matches':
        return new RegExp(String(simples.valor)).test(String(valor));
      case 'in':
        return Array.isArray(simples.valor) && simples.valor.includes(valor);
      case 'not_in':
        return !Array.isArray(simples.valor) || !simples.valor.includes(valor);
      default:
        return false;
    }
  }

  /**
   * Get nested field value
   */
  private obterValorCampo(campo: string, dados: Record<string, any>): any {
    return campo.split('.').reduce((obj, prop) => obj?.[prop], dados);
  }

  /**
   * Execute action (private)
   */
  private async executarAcao(acao: Acao, dados: Record<string, any>): Promise<any> {
    switch (acao.tipo) {
      case 'create_entry':
        return { tipo: 'entry_created', id: this.gerarUUID() };
      case 'send_notification':
        return { tipo: 'notification_sent', channel: acao.parametros.channel };
      case 'run_report':
        return { tipo: 'report_generated', nome: acao.parametros.nome_relatorio };
      case 'archive_data':
        return { tipo: 'data_archived', registros: acao.parametros.quantidade };
      case 'update_status':
        return { tipo: 'status_updated', novo_status: acao.parametros.novo_status };
      case 'execute_workflow':
        return { tipo: 'workflow_started', fluxo_id: this.gerarUUID() };
      case 'create_task':
        return { tipo: 'task_created', id: this.gerarUUID() };
      default:
        throw new Error(`Tipo de ação desconhecido: ${acao.tipo}`);
    }
  }

  /**
   * Schedule time-based rule
   */
  private agendarRegraTemporizada(regra_id: string, trigger: TriggerTempo): void {
    // Simple implementation: schedule every minute and check cron
    const timerKey = `regra_${regra_id}`;
    const timeout = setInterval(() => {
      if (this.crontabAtivo(trigger.cron)) {
        this.executarRegra(regra_id, {});
      }
    }, 60000); // Check every minute

    this.timers.set(timerKey, timeout);
  }

  /**
   * Check if cron time matches current time
   */
  private crontabAtivo(cron: string): boolean {
    // Simplified cron matching - in production use node-cron package
    const partes = cron.split(' ');
    if (partes.length !== 5) return false;

    const agora = new Date();
    const [minuto, hora, dia, mes, dia_semana] = partes.map(Number);

    return (
      (minuto === agora.getMinutes() || minuto === -1) &&
      (hora === agora.getHours() || hora === -1) &&
      (dia === agora.getDate() || dia === -1) &&
      (mes === agora.getMonth() + 1 || mes === -1) &&
      (dia_semana === agora.getDay() || dia_semana === -1)
    );
  }

  /**
   * Save version history
   */
  private async salvarVersaoRegra(
    regra: RegraAutomacao,
    alterado_por: string,
    motivo?: string
  ): Promise<void> {
    const versoes = this.historico_versoes.get(regra.id) || [];
    versoes.push({
      id: this.gerarUUID(),
      regra_id: regra.id,
      versao: regra.versao,
      conteudo: { ...regra },
      alterado_por,
      timestamp: new Date().toISOString(),
      motivo
    });
    this.historico_versoes.set(regra.id, versoes);
  }

  /**
   * Generate UUID
   */
  private gerarUUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
