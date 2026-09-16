/**
 * Process Orchestration Engine
 *
 * Defines business processes as DAGs (Directed Acyclic Graphs).
 * Supports task sequencing, parallel execution, conditional branches,
 * error handling, and subprocess composition.
 *
 * @example
 * const engine = new OrquestradorProcessos();
 * const processo = await engine.definirProcesso({
 *   nome: 'Month-End Close',
 *   tarefas: [
 *     { id: 'coleta', tipo: 'tarefa', nome: 'Collect transactions' },
 *     { id: 'validacao', tipo: 'tarefa', nome: 'Validate data', depende_de: ['coleta'] },
 *     { id: 'consolidacao', tipo: 'tarefa', nome: 'Consolidate', depende_de: ['validacao'] }
 *   ]
 * });
 * await engine.executarProcesso(processo.id);
 */

export interface TarefaDefinicao {
  id: string;
  nome: string;
  tipo: 'tarefa' | 'subprocesso' | 'decisao' | 'paralelo';
  descricao?: string;
  depende_de?: string[]; // IDs das tarefas que devem completar antes
  tempo_estimado_minutos?: number;
  retry_tentativas?: number;
  timeout_minutos?: number;
  onError?: 'fail' | 'skip' | 'retry';
  parametros?: Record<string, any>;
  condicao_execucao?: (contexto: ContextoExecucao) => boolean;
  handler?: (contexto: ContextoExecucao) => Promise<any>;
}

export interface ProcessoDefinicao {
  id: string;
  nome: string;
  descricao?: string;
  versao: number;
  tarefas: TarefaDefinicao[];
  condicoes_parada?: (contexto: ContextoExecucao) => boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface EstadoTarefa {
  id: string;
  tarefa_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retry';
  tentativas: number;
  data_inicio?: string;
  data_fim?: string;
  tempo_execucao_ms?: number;
  resultado?: any;
  erro?: string;
  dependencias_atendidas?: boolean;
}

export interface ContextoExecucao {
  id: string;
  processo_id: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
  variaveis: Map<string, any>;
  estado_tarefas: Map<string, EstadoTarefa>;
  data_inicio: string;
  data_fim?: string;
  tempo_total_ms?: number;
  caminho_execucao: string[]; // IDs das tarefas executadas em ordem
}

export interface HistoricoProcesso {
  id: string;
  processo_id: string;
  contexto_execucao_id: string;
  evento: 'started' | 'task_started' | 'task_completed' | 'task_failed' | 'task_skipped' | 'paused' | 'resumed' | 'completed' | 'failed';
  tarefa_id?: string;
  timestamp: string;
  detalhes?: Record<string, any>;
}

export class OrquestradorProcessos {
  private processos: Map<string, ProcessoDefinicao> = new Map();
  private execucoes: Map<string, ContextoExecucao> = new Map();
  private historico: HistoricoProcesso[] = [];
  private subprocessos: Map<string, ProcessoDefinicao> = new Map();
  private pausas: Map<string, boolean> = new Map();

  /**
   * Define a new business process
   */
  async definirProcesso(config: {
    nome: string;
    descricao?: string;
    tarefas: TarefaDefinicao[];
    condicoes_parada?: (contexto: ContextoExecucao) => boolean;
  }): Promise<string> {
    const id = this.gerarUUID();
    const agora = new Date().toISOString();

    // Validate DAG
    this.validarDAG(config.tarefas);

    const processo: ProcessoDefinicao = {
      id,
      nome: config.nome,
      descricao: config.descricao,
      versao: 1,
      tarefas: config.tarefas,
      condicoes_parada: config.condicoes_parada,
      criado_em: agora,
      atualizado_em: agora
    };

    this.processos.set(id, processo);
    return id;
  }

  /**
   * Execute process
   */
  async executarProcesso(processo_id: string, variaveis_iniciais?: Record<string, any>): Promise<string> {
    const processo = this.processos.get(processo_id);
    if (!processo) throw new Error(`Processo ${processo_id} não encontrado`);

    const contexto: ContextoExecucao = {
      id: this.gerarUUID(),
      processo_id,
      status: 'running',
      variaveis: new Map(Object.entries(variaveis_iniciais || {})),
      estado_tarefas: new Map(),
      data_inicio: new Date().toISOString(),
      caminho_execucao: []
    };

    this.execucoes.set(contexto.id, contexto);
    this.pausas.set(contexto.id, false);

    // Initialize task states
    processo.tarefas.forEach(tarefa => {
      contexto.estado_tarefas.set(tarefa.id, {
        id: this.gerarUUID(),
        tarefa_id: tarefa.id,
        status: 'pending',
        tentativas: 0
      });
    });

    await this.registrarHistorico(contexto.id, processo_id, 'started', undefined, { processo: processo.nome });

    // Execute tasks in order (respecting dependencies)
    await this.executarTarefas(contexto, processo);

    contexto.data_fim = new Date().toISOString();
    contexto.tempo_total_ms = new Date(contexto.data_fim).getTime() - new Date(contexto.data_inicio).getTime();

    // Finalize
    if (processo.condicoes_parada && processo.condicoes_parada(contexto)) {
      contexto.status = 'stopped';
      await this.registrarHistorico(contexto.id, processo_id, 'failed');
    } else if (contexto.status === 'running') {
      contexto.status = 'completed';
      await this.registrarHistorico(contexto.id, processo_id, 'completed');
    }

    this.pausas.delete(contexto.id);
    return contexto.id;
  }

  /**
   * Execute all tasks in the process
   */
  private async executarTarefas(contexto: ContextoExecucao, processo: ProcessoDefinicao): Promise<void> {
    while (contexto.status === 'running') {
      // Check if paused
      if (this.pausas.get(contexto.id)) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // Find next ready task
      const proxima_tarefa = this.encontrarProximaTarefa(contexto, processo);

      if (!proxima_tarefa) {
        // All tasks completed
        break;
      }

      const estado_tarefa = contexto.estado_tarefas.get(proxima_tarefa.id)!;

      // Check dependencies
      const dependencias_ok = this.verificarDependencias(contexto, proxima_tarefa, processo);
      estado_tarefa.dependencias_atendidas = dependencias_ok;

      if (!dependencias_ok) {
        if (proxima_tarefa.onError === 'skip') {
          estado_tarefa.status = 'skipped';
          await this.registrarHistorico(contexto.id, processo.id, 'task_skipped', proxima_tarefa.id);
        } else {
          contexto.status = 'failed';
          await this.registrarHistorico(contexto.id, processo.id, 'failed', proxima_tarefa.id, {
            motivo: 'Dependência não atendida'
          });
          return;
        }
        continue;
      }

      // Check execution condition
      if (proxima_tarefa.condicao_execucao && !proxima_tarefa.condicao_execucao(contexto)) {
        estado_tarefa.status = 'skipped';
        await this.registrarHistorico(contexto.id, processo.id, 'task_skipped', proxima_tarefa.id);
        continue;
      }

      // Execute task
      try {
        await this.executarTarefa(contexto, proxima_tarefa, processo);
        contexto.caminho_execucao.push(proxima_tarefa.id);
      } catch (erro) {
        estado_tarefa.status = 'failed';
        estado_tarefa.erro = erro instanceof Error ? erro.message : String(erro);

        if (proxima_tarefa.onError === 'retry' && estado_tarefa.tentativas < (proxima_tarefa.retry_tentativas || 3)) {
          estado_tarefa.tentativas++;
          estado_tarefa.status = 'retry';
          await this.registrarHistorico(contexto.id, processo.id, 'task_started', proxima_tarefa.id, {
            tentativa: estado_tarefa.tentativas
          });
          continue;
        }

        if (proxima_tarefa.onError === 'fail' || proxima_tarefa.onError === undefined) {
          contexto.status = 'failed';
          await this.registrarHistorico(contexto.id, processo.id, 'task_failed', proxima_tarefa.id, {
            erro: erro instanceof Error ? erro.message : String(erro)
          });
          return;
        }

        // onError === 'skip'
        estado_tarefa.status = 'skipped';
        await this.registrarHistorico(contexto.id, processo.id, 'task_skipped', proxima_tarefa.id);
      }
    }
  }

  /**
   * Execute a single task
   */
  private async executarTarefa(
    contexto: ContextoExecucao,
    tarefa: TarefaDefinicao,
    processo: ProcessoDefinicao
  ): Promise<void> {
    const estado = contexto.estado_tarefas.get(tarefa.id)!;
    const tempo_inicio = Date.now();

    estado.status = 'running';
    estado.data_inicio = new Date().toISOString();

    await this.registrarHistorico(contexto.id, processo.id, 'task_started', tarefa.id);

    try {
      let resultado: any;

      switch (tarefa.tipo) {
        case 'subprocesso':
          resultado = await this.executarSubprocesso(contexto, tarefa);
          break;
        case 'decisao':
          resultado = await this.tomarDecisao(contexto, tarefa);
          break;
        case 'paralelo':
          resultado = await this.executarParalelo(contexto, tarefa, processo);
          break;
        default:
          resultado = tarefa.handler ? await tarefa.handler(contexto) : { sucesso: true };
      }

      estado.status = 'completed';
      estado.resultado = resultado;
      estado.data_fim = new Date().toISOString();
      estado.tempo_execucao_ms = Date.now() - tempo_inicio;

      await this.registrarHistorico(contexto.id, processo.id, 'task_completed', tarefa.id, {
        tempo_ms: estado.tempo_execucao_ms
      });
    } catch (erro) {
      throw erro;
    }
  }

  /**
   * Pause execution
   */
  async pausarProcesso(execucao_id: string): Promise<void> {
    const contexto = this.execucoes.get(execucao_id);
    if (!contexto) throw new Error(`Execução ${execucao_id} não encontrada`);

    if (contexto.status === 'running') {
      contexto.status = 'paused';
      this.pausas.set(execucao_id, true);
      await this.registrarHistorico(execucao_id, contexto.processo_id, 'paused');
    }
  }

  /**
   * Resume execution
   */
  async resumirProcesso(execucao_id: string): Promise<void> {
    const contexto = this.execucoes.get(execucao_id);
    if (!contexto) throw new Error(`Execução ${execucao_id} não encontrada`);

    if (contexto.status === 'paused') {
      contexto.status = 'running';
      this.pausas.set(execucao_id, false);
      await this.registrarHistorico(execucao_id, contexto.processo_id, 'resumed');
    }
  }

  /**
   * Stop execution
   */
  async pararProcesso(execucao_id: string): Promise<void> {
    const contexto = this.execucoes.get(execucao_id);
    if (!contexto) throw new Error(`Execução ${execucao_id} não encontrada`);

    contexto.status = 'stopped';
    contexto.data_fim = new Date().toISOString();
    contexto.tempo_total_ms = new Date(contexto.data_fim).getTime() - new Date(contexto.data_inicio).getTime();

    this.pausas.delete(execucao_id);
  }

  /**
   * Get execution status
   */
  obterStatusExecucao(execucao_id: string): ContextoExecucao | null {
    return this.execucoes.get(execucao_id) || null;
  }

  /**
   * Find next task to execute
   */
  private encontrarProximaTarefa(contexto: ContextoExecucao, processo: ProcessoDefinicao): TarefaDefinicao | null {
    for (const tarefa of processo.tarefas) {
      const estado = contexto.estado_tarefas.get(tarefa.id)!;
      if (estado.status === 'pending') {
        return tarefa;
      }
      if (estado.status === 'retry') {
        return tarefa;
      }
    }
    return null;
  }

  /**
   * Verify task dependencies
   */
  private verificarDependencias(
    contexto: ContextoExecucao,
    tarefa: TarefaDefinicao,
    processo: ProcessoDefinicao
  ): boolean {
    if (!tarefa.depende_de || tarefa.depende_de.length === 0) {
      return true;
    }

    for (const dep_id of tarefa.depende_de) {
      const dep_tarefa = processo.tarefas.find(t => t.id === dep_id);
      if (!dep_tarefa) continue;

      const estado_dep = contexto.estado_tarefas.get(dep_id);
      if (!estado_dep || estado_dep.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute subprocess
   */
  private async executarSubprocesso(contexto: ContextoExecucao, tarefa: TarefaDefinicao): Promise<any> {
    const subprocess_id = tarefa.parametros?.processo_id;
    if (!subprocess_id) throw new Error(`Subprocesso não especificado para ${tarefa.id}`);

    return { tipo: 'subprocesso_executado', processo_id: subprocess_id };
  }

  /**
   * Make decision (conditional branch)
   */
  private async tomarDecisao(contexto: ContextoExecucao, tarefa: TarefaDefinicao): Promise<any> {
    if (!tarefa.handler) throw new Error(`Handler não especificado para decisão ${tarefa.id}`);
    return tarefa.handler(contexto);
  }

  /**
   * Execute parallel tasks
   */
  private async executarParalelo(
    contexto: ContextoExecucao,
    tarefa: TarefaDefinicao,
    processo: ProcessoDefinicao
  ): Promise<any> {
    const tarefas_paralelas = tarefa.parametros?.tarefas_ids || [];
    const resultados = await Promise.all(
      tarefas_paralelas.map(async (id: string) => {
        const t = processo.tarefas.find(x => x.id === id);
        if (t) return this.executarTarefa(contexto, t, processo);
      })
    );

    return { tipo: 'paralelo_executado', resultados };
  }

  /**
   * Validate DAG for cycles
   */
  private validarDAG(tarefas: TarefaDefinicao[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const temCiclo = (id: string): boolean => {
      visited.add(id);
      recursionStack.add(id);

      const tarefa = tarefas.find(t => t.id === id);
      if (tarefa?.depende_de) {
        for (const dep of tarefa.depende_de) {
          if (!visited.has(dep)) {
            if (temCiclo(dep)) return true;
          } else if (recursionStack.has(dep)) {
            return true;
          }
        }
      }

      recursionStack.delete(id);
      return false;
    };

    for (const tarefa of tarefas) {
      if (!visited.has(tarefa.id)) {
        if (temCiclo(tarefa.id)) {
          throw new Error('Processo contém ciclos - DAG inválido');
        }
      }
    }
  }

  /**
   * Register execution history
   */
  private async registrarHistorico(
    execucao_id: string,
    processo_id: string,
    evento: HistoricoProcesso['evento'],
    tarefa_id?: string,
    detalhes?: Record<string, any>
  ): Promise<void> {
    this.historico.push({
      id: this.gerarUUID(),
      processo_id,
      contexto_execucao_id: execucao_id,
      evento,
      tarefa_id,
      timestamp: new Date().toISOString(),
      detalhes
    });
  }

  /**
   * Get execution history
   */
  obterHistoricoExecucao(execucao_id: string): HistoricoProcesso[] {
    return this.historico.filter(h => h.contexto_execucao_id === execucao_id);
  }

  /**
   * Generate UUID
   */
  private gerarUUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
