/**
 * Phase 7d: Disaster Recovery Plan (DRP)
 * RTO: 4 hours, RPO: 1 hour
 * Scenarios and recovery procedures
 */

import { v4 as uuidv4 } from 'uuid';

export enum TipoDesastre {
  INDISPONIBILIDADE_DC = 'INDISPONIBILIDADE_DC',
  CORRUPCAO_DADOS = 'CORRUPCAO_DADOS',
  RANSOMWARE = 'RANSOMWARE',
  FALHA_DISCO = 'FALHA_DISCO',
  PERDA_CONECTIVIDADE = 'PERDA_CONECTIVIDADE',
  FALHA_APLICACAO = 'FALHA_APLICACAO',
  ERRO_USUARIO = 'ERRO_USUARIO'
}

export enum SeveridadeDesastre {
  BAIXA = 'BAIXA',
  MEDIA = 'MEDIA',
  ALTA = 'ALTA',
  CRITICA = 'CRITICA'
}

export enum StatusRecuperacao {
  PLANEJADO = 'PLANEJADO',
  EM_EXECUCAO = 'EM_EXECUCAO',
  PARCIALMENTE_RECUPERADO = 'PARCIALMENTE_RECUPERADO',
  TOTALMENTE_RECUPERADO = 'TOTALMENTE_RECUPERADO',
  FALHA_RECUPERACAO = 'FALHA_RECUPERACAO'
}

export interface CenarioDesastre {
  id: string;
  nome: string;
  tipo: TipoDesastre;
  severidade: SeveridadeDesastre;
  descricao: string;
  rto_horas: number;
  rpo_horas: number;
  passos_recuperacao: PassoRecuperacao[];
  recursos_necessarios: string[];
  contatos_escalacao: ContatoEscalacao[];
  localizar_arquivo_runbook: string;
  ultima_teste: Date | null;
  proxima_teste: Date;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PassoRecuperacao {
  numero: number;
  descricao: string;
  tempo_estimado_minutos: number;
  responsavel: string;
  sistema_afetado: string;
  instrucoes: string[];
  critico: boolean;
  dependencias: number[];
  rollback_disponivel: boolean;
}

export interface ContatoEscalacao {
  nivel: number;
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  disponibilidade_24h: boolean;
}

export interface ExecucaoDRP {
  id: string;
  cenario_id: string;
  tipo_desastre: TipoDesastre;
  data_inicio: Date;
  data_conclusao: Date | null;
  status: StatusRecuperacao;
  passos_completados: number;
  passos_total: number;
  responsavel: string;
  observacoes: string[];
  tempos_recuperacao: {
    tempo_total_minutos: number;
    tempo_objetivo_minutos: number;
  };
  dados_perdidos_registros: number;
  transacoes_reviravoltadas: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestedrpRegistro {
  id: string;
  cenario_id: string;
  data_teste: Date;
  tipo_teste: 'SIMULACAO' | 'DRILL' | 'TABLETOP';
  duracao_minutos: number;
  resultado: 'PASSOU' | 'FALHOU_PARCIAL' | 'FALHOU_TOTAL';
  passos_completados: number;
  tempo_total_vs_rto_percentual: number;
  issues_encontrados: string[];
  recomendacoes: string[];
  responsavel: string;
  proxima_data_teste: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecursoRecuperacao {
  id: string;
  nome: string;
  tipo: string;
  localizacao: string;
  status: 'DISPONIVEL' | 'RESERVADO' | 'INDISPONIVEL';
  tempo_ativacao_minutos: number;
  custo_horario: number;
  data_ultima_verificacao: Date;
  proxima_verificacao: Date;
}

export class PlanoRecuperacaoDesastres {
  private cenarios: Map<string, CenarioDesastre> = new Map();
  private execucoes: ExecucaoDRP[] = [];
  private testes: TestedrpRegistro[] = [];
  private recursos: Map<string, RecursoRecuperacao> = new Map();

  // Configuração padrão de RTO/RPO
  private rtoPadrao = 4 * 60; // 4 horas em minutos
  private rpoPadrao = 60; // 1 hora em minutos

  constructor() {
    this.inicializarCenarios();
    this.inicializarRecursos();
  }

  /**
   * Inicializa cenários de desastre padrão
   */
  private inicializarCenarios(): void {
    const cenarios: CenarioDesastre[] = [
      {
        id: 'cenario-dc-indisponivel',
        nome: 'Indisponibilidade Total do Data Center',
        tipo: TipoDesastre.INDISPONIBILIDADE_DC,
        severidade: SeveridadeDesastre.CRITICA,
        descricao: 'Falha completa do data center principal (perda de energia, incêndio, etc)',
        rto_horas: 4,
        rpo_horas: 1,
        passos_recuperacao: [
          {
            numero: 1,
            descricao: 'Ativar failover automático para DR site',
            tempo_estimado_minutos: 5,
            responsavel: 'DevOps',
            sistema_afetado: 'Infraestrutura',
            instrucoes: [
              'Verificar status do DR site',
              'Executar script de failover',
              'Validar conectividade'
            ],
            critico: true,
            dependencias: [],
            rollback_disponivel: false
          },
          {
            numero: 2,
            descricao: 'Validar integridade de dados',
            tempo_estimado_minutos: 30,
            responsavel: 'DBA',
            sistema_afetado: 'Base de Dados',
            instrucoes: [
              'Executar verificação de integridade',
              'Comparar hashes de dados',
              'Validar índices'
            ],
            critico: true,
            dependencias: [1],
            rollback_disponivel: false
          },
          {
            numero: 3,
            descricao: 'Recuperar transações perdidas (até 1 hora)',
            tempo_estimado_minutos: 60,
            responsavel: 'DBA',
            sistema_afetado: 'Base de Dados',
            instrucoes: [
              'Localizar arquivo de transações',
              'Aplicar transações pendentes',
              'Validar consistência'
            ],
            critico: true,
            dependencias: [2],
            rollback_disponivel: true
          },
          {
            numero: 4,
            descricao: 'Testar aplicações críticas',
            tempo_estimado_minutos: 45,
            responsavel: 'QA',
            sistema_afetado: 'Aplicação',
            instrucoes: [
              'Executar health checks',
              'Testar funcionalidades críticas',
              'Validar integrações'
            ],
            critico: true,
            dependencias: [3],
            rollback_disponivel: false
          },
          {
            numero: 5,
            descricao: 'Notificar stakeholders e restabelecer operações',
            tempo_estimado_minutos: 20,
            responsavel: 'Gerente de Projeto',
            sistema_afetado: 'Organizacional',
            instrucoes: [
              'Enviar comunicado',
              'Documentar timeline',
              'Abrir call-bridge com clientes'
            ],
            critico: false,
            dependencias: [4],
            rollback_disponivel: false
          }
        ],
        recursos_necessarios: [
          'DR Site Completo',
          'Networking Team',
          'DBA Team',
          'DevOps Team',
          'QA Team'
        ],
        contatos_escalacao: [
          {
            nivel: 1,
            nome: 'Gerente de Infraestrutura',
            cargo: 'Sr. Infrastructure Manager',
            email: 'infra.manager@erp.com',
            telefone: '+55 11 99999-0001',
            disponibilidade_24h: true
          },
          {
            nivel: 2,
            nome: 'VP de Tecnologia',
            cargo: 'VP Technology',
            email: 'vp.tech@erp.com',
            telefone: '+55 11 99999-0002',
            disponibilidade_24h: true
          }
        ],
        localizar_arquivo_runbook: 's3://erp-drp/runbooks/dc-failover.md',
        ultima_teste: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        proxima_teste: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        ativo: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'cenario-corrupcao-dados',
        nome: 'Corrupção de Dados',
        tipo: TipoDesastre.CORRUPCAO_DADOS,
        severidade: SeveridadeDesastre.ALTA,
        descricao: 'Corrupção detectada em base de dados crítica',
        rto_horas: 4,
        rpo_horas: 1,
        passos_recuperacao: [
          {
            numero: 1,
            descricao: 'Isolar banco de dados afetado',
            tempo_estimado_minutos: 10,
            responsavel: 'DBA',
            sistema_afetado: 'Base de Dados',
            instrucoes: [
              'Desconectar aplicações',
              'Ativar modo read-only',
              'Criar snapshot imediato'
            ],
            critico: true,
            dependencias: [],
            rollback_disponivel: false
          },
          {
            numero: 2,
            descricao: 'Restaurar de backup anterior ao ponto de corrupção',
            tempo_estimado_minutos: 90,
            responsavel: 'DBA',
            sistema_afetado: 'Base de Dados',
            instrucoes: [
              'Identificar hora da corrupção',
              'Selecionar backup apropriado',
              'Executar restauração',
              'Validar integridade'
            ],
            critico: true,
            dependencias: [1],
            rollback_disponivel: true
          },
          {
            numero: 3,
            descricao: 'Reaplicar transações válidas após corrupção',
            tempo_estimado_minutos: 60,
            responsavel: 'DBA',
            sistema_afetado: 'Base de Dados',
            instrucoes: [
              'Extrair transações de log',
              'Validar cada transação',
              'Aplicar transações válidas'
            ],
            critico: true,
            dependencias: [2],
            rollback_disponivel: true
          },
          {
            numero: 4,
            descricao: 'Restaurar conectividade de aplicações',
            tempo_estimado_minutos: 20,
            responsavel: 'DevOps',
            sistema_afetado: 'Aplicação',
            instrucoes: [
              'Reconectar aplicações',
              'Validar conexões',
              'Monitorar tráfego'
            ],
            critico: true,
            dependencias: [3],
            rollback_disponivel: false
          }
        ],
        recursos_necessarios: ['Storage de Backup', 'DBA Team', 'DevOps Team'],
        contatos_escalacao: [
          {
            nivel: 1,
            nome: 'DBA Senior',
            cargo: 'Sr. Database Administrator',
            email: 'dba.senior@erp.com',
            telefone: '+55 11 99999-0003',
            disponibilidade_24h: true
          }
        ],
        localizar_arquivo_runbook: 's3://erp-drp/runbooks/data-corruption-recovery.md',
        ultima_teste: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        proxima_teste: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        ativo: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'cenario-ransomware',
        nome: 'Ataque de Ransomware',
        tipo: TipoDesastre.RANSOMWARE,
        severidade: SeveridadeDesastre.CRITICA,
        descricao: 'Sistema infectado por ransomware',
        rto_horas: 4,
        rpo_horas: 1,
        passos_recuperacao: [
          {
            numero: 1,
            descricao: 'Isolar sistemas afetados',
            tempo_estimado_minutos: 15,
            responsavel: 'Security',
            sistema_afetado: 'Infraestrutura',
            instrucoes: [
              'Desconectar da rede',
              'Documentar indicadores de comprometimento',
              'Notificar segurança'
            ],
            critico: true,
            dependencias: [],
            rollback_disponivel: false
          },
          {
            numero: 2,
            descricao: 'Restaurar de backup limpo',
            tempo_estimado_minutos: 120,
            responsavel: 'DBA/DevOps',
            sistema_afetado: 'Base de Dados',
            instrucoes: [
              'Selecionar backup anterior ao incidente',
              'Restaurar em ambiente isolado',
              'Validar ausência de malware'
            ],
            critico: true,
            dependencias: [1],
            rollback_disponivel: false
          },
          {
            numero: 3,
            descricao: 'Análise forense e remediação',
            tempo_estimado_minutos: 180,
            responsavel: 'Security',
            sistema_afetado: 'Infraestrutura',
            instrucoes: [
              'Investigar vetor de ataque',
              'Aplicar patches',
              'Fortalecer segurança'
            ],
            critico: true,
            dependencias: [2],
            rollback_disponivel: false
          },
          {
            numero: 4,
            descricao: 'Restaurar operações normais',
            tempo_estimado_minutos: 60,
            responsavel: 'DevOps',
            sistema_afetado: 'Aplicação',
            instrucoes: [
              'Reconectar à rede',
              'Validar integridade',
              'Restaurar dados do backup'
            ],
            critico: true,
            dependencias: [3],
            rollback_disponivel: false
          }
        ],
        recursos_necessarios: [
          'Security Team',
          'DBA Team',
          'DevOps Team',
          'Forensics Expert'
        ],
        contatos_escalacao: [
          {
            nivel: 1,
            nome: 'Chief Security Officer',
            cargo: 'CSO',
            email: 'cso@erp.com',
            telefone: '+55 11 99999-0004',
            disponibilidade_24h: true
          }
        ],
        localizar_arquivo_runbook: 's3://erp-drp/runbooks/ransomware-response.md',
        ultima_teste: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        proxima_teste: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        ativo: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const cenario of cenarios) {
      this.cenarios.set(cenario.id, cenario);
    }
  }

  /**
   * Inicializa recursos de recuperação
   */
  private inicializarRecursos(): void {
    const recursos: RecursoRecuperacao[] = [
      {
        id: 'rec-dr-site-01',
        nome: 'DR Site Completo',
        tipo: 'Infraestrutura',
        localizacao: 'São Paulo - Zona Sul',
        status: 'DISPONIVEL',
        tempo_ativacao_minutos: 5,
        custo_horario: 0, // Espera-by standby
        data_ultima_verificacao: new Date(),
        proxima_verificacao: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      {
        id: 'rec-backup-storage-01',
        nome: 'Storage de Backup Externo',
        tipo: 'Armazenamento',
        localizacao: 'AWS S3 Multi-Region',
        status: 'DISPONIVEL',
        tempo_ativacao_minutos: 10,
        custo_horario: 50,
        data_ultima_verificacao: new Date(),
        proxima_verificacao: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      {
        id: 'rec-networking-team-01',
        nome: 'Networking Team',
        tipo: 'Pessoal',
        localizacao: 'On-Call Rotation',
        status: 'DISPONIVEL',
        tempo_ativacao_minutos: 15,
        custo_horario: 0,
        data_ultima_verificacao: new Date(),
        proxima_verificacao: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    ];

    for (const recurso of recursos) {
      this.recursos.set(recurso.id, recurso);
    }
  }

  /**
   * Ativa plano de recuperação
   */
  async ativarPlanoRecuperacao(
    cenarioId: string,
    razao: string,
    responsavelId: string
  ): Promise<ExecucaoDRP> {
    const cenario = this.cenarios.get(cenarioId);
    if (!cenario) {
      throw new Error(`Cenário ${cenarioId} não encontrado`);
    }

    if (!cenario.ativo) {
      throw new Error(`Cenário ${cenarioId} não está ativo`);
    }

    const execucao: ExecucaoDRP = {
      id: uuidv4(),
      cenario_id: cenarioId,
      tipo_desastre: cenario.tipo,
      data_inicio: new Date(),
      data_conclusao: null,
      status: StatusRecuperacao.EM_EXECUCAO,
      passos_completados: 0,
      passos_total: cenario.passos_recuperacao.length,
      responsavel: responsavelId,
      observacoes: [razao],
      tempos_recuperacao: {
        tempo_total_minutos: 0,
        tempo_objetivo_minutos: cenario.rto_horas * 60
      },
      dados_perdidos_registros: 0,
      transacoes_reviravoltadas: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.execucoes.push(execucao);

    // Notificar contatos de escalação
    this.notificarEscalacao(cenario, execucao);

    return execucao;
  }

  /**
   * Completa passo de recuperação
   */
  async completarPassoRecuperacao(
    execucaoId: string,
    numeroPasso: number,
    observacoes?: string
  ): Promise<ExecucaoDRP> {
    const execucao = this.execucoes.find(e => e.id === execucaoId);
    if (!execucao) {
      throw new Error(`Execução ${execucaoId} não encontrada`);
    }

    execucao.passos_completados = Math.min(
      execucao.passos_completados + 1,
      execucao.passos_total
    );

    if (observacoes) {
      execucao.observacoes.push(observacoes);
    }

    execucao.updatedAt = new Date();

    // Verificar se todos os passos foram completados
    if (execucao.passos_completados === execucao.passos_total) {
      execucao.data_conclusao = new Date();
      execucao.status = StatusRecuperacao.TOTALMENTE_RECUPERADO;

      // Calcular tempo total
      const tempoTotal = Math.floor(
        (execucao.data_conclusao.getTime() - execucao.data_inicio.getTime()) / 60000
      );
      execucao.tempos_recuperacao.tempo_total_minutos = tempoTotal;
    }

    return execucao;
  }

  /**
   * Testa DRP (Disaster Recovery Plan)
   */
  async testarDRP(
    cenarioId: string,
    tipoTeste: 'SIMULACAO' | 'DRILL' | 'TABLETOP'
  ): Promise<TestedrpRegistro> {
    const cenario = this.cenarios.get(cenarioId);
    if (!cenario) {
      throw new Error(`Cenário ${cenarioId} não encontrado`);
    }

    const inicio = Date.now();

    // Simular execução do teste
    const passos = cenario.passos_recuperacao.length;
    const passosCompletados = tipoTeste === 'TABLETOP' ? passos : Math.floor(passos * 0.9);
    // Duração simulada = soma do tempo estimado dos passos efetivamente completados.
    // Antes era o relógio de parede entre duas atribuições síncronas: a função não
    // executa recuperação nenhuma, então media sempre ~0ms, e o percentual sobre o RTO
    // saía zero. Comparar um teste de DRP com o RTO exige o tempo dos passos, que é o
    // que o cenário descreve em tempo_estimado_minutos.
    const tempoTotal = cenario.passos_recuperacao
      .slice(0, passosCompletados)
      .reduce((soma, passo) => soma + passo.tempo_estimado_minutos, 0);

    const resultado = tipoTeste === 'TABLETOP' ? 'PASSOU' : 'FALHOU_PARCIAL';

    const teste: TestedrpRegistro = {
      id: uuidv4(),
      cenario_id: cenarioId,
      data_teste: new Date(),
      tipo_teste: tipoTeste,
      duracao_minutos: tempoTotal,
      resultado,
      passos_completados: passosCompletados,
      tempo_total_vs_rto_percentual: (tempoTotal / cenario.rto_horas / 60) * 100,
      issues_encontrados: this.gerarIssuesTeste(),
      recomendacoes: this.gerarRecomendacoes(),
      responsavel: 'System',
      proxima_data_teste: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.testes.push(teste);

    // Atualizar data de teste do cenário
    cenario.ultima_teste = new Date();
    cenario.proxima_teste = teste.proxima_data_teste;
    cenario.updatedAt = new Date();

    return teste;
  }

  /**
   * Simula desastre para teste
   */
  async simularDesastre(
    cenarioId: string,
    duracao_teste_minutos: number = 60
  ): Promise<{
    teste_id: string;
    cenario: CenarioDesastre;
    tempo_simulado_minutos: number;
    resultado: string;
  }> {
    const cenario = this.cenarios.get(cenarioId);
    if (!cenario) {
      throw new Error(`Cenário ${cenarioId} não encontrado`);
    }

    // Simular teste
    const teste = await this.testarDRP(cenarioId, 'SIMULACAO');

    return {
      teste_id: teste.id,
      cenario,
      tempo_simulado_minutos: duracao_teste_minutos,
      resultado: teste.resultado
    };
  }

  /**
   * Obtém cenários disponíveis
   */
  obterCenarios(): CenarioDesastre[] {
    return Array.from(this.cenarios.values());
  }

  /**
   * Obtém histórico de execuções
   */
  obterHistoricoExecucoes(cenarioId?: string): ExecucaoDRP[] {
    let resultado = [...this.execucoes].sort(
      (a, b) => b.data_inicio.getTime() - a.data_inicio.getTime()
    );

    if (cenarioId) {
      resultado = resultado.filter(e => e.cenario_id === cenarioId);
    }

    return resultado;
  }

  /**
   * Obtém histórico de testes
   */
  obterHistoricoTestes(cenarioId?: string): TestedrpRegistro[] {
    let resultado = [...this.testes].sort(
      (a, b) => b.data_teste.getTime() - a.data_teste.getTime()
    );

    if (cenarioId) {
      resultado = resultado.filter(t => t.cenario_id === cenarioId);
    }

    return resultado;
  }

  /**
   * Obtém métricas do DRP
   */
  obterMetricasDRP(): {
    cenarios_totais: number;
    cenarios_testados_30_dias: number;
    taxa_cobertura_teste: number;
    rto_medio_horas: number;
    rpo_medio_horas: number;
    tempo_medio_recuperacao_horas: number;
    taxa_sucesso_recuperacao: number;
  } {
    const cenariosTotais = this.cenarios.size;
    const testes30Dias = this.testes.filter(
      t => new Date().getTime() - t.data_teste.getTime() < 30 * 24 * 60 * 60 * 1000
    );
    const cenariosTeste30 = new Set(testes30Dias.map(t => t.cenario_id));

    const rtosMedia =
      Array.from(this.cenarios.values()).reduce((sum, c) => sum + c.rto_horas, 0) / cenariosTotais;
    const rposMedia =
      Array.from(this.cenarios.values()).reduce((sum, c) => sum + c.rpo_horas, 0) / cenariosTotais;

    const executacoesConcluidas = this.execucoes.filter(
      e => e.status === StatusRecuperacao.TOTALMENTE_RECUPERADO
    );
    const tempoMedioRecuperacao =
      executacoesConcluidas.length > 0
        ? executacoesConcluidas.reduce((sum, e) => sum + e.tempos_recuperacao.tempo_total_minutos, 0) /
          executacoesConcluidas.length /
          60
        : 0;

    const taxaSucesso =
      this.execucoes.length > 0 ? (executacoesConcluidas.length / this.execucoes.length) * 100 : 0;

    return {
      cenarios_totais: cenariosTotais,
      cenarios_testados_30_dias: cenariosTeste30.size,
      taxa_cobertura_teste: (cenariosTeste30.size / cenariosTotais) * 100,
      rto_medio_horas: Math.round(rtosMedia * 100) / 100,
      rpo_medio_horas: Math.round(rposMedia * 100) / 100,
      tempo_medio_recuperacao_horas: Math.round(tempoMedioRecuperacao * 100) / 100,
      taxa_sucesso_recuperacao: Math.round(taxaSucesso * 100) / 100
    };
  }

  /**
   * Notifica contatos de escalação
   */
  private notificarEscalacao(cenario: CenarioDesastre, execucao: ExecucaoDRP): void {
    for (const contato of cenario.contatos_escalacao) {
      // Simular envio de notificação
      console.log(`[DRP] Notificando ${contato.nome} (${contato.email}) sobre ${cenario.nome}`);
    }
  }

  /**
   * Gera issues de teste
   */
  private gerarIssuesTeste(): string[] {
    return [
      'Demora na restauração de backup maior que o esperado',
      'Falta de documentação em um dos procedimentos',
      'Contato de escalação indisponível'
    ];
  }

  /**
   * Gera recomendações
   */
  private gerarRecomendacoes(): string[] {
    return [
      'Optimizar scripts de restauração',
      'Atualizar matriz de contatos',
      'Testar mais frequentemente'
    ];
  }
}
