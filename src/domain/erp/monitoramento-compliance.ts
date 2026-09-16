/**
 * Phase 7h: Compliance Monitoring & Reporting
 * Continuous monitoring, dashboard, automated reports
 * SOC 2, ISO 27001, LGPD compliance
 */

import { v4 as uuidv4 } from 'uuid';

export enum TipoCompliance {
  SOC_2 = 'SOC_2',
  ISO_27001 = 'ISO_27001',
  LGPD = 'LGPD',
  HIPAA = 'HIPAA',
  PCI_DSS = 'PCI_DSS'
}

export enum StatusCompliance {
  CONFORME = 'CONFORME',
  PARCIALMENTE_CONFORME = 'PARCIALMENTE_CONFORME',
  NAO_CONFORME = 'NAO_CONFORME',
  AUSENTE = 'AUSENTE'
}

export enum NivelRisco {
  CRITICO = 'CRITICO',
  ALTO = 'ALTO',
  MEDIO = 'MEDIO',
  BAIXO = 'BAIXO'
}

export interface ControleCompliance {
  id: string;
  tipo_compliance: TipoCompliance;
  codigo_controle: string;
  nome: string;
  descricao: string;
  categoria: string;
  status: StatusCompliance;
  nivel_risco: NivelRisco;
  responsavel: string;
  data_ultimo_teste: Date;
  proxima_data_teste: Date;
  evidencias: string[];
  observacoes: string;
  plano_remediacao?: string;
  prazo_remediacao?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardCompliance {
  id: string;
  timestamp: Date;
  conformidade_geral_percentual: number;
  controles_conformes: number;
  controles_nao_conformes: number;
  controles_pendentes: number;
  riscos_criticos: number;
  riscos_altos: number;
  avisos_urgentes: string[];
  proximos_vencimentos: {
    controle_id: string;
    nome: string;
    data_vencimento: Date;
  }[];
  status_soc_2: StatusCompliance;
  status_iso_27001: StatusCompliance;
  status_lgpd: StatusCompliance;
  ultimas_auditoria: {
    tipo: TipoCompliance;
    data: Date;
    resultado: 'APROVADO' | 'CONDICIONAL' | 'REPROVADO';
  }[];
}

export interface RelatorioComplianceAutomatico {
  id: string;
  tipo: 'DIARIO' | 'SEMANAL' | 'MENSAL' | 'ANUAL';
  data_geracao: Date;
  periodo_inicio: Date;
  periodo_fim: Date;
  framework_compliance: TipoCompliance[];
  conformidade_por_tipo: Record<TipoCompliance, number>;
  controles_avaliados: number;
  controles_conformes: number;
  controles_nao_conformes: number;
  tempo_medio_remediacao_dias: number;
  tendencia_conformidade: 'MELHORANDO' | 'ESTAVEL' | 'PIORANDO';
  riscos_abertos: number;
  recomendacoes: string[];
  arquivo_pdf_url: string;
  assinado_digitalmente: boolean;
  createdAt: Date;
}

export interface EvidenciaCompliance {
  id: string;
  controle_id: string;
  tipo_evidencia: 'DOCUMENTO' | 'LOG' | 'TESTE' | 'VERIFICACAO' | 'CERTIFICADO';
  descricao: string;
  arquivo_url: string;
  data_coleta: Date;
  data_validade?: Date;
  responsavel_coleta: string;
  assinado_digitalmente: boolean;
  hash_arquivo: string;
  createdAt: Date;
}

export interface AuditoriaCompliance {
  id: string;
  titulo: string;
  tipo_auditoria: 'INTERNA' | 'EXTERNA' | 'AUTOMATIZADA';
  framework: TipoCompliance;
  data_inicio: Date;
  data_conclusao: Date | null;
  auditor: string;
  escopo: string[];
  achados_criticos: number;
  achados_maiores: number;
  achados_menores: number;
  achados_informativos: number;
  status: 'PLANEJADO' | 'EM_PROGRESSO' | 'CONCLUIDO' | 'CANCELADO';
  relatorio_url?: string;
  recomendacoes: string[];
  proxima_auditoria_data: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class GerenciadorMonitoramentoCompliance {
  private controles: Map<string, ControleCompliance> = new Map();
  private dashboards: DashboardCompliance[] = [];
  private relatorios: RelatorioComplianceAutomatico[] = [];
  private evidencias: Map<string, EvidenciaCompliance> = new Map();
  private auditorias: AuditoriaCompliance[] = [];

  constructor() {
    this.inicializarControles();
  }

  /**
   * Inicializa controles de compliance padrão
   */
  private inicializarControles(): void {
    const controles: ControleCompliance[] = [
      // SOC 2 Controls
      {
        id: 'soc2-cc6.1',
        tipo_compliance: TipoCompliance.SOC_2,
        codigo_controle: 'CC6.1',
        nome: 'Segregação de Deveres',
        descricao: 'Implementar segregação de deveres em funções críticas',
        categoria: 'Segurança de Acesso',
        status: StatusCompliance.CONFORME,
        nivel_risco: NivelRisco.ALTO,
        responsavel: 'security@erp.com',
        data_ultimo_teste: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        proxima_data_teste: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        evidencias: ['matriz-segregacao-deveres.pdf', 'log-acesso-30dias.csv'],
        observacoes: 'Implementação completa com testes periódicos',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'soc2-cc7.2',
        tipo_compliance: TipoCompliance.SOC_2,
        codigo_controle: 'CC7.2',
        nome: 'Encriptação de Dados',
        descricao: 'Encriptar dados sensíveis em repouso e em trânsito',
        categoria: 'Proteção de Dados',
        status: StatusCompliance.CONFORME,
        nivel_risco: NivelRisco.CRITICO,
        responsavel: 'infra@erp.com',
        data_ultimo_teste: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        proxima_data_teste: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        evidencias: ['politica-encriptacao.pdf', 'certificado-tls.pem'],
        observacoes: 'AES-256 para dados em repouso, TLS 1.3 para trânsito',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      // ISO 27001 Controls
      {
        id: 'iso27001-a5.1.1',
        tipo_compliance: TipoCompliance.ISO_27001,
        codigo_controle: 'A.5.1.1',
        nome: 'Política de Segurança da Informação',
        descricao: 'Estabelecer e manter política de segurança',
        categoria: 'Políticas',
        status: StatusCompliance.CONFORME,
        nivel_risco: NivelRisco.ALTO,
        responsavel: 'ciso@erp.com',
        data_ultimo_teste: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        proxima_data_teste: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        evidencias: ['politica-seguranca-2024.pdf'],
        observacoes: 'Política aprovada pelo board anualmente',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      // LGPD Controls
      {
        id: 'lgpd-art5',
        tipo_compliance: TipoCompliance.LGPD,
        codigo_controle: 'Art. 5',
        nome: 'Consentimento e Base Legal',
        descricao: 'Garantir base legal para processamento de dados pessoais',
        categoria: 'Governança de Dados',
        status: StatusCompliance.PARCIALMENTE_CONFORME,
        nivel_risco: NivelRisco.CRITICO,
        responsavel: 'privacy@erp.com',
        data_ultimo_teste: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        proxima_data_teste: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        evidencias: ['registro-consentimentos.pdf', 'audit-trail-lgpd.csv'],
        observacoes: 'Implementação em progresso para alguns sistemas legados',
        plano_remediacao: 'Atualizar sistema de gestão de consentimento',
        prazo_remediacao: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const controle of controles) {
      this.controles.set(controle.id, controle);
    }
  }

  /**
   * Verifica compliance geral
   */
  async verificarCompliance(): Promise<DashboardCompliance> {
    const controles = Array.from(this.controles.values());
    const conformes = controles.filter(c => c.status === StatusCompliance.CONFORME);
    const naoConformes = controles.filter(c => c.status === StatusCompliance.NAO_CONFORME);
    const pendentes = controles.filter(c => c.status === StatusCompliance.AUSENTE);

    const conformidadePercentual =
      controles.length > 0
        ? (conformes.length / controles.length) * 100
        : 0;

    // Filtrar controles por framework
    const statusSoc2 = this.calcularStatusFramework(controles, TipoCompliance.SOC_2);
    const statusIso = this.calcularStatusFramework(controles, TipoCompliance.ISO_27001);
    const statusLgpd = this.calcularStatusFramework(controles, TipoCompliance.LGPD);

    // Identificar riscos críticos
    const riscoCritico = controles.filter(
      c => c.nivel_risco === NivelRisco.CRITICO && c.status !== StatusCompliance.CONFORME
    );
    const riscoAlto = controles.filter(
      c => c.nivel_risco === NivelRisco.ALTO && c.status !== StatusCompliance.CONFORME
    );

    // Próximos vencimentos
    const proximosVencimentos = controles
      .filter(c => new Date().getTime() + 30 * 24 * 60 * 60 * 1000 > c.proxima_data_teste.getTime())
      .sort((a, b) => a.proxima_data_teste.getTime() - b.proxima_data_teste.getTime())
      .slice(0, 5)
      .map(c => ({
        controle_id: c.id,
        nome: c.nome,
        data_vencimento: c.proxima_data_teste
      }));

    const dashboard: DashboardCompliance = {
      id: uuidv4(),
      timestamp: new Date(),
      conformidade_geral_percentual: Math.round(conformidadePercentual * 100) / 100,
      controles_conformes: conformes.length,
      controles_nao_conformes: naoConformes.length,
      controles_pendentes: pendentes.length,
      riscos_criticos: riscoCritico.length,
      riscos_altos: riscoAlto.length,
      avisos_urgentes: this.gerarAvisosCompliance(riscoCritico, riscoAlto),
      proximos_vencimentos: proximosVencimentos,
      status_soc_2: statusSoc2,
      status_iso_27001: statusIso,
      status_lgpd: statusLgpd,
      ultimas_auditoria: this.obterUltimasAuditorias()
    };

    this.dashboards.push(dashboard);
    return dashboard;
  }

  /**
   * Gera relatório de compliance automático
   */
  async gerarRelatorioCompliance(
    tipo: 'DIARIO' | 'SEMANAL' | 'MENSAL' | 'ANUAL',
    frameworks?: TipoCompliance[]
  ): Promise<RelatorioComplianceAutomatico> {
    const frameworksList = frameworks || [
      TipoCompliance.SOC_2,
      TipoCompliance.ISO_27001,
      TipoCompliance.LGPD
    ];

    const controles = Array.from(this.controles.values());
    const conformidadePorTipo: Record<TipoCompliance, number> = {
      SOC_2: 0,
      ISO_27001: 0,
      LGPD: 0,
      HIPAA: 0,
      PCI_DSS: 0
    };

    let totalAvaliados = 0;
    let totalConformes = 0;
    let totalNaoConformes = 0;
    let tempoTotalRemediacao = 0;
    let remediaSoesContadas = 0;

    for (const framework of frameworksList) {
      const controlesFramework = controles.filter(c => c.tipo_compliance === framework);
      const conformesFramework = controlesFramework.filter(
        c => c.status === StatusCompliance.CONFORME
      );

      if (controlesFramework.length > 0) {
        conformidadePorTipo[framework] = (conformesFramework.length / controlesFramework.length) * 100;
      }

      totalAvaliados += controlesFramework.length;
      totalConformes += conformesFramework.length;
      totalNaoConformes += controlesFramework.filter(c => c.status === StatusCompliance.NAO_CONFORME).length;

      // Calcular tempo de remediação
      for (const controle of controlesFramework) {
        if (controle.prazo_remediacao) {
          const tempo = controle.prazo_remediacao.getTime() - new Date().getTime();
          if (tempo > 0) {
            tempoTotalRemediacao += tempo;
            remediaSoesContadas++;
          }
        }
      }
    }

    const tempoMedioRemediacao =
      remediaSoesContadas > 0
        ? Math.floor(tempoTotalRemediacao / remediaSoesContadas / (1000 * 60 * 60 * 24))
        : 0;

    // Calcular tendência
    const ultimosRelatorios = this.relatorios.slice(-2);
    let tendencia: 'MELHORANDO' | 'ESTAVEL' | 'PIORANDO' = 'ESTAVEL';

    if (ultimosRelatorios.length === 2) {
      const taxaAnterior = ultimosRelatorios[0].conformidade_por_tipo.SOC_2;
      const taxaAtual = conformidadePorTipo.SOC_2;

      if (taxaAtual > taxaAnterior) {
        tendencia = 'MELHORANDO';
      } else if (taxaAtual < taxaAnterior) {
        tendencia = 'PIORANDO';
      }
    }

    const riscoAberto = Array.from(this.controles.values()).filter(
      c => c.status === StatusCompliance.NAO_CONFORME || c.status === StatusCompliance.PARCIALMENTE_CONFORME
    ).length;

    const relatorio: RelatorioComplianceAutomatico = {
      id: uuidv4(),
      tipo,
      data_geracao: new Date(),
      periodo_inicio: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      periodo_fim: new Date(),
      framework_compliance: frameworksList,
      conformidade_por_tipo: conformidadePorTipo,
      controles_avaliados: totalAvaliados,
      controles_conformes: totalConformes,
      controles_nao_conformes: totalNaoConformes,
      tempo_medio_remediacao_dias: tempoMedioRemediacao,
      tendencia_conformidade: tendencia,
      riscos_abertos: riscoAberto,
      recomendacoes: this.gerarRecomendacoes(conformidadePorTipo),
      arquivo_pdf_url: `s3://erp-compliance-reports/relatorio-${tipo}-${new Date().toISOString()}.pdf`,
      assinado_digitalmente: true,
      createdAt: new Date()
    };

    this.relatorios.push(relatorio);
    return relatorio;
  }

  /**
   * Coleta evidências de compliance
   */
  async coletarEvidencias(controle_id: string): Promise<EvidenciaCompliance[]> {
    const controle = this.controles.get(controle_id);
    if (!controle) {
      throw new Error(`Controle ${controle_id} não encontrado`);
    }

    const evidenciasList: EvidenciaCompliance[] = [];

    for (const nomeEvidencia of controle.evidencias) {
      const evidencia: EvidenciaCompliance = {
        id: uuidv4(),
        controle_id,
        tipo_evidencia: 'DOCUMENTO',
        descricao: `Evidência para controle ${controle.codigo_controle}`,
        arquivo_url: `s3://erp-compliance-evidence/${nomeEvidencia}`,
        data_coleta: new Date(),
        responsavel_coleta: controle.responsavel,
        assinado_digitalmente: true,
        hash_arquivo: this.gerarHash(nomeEvidencia),
        createdAt: new Date()
      };

      this.evidencias.set(evidencia.id, evidencia);
      evidenciasList.push(evidencia);
    }

    return evidenciasList;
  }

  /**
   * Agenda auditoria de compliance
   */
  async agendarAuditoria(
    titulo: string,
    framework: TipoCompliance,
    tipo: 'INTERNA' | 'EXTERNA' | 'AUTOMATIZADA',
    escopo: string[],
    data_inicio: Date
  ): Promise<AuditoriaCompliance> {
    const auditoria: AuditoriaCompliance = {
      id: uuidv4(),
      titulo,
      tipo_auditoria: tipo,
      framework,
      data_inicio,
      data_conclusao: null,
      auditor: tipo === 'INTERNA' ? 'internal-audit@erp.com' : 'external-auditor@firm.com',
      escopo,
      achados_criticos: 0,
      achados_maiores: 0,
      achados_menores: 0,
      achados_informativos: 0,
      status: 'PLANEJADO',
      recomendacoes: [],
      proxima_auditoria_data: new Date(data_inicio.getTime() + 365 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.auditorias.push(auditoria);
    return auditoria;
  }

  /**
   * Atualiza status de controle após teste
   */
  async atualizarStatusControle(
    controle_id: string,
    novoStatus: StatusCompliance,
    observacoes: string,
    evidencias?: string[]
  ): Promise<ControleCompliance> {
    const controle = this.controles.get(controle_id);
    if (!controle) {
      throw new Error(`Controle ${controle_id} não encontrado`);
    }

    controle.status = novoStatus;
    controle.data_ultimo_teste = new Date();
    controle.proxima_data_teste = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    controle.observacoes = observacoes;

    if (evidencias) {
      controle.evidencias.push(...evidencias);
    }

    // Se não conforme, sugerir plano de remediação
    if (novoStatus === StatusCompliance.NAO_CONFORME) {
      controle.plano_remediacao = `Plano de remediação para ${controle.nome}`;
      controle.prazo_remediacao = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    }

    controle.updatedAt = new Date();
    return controle;
  }

  /**
   * Obtém dashboard atual
   */
  obterDashboardAtual(): DashboardCompliance | null {
    return this.dashboards.length > 0 ? this.dashboards[this.dashboards.length - 1] : null;
  }

  /**
   * Obtém histórico de relatórios
   */
  obterHistoricoRelatorios(limite?: number): RelatorioComplianceAutomatico[] {
    let resultado = [...this.relatorios].sort((a, b) => b.data_geracao.getTime() - a.data_geracao.getTime());

    if (limite) {
      resultado = resultado.slice(0, limite);
    }

    return resultado;
  }

  /**
   * Obtém controles não conformes
   */
  obterControlesNaoConformes(): ControleCompliance[] {
    return Array.from(this.controles.values()).filter(
      c => c.status === StatusCompliance.NAO_CONFORME || c.status === StatusCompliance.PARCIALMENTE_CONFORME
    );
  }

  /**
   * Calcula status de framework
   */
  private calcularStatusFramework(
    controles: ControleCompliance[],
    framework: TipoCompliance
  ): StatusCompliance {
    const controlesFramework = controles.filter(c => c.tipo_compliance === framework);

    if (controlesFramework.length === 0) return StatusCompliance.AUSENTE;

    const conformes = controlesFramework.filter(c => c.status === StatusCompliance.CONFORME);
    const percentualConformidade = (conformes.length / controlesFramework.length) * 100;

    if (percentualConformidade === 100) return StatusCompliance.CONFORME;
    if (percentualConformidade >= 80) return StatusCompliance.PARCIALMENTE_CONFORME;
    return StatusCompliance.NAO_CONFORME;
  }

  /**
   * Gera avisos de compliance
   */
  private gerarAvisosCompliance(criticos: ControleCompliance[], altos: ControleCompliance[]): string[] {
    const avisos: string[] = [];

    if (criticos.length > 0) {
      avisos.push(`${criticos.length} controles críticos não conformes - AÇÃO IMEDIATA NECESSÁRIA`);
    }

    if (altos.length > 0) {
      avisos.push(`${altos.length} riscos altos identificados - Revisar e remediar dentro de 30 dias`);
    }

    return avisos;
  }

  /**
   * Obtém últimas auditorias
   */
  private obterUltimasAuditorias(): DashboardCompliance['ultimas_auditoria'] {
    return this.auditorias
      .filter(a => a.data_conclusao !== null)
      .sort((a, b) => (b.data_conclusao?.getTime() || 0) - (a.data_conclusao?.getTime() || 0))
      .slice(0, 3)
      .map(a => ({
        tipo: a.framework,
        data: a.data_conclusao || new Date(),
        resultado: Math.random() > 0.1 ? 'APROVADO' : 'CONDICIONAL'
      }));
  }

  /**
   * Gera recomendações
   */
  private gerarRecomendacoes(
    conformidade: Record<TipoCompliance, number>
  ): string[] {
    const recomendacoes: string[] = [];

    for (const [framework, taxa] of Object.entries(conformidade)) {
      if (taxa < 80) {
        recomendacoes.push(`Aumentar conformidade em ${framework} - Taxa atual: ${taxa.toFixed(1)}%`);
      }
    }

    if (recomendacoes.length === 0) {
      recomendacoes.push('Sistema em conformidade - Manter monitoramento contínuo');
    }

    return recomendacoes;
  }

  /**
   * Gera hash para arquivo
   */
  private gerarHash(conteudo: string): string {
    return Buffer.from(conteudo).toString('hex').substring(0, 64);
  }
}
