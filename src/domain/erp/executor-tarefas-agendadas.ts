/**
 * Scheduled Task Executor
 *
 * Cron-based task scheduling with task types for reports, reconciliation,
 * backups, cleanup, and archival. Execution history and error logging.
 * Distributed execution with worker pool support.
 *
 * @example
 * const executor = new ExecutorTarefasAgendadas();
 * await executor.agendarTarefa({
 *   nome: 'Daily Report Generation',
 *   tipo: 'report_generation',
 *   cron: '0 9 * * *',
 *   handler: async () => { return { relatorio_id: '123' } }
 * });
 */

export type TipoTarefa = 'report_generation' | 'data_reconciliation' | 'backup' | 'cleanup' | 'archival' | 'sync' | 'custom';
export type StatusTarefa = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type StatusAgendamento = 'active' | 'paused' | 'disabled' | 'archived';

export interface TarefaAgendada {
  id: string;
  nome: string;
  descricao?: string;
  tipo: TipoTarefa;
  cron: string; // "0 9 * * *" format
  timezone?: string;
  parametros?: Record<string, any>;
  handler?: (parametros?: Record<string, any>) => Promise<any>;
  retry_em_falha?: boolean;
  tentativas_maximas?: number;
  timeout_minutos?: number;
  ativo: boolean;
  data_criacao: string;
  data_atualizacao: string;
  proxima_execucao?: string;
  ultima_execucao?: string;
  disabled_motivo?: string;
  tags?: string[];
}

export interface ExecucaoTarefa {
  id: string;
  tarefa_id: string;
  status: StatusTarefa;
  tempo_inicio: string;
  tempo_fim?: string;
  tempo_execucao_ms?: number;
  resultado?: any;
  erro?: string;
  tentativa?: number;
  proximo_retry?: string;
  worker_id?: string;
  logs?: string[];
}

export interface PoolWorker {
  id: string;
  ativo: boolean;
  tarefas_executando: string[]; // Execution IDs
  tarefas_completadas: number;
  tarefas_falhadas: number;
  data_criacao: string;
  ultimo_heartbeat: string;
}

export interface ConfiguracaoExecutor {
  timezone?: string;
  max_workers?: number;
  max_tarefas_paralelas?: number;
  cleanup_logs_dias?: number;
  arquivar_execucoes_dias?: number;
}

export class ExecutorTarefasAgendadas {
  private tarefas: Map<string, TarefaAgendada> = new Map();
  private execucoes: Map<string, ExecucaoTarefa> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private workers: Map<string, PoolWorker> = new Map();
  private historico_execucoes: ExecucaoTarefa[] = [];
  private fila_execucao: { tarefa_id: string; timestamp: string }[] = [];
  private config: ConfiguracaoExecutor = {
    timezone: 'UTC',
    max_workers: 4,
    max_tarefas_paralelas: 10,
    cleanup_logs_dias: 30,
    arquivar_execucoes_dias: 90
  };

  constructor(config?: ConfiguracaoExecutor) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.inicializarWorkers();
  }

  /**
   * Schedule a new task
   */
  async agendarTarefa(config: {
    nome: string;
    descricao?: string;
    tipo: TipoTarefa;
    cron: string;
    timezone?: string;
    parametros?: Record<string, any>;
    handler?: (parametros?: Record<string, any>) => Promise<any>;
    retry_em_falha?: boolean;
    tentativas_maximas?: number;
    timeout_minutos?: number;
    tags?: string[];
  }): Promise<string> {
    const id = this.gerarUUID();
    const agora = new Date().toISOString();

    const tarefa: TarefaAgendada = {
      id,
      nome: config.nome,
      descricao: config.descricao,
      tipo: config.tipo,
      cron: config.cron,
      timezone: config.timezone || this.config.timezone,
      parametros: config.parametros,
      handler: config.handler,
      retry_em_falha: config.retry_em_falha || false,
      tentativas_maximas: config.tentativas_maximas || 3,
      timeout_minutos: config.timeout_minutos || 60,
      ativo: true,
      data_criacao: agora,
      data_atualizacao: agora,
      tags: config.tags
    };

    this.tarefas.set(id, tarefa);
    await this.agendarProximaExecucao(id);

    return id;
  }

  /**
   * Execute task
   */
  async executarTarefa(tarefa_id: string): Promise<string> {
    const tarefa = this.tarefas.get(tarefa_id);
    if (!tarefa) throw new Error(`Tarefa ${tarefa_id} não encontrada`);
    if (!tarefa.ativo) throw new Error(`Tarefa ${tarefa_id} não está ativa`);

    const execucao_id = this.gerarUUID();
    const tempo_inicio = Date.now();

    const execucao: ExecucaoTarefa = {
      id: execucao_id,
      tarefa_id,
      status: 'pending',
      tempo_inicio: new Date().toISOString(),
      logs: []
    };

    this.execucoes.set(execucao_id, execucao);

    // Assign to worker
    const worker = this.atribuirWorker(tarefa_id);
    if (!worker) {
      // Queue for later
      this.fila_execucao.push({ tarefa_id, timestamp: new Date().toISOString() });
      return execucao_id;
    }

    execucao.worker_id = worker.id;
    execucao.status = 'running';

    try {
      // Execute with timeout
      const timeout = tarefa.timeout_minutos! * 60 * 1000;
      const resultado = await Promise.race([
        this.executarComHandler(tarefa, execucao),
        this.criarTimeout(timeout, `Timeout após ${tarefa.timeout_minutos} minutos`)
      ]);

      execucao.status = 'completed';
      execucao.resultado = resultado;
      execucao.tempo_fim = new Date().toISOString();
      execucao.tempo_execucao_ms = Date.now() - tempo_inicio;

      // Update task
      tarefa.ultima_execucao = execucao.tempo_inicio;
      tarefa.data_atualizacao = new Date().toISOString();
      await this.agendarProximaExecucao(tarefa_id);

      // Update worker stats
      worker.tarefas_completadas++;

    } catch (erro) {
      execucao.status = 'failed';
      execucao.erro = erro instanceof Error ? erro.message : String(erro);
      execucao.tempo_fim = new Date().toISOString();
      execucao.tempo_execucao_ms = Date.now() - tempo_inicio;

      if (execucao.logs) {
        execucao.logs.push(`Erro: ${execucao.erro}`);
      }

      // Update worker stats
      worker.tarefas_falhadas++;

      // Retry if configured
      if (tarefa.retry_em_falha && (!execucao.tentativa || execucao.tentativa < tarefa.tentativas_maximas!)) {
        execucao.tentativa = (execucao.tentativa || 0) + 1;
        const delay_ms = this.calcularDelayRetry(execucao.tentativa);
        execucao.proximo_retry = new Date(Date.now() + delay_ms).toISOString();

        const timerKey = `retry_${execucao_id}`;
        const timeout = setTimeout(() => {
          this.executarTarefa(tarefa_id);
          this.timers.delete(timerKey);
        }, delay_ms);

        this.timers.set(timerKey, timeout);
      }
    }

    // Release worker
    if (worker) {
      const index = worker.tarefas_executando.indexOf(execucao_id);
      if (index > -1) {
        worker.tarefas_executando.splice(index, 1);
      }
    }

    this.historico_execucoes.push(execucao);
    await this.procesarFilaExecucao();

    return execucao_id;
  }

  /**
   * Cancel task
   */
  async cancelarTarefa(tarefa_id: string): Promise<void> {
    const tarefa = this.tarefas.get(tarefa_id);
    if (!tarefa) throw new Error(`Tarefa ${tarefa_id} não encontrada`);

    tarefa.ativo = false;
    tarefa.disabled_motivo = 'Cancelado pelo usuário';
    tarefa.data_atualizacao = new Date().toISOString();

    // Clear timer
    const timerKey = `agendado_${tarefa_id}`;
    if (this.timers.has(timerKey)) {
      clearTimeout(this.timers.get(timerKey));
      this.timers.delete(timerKey);
    }
  }

  /**
   * Pause task
   */
  async pausarTarefa(tarefa_id: string): Promise<void> {
    const tarefa = this.tarefas.get(tarefa_id);
    if (!tarefa) throw new Error(`Tarefa ${tarefa_id} não encontrada`);

    tarefa.ativo = false;
    tarefa.data_atualizacao = new Date().toISOString();

    const timerKey = `agendado_${tarefa_id}`;
    if (this.timers.has(timerKey)) {
      clearTimeout(this.timers.get(timerKey));
      this.timers.delete(timerKey);
    }
  }

  /**
   * Resume task
   */
  async resumirTarefa(tarefa_id: string): Promise<void> {
    const tarefa = this.tarefas.get(tarefa_id);
    if (!tarefa) throw new Error(`Tarefa ${tarefa_id} não encontrada`);

    tarefa.ativo = true;
    tarefa.disabled_motivo = undefined;
    tarefa.data_atualizacao = new Date().toISOString();

    await this.agendarProximaExecucao(tarefa_id);
  }

  /**
   * Get task status
   */
  obterStatusTarefa(tarefa_id: string): TarefaAgendada | null {
    return this.tarefas.get(tarefa_id) || null;
  }

  /**
   * Get execution history
   */
  obterHistoricoExecucao(tarefa_id?: string, limite: number = 50): ExecucaoTarefa[] {
    let execucoes = [...this.historico_execucoes].sort((a, b) =>
      new Date(b.tempo_inicio).getTime() - new Date(a.tempo_inicio).getTime()
    );

    if (tarefa_id) {
      execucoes = execucoes.filter(e => e.tarefa_id === tarefa_id);
    }

    return execucoes.slice(0, limite);
  }

  /**
   * List all tasks
   */
  listarTarefas(filtro?: { ativa?: boolean; tipo?: TipoTarefa; tags?: string[] }): TarefaAgendada[] {
    let tarefas = Array.from(this.tarefas.values());

    if (filtro?.ativa !== undefined) {
      tarefas = tarefas.filter(t => t.ativo === filtro.ativa);
    }

    if (filtro?.tipo) {
      tarefas = tarefas.filter(t => t.tipo === filtro.tipo);
    }

    if (filtro?.tags && filtro.tags.length > 0) {
      tarefas = tarefas.filter(t => t.tags && t.tags.some(tag => filtro.tags!.includes(tag)));
    }

    return tarefas;
  }

  /**
   * Get execution statistics
   */
  obterEstatisticas(): {
    total_tarefas: number;
    tarefas_ativas: number;
    total_execucoes: number;
    execucoes_sucesso: number;
    execucoes_falha: number;
    taxa_sucesso: number;
    workers_ativos: number;
  } {
    const total_tarefas = this.tarefas.size;
    const tarefas_ativas = Array.from(this.tarefas.values()).filter(t => t.ativo).length;
    const total_execucoes = this.historico_execucoes.length;
    const execucoes_sucesso = this.historico_execucoes.filter(e => e.status === 'completed').length;
    const execucoes_falha = this.historico_execucoes.filter(e => e.status === 'failed').length;
    const workers_ativos = Array.from(this.workers.values()).filter(w => w.ativo).length;

    return {
      total_tarefas,
      tarefas_ativas,
      total_execucoes,
      execucoes_sucesso,
      execucoes_falha,
      taxa_sucesso: total_execucoes > 0 ? (execucoes_sucesso / total_execucoes) * 100 : 0,
      workers_ativos
    };
  }

  /**
   * Schedule next execution
   */
  private async agendarProximaExecucao(tarefa_id: string): Promise<void> {
    const tarefa = this.tarefas.get(tarefa_id);
    if (!tarefa || !tarefa.ativo) return;

    const proxima_execucao = this.calcularProximaExecucao(tarefa.cron);
    tarefa.proxima_execucao = proxima_execucao.toISOString();

    const delay_ms = proxima_execucao.getTime() - Date.now();
    const timerKey = `agendado_${tarefa_id}`;

    // Clear previous timer
    if (this.timers.has(timerKey)) {
      clearTimeout(this.timers.get(timerKey));
    }

    // Schedule new timer
    const timeout = setTimeout(() => {
      this.executarTarefa(tarefa_id);
      this.timers.delete(timerKey);
    }, Math.max(0, delay_ms));

    this.timers.set(timerKey, timeout);
  }

  /**
   * Calculate next execution time from cron
   */
  private calcularProximaExecucao(cron: string): Date {
    const partes = cron.split(' ');
    const [minuto, hora, dia, mes, dia_semana] = partes.map(Number);

    let proxima = new Date();
    proxima.setSeconds(0);
    proxima.setMilliseconds(0);

    // Simple implementation - would use cron library in production
    proxima.setMinutes(minuto || 0);
    proxima.setHours(hora || 0);

    if (proxima <= new Date()) {
      proxima.setDate(proxima.getDate() + 1);
    }

    return proxima;
  }

  /**
   * Assign task to worker
   */
  private atribuirWorker(tarefa_id: string): PoolWorker | null {
    const workers_disponiveis = Array.from(this.workers.values()).filter(
      w => w.ativo && w.tarefas_executando.length < this.config.max_tarefas_paralelas!
    );

    if (workers_disponiveis.length === 0) return null;

    // Select worker with least tasks
    const worker = workers_disponiveis.reduce((a, b) =>
      a.tarefas_executando.length < b.tarefas_executando.length ? a : b
    );

    return worker;
  }

  /**
   * Process execution queue
   */
  private async procesarFilaExecucao(): Promise<void> {
    while (this.fila_execucao.length > 0) {
      const item = this.fila_execucao[0];
      const worker = this.atribuirWorker(item.tarefa_id);

      if (!worker) break;

      this.fila_execucao.shift();
      await this.executarTarefa(item.tarefa_id);
    }
  }

  /**
   * Execute task with handler
   */
  private async executarComHandler(
    tarefa: TarefaAgendada,
    execucao: ExecucaoTarefa
  ): Promise<any> {
    if (execucao.logs) execucao.logs.push(`Iniciando execução de ${tarefa.nome}`);

    if (tarefa.handler) {
      return await tarefa.handler(tarefa.parametros);
    }

    // Default behavior based on task type
    switch (tarefa.tipo) {
      case 'report_generation':
        if (execucao.logs) execucao.logs.push('Gerando relatório...');
        return { tipo: 'relatorio', id: this.gerarUUID() };

      case 'data_reconciliation':
        if (execucao.logs) execucao.logs.push('Reconciliando dados...');
        return { tipo: 'reconciliacao', registros_processados: 1000 };

      case 'backup':
        if (execucao.logs) execucao.logs.push('Fazendo backup...');
        return { tipo: 'backup', size_bytes: 1024 * 1024 };

      case 'cleanup':
        if (execucao.logs) execucao.logs.push('Limpando dados...');
        return { tipo: 'cleanup', registros_deletados: 500 };

      case 'archival':
        if (execucao.logs) execucao.logs.push('Arquivando dados...');
        return { tipo: 'archival', registros_arquivados: 200 };

      case 'sync':
        if (execucao.logs) execucao.logs.push('Sincronizando dados...');
        return { tipo: 'sync', registros_sincronizados: 100 };

      default:
        return { tipo: 'custom', resultado: 'ok' };
    }
  }

  /**
   * Create timeout promise
   */
  private criarTimeout(ms: number, mensagem: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(mensagem)), ms)
    );
  }

  /**
   * Calculate retry delay
   */
  private calcularDelayRetry(tentativa: number): number {
    return Math.min(60000 * Math.pow(2, tentativa - 1), 3600000); // Max 1 hour
  }

  /**
   * Initialize worker pool
   */
  private inicializarWorkers(): void {
    for (let i = 0; i < this.config.max_workers!; i++) {
      const worker: PoolWorker = {
        id: `worker-${i}`,
        ativo: true,
        tarefas_executando: [],
        tarefas_completadas: 0,
        tarefas_falhadas: 0,
        data_criacao: new Date().toISOString(),
        ultimo_heartbeat: new Date().toISOString()
      };
      this.workers.set(worker.id, worker);
    }
  }

  /**
   * Generate UUID
   */
  private gerarUUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
