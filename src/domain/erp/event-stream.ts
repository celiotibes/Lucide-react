/**
 * Event Stream & Change Capture
 *
 * Event publishing for all ledger changes with event replay capability.
 * Event types: EntryCreated, EntryModified, EntryRetified, PeriodClosed.
 * Subscribers for automation triggers and audit trails.
 * Kafka/RabbitMQ ready architecture.
 *
 * @example
 * const stream = new EventStream();
 * stream.inscreverEvento('EntryCreated', (evento) => {
 *   console.log(`Nova entrada: ${evento.dados.id}`);
 * });
 * await stream.publicarEvento({
 *   tipo: 'EntryCreated',
 *   agregado_id: 'entry-123',
 *   dados: { valor: 1000, conta: 'CC-001' }
 * });
 */

export type TipoEvento =
  | 'EntryCreated'
  | 'EntryModified'
  | 'EntryRetified'
  | 'PeriodClosed'
  | 'WorkflowApproved'
  | 'WorkflowRejected'
  | 'RuleExecuted'
  | 'TaskCompleted'
  | 'NotificationSent'
  | 'ComplianceViolation';

export interface DadosEvento {
  [key: string]: any;
}

export interface Evento {
  id: string;
  tipo: TipoEvento;
  agregado_id: string; // ID of the entity being changed
  agregado_tipo: 'entry' | 'workflow' | 'rule' | 'task' | 'period' | 'user';
  versao_agregado: number;
  timestamp: string;
  usuario_id?: string;
  dados: DadosEvento;
  dados_anterior?: DadosEvento;
  metadata?: Record<string, any>;
  id_transacao?: string; // For correlating related events
  id_causa?: string; // ID of the event that caused this one
}

export interface SubscriptorEvento {
  id: string;
  tipos_evento: TipoEvento[];
  filtro?: (evento: Evento) => boolean;
  handler: (evento: Evento) => Promise<void>;
  ativo: boolean;
  tentativas_falha: number;
  proxima_retry?: string;
}

export interface ProjeçãoEvento {
  id: string;
  nome: string;
  tipos_evento: TipoEvento[];
  estado: Record<string, any>;
  versao: number;
  ultima_atualizacao: string;
}

export interface SnapshotEvento {
  id: string;
  agregado_id: string;
  agregado_tipo: string;
  versao_agregado: number;
  estado_snapshot: Record<string, any>;
  timestamp: string;
  evento_id: string;
}

export class EventStream {
  private eventos: Evento[] = [];
  private subscriptores: Map<string, SubscriptorEvento[]> = new Map();
  private projecoes: Map<string, ProjeçãoEvento> = new Map();
  private snapshots: Map<string, SnapshotEvento> = new Map();
  private replaying = false;
  private timers_retry: Map<string, NodeJS.Timeout> = new Map();
  private deduplicacao: Set<string> = new Set(); // Prevent duplicate processing
  private max_eventos_fila = 100000;
  private offset_leitura = 0;

  /**
   * Publish event
   */
  async publicarEvento(config: {
    tipo: TipoEvento;
    agregado_id: string;
    agregado_tipo: 'entry' | 'workflow' | 'rule' | 'task' | 'period' | 'user';
    versao_agregado?: number;
    usuario_id?: string;
    dados: DadosEvento;
    dados_anterior?: DadosEvento;
    metadata?: Record<string, any>;
    id_transacao?: string;
    id_causa?: string;
  }): Promise<string> {
    const evento: Evento = {
      id: this.gerarUUID(),
      tipo: config.tipo,
      agregado_id: config.agregado_id,
      agregado_tipo: config.agregado_tipo,
      versao_agregado: config.versao_agregado || 1,
      timestamp: new Date().toISOString(),
      usuario_id: config.usuario_id,
      dados: config.dados,
      dados_anterior: config.dados_anterior,
      metadata: config.metadata,
      id_transacao: config.id_transacao || this.gerarUUID(),
      id_causa: config.id_causa
    };

    // Check deduplication
    const hash_evento = `${evento.agregado_id}-${evento.tipo}-${evento.timestamp}`;
    if (this.deduplicacao.has(hash_evento)) {
      console.warn(`Evento duplicado detectado: ${hash_evento}`);
      return evento.id;
    }
    this.deduplicacao.add(hash_evento);

    // Add to stream
    this.eventos.push(evento);

    // Maintain size limit
    if (this.eventos.length > this.max_eventos_fila) {
      this.eventos = this.eventos.slice(-this.max_eventos_fila);
    }

    // Notify subscribers
    await this.notificarSubscriptores(evento);

    return evento.id;
  }

  /**
   * Subscribe to events
   */
  inscreverEvento(
    tipos_evento: TipoEvento | TipoEvento[],
    handler: (evento: Evento) => Promise<void>,
    opcoes?: {
      filtro?: (evento: Evento) => boolean;
      id?: string;
    }
  ): string {
    const tipos = Array.isArray(tipos_evento) ? tipos_evento : [tipos_evento];
    const id_subscriptor = opcoes?.id || this.gerarUUID();

    const subscriptor: SubscriptorEvento = {
      id: id_subscriptor,
      tipos_evento: tipos,
      filtro: opcoes?.filtro,
      handler,
      ativo: true,
      tentativas_falha: 0
    };

    for (const tipo of tipos) {
      if (!this.subscriptores.has(tipo)) {
        this.subscriptores.set(tipo, []);
      }
      this.subscriptores.get(tipo)!.push(subscriptor);
    }

    return id_subscriptor;
  }

  /**
   * Unsubscribe from events
   */
  desinscreverEvento(id_subscriptor: string): void {
    for (const subscriptores of this.subscriptores.values()) {
      const index = subscriptores.findIndex(s => s.id === id_subscriptor);
      if (index > -1) {
        subscriptores.splice(index, 1);
      }
    }
  }

  /**
   * Replay events
   */
  async replayEventos(opcoes?: {
    a_partir_de?: string; // event ID
    tipos_evento?: TipoEvento[];
    agregado_id?: string;
    desde_timestamp?: string;
    ate_timestamp?: string;
  }): Promise<Evento[]> {
    this.replaying = true;
    const eventos_filtrados: Evento[] = [];

    try {
      for (const evento of this.eventos) {
        // Apply filters
        if (opcoes?.tipos_evento && !opcoes.tipos_evento.includes(evento.tipo)) {
          continue;
        }

        if (opcoes?.agregado_id && evento.agregado_id !== opcoes.agregado_id) {
          continue;
        }

        if (opcoes?.desde_timestamp && evento.timestamp < opcoes.desde_timestamp) {
          continue;
        }

        if (opcoes?.ate_timestamp && evento.timestamp > opcoes.ate_timestamp) {
          continue;
        }

        if (opcoes?.a_partir_de === evento.id) {
          // Start from this event
          eventos_filtrados.push(evento);
          // Continue to add remaining events
          const start_index = this.eventos.indexOf(evento);
          for (let i = start_index + 1; i < this.eventos.length; i++) {
            const e = this.eventos[i];
            if (!opcoes.tipos_evento || opcoes.tipos_evento.includes(e.tipo)) {
              if (!opcoes.agregado_id || e.agregado_id === opcoes.agregado_id) {
                eventos_filtrados.push(e);
              }
            }
          }
          break;
        }

        eventos_filtrados.push(evento);
      }

      // Notify subscribers of replayed events
      for (const evento of eventos_filtrados) {
        await this.notificarSubscriptores(evento);
      }

    } finally {
      this.replaying = false;
    }

    return eventos_filtrados;
  }

  /**
   * Create projection
   */
  criarProjecao(config: {
    nome: string;
    tipos_evento: TipoEvento[];
    handler?: (estado: Record<string, any>, evento: Evento) => Record<string, any>;
  }): string {
    const id = this.gerarUUID();

    const projecao: ProjeçãoEvento = {
      id,
      nome: config.nome,
      tipos_evento: config.tipos_evento,
      estado: {},
      versao: 0,
      ultima_atualizacao: new Date().toISOString()
    };

    this.projecoes.set(id, projecao);

    // Subscribe to events
    this.inscreverEvento(config.tipos_evento, async (evento) => {
      if (config.handler) {
        projecao.estado = config.handler(projecao.estado, evento);
      }
      projecao.versao++;
      projecao.ultima_atualizacao = new Date().toISOString();
    }, { id: `proj_${id}` });

    return id;
  }

  /**
   * Get projection state
   */
  obterProjecao(projecao_id: string): ProjeçãoEvento | null {
    return this.projecoes.get(projecao_id) || null;
  }

  /**
   * Snapshot an aggregate
   */
  async criarSnapshot(
    agregado_id: string,
    agregado_tipo: string,
    versao: number,
    estado: Record<string, any>
  ): Promise<string> {
    const snapshot_id = this.gerarUUID();

    const snapshot: SnapshotEvento = {
      id: snapshot_id,
      agregado_id,
      agregado_tipo,
      versao_agregado: versao,
      estado_snapshot: estado,
      timestamp: new Date().toISOString(),
      evento_id: ''
    };

    this.snapshots.set(`${agregado_id}-${versao}`, snapshot);
    return snapshot_id;
  }

  /**
   * Get snapshot
   */
  obterSnapshot(agregado_id: string): SnapshotEvento | null {
    // Get latest snapshot
    for (const [key, snapshot] of this.snapshots.entries()) {
      if (snapshot.agregado_id === agregado_id) {
        return snapshot;
      }
    }
    return null;
  }

  /**
   * Get events by aggregate
   */
  obterEventosPorAgregado(agregado_id: string): Evento[] {
    return this.eventos.filter(e => e.agregado_id === agregado_id);
  }

  /**
   * Get events by type
   */
  obterEventosPorTipo(tipo: TipoEvento): Evento[] {
    return this.eventos.filter(e => e.tipo === tipo);
  }

  /**
   * Get events in date range
   */
  obterEventosPorPeriodo(desde: string, ate: string): Evento[] {
    return this.eventos.filter(e =>
      e.timestamp >= desde && e.timestamp <= ate
    );
  }

  /**
   * Get correlated events
   */
  obterEventosCorrelacionados(id_transacao: string): Evento[] {
    return this.eventos.filter(e => e.id_transacao === id_transacao);
  }

  /**
   * Get event stream statistics
   */
  obterEstatisticas(): {
    total_eventos: number;
    eventos_por_tipo: Record<string, number>;
    ultimos_24h: number;
    subscriptores_ativos: number;
    projecoes: number;
  } {
    const eventos_por_tipo: Record<string, number> = {};
    const agora = new Date();
    const vinte_quatro_horas_atras = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

    let ultimos_24h = 0;

    for (const evento of this.eventos) {
      eventos_por_tipo[evento.tipo] = (eventos_por_tipo[evento.tipo] || 0) + 1;
      if (new Date(evento.timestamp) >= vinte_quatro_horas_atras) {
        ultimos_24h++;
      }
    }

    const subscriptores_ativos = Array.from(this.subscriptores.values())
      .flat()
      .filter(s => s.ativo).length;

    return {
      total_eventos: this.eventos.length,
      eventos_por_tipo,
      ultimos_24h,
      subscriptores_ativos,
      projecoes: this.projecoes.size
    };
  }

  /**
   * Notify subscribers
   */
  private async notificarSubscriptores(evento: Evento): Promise<void> {
    const subscriptores = this.subscriptores.get(evento.tipo) || [];

    for (const subscriptor of subscriptores) {
      if (!subscriptor.ativo) continue;

      // Check filter
      if (subscriptor.filtro && !subscriptor.filtro(evento)) {
        continue;
      }

      try {
        await subscriptor.handler(evento);
        subscriptor.tentativas_falha = 0;
      } catch (erro) {
        subscriptor.tentativas_falha++;

        if (subscriptor.tentativas_falha < 5) {
          // Schedule retry
          const delay_ms = Math.min(1000 * Math.pow(2, subscriptor.tentativas_falha - 1), 30000);
          subscriptor.proxima_retry = new Date(Date.now() + delay_ms).toISOString();

          const timerKey = `retry_${subscriptor.id}_${evento.id}`;
          const timeout = setTimeout(() => {
            this.notificarSubscriptores(evento);
            this.timers_retry.delete(timerKey);
          }, delay_ms);

          this.timers_retry.set(timerKey, timeout);
        } else {
          // Disable subscriber after too many failures
          subscriptor.ativo = false;
          console.error(`Subscriptor ${subscriptor.id} desabilitado após muitas falhas:`, erro);
        }
      }
    }
  }

  /**
   * Generate UUID
   */
  private gerarUUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
