/**
 * Phase 7c: Data Replication & High Availability
 * Primary-replica replication with multi-region support
 * Automatic failover with health checks
 */

import { v4 as uuidv4 } from 'uuid';

export enum StatusReplica {
  SAUDAVEL = 'SAUDAVEL',
  DEGRADADA = 'DEGRADADA',
  DESCONECTADA = 'DESCONECTADA',
  SINCRONIZANDO = 'SINCRONIZANDO',
  FALHA = 'FALHA'
}

export enum TipoReplica {
  PRIMARIA = 'PRIMARIA',
  REPLICA_SINCRONA = 'REPLICA_SINCRONA',
  REPLICA_ASSINCRONA = 'REPLICA_ASSINCRONA'
}

export enum EstadoFailover {
  NORMAL = 'NORMAL',
  VERIFICANDO = 'VERIFICANDO',
  ATIVANDO = 'ATIVANDO',
  ATIVO = 'ATIVO',
  REVERTER_PENDENTE = 'REVERTER_PENDENTE'
}

export interface ConfiguracaoReplica {
  id: string;
  nome: string;
  tipo: TipoReplica;
  host: string;
  porta: number;
  regiao: string;
  zona: string;
  replicacao_lag_max_ms: number;
  capacidade_gb: number;
  ativa: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusReplicacao {
  id: string;
  replica_id: string;
  status: StatusReplica;
  replicacao_lag_ms: number;
  linhas_sincronizadas: number;
  linhas_pendentes: number;
  ultima_sincronizacao: Date;
  taxa_transferencia_mbps: number;
  percentual_disco: number;
  cpu_percentual: number;
  memoria_percentual: number;
  conexoes_ativas: number;
  transacoes_por_segundo: number;
  erros_ultimas_24h: number;
  ultimaVerificacao: Date;
  proximaVerificacao: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventoFailover {
  id: string;
  timestamp: Date;
  tipo: 'FAILOVER' | 'FAILBACK' | 'VERIFICACAO' | 'RECUPERACAO';
  replica_origem_id: string;
  replica_destino_id: string;
  razao: string;
  automatico: boolean;
  tempo_execucao_ms: number;
  sucesso: boolean;
  dados_perdidos?: number;
  transacoes_reviravoltadas?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusSincronizacao {
  replica_id: string;
  binlog_position: number;
  binlog_file: string;
  tempo_ultima_sincronizacao: Date;
  velocidade_media_mbps: number;
  eta_completo_minutos: number;
  propagacao_global_ms: number;
}

export class GerenciadorReplicacaoHA {
  private replicas: Map<string, ConfiguracaoReplica> = new Map();
  private statusReplicacoes: Map<string, StatusReplicacao> = new Map();
  private historicosFailover: EventoFailover[] = [];
  private sincronizacoes: Map<string, StatusSincronizacao> = new Map();

  // Estado de failover
  private estadoFailoverAtual: EstadoFailover = EstadoFailover.NORMAL;
  private replicaPrimariaAtualId: string = '';
  private intervaloVerificacaoSaude: NodeJS.Timer | null = null;

  constructor() {
    this.inicializarReplicas();
  }

  /**
   * Inicializa replicas padrão
   */
  private inicializarReplicas(): void {
    // Replica primária
    const primaria: ConfiguracaoReplica = {
      id: 'replica-primaria-01',
      nome: 'Primária - SP-01',
      tipo: TipoReplica.PRIMARIA,
      host: 'db-primary-sp.erp.internal',
      porta: 5432,
      regiao: 'us-east-1',
      zona: 'us-east-1a',
      replicacao_lag_max_ms: 100,
      capacidade_gb: 500,
      ativa: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Replicas síncronas
    const replicaSinc1: ConfiguracaoReplica = {
      id: 'replica-sinc-01',
      nome: 'Síncrona - SP-02',
      tipo: TipoReplica.REPLICA_SINCRONA,
      host: 'db-sync-sp.erp.internal',
      porta: 5432,
      regiao: 'us-east-1',
      zona: 'us-east-1b',
      replicacao_lag_max_ms: 50,
      capacidade_gb: 500,
      ativa: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Replicas assíncronas (multi-região)
    const replicaAsync1: ConfiguracaoReplica = {
      id: 'replica-async-01',
      nome: 'Assíncrona - RJ-01',
      tipo: TipoReplica.REPLICA_ASSINCRONA,
      host: 'db-async-rj.erp.internal',
      porta: 5432,
      regiao: 'sa-east-1',
      zona: 'sa-east-1a',
      replicacao_lag_max_ms: 5000,
      capacidade_gb: 500,
      ativa: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const replicaAsync2: ConfiguracaoReplica = {
      id: 'replica-async-02',
      nome: 'Assíncrona - MG-01',
      tipo: TipoReplica.REPLICA_ASSINCRONA,
      host: 'db-async-mg.erp.internal',
      porta: 5432,
      regiao: 'us-west-1',
      zona: 'us-west-1a',
      replicacao_lag_max_ms: 5000,
      capacidade_gb: 500,
      ativa: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.replicas.set(primaria.id, primaria);
    this.replicas.set(replicaSinc1.id, replicaSinc1);
    this.replicas.set(replicaAsync1.id, replicaAsync1);
    this.replicas.set(replicaAsync2.id, replicaAsync2);

    this.replicaPrimariaAtualId = primaria.id;

    // Inicializar status
    for (const replica of this.replicas.values()) {
      this.statusReplicacoes.set(replica.id, {
        id: uuidv4(),
        replica_id: replica.id,
        status: StatusReplica.SAUDAVEL,
        replicacao_lag_ms: Math.random() * 100,
        linhas_sincronizadas: Math.floor(Math.random() * 10000000),
        linhas_pendentes: 0,
        ultima_sincronizacao: new Date(),
        taxa_transferencia_mbps: 100 + Math.random() * 400,
        percentual_disco: 45 + Math.random() * 20,
        cpu_percentual: 30 + Math.random() * 30,
        memoria_percentual: 40 + Math.random() * 30,
        conexoes_ativas: 50 + Math.floor(Math.random() * 200),
        transacoes_por_segundo: 500 + Math.floor(Math.random() * 1500),
        erros_ultimas_24h: Math.floor(Math.random() * 3),
        ultimaVerificacao: new Date(),
        proximaVerificacao: new Date(Date.now() + 10 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      this.sincronizacoes.set(replica.id, {
        replica_id: replica.id,
        binlog_position: Math.floor(Math.random() * 1000000000),
        binlog_file: `mysql-bin.${Math.floor(Math.random() * 1000)}`,
        tempo_ultima_sincronizacao: new Date(),
        velocidade_media_mbps: 150 + Math.random() * 300,
        eta_completo_minutos: Math.floor(Math.random() * 30),
        propagacao_global_ms: Math.random() * 1000
      });
    }
  }

  /**
   * Configura replicação entre replicas
   */
  async configurarReplicacao(
    replicaId: string,
    configExtra?: Partial<ConfiguracaoReplica>
  ): Promise<ConfiguracaoReplica> {
    const replica = this.replicas.get(replicaId);
    if (!replica) {
      throw new Error(`Replica ${replicaId} não encontrada`);
    }

    // Atualizar configuração
    Object.assign(replica, configExtra);
    replica.updatedAt = new Date();

    // Simular configuração da replicação
    await this.simularConfiguracao();

    return replica;
  }

  /**
   * Monitora saúde das replicas
   */
  async monitorarSaude(): Promise<StatusReplicacao[]> {
    const statusList: StatusReplicacao[] = [];

    for (const replica of this.replicas.values()) {
      if (!replica.ativa) continue;

      const status = this.statusReplicacoes.get(replica.id);
      if (!status) continue;

      // Simular verificação de saúde
      status.ultimaVerificacao = new Date();
      status.proximaVerificacao = new Date(Date.now() + 10 * 1000);

      // Simular degradação ocasional
      const degradada = Math.random() > 0.95;
      if (degradada) {
        status.status = StatusReplica.DEGRADADA;
        status.replicacao_lag_ms = 500 + Math.random() * 4500;
        status.linhas_pendentes = Math.floor(Math.random() * 50000);
      } else {
        status.status = StatusReplica.SAUDAVEL;
        status.replicacao_lag_ms = Math.random() * 100;
        status.linhas_pendentes = 0;
      }

      status.updatedAt = new Date();
      statusList.push(status);
    }

    // Verificar se failover é necessário
    await this.verificarNecessidadeFailover(statusList);

    return statusList;
  }

  /**
   * Verifica necessidade de failover
   */
  private async verificarNecessidadeFailover(statusList: StatusReplicacao[]): Promise<void> {
    const primaria = this.replicas.get(this.replicaPrimariaAtualId);
    if (!primaria) return;

    const statusPrimaria = statusList.find(s => s.replica_id === this.replicaPrimariaAtualId);
    if (!statusPrimaria) return;

    // Condiçoes de failover
    if (
      statusPrimaria.status === StatusReplica.DESCONECTADA ||
      statusPrimaria.status === StatusReplica.FALHA ||
      (statusPrimaria.status === StatusReplica.DEGRADADA &&
        statusPrimaria.replicacao_lag_ms > primaria.replicacao_lag_max_ms * 10)
    ) {
      // Procurar melhor replica para failover
      const melhorReplica = this.selecionarMelhorReplica(statusList);
      if (melhorReplica) {
        await this.executarFailover(statusPrimaria.replica_id, melhorReplica.replica_id);
      }
    }
  }

  /**
   * Seleciona melhor replica para failover
   */
  private selecionarMelhorReplica(statusList: StatusReplicacao[]): StatusReplicacao | null {
    // Preferir replicas síncronas saudáveis
    let melhor = statusList.find(
      s =>
        s.status === StatusReplica.SAUDAVEL &&
        this.replicas.get(s.replica_id)?.tipo === TipoReplica.REPLICA_SINCRONA
    );

    if (melhor) return melhor;

    // Depois replicas síncronas degradadas
    melhor = statusList.find(
      s =>
        s.status === StatusReplica.DEGRADADA &&
        this.replicas.get(s.replica_id)?.tipo === TipoReplica.REPLICA_SINCRONA
    );

    if (melhor) return melhor;

    // Finalmente qualquer replica saudável
    return statusList.find(s => s.status === StatusReplica.SAUDAVEL) || null;
  }

  /**
   * Executa failover automático
   */
  async executarFailover(
    replicaOrigemId: string,
    replicaDestinoId: string,
    automatico: boolean = true
  ): Promise<EventoFailover> {
    const inicio = Date.now();
    this.estadoFailoverAtual = EstadoFailover.ATIVANDO;

    try {
      // Promover replica destino a primária
      const replicaDestino = this.replicas.get(replicaDestinoId);
      if (!replicaDestino) {
        throw new Error(`Replica destino ${replicaDestinoId} não encontrada`);
      }

      // Simular processo de failover
      await this.simularPromocaoReplica(replicaDestino);

      // Atualizar estado
      this.replicaPrimariaAtualId = replicaDestinoId;

      const replicaAnterior = this.replicas.get(replicaOrigemId);
      if (replicaAnterior) {
        replicaAnterior.tipo = TipoReplica.REPLICA_ASSINCRONA;
        replicaAnterior.updatedAt = new Date();
      }

      const duracao = Date.now() - inicio;
      this.estadoFailoverAtual = EstadoFailover.ATIVO;

      const evento: EventoFailover = {
        id: uuidv4(),
        timestamp: new Date(),
        tipo: 'FAILOVER',
        replica_origem_id: replicaOrigemId,
        replica_destino_id: replicaDestinoId,
        razao: `Failover automático de ${replicaOrigemId} para ${replicaDestinoId}`,
        automatico,
        tempo_execucao_ms: duracao,
        sucesso: true,
        dados_perdidos: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.historicosFailover.push(evento);
      return evento;
    } catch (error) {
      this.estadoFailoverAtual = EstadoFailover.NORMAL;
      throw new Error(`Falha ao executar failover: ${error}`);
    }
  }

  /**
   * Simula promoção de replica
   */
  private async simularPromocaoReplica(replica: ConfiguracaoReplica): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 200));
    replica.tipo = TipoReplica.PRIMARIA;
    replica.updatedAt = new Date();
  }

  /**
   * Sincroniza todas as replicas
   */
  async sincronizarReplicas(): Promise<{
    replicas_sincronizadas: number;
    replicas_falhadas: number;
    tempo_total_ms: number;
    lag_maximo_ms: number;
  }> {
    const inicio = Date.now();
    let sincronizadas = 0;
    let falhadas = 0;
    let lagMaximo = 0;

    for (const replica of this.replicas.values()) {
      if (replica.id === this.replicaPrimariaAtualId) continue;

      try {
        const status = this.statusReplicacoes.get(replica.id);
        if (status) {
          status.status = StatusReplica.SINCRONIZANDO;
          status.ultima_sincronizacao = new Date();

          // Simular sincronização
          await this.simularSincronizacao(replica.id);

          status.status = StatusReplica.SAUDAVEL;
          status.linhas_pendentes = 0;
          syncronizadas++;

          lagMaximo = Math.max(lagMaximo, status.replicacao_lag_ms);
        }
      } catch (error) {
        falhadas++;
      }
    }

    const tempoTotal = Date.now() - inicio;

    return {
      replicas_sincronizadas: sincronizadas,
      replicas_falhadas: falhadas,
      tempo_total_ms: tempoTotal,
      lag_maximo_ms: lagMaximo
    };
  }

  /**
   * Simula sincronização
   */
  private async simularSincronizacao(replicaId: string): Promise<void> {
    const tempo = Math.random() * 2000 + 1000; // 1-3 segundos
    await new Promise(resolve => setTimeout(resolve, tempo));
  }

  /**
   * Carrega escrita em replicas de leitura
   */
  async executarLeitura(query: string, preferirReplica: boolean = true): Promise<any[]> {
    if (!preferirReplica) {
      return this.executarNoReplica(this.replicaPrimariaAtualId, query);
    }

    // Encontrar melhor replica de leitura
    const statusList = Array.from(this.statusReplicacoes.values());
    const replicasLeitura = statusList.filter(s => s.replica_id !== this.replicaPrimariaAtualId);

    if (replicasLeitura.length === 0) {
      return this.executarNoReplica(this.replicaPrimariaAtualId, query);
    }

    // Selecionar replica com menor lag
    const melhorReplica = replicasLeitura.reduce((prev, current) =>
      prev.replicacao_lag_ms < current.replicacao_lag_ms ? prev : current
    );

    return this.executarNoReplica(melhorReplica.replica_id, query);
  }

  /**
   * Executa query em replica específica
   */
  private async executarNoReplica(replicaId: string, query: string): Promise<any[]> {
    // Simular execução
    const replica = this.replicas.get(replicaId);
    if (!replica) {
      throw new Error(`Replica ${replicaId} não encontrada`);
    }

    // Simular resultado
    return [
      { id: 1, valor: 'Dados de teste' },
      { id: 2, valor: 'Mais dados de teste' }
    ];
  }

  /**
   * Obtém status de todas as replicas
   */
  obterStatusTodasReplicas(): (StatusReplicacao & { nome_replica: string })[] {
    return Array.from(this.statusReplicacoes.values()).map(status => ({
      ...status,
      nome_replica: this.replicas.get(status.replica_id)?.nome || 'Desconhecida'
    }));
  }

  /**
   * Obtém informações de sincronização
   */
  obterInformacoesSincronizacao(): StatusSincronizacao[] {
    return Array.from(this.sincronizacoes.values());
  }

  /**
   * Obtém histórico de failover
   */
  obterHistoricoFailover(ultimosN?: number): EventoFailover[] {
    let resultado = [...this.historicosFailover].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    if (ultimosN) {
      resultado = resultado.slice(0, ultimosN);
    }

    return resultado;
  }

  /**
   * Obtém replica primária atual
   */
  obterReplicaPrimaria(): ConfiguracaoReplica | null {
    return this.replicas.get(this.replicaPrimariaAtualId) || null;
  }

  /**
   * Obtém todas as replicas
   */
  obterTodasReplicas(): ConfiguracaoReplica[] {
    return Array.from(this.replicas.values());
  }

  /**
   * Obtém estado de failover
   */
  obterEstadoFailover(): EstadoFailover {
    return this.estadoFailoverAtual;
  }

  /**
   * Calcula métricas de disponibilidade
   */
  calcularDisponibilidade(): {
    disponibilidade_percentual: number;
    tempo_medio_failover_ms: number;
    replicas_saudaveis: number;
    replicas_total: number;
    rpo_minutos: number;
    rto_minutos: number;
  } {
    const statusList = Array.from(this.statusReplicacoes.values());
    const saudaveis = statusList.filter(s => s.status === StatusReplica.SAUDAVEL).length;
    const total = statusList.length;

    // RTO: Tempo de Recuperação (em minutos)
    const rto = Math.ceil(
      statusList
        .filter(s => s.status !== StatusReplica.SAUDAVEL)
        .reduce((max, s) => Math.max(max, s.replicacao_lag_ms), 0) / 1000 / 60
    );

    // RPO: Objetivo de Ponto de Recuperação
    const rpo =
      statusList.length > 0
        ? Math.ceil(statusList.reduce((max, s) => Math.max(max, s.replicacao_lag_ms), 0) / 1000 / 60)
        : 0;

    const tempoMedioFailover =
      this.historicosFailover.length > 0
        ? this.historicosFailover.reduce((sum, e) => sum + e.tempo_execucao_ms, 0) /
          this.historicosFailover.length
        : 0;

    const disponibilidade = total > 0 ? (saudaveis / total) * 100 : 0;

    return {
      disponibilidade_percentual: Math.round(disponibilidade * 100) / 100,
      tempo_medio_failover_ms: Math.round(tempoMedioFailover),
      replicas_saudaveis: saudaveis,
      replicas_total: total,
      rpo_minutos: rpo,
      rto_minutos: rto
    };
  }

  /**
   * Simula configuração
   */
  private async simularConfiguracao(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
