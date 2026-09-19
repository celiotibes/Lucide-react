/**
 * Phase 7f: Vulnerability Management & Patching
 * CVE tracking, security patching, penetration testing
 */

import { v4 as uuidv4 } from 'uuid';

export enum SeveridadeVulnerabilidade {
  CRITICA = 'CRITICA',
  ALTA = 'ALTA',
  MEDIA = 'MEDIA',
  BAIXA = 'BAIXA',
  INFORMACIONAL = 'INFORMACIONAL'
}

export enum StatusVulnerabilidade {
  DESCOBERTA = 'DESCOBERTA',
  CONFIRMADA = 'CONFIRMADA',
  EM_REMEDIACAO = 'EM_REMEDIACAO',
  REMEDIADA = 'REMEDIADA',
  ACEITA_RISCO = 'ACEITA_RISCO',
  FALSA_POSITIVA = 'FALSA_POSITIVA'
}

export enum TipoVarredura {
  AUTOMATICA = 'AUTOMATICA',
  MANUAL = 'MANUAL',
  PENETRACAO = 'PENETRACAO'
}

export interface Vulnerabilidade {
  id: string;
  cve_id: string;
  titulo: string;
  descricao: string;
  severidade: SeveridadeVulnerabilidade;
  status: StatusVulnerabilidade;
  componente_afetado: string;
  versao_afetada: string;
  score_cvss: number;
  vetor_ataque: string;
  cwes: string[];
  data_descoberta: Date;
  data_confirmacao?: Date;
  data_correcao?: Date;
  data_remediacao?: Date;
  data_revisao?: Date;
  risco_negocio: string;
  recomendacoes: string[];
  patches_disponiveis: PatchSeguranca[];
  responsavel: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatchSeguranca {
  id: string;
  numero_versao: string;
  data_lancamento: Date;
  tamanho_mb: number;
  urgencia: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';
  instrucos_instalacao: string[];
  rollback_disponivel: boolean;
  recomendacoes_teste: string[];
  changelog: string;
  assinado_digitalmente: boolean;
  assinatura_hash: string;
}

export interface VarreduraSeguranca {
  id: string;
  titulo: string;
  tipo: TipoVarredura;
  data_inicio: Date;
  data_conclusao: Date | null;
  duracao_minutos: number;
  escopo: string[];
  ferramenta: string;
  versao_ferramenta: string;
  vulnerabilidades_descobertas: number;
  vulnerabilidades_por_severidade: Record<SeveridadeVulnerabilidade, number>;
  taxa_cobertura_percentual: number;
  falsos_positivos_confirmados: number;
  recomendacoes: string[];
  relatorio_url: string;
  responsavel: string;
  createdAt: Date;
}

export interface TestePenetracao {
  id: string;
  titulo: string;
  data_inicio: Date;
  data_conclusao: Date | null;
  duracao_dias: number;
  escopo: string;
  equipe_testadores: string[];
  vulnerabilidades_encontradas: number;
  classificacao_risco: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';
  vetores_explorados: string[];
  recomendacoes: string[];
  dados_comprometidos: boolean;
  acesso_obtido: string[];
  proxima_data_teste: Date;
  createdAt: Date;
}

export interface ProcessoPatch {
  id: string;
  titulo: string;
  patch_id: string;
  vulnerabilidades_afetadas: string[];
  data_planejamento: Date;
  data_aplicacao_planejada: Date;
  data_aplicacao_real?: Date;
  ambientes: {
    desenvolvimento: PatchStatus;
    staging: PatchStatus;
    producao: PatchStatus;
  };
  aprovadores: string[];
  janela_manutencao: {
    data_inicio: Date;
    data_fim: Date;
    downtime_minutos_estimado: number;
  };
  status: 'PLANEJADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REVERSO';
  rollback_necessario: boolean;
  testado: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatchStatus {
  status: 'PENDENTE' | 'APLICADO' | 'FALHADO' | 'REVERTIDO';
  data_aplicacao?: Date;
  mensagem_erro?: string;
  tentativas: number;
}

export class GerenciadorVulnerabilidades {
  private vulnerabilidades: Map<string, Vulnerabilidade> = new Map();
  private varreduras: VarreduraSeguranca[] = [];
  private testesPenetracao: TestePenetracao[] = [];
  private processosPatch: ProcessoPatch[] = [];

  constructor() {
    this.inicializarVulnerabilidadesExemplo();
  }

  /**
   * Inicializa vulnerabilidades de exemplo
   */
  private inicializarVulnerabilidadesExemplo(): void {
    const vulns: Vulnerabilidade[] = [
      {
        id: 'vuln-001',
        cve_id: 'CVE-2024-0001',
        titulo: 'SQL Injection em módulo de relatórios',
        descricao: 'Entrada de usuário não validada permite SQL injection',
        severidade: SeveridadeVulnerabilidade.CRITICA,
        status: StatusVulnerabilidade.REMEDIADA,
        componente_afetado: 'relatorio-builder.ts',
        versao_afetada: '1.0.0 - 1.2.3',
        score_cvss: 9.8,
        vetor_ataque: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        cwes: ['CWE-89'],
        data_descoberta: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        data_confirmacao: new Date(Date.now() - 85 * 24 * 60 * 60 * 1000),
        data_remediacao: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        risco_negocio: 'Exposição crítica de dados confidenciais',
        recomendacoes: ['Validar todas as entradas de usuário', 'Usar prepared statements'],
        patches_disponiveis: [
          {
            id: 'patch-001-v1.2.4',
            numero_versao: '1.2.4',
            data_lancamento: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            tamanho_mb: 5.2,
            urgencia: 'CRITICA',
            instrucos_instalacao: ['Fazer backup', 'Parar serviço', 'Aplicar patch', 'Iniciar serviço'],
            rollback_disponivel: true,
            recomendacoes_teste: ['Testar relatórios com dados especiais', 'Testar com caracteres SQL'],
            changelog: 'Adicionado validação de entrada com prepared statements',
            assinado_digitalmente: true,
            assinatura_hash: 'sha256hash...'
          }
        ],
        responsavel: 'security-team@erp.com',
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'vuln-002',
        cve_id: 'CVE-2024-0002',
        titulo: 'Cross-Site Request Forgery (CSRF) em aprovações',
        descricao: 'Falta de token CSRF em operações de aprovação',
        severidade: SeveridadeVulnerabilidade.ALTA,
        status: StatusVulnerabilidade.EM_REMEDIACAO,
        componente_afetado: 'document-approvals.ts',
        versao_afetada: '1.0.0 - 1.3.0',
        score_cvss: 6.5,
        vetor_ataque: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:N',
        cwes: ['CWE-352'],
        data_descoberta: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        data_confirmacao: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
        risco_negocio: 'Comprometimento de integridade de documentos',
        recomendacoes: ['Implementar tokens CSRF', 'Validar origin header', 'Usar SameSite cookies'],
        patches_disponiveis: [
          {
            id: 'patch-002-v1.3.1',
            numero_versao: '1.3.1',
            data_lancamento: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            tamanho_mb: 3.1,
            urgencia: 'ALTA',
            instrucos_instalacao: ['Backup', 'Parar serviço', 'Aplicar patch', 'Iniciar'],
            rollback_disponivel: true,
            recomendacoes_teste: ['Testar fluxo de aprovação', 'Testar com tokens inválidos'],
            changelog: 'Adicionado validação de CSRF token',
            assinado_digitalmente: true,
            assinatura_hash: 'sha256hash...'
          }
        ],
        responsavel: 'security-team@erp.com',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
      }
    ];

    for (const vuln of vulns) {
      this.vulnerabilidades.set(vuln.id, vuln);
    }
  }

  /**
   * Executa varredura de segurança
   */
  async executarScan(
    titulo: string,
    tipo: TipoVarredura,
    escopo: string[],
    ferramenta: string = 'Nessus'
  ): Promise<VarreduraSeguranca> {
    const varredura: VarreduraSeguranca = {
      id: uuidv4(),
      titulo,
      tipo,
      data_inicio: new Date(),
      data_conclusao: null,
      duracao_minutos: 0,
      escopo,
      ferramenta,
      versao_ferramenta: '10.5.0',
      vulnerabilidades_descobertas: 0,
      vulnerabilidades_por_severidade: {
        CRITICA: 0,
        ALTA: 0,
        MEDIA: 0,
        BAIXA: 0,
        INFORMACIONAL: 0
      },
      taxa_cobertura_percentual: 0,
      falsos_positivos_confirmados: 0,
      recomendacoes: [],
      relatorio_url: '',
      responsavel: 'security-team@erp.com',
      createdAt: new Date()
    };

    // Simular execução da varredura
    await this.simularVarredura(varredura);

    this.varreduras.push(varredura);
    return varredura;
  }

  /**
   * Simula execução de varredura
   */
  private async simularVarredura(varredura: VarreduraSeguranca): Promise<void> {
    // Simular duração de 5-30 minutos
    const duracao = Math.floor(Math.random() * 25) + 5;
    await new Promise(resolve => setTimeout(resolve, 100));

    varredura.data_conclusao = new Date();
    varredura.duracao_minutos = duracao;

    // Simular vulnerabilidades descobertas
    varredura.vulnerabilidades_descobertas = Math.floor(Math.random() * 10) + 2;
    varredura.vulnerabilidades_por_severidade.CRITICA = Math.floor(Math.random() * 2);
    varredura.vulnerabilidades_por_severidade.ALTA = Math.floor(Math.random() * 3) + 1;
    varredura.vulnerabilidades_por_severidade.MEDIA = Math.floor(Math.random() * 5) + 2;
    varredura.vulnerabilidades_por_severidade.BAIXA = Math.floor(Math.random() * 5);
    varredura.vulnerabilidades_por_severidade.INFORMACIONAL = Math.floor(Math.random() * 3);

    varredura.taxa_cobertura_percentual = 85 + Math.random() * 15;
    varredura.falsos_positivos_confirmados = Math.floor(Math.random() * 3);

    varredura.recomendacoes = [
      'Aplicar patches de segurança disponíveis',
      'Fortalecer validação de entrada',
      'Implementar WAF (Web Application Firewall)',
      'Aumentar monitoramento de segurança'
    ];

    varredura.relatorio_url = `s3://erp-security-reports/scan-${varredura.id}.pdf`;
  }

  /**
   * Registra vulnerabilidade descoberta
   */
  async registrarVulnerabilidade(
    cve_id: string,
    titulo: string,
    descricao: string,
    severidade: SeveridadeVulnerabilidade,
    componente_afetado: string,
    versao_afetada: string,
    score_cvss: number,
    vetor_ataque: string,
    cwes: string[]
  ): Promise<Vulnerabilidade> {
    const vuln: Vulnerabilidade = {
      id: uuidv4(),
      cve_id,
      titulo,
      descricao,
      severidade,
      status: StatusVulnerabilidade.DESCOBERTA,
      componente_afetado,
      versao_afetada,
      score_cvss,
      vetor_ataque,
      cwes,
      data_descoberta: new Date(),
      risco_negocio: `Potencial comprometimento via ${titulo}`,
      recomendacoes: [],
      patches_disponiveis: [],
      responsavel: 'security-team@erp.com',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.vulnerabilidades.set(vuln.id, vuln);
    return vuln;
  }

  /**
   * Aplica patch de segurança
   */
  async aplicarPatch(
    patch_id: string,
    ambientes: ('desenvolvimento' | 'staging' | 'producao')[] = ['desenvolvimento']
  ): Promise<ProcessoPatch> {
    // Encontrar vulnerabilidades associadas
    const vulnsAfetadas = Array.from(this.vulnerabilidades.values())
      .filter(v => v.patches_disponiveis.some(p => p.id === patch_id))
      .map(v => v.id);

    const processo: ProcessoPatch = {
      id: uuidv4(),
      titulo: `Aplicação de patch de segurança - ${patch_id}`,
      patch_id,
      vulnerabilidades_afetadas: vulnsAfetadas,
      data_planejamento: new Date(),
      data_aplicacao_planejada: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ambientes: {
        desenvolvimento: { status: 'PENDENTE', tentativas: 0 },
        staging: { status: 'PENDENTE', tentativas: 0 },
        producao: { status: 'PENDENTE', tentativas: 0 }
      },
      aprovadores: ['ciso@erp.com', 'cto@erp.com'],
      janela_manutencao: {
        data_inicio: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        data_fim: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
        downtime_minutos_estimado: 30
      },
      status: 'PLANEJADO',
      rollback_necessario: false,
      testado: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.processosPatch.push(processo);

    // Simular aplicação em desenvolvimento
    if (ambientes.includes('desenvolvimento')) {
      await this.executarPatchAmbiente(processo, 'desenvolvimento');
    }

    return processo;
  }

  /**
   * Executa patch em ambiente específico
   */
  private async executarPatchAmbiente(
    processo: ProcessoPatch,
    ambiente: 'desenvolvimento' | 'staging' | 'producao'
  ): Promise<void> {
    const statusPatch = processo.ambientes[ambiente];
    statusPatch.status = 'PENDENTE';
    statusPatch.tentativas++;

    try {
      // Simular aplicação de patch
      await new Promise(resolve => setTimeout(resolve, 500));

      statusPatch.status = 'APLICADO';
      statusPatch.data_aplicacao = new Date();

      if (statusPatch.tentativas === 1) {
        processo.status = 'EM_ANDAMENTO';
      }

      // Verificar se todos os ambientes foram aplicados
      const todosAplicados = Object.values(processo.ambientes).every(
        s => s.status === 'APLICADO'
      );

      if (todosAplicados) {
        processo.status = 'CONCLUIDO';
        processo.data_aplicacao_real = new Date();

        // Atualizar vulnerabilidades associadas
        for (const vulnId of processo.vulnerabilidades_afetadas) {
          const vuln = this.vulnerabilidades.get(vulnId);
          if (vuln) {
            vuln.status = StatusVulnerabilidade.REMEDIADA;
            vuln.data_remediacao = new Date();
          }
        }
      }
    } catch (error) {
      statusPatch.status = 'FALHADO';
      statusPatch.mensagem_erro = `Erro ao aplicar patch: ${error}`;

      if (statusPatch.tentativas >= 3) {
        processo.status = 'REVERSO';
        processo.rollback_necessario = true;
      }
    }

    processo.updatedAt = new Date();
  }

  /**
   * Executa teste de penetração
   */
  async executarTestePenetracao(
    titulo: string,
    escopo: string,
    equipe: string[]
  ): Promise<TestePenetracao> {
    const duracao = Math.floor(Math.random() * 5) + 3; // 3-8 dias

    const teste: TestePenetracao = {
      id: uuidv4(),
      titulo,
      data_inicio: new Date(),
      data_conclusao: new Date(Date.now() + duracao * 24 * 60 * 60 * 1000),
      duracao_dias: duracao,
      escopo,
      equipe_testadores: equipe,
      vulnerabilidades_encontradas: Math.floor(Math.random() * 15) + 5,
      classificacao_risco: this.selecionarRiscoPenetracao(),
      vetores_explorados: [
        'SQL Injection',
        'XSS',
        'CSRF',
        'Broken Authentication',
        'Insecure Deserialization'
      ],
      recomendacoes: [
        'Implementar validação de entrada robusta',
        'Usar bibliotecas de segurança atualizadas',
        'Realizar auditorias de segurança regulares',
        'Implementar segurança no design'
      ],
      dados_comprometidos: false,
      acesso_obtido: ['acesso_leitura_banco_dados', 'acesso_aplicacao'],
      proxima_data_teste: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      createdAt: new Date()
    };

    this.testesPenetracao.push(teste);
    return teste;
  }

  /**
   * Seleciona risco aleatório para teste de penetração
   */
  private selecionarRiscoPenetracao(): 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA' {
    const riscos: Array<'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA'> = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];
    return riscos[Math.floor(Math.random() * riscos.length)];
  }

  /**
   * Gera relatório de vulnerabilidades
   */
  gerarRelatorioVulnerabilidades(): {
    total_vulnerabilidades: number;
    por_severidade: Record<SeveridadeVulnerabilidade, number>;
    por_status: Record<StatusVulnerabilidade, number>;
    tempo_medio_remediacao_dias: number;
    vulnerabilidades_abiertas: number;
    taxa_remediacao_percentual: number;
  } {
    const vulns = Array.from(this.vulnerabilidades.values());

    const porSeveridade: Record<SeveridadeVulnerabilidade, number> = {
      CRITICA: 0,
      ALTA: 0,
      MEDIA: 0,
      BAIXA: 0,
      INFORMACIONAL: 0
    };

    const porStatus: Record<StatusVulnerabilidade, number> = {
      DESCOBERTA: 0,
      CONFIRMADA: 0,
      EM_REMEDIACAO: 0,
      REMEDIADA: 0,
      ACEITA_RISCO: 0,
      FALSA_POSITIVA: 0
    };

    let tempoTotalRemediacao = 0;
    let vulnerabilidadesRemediadas = 0;

    for (const vuln of vulns) {
      porSeveridade[vuln.severidade]++;
      porStatus[vuln.status]++;

      if (vuln.status === StatusVulnerabilidade.REMEDIADA && vuln.data_remediacao) {
        const tempo = vuln.data_remediacao.getTime() - vuln.data_descoberta.getTime();
        tempoTotalRemediacao += tempo;
        vulnerabilidadesRemediadas++;
      }
    }

    const tempoMedioRemediacao =
      vulnerabilidadesRemediadas > 0
        ? Math.floor(tempoTotalRemediacao / vulnerabilidadesRemediadas / (1000 * 60 * 60 * 24))
        : 0;

    const vulnerabilidadesAbertas = vulns.filter(
      v => v.status !== StatusVulnerabilidade.REMEDIADA && v.status !== StatusVulnerabilidade.FALSA_POSITIVA
    ).length;

    const taxaRemediacao = vulns.length > 0 ? (vulnerabilidadesRemediadas / vulns.length) * 100 : 0;

    return {
      total_vulnerabilidades: vulns.length,
      por_severidade: porSeveridade,
      por_status: porStatus,
      tempo_medio_remediacao_dias: tempoMedioRemediacao,
      vulnerabilidades_abiertas: vulnerabilidadesAbertas,
      taxa_remediacao_percentual: Math.round(taxaRemediacao * 100) / 100
    };
  }

  /**
   * Obtém vulnerabilidades não remediadas
   */
  obterVulnerabilidadesAbertas(): Vulnerabilidade[] {
    return Array.from(this.vulnerabilidades.values()).filter(
      v => v.status !== StatusVulnerabilidade.REMEDIADA && v.status !== StatusVulnerabilidade.FALSA_POSITIVA
    );
  }

  /**
   * Obtém histórico de varreduras
   */
  obterHistoricoVarreduras(): VarreduraSeguranca[] {
    return [...this.varreduras].sort((a, b) => b.data_inicio.getTime() - a.data_inicio.getTime());
  }

  /**
   * Obtém histórico de testes de penetração
   */
  obterHistoricoTestesPenetracao(): TestePenetracao[] {
    return [...this.testesPenetracao].sort((a, b) => b.data_inicio.getTime() - a.data_inicio.getTime());
  }

  /**
   * Obtém processos de patch em andamento
   */
  obterProcessosPatchEmAndamento(): ProcessoPatch[] {
    return this.processosPatch.filter(p => p.status === 'EM_ANDAMENTO' || p.status === 'PLANEJADO');
  }
}
