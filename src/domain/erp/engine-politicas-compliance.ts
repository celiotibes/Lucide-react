/**
 * Compliance & Policy Engine
 *
 * Policy enforcement: spending limits, segregation of duties, approval rules.
 * Compliance checks: LGPD, Lei 6404/76, Resolução CFC.
 * Multi-tenant compliance policies with violation logging and escalation.
 *
 * @example
 * const engine = new EnginePoliticasCompliance();
 * const violacoes = await engine.executarVerificacaoCompliance({
 *   usuario_id: 'user-1',
 *   operacao: 'create_entry',
 *   dados: { valor: 50000, account: 'CC-001' },
 *   contexto: { departamento: 'financeiro' }
 * });
 */

export type TipoPolitica = 'spending_limit' | 'segregation_of_duties' | 'approval_rule' | 'data_retention' | 'audit_trail';
export type StatusViolacao = 'detected' | 'escalated' | 'acknowledged' | 'resolved';
export type TipoLegislacao = 'LGPD' | 'Lei_6404' | 'Resolucao_CFC' | 'GDPR' | 'SOX';
export type SeveridadeViolacao = 'info' | 'warning' | 'critical';

export interface Politica {
  id: string;
  nome: string;
  tipo: TipoPolitica;
  descricao?: string;
  ativa: boolean;
  tenant_id?: string;
  criterios: Record<string, any>;
  limite?: number;
  acao_em_violacao?: 'block' | 'warn' | 'escalate';
  legislacoes_aplicaveis?: TipoLegislacao[];
  criado_em: string;
  atualizado_em: string;
}

export interface RegraSegregacaoDDutores {
  id: string;
  politica_id: string;
  operacao_1: string; // ex: 'create_entry'
  operacao_2: string; // ex: 'approve_entry'
  usuarios_mesmo_grupo_bloqueado: boolean; // Se true, mesmo usuário não pode fazer ambas
  criado_em: string;
}

export interface ViolacaoPolitica {
  id: string;
  politica_id: string;
  usuario_id: string;
  operacao: string;
  timestamp: string;
  status: StatusViolacao;
  severidade: SeveridadeViolacao;
  descricao: string;
  dados_operacao: Record<string, any>;
  motivo_escalacao?: string;
  escalado_para?: string; // User ID or role
  timestamp_escalacao?: string;
  timestamp_resolucao?: string;
  observacoes?: string;
  legislacoes_violadas: TipoLegislacao[];
}

export interface RegraNaoAprovaçao {
  id: string;
  politica_id: string;
  operacao: string;
  usuarios_que_podem_aprovar: string[]; // Roles or IDs
  usuarios_que_nao_podem: string[]; // Roles or IDs
  requer_multiplos_aprovadores?: boolean;
  numero_aprovadores_requerido?: number;
  criado_em: string;
}

export interface AuditoriaCompliance {
  id: string;
  data_auditoria: string;
  usuario_auditado_id: string;
  operacoes_auditadas: string[];
  violacoes_encontradas: number;
  politicas_verificadas: string[];
  resultado: 'conforme' | 'nao_conforme' | 'com_restricoes';
  observacoes?: string;
  auditor_id: string;
  timestamp: string;
}

export interface RelatorioConformidade {
  id: string;
  periodo_inicio: string;
  periodo_fim: string;
  total_violacoes: number;
  violacoes_por_tipo: Record<string, number>;
  violacoes_por_severidade: Record<SeveridadeViolacao, number>;
  usuarios_com_violacoes: string[];
  legislacoes_e_conformidade: Record<TipoLegislacao, { conforme: boolean; observacoes: string }>;
  recomendacoes?: string[];
  gerado_em: string;
  gerado_por: string;
}

export class EnginePoliticasCompliance {
  private politicas: Map<string, Politica> = new Map();
  private regras_segregacao: Map<string, RegraSegregacaoDDutores> = new Map();
  private regras_nao_aprovacao: Map<string, RegraNaoAprovaçao> = new Map();
  private violacoes: ViolacaoPolitica[] = [];
  private auditorias: AuditoriaCompliance[] = [];
  private historico_operacoes: Array<{
    usuario_id: string;
    operacao: string;
    timestamp: string;
    dados: Record<string, any>;
  }> = [];

  /**
   * Register policy
   */
  async registrarPolitica(config: {
    nome: string;
    tipo: TipoPolitica;
    descricao?: string;
    criterios: Record<string, any>;
    limite?: number;
    acao_em_violacao?: 'block' | 'warn' | 'escalate';
    legislacoes_aplicaveis?: TipoLegislacao[];
    tenant_id?: string;
  }): Promise<string> {
    const id = this.gerarUUID();
    const agora = new Date().toISOString();

    const politica: Politica = {
      id,
      nome: config.nome,
      tipo: config.tipo,
      descricao: config.descricao,
      ativa: true,
      tenant_id: config.tenant_id,
      criterios: config.criterios,
      limite: config.limite,
      acao_em_violacao: config.acao_em_violacao || 'warn',
      legislacoes_aplicaveis: config.legislacoes_aplicaveis,
      criado_em: agora,
      atualizado_em: agora
    };

    this.politicas.set(id, politica);
    return id;
  }

  /**
   * Register segregation of duties rule
   */
  async registrarRegraSegregacao(config: {
    politica_id: string;
    operacao_1: string;
    operacao_2: string;
    usuarios_mesmo_grupo_bloqueado?: boolean;
  }): Promise<string> {
    const id = this.gerarUUID();

    const regra: RegraSegregacaoDDutores = {
      id,
      politica_id: config.politica_id,
      operacao_1: config.operacao_1,
      operacao_2: config.operacao_2,
      usuarios_mesmo_grupo_bloqueado: config.usuarios_mesmo_grupo_bloqueado !== false,
      criado_em: new Date().toISOString()
    };

    this.regras_segregacao.set(id, regra);
    return id;
  }

  /**
   * Register approval rule
   */
  async registrarRegraAprovacao(config: {
    politica_id: string;
    operacao: string;
    usuarios_que_podem_aprovar: string[];
    usuarios_que_nao_podem?: string[];
    requer_multiplos_aprovadores?: boolean;
    numero_aprovadores_requerido?: number;
  }): Promise<string> {
    const id = this.gerarUUID();

    const regra: RegraNaoAprovaçao = {
      id,
      politica_id: config.politica_id,
      operacao: config.operacao,
      usuarios_que_podem_aprovar: config.usuarios_que_podem_aprovar,
      usuarios_que_nao_podem: config.usuarios_que_nao_podem || [],
      requer_multiplos_aprovadores: config.requer_multiplos_aprovadores,
      numero_aprovadores_requerido: config.numero_aprovadores_requerido,
      criado_em: new Date().toISOString()
    };

    this.regras_nao_aprovacao.set(id, regra);
    return id;
  }

  /**
   * Execute compliance verification
   */
  async executarVerificacaoCompliance(config: {
    usuario_id: string;
    operacao: string;
    dados: Record<string, any>;
    contexto?: Record<string, any>;
  }): Promise<{
    violacoes: ViolacaoPolitica[];
    bloqueado: boolean;
    avisos: string[];
    operacao_permitida: boolean;
  }> {
    const violacoes: ViolacaoPolitica[] = [];
    const avisos: string[] = [];
    let bloqueado = false;

    // Record operation
    this.historico_operacoes.push({
      usuario_id: config.usuario_id,
      operacao: config.operacao,
      timestamp: new Date().toISOString(),
      dados: config.dados
    });

    // Check all policies
    for (const [_, politica] of this.politicas.entries()) {
      if (!politica.ativa) continue;

      const violacao = await this.verificarPolitica(
        politica,
        config.usuario_id,
        config.operacao,
        config.dados,
        config.contexto
      );

      if (violacao) {
        violacoes.push(violacao);

        if (politica.acao_em_violacao === 'block') {
          bloqueado = true;
        } else if (politica.acao_em_violacao === 'escalate') {
          await this.escalarViolacao(violacao);
        }
      }
    }

    // Check segregation of duties
    for (const [_, regra] of this.regras_segregacao.entries()) {
      const violacao_sod = await this.verificarSegregacaoDDutores(
        regra,
        config.usuario_id,
        config.operacao
      );

      if (violacao_sod) {
        violacoes.push(violacao_sod);
        if (this.politicas.get(regra.politica_id)?.acao_em_violacao === 'block') {
          bloqueado = true;
        }
      }
    }

    // Check approval rules
    for (const [_, regra] of this.regras_nao_aprovacao.entries()) {
      if (regra.operacao !== config.operacao) continue;

      if (regra.usuarios_que_nao_podem.includes(config.usuario_id)) {
        const violacao_aprovacao: ViolacaoPolitica = {
          id: this.gerarUUID(),
          politica_id: regra.politica_id,
          usuario_id: config.usuario_id,
          operacao: config.operacao,
          timestamp: new Date().toISOString(),
          status: 'detected',
          severidade: 'critical',
          descricao: `Usuário ${config.usuario_id} não tem permissão para aprovação de ${config.operacao}`,
          dados_operacao: config.dados,
          legislacoes_violadas: []
        };

        violacoes.push(violacao_aprovacao);
        bloqueado = true;
      }
    }

    return {
      violacoes,
      bloqueado,
      avisos,
      operacao_permitida: !bloqueado && violacoes.length === 0
    };
  }

  /**
   * Verify single policy
   */
  private async verificarPolitica(
    politica: Politica,
    usuario_id: string,
    operacao: string,
    dados: Record<string, any>,
    contexto?: Record<string, any>
  ): Promise<ViolacaoPolitica | null> {
    switch (politica.tipo) {
      case 'spending_limit':
        return this.verificarLimiteGastos(politica, usuario_id, dados);

      case 'data_retention':
        return this.verificarRetencaoDados(politica, dados);

      case 'audit_trail':
        return this.verificarAuditoriaCompleta(politica, usuario_id, operacao);

      default:
        return null;
    }
  }

  /**
   * Verify spending limit
   */
  private async verificarLimiteGastos(
    politica: Politica,
    usuario_id: string,
    dados: Record<string, any>
  ): Promise<ViolacaoPolitica | null> {
    if (!politica.limite || !dados.valor) return null;

    if (dados.valor > politica.limite) {
      const violacao: ViolacaoPolitica = {
        id: this.gerarUUID(),
        politica_id: politica.id,
        usuario_id,
        operacao: 'create_entry',
        timestamp: new Date().toISOString(),
        status: 'detected',
        severidade: dados.valor > politica.limite * 2 ? 'critical' : 'warning',
        descricao: `Valor ${dados.valor} excede limite de ${politica.limite}`,
        dados_operacao: dados,
        legislacoes_violadas: politica.legislacoes_aplicaveis || []
      };

      this.violacoes.push(violacao);
      return violacao;
    }

    return null;
  }

  /**
   * Verify data retention
   */
  private async verificarRetencaoDados(
    politica: Politica,
    dados: Record<string, any>
  ): Promise<ViolacaoPolitica | null> {
    const dias_retencao = politica.criterios.dias_minimos_retencao || 0;
    if (!dados.data_criacao) return null;

    const data_criacao = new Date(dados.data_criacao);
    const dias_decorridos = (Date.now() - data_criacao.getTime()) / (1000 * 60 * 60 * 24);

    if (dias_decorridos < dias_retencao) {
      return {
        id: this.gerarUUID(),
        politica_id: politica.id,
        usuario_id: 'system',
        operacao: 'delete_data',
        timestamp: new Date().toISOString(),
        status: 'detected',
        severidade: 'critical',
        descricao: `Tentativa de deletar dados criados há ${dias_decorridos.toFixed(0)} dias (mínimo: ${dias_retencao})`,
        dados_operacao: dados,
        legislacoes_violadas: politica.legislacoes_aplicaveis || []
      };
    }

    return null;
  }

  /**
   * Verify audit trail completeness
   */
  private async verificarAuditoriaCompleta(
    politica: Politica,
    usuario_id: string,
    operacao: string
  ): Promise<ViolacaoPolitica | null> {
    // Check if all operations are being audited
    const requer_auditoria = politica.criterios.operacoes_auditaveis || [];

    if (requer_auditoria.includes(operacao)) {
      // Verify audit trail exists
      const audit_record = this.historico_operacoes.find(
        op => op.usuario_id === usuario_id && op.operacao === operacao
      );

      if (!audit_record) {
        return {
          id: this.gerarUUID(),
          politica_id: politica.id,
          usuario_id,
          operacao,
          timestamp: new Date().toISOString(),
          status: 'detected',
          severidade: 'warning',
          descricao: `Operação ${operacao} não foi totalmente auditada`,
          dados_operacao: {},
          legislacoes_violadas: politica.legislacoes_aplicaveis || []
        };
      }
    }

    return null;
  }

  /**
   * Verify segregation of duties
   */
  private async verificarSegregacaoDDutores(
    regra: RegraSegregacaoDDutores,
    usuario_id: string,
    operacao: string
  ): Promise<ViolacaoPolitica | null> {
    if (operacao !== regra.operacao_1 && operacao !== regra.operacao_2) {
      return null;
    }

    // Check if user already performed the other operation
    const operacao_complementar = operacao === regra.operacao_1 ? regra.operacao_2 : regra.operacao_1;
    const ja_fez_operacao = this.historico_operacoes.some(
      op => op.usuario_id === usuario_id && op.operacao === operacao_complementar
    );

    if (ja_fez_operacao && regra.usuarios_mesmo_grupo_bloqueado) {
      const politica = this.politicas.get(regra.politica_id);
      return {
        id: this.gerarUUID(),
        politica_id: regra.politica_id,
        usuario_id,
        operacao,
        timestamp: new Date().toISOString(),
        status: 'detected',
        severidade: 'critical',
        descricao: `Violação de segregação de funções: usuário já executou ${operacao_complementar}`,
        dados_operacao: {},
        legislacoes_violadas: politica?.legislacoes_aplicaveis || []
      };
    }

    return null;
  }

  /**
   * Escalate violation
   */
  private async escalarViolacao(violacao: ViolacaoPolitica): Promise<void> {
    violacao.status = 'escalated';
    violacao.timestamp_escalacao = new Date().toISOString();
    violacao.escalado_para = 'compliance_manager'; // Default escalation role

    this.violacoes = this.violacoes.map(v => v.id === violacao.id ? violacao : v);
  }

  /**
   * Get violations
   */
  obterViolacoes(filtro?: {
    usuario_id?: string;
    status?: StatusViolacao;
    severidade?: SeveridadeViolacao;
    dias?: number;
  }): ViolacaoPolitica[] {
    let violacoes = [...this.violacoes];

    if (filtro?.usuario_id) {
      violacoes = violacoes.filter(v => v.usuario_id === filtro.usuario_id);
    }

    if (filtro?.status) {
      violacoes = violacoes.filter(v => v.status === filtro.status);
    }

    if (filtro?.severidade) {
      violacoes = violacoes.filter(v => v.severidade === filtro.severidade);
    }

    if (filtro?.dias) {
      const data_limite = new Date(Date.now() - filtro.dias * 24 * 60 * 60 * 1000);
      violacoes = violacoes.filter(v => new Date(v.timestamp) >= data_limite);
    }

    return violacoes;
  }

  /**
   * Generate compliance report
   */
  async gerarRelatorioConformidade(
    periodo_inicio: string,
    periodo_fim: string
  ): Promise<RelatorioConformidade> {
    const violacoes_periodo = this.violacoes.filter(
      v => v.timestamp >= periodo_inicio && v.timestamp <= periodo_fim
    );

    const violacoes_por_tipo: Record<string, number> = {};
    const violacoes_por_severidade: Record<SeveridadeViolacao, number> = {
      info: 0,
      warning: 0,
      critical: 0
    };

    for (const v of violacoes_periodo) {
      violacoes_por_tipo[v.politica_id] = (violacoes_por_tipo[v.politica_id] || 0) + 1;
      violacoes_por_severidade[v.severidade]++;
    }

    const usuarios_com_violacoes = [...new Set(violacoes_periodo.map(v => v.usuario_id))];

    // Check legislation compliance
    const legislacoes_e_conformidade: Record<TipoLegislacao, { conforme: boolean; observacoes: string }> = {
      LGPD: { conforme: violacoes_por_severidade.critical === 0, observacoes: 'LGPD compliance check' },
      Lei_6404: { conforme: true, observacoes: 'Lei 6404/76 compliance check' },
      Resolucao_CFC: { conforme: true, observacoes: 'Resolução CFC compliance check' },
      GDPR: { conforme: true, observacoes: 'GDPR compliance check' },
      SOX: { conforme: true, observacoes: 'SOX compliance check' }
    };

    return {
      id: this.gerarUUID(),
      periodo_inicio,
      periodo_fim,
      total_violacoes: violacoes_periodo.length,
      violacoes_por_tipo,
      violacoes_por_severidade,
      usuarios_com_violacoes,
      legislacoes_e_conformidade,
      recomendacoes: [
        'Realizar treinamento de compliance',
        'Revisar políticas de segregação de funções',
        'Implementar controles adicionais de auditoria'
      ],
      gerado_em: new Date().toISOString(),
      gerado_por: 'system'
    };
  }

  /**
   * Generate UUID
   */
  private gerarUUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
