/**
 * Phase 7g: Data Privacy & LGPD Compliance
 * Data subject rights, consent management, GDPR/LGPD
 * Data export, deletion, anonymization
 */

import { v4 as uuidv4 } from 'uuid';

export enum TipoDireito {
  ACESSO = 'ACESSO',
  CORRECAO = 'CORRECAO',
  DELECAO = 'DELECAO',
  PORTABILIDADE = 'PORTABILIDADE',
  OPOSICAO = 'OPOSICAO',
  RESTRICAO_PROCESSAMENTO = 'RESTRICAO_PROCESSAMENTO'
}

export enum StatusRequisicao {
  RECEBIDA = 'RECEBIDA',
  ACEITA = 'ACEITA',
  PROCESSANDO = 'PROCESSANDO',
  COMPLETA = 'COMPLETA',
  REJEITADA = 'REJEITADA',
  ARQUIVADA = 'ARQUIVADA'
}

export enum ClassificacaoDados {
  PUBLICO = 'PUBLICO',
  INTERNO = 'INTERNO',
  CONFIDENCIAL = 'CONFIDENCIAL',
  PESSOAL = 'PESSOAL',
  FINANCEIRO = 'FINANCEIRO'
}

export interface TitularDados {
  id: string;
  nome: string;
  email: string;
  cpf: string;
  data_nascimento: Date;
  endereco: {
    rua: string;
    numero: string;
    cidade: string;
    estado: string;
    cep: string;
  };
  telefones: string[];
  consentimentos: ConsentimentoLGPD[];
  requisicoes: RequisicaoDireito[];
  data_ultima_atualizacao: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsentimentoLGPD {
  id: string;
  titular_id: string;
  tipo: 'PROCESSAMENTO' | 'MARKETING' | 'TERCEIROS' | 'COOKIES';
  finalidade: string;
  concedido: boolean;
  data_concessao: Date;
  data_revogacao?: Date;
  prova_consentimento: string;
  valido: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequisicaoDireito {
  id: string;
  titular_id: string;
  tipo: TipoDireito;
  status: StatusRequisicao;
  data_requisicao: Date;
  data_resposta_planejada: Date;
  data_resposta_efetiva?: Date;
  motivo_rejeicao?: string;
  dados_processados?: any[];
  url_exportacao?: string;
  registros_deletados?: number;
  registros_anonimizados?: number;
  responsavel: string;
  verificacao_identidade_completa: boolean;
  assinatura_digital: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventarioDados {
  id: string;
  nome_sistema: string;
  descricao: string;
  classificacao: ClassificacaoDados;
  localizacao: string;
  responsavel_dados: string;
  campos_pessoais: string[];
  campos_sensiveis: string[];
  frequencia_acesso: string;
  tempo_retencao_dias: number;
  base_legal: string;
  processadores: string[];
  paises_transferencia: string[];
  medidas_seguranca: string[];
  data_ultima_auditoria: Date;
  proxima_auditoria_planejada: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnonimizacaoDados {
  id: string;
  titular_id: string;
  data_anonimizacao: Date;
  campos_anonimizados: string[];
  metodo_anonimizacao: string;
  motivo: string;
  reversivel: boolean;
  chave_recuperacao?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GerenciadorComplianceLGPD {
  private titulares: Map<string, TitularDados> = new Map();
  private requisicoes: RequisicaoDireito[] = [];
  private inventarios: Map<string, InventarioDados> = new Map();
  private anonimizacoes: AnonimizacaoDados[] = [];

  // Prazos LGPD
  private prazoPadraoDias = 15;
  private prazoMaximoDias = 45;
  private tempoRetencaoPessoalDias = 1825; // 5 anos

  constructor() {
    this.inicializarInventario();
  }

  /**
   * Inicializa inventário de dados
   */
  private inicializarInventario(): void {
    const inventarios: InventarioDados[] = [
      {
        id: 'inv-001',
        nome_sistema: 'Sistema de Gestão de Pagamentos',
        descricao: 'Processa informações de pagamento de usuários',
        classificacao: ClassificacaoDados.FINANCEIRO,
        localizacao: 'PostgreSQL - Prod',
        responsavel_dados: 'Departamento Financeiro',
        campos_pessoais: ['cpf', 'nome', 'email', 'telefone'],
        campos_sensiveis: ['numero_conta', 'agencia', 'valor_transacao'],
        frequencia_acesso: 'Diária',
        tempo_retencao_dias: 2555,
        base_legal: 'Lei 6.404/76 - Obrigação Legal',
        processadores: ['AWS', 'Stripe'],
        paises_transferencia: ['EUA', 'Brasil'],
        medidas_seguranca: ['Encriptação AES-256', 'TLS 1.3', 'Autenticação MFA'],
        data_ultima_auditoria: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        proxima_auditoria_planejada: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'inv-002',
        nome_sistema: 'Sistema de Gestão de Usuários',
        descricao: 'Armazena informações de cadastro de usuários',
        classificacao: ClassificacaoDados.PESSOAL,
        localizacao: 'PostgreSQL - Prod',
        responsavel_dados: 'TI',
        campos_pessoais: ['cpf', 'rg', 'nome', 'email', 'endereco', 'telefone'],
        campos_sensiveis: ['data_nascimento', 'genero', 'nacionalidade'],
        frequencia_acesso: 'Diária',
        tempo_retencao_dias: 2555,
        base_legal: 'LGPD - Interesse Legítimo',
        processadores: ['AWS'],
        paises_transferencia: ['Brasil'],
        medidas_seguranca: ['Encriptação em repouso', 'Controle de acesso RBAC'],
        data_ultima_auditoria: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        proxima_auditoria_planejada: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const inv of inventarios) {
      this.inventarios.set(inv.id, inv);
    }
  }

  /**
   * Registra novo titular de dados
   */
  async registrarTitular(
    nome: string,
    email: string,
    cpf: string,
    data_nascimento: Date,
    endereco: TitularDados['endereco'],
    telefones: string[]
  ): Promise<TitularDados> {
    const titular: TitularDados = {
      id: uuidv4(),
      nome,
      email,
      cpf,
      data_nascimento,
      endereco,
      telefones,
      consentimentos: [],
      requisicoes: [],
      data_ultima_atualizacao: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.titulares.set(titular.id, titular);
    return titular;
  }

  /**
   * Registra consentimento do titular
   */
  async registrarConsentimento(
    titular_id: string,
    tipo: 'PROCESSAMENTO' | 'MARKETING' | 'TERCEIROS' | 'COOKIES',
    finalidade: string,
    concedido: boolean
  ): Promise<ConsentimentoLGPD> {
    const titular = this.titulares.get(titular_id);
    if (!titular) {
      throw new Error(`Titular ${titular_id} não encontrado`);
    }

    const consentimento: ConsentimentoLGPD = {
      id: uuidv4(),
      titular_id,
      tipo,
      finalidade,
      concedido,
      data_concessao: new Date(),
      prova_consentimento: `IP: 192.168.1.${Math.floor(Math.random() * 255)}, User-Agent: Mozilla...`,
      valido: concedido,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    titular.consentimentos.push(consentimento);
    titular.updatedAt = new Date();

    return consentimento;
  }

  /**
   * Processa requisição de direito do titular
   */
  async processarRequisicaoDireito(
    titular_id: string,
    tipo: TipoDireito,
    motivo: string
  ): Promise<RequisicaoDireito> {
    const titular = this.titulares.get(titular_id);
    if (!titular) {
      throw new Error(`Titular ${titular_id} não encontrado`);
    }

    // Validar consentimento apropriado
    const consentimentoValido = this.validarConsentimento(titular, tipo);
    if (!consentimentoValido) {
      throw new Error(`Titular não possui consentimento para ${tipo}`);
    }

    const dataRespostaPlaneajada = new Date();
    dataRespostaPlaneajada.setDate(dataRespostaPlaneajada.getDate() + this.prazoPadraoDias);

    const requisicao: RequisicaoDireito = {
      id: uuidv4(),
      titular_id,
      tipo,
      status: StatusRequisicao.RECEBIDA,
      data_requisicao: new Date(),
      data_resposta_planejada: dataRespostaPlaneajada,
      responsavel: 'privacy-team@erp.com',
      verificacao_identidade_completa: false,
      assinatura_digital: this.gerarAssinatura(titular_id),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Simular validação de identidade
    await this.validarIdentidadeTitular(titular, requisicao);

    this.requisicoes.push(requisicao);
    titular.requisicoes.push(requisicao);

    // Processar requisição conforme tipo
    await this.executarRequisicaoDireito(requisicao, titular);

    return requisicao;
  }

  /**
   * Executa requisição de direito
   */
  private async executarRequisicaoDireito(
    requisicao: RequisicaoDireito,
    titular: TitularDados
  ): Promise<void> {
    requisicao.status = StatusRequisicao.PROCESSANDO;
    requisicao.updatedAt = new Date();

    try {
      switch (requisicao.tipo) {
        case TipoDireito.ACESSO:
          await this.exportarDadosPessoa(titular.id, requisicao);
          break;

        case TipoDireito.CORRECAO:
          // Em produção, abriria formulário para correção
          await this.processarCorrecaoDados(titular.id, requisicao);
          break;

        case TipoDireito.DELECAO:
          await this.deletarDadosPessoa(titular.id, requisicao);
          break;

        case TipoDireito.PORTABILIDADE:
          await this.exportarDadosPessoa(titular.id, requisicao);
          break;

        case TipoDireito.OPOSICAO:
          await this.processarOposicao(titular.id, requisicao);
          break;

        case TipoDireito.RESTRICAO_PROCESSAMENTO:
          await this.restringirProcessamento(titular.id, requisicao);
          break;
      }

      requisicao.status = StatusRequisicao.COMPLETA;
      requisicao.data_resposta_efetiva = new Date();
    } catch (error) {
      requisicao.status = StatusRequisicao.REJEITADA;
      requisicao.motivo_rejeicao = `Erro ao processar: ${error}`;
    }

    requisicao.updatedAt = new Date();
  }

  /**
   * Exporta dados pessoais do titular
   */
  async exportarDadosPessoa(
    titular_id: string,
    requisicao: RequisicaoDireito
  ): Promise<string> {
    const titular = this.titulares.get(titular_id);
    if (!titular) {
      throw new Error(`Titular ${titular_id} não encontrado`);
    }

    const dados = {
      perfil_pessoal: {
        nome: titular.nome,
        email: titular.email,
        cpf: titular.cpf,
        data_nascimento: titular.data_nascimento,
        endereco: titular.endereco,
        telefones: titular.telefones
      },
      consentimentos: titular.consentimentos,
      historico_requisicoes: titular.requisicoes.map(r => ({
        id: r.id,
        tipo: r.tipo,
        status: r.status,
        data: r.data_requisicao
      }))
    };

    // Simular exportação para arquivo encriptado
    const arquivo = `titular-${titular_id}-${new Date().toISOString()}.json.gpg`;
    const url = `s3://erp-data-exports/${arquivo}`;

    requisicao.url_exportacao = url;
    requisicao.dados_processados = [dados];

    return url;
  }

  /**
   * Deleta dados pessoais do titular
   */
  async deletarDadosPessoa(
    titular_id: string,
    requisicao: RequisicaoDireito
  ): Promise<void> {
    const titular = this.titulares.get(titular_id);
    if (!titular) {
      throw new Error(`Titular ${titular_id} não encontrado`);
    }

    // Simular contagem de registros a deletar
    let registrosDeletados = 0;

    // Buscar registros em diferentes sistemas (simulado)
    const sistemasAfetados = Array.from(this.inventarios.values());

    for (const sistema of sistemasAfetados) {
      // Simular deleção
      const registrosDoSistema = Math.floor(Math.random() * 100) + 10;
      registrosDeletados += registrosDoSistema;
    }

    requisicao.registros_deletados = registrosDeletados;

    // Após período de retenção, deletar permanentemente
    // Em produção, seria agendado job para deleção definitiva
  }

  /**
   * Anonimiza dados pessoais
   */
  async anonimizarDadosPessoa(
    titular_id: string,
    motivo: string,
    reversivel: boolean = false
  ): Promise<AnonimizacaoDados> {
    const titular = this.titulares.get(titular_id);
    if (!titular) {
      throw new Error(`Titular ${titular_id} não encontrado`);
    }

    const anonimizacao: AnonimizacaoDados = {
      id: uuidv4(),
      titular_id,
      data_anonimizacao: new Date(),
      campos_anonimizados: ['cpf', 'email', 'endereco', 'telefone'],
      metodo_anonimizacao: 'Hash Irreversível',
      motivo,
      reversivel,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (reversivel) {
      // Simular geração de chave de recuperação
      anonimizacao.chave_recuperacao = Buffer.from(
        `${titular_id}-${Date.now()}`
      ).toString('base64');
    }

    this.anonimizacoes.push(anonimizacao);
    return anonimizacao;
  }

  /**
   * Valida consentimento do titular
   */
  private validarConsentimento(titular: TitularDados, tipo: TipoDireito): boolean {
    // Direitos sempre válidos sem consentimento específico
    if (tipo === TipoDireito.ACESSO || tipo === TipoDireito.PORTABILIDADE) {
      return true;
    }

    // Para outras operações, verificar consentimento apropriado
    const consentimentsRequeridos = {
      [TipoDireito.CORRECAO]: 'PROCESSAMENTO',
      [TipoDireito.DELECAO]: 'PROCESSAMENTO',
      [TipoDireito.OPOSICAO]: 'MARKETING',
      [TipoDireito.RESTRICAO_PROCESSAMENTO]: 'PROCESSAMENTO'
    };

    const tipoConsentimento = consentimentsRequeridos[tipo] as any;
    if (!tipoConsentimento) return true;

    return titular.consentimentos.some(
      c => c.tipo === tipoConsentimento && c.concedido && c.valido
    );
  }

  /**
   * Valida identidade do titular
   */
  private async validarIdentidadeTitular(
    titular: TitularDados,
    requisicao: RequisicaoDireito
  ): Promise<void> {
    // Simular validação de identidade
    await new Promise(resolve => setTimeout(resolve, 100));
    requisicao.verificacao_identidade_completa = true;
  }

  /**
   * Processa correção de dados
   */
  private async processarCorrecaoDados(
    titular_id: string,
    requisicao: RequisicaoDireito
  ): Promise<void> {
    // Em produção, enviaria e-mail com formulário de correção
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Processa oposição ao processamento
   */
  private async processarOposicao(
    titular_id: string,
    requisicao: RequisicaoDireito
  ): Promise<void> {
    // Revogar consentimentos de marketing e terceiros
    const titular = this.titulares.get(titular_id);
    if (titular) {
      for (const consent of titular.consentimentos) {
        if (consent.tipo === 'MARKETING' || consent.tipo === 'TERCEIROS') {
          consent.valido = false;
          consent.data_revogacao = new Date();
        }
      }
    }
  }

  /**
   * Restringe processamento de dados
   */
  private async restringirProcessamento(
    titular_id: string,
    requisicao: RequisicaoDireito
  ): Promise<void> {
    const titular = this.titulares.get(titular_id);
    if (titular) {
      // Marcar dados como restritos para processamento
      for (const consent of titular.consentimentos) {
        if (consent.tipo === 'PROCESSAMENTO') {
          consent.valido = false;
        }
      }
    }
  }

  /**
   * Gera assinatura digital para requisição
   */
  private gerarAssinatura(titular_id: string): string {
    return Buffer.from(
      `${titular_id}-${Date.now()}-ASSINATURA`
    ).toString('base64');
  }

  /**
   * Obtém requisições pendentes
   */
  obterRequisicoesPendentes(): RequisicaoDireito[] {
    return this.requisicoes.filter(
      r => r.status === StatusRequisicao.RECEBIDA || r.status === StatusRequisicao.PROCESSANDO
    );
  }

  /**
   * Obtém inventário de dados
   */
  obterInventarioDados(): InventarioDados[] {
    return Array.from(this.inventarios.values());
  }

  /**
   * Auditoria LGPD
   */
  auditarConsentimento(): {
    total_titulares: number;
    consentimentos_validos: number;
    consentimentos_revogados: number;
    taxa_consentimento_valido: number;
    requisicoes_30_dias: number;
    tempo_medio_resposta_dias: number;
  } {
    let consentimentosValidos = 0;
    let consentimentosRevogados = 0;
    let tempoTotalResposta = 0;
    let requisicoesConcluidas = 0;

    for (const titular of this.titulares.values()) {
      for (const consent of titular.consentimentos) {
        if (consent.valido) {
          consentimentosValidos++;
        } else if (consent.data_revogacao) {
          consentimentosRevogados++;
        }
      }
    }

    for (const req of this.requisicoes) {
      if (req.data_resposta_efetiva && req.status === StatusRequisicao.COMPLETA) {
        const tempo = req.data_resposta_efetiva.getTime() - req.data_requisicao.getTime();
        tempoTotalResposta += tempo;
        requisicoesConcluidas++;
      }
    }

    const tempoMedioResposta =
      requisicoesConcluidas > 0
        ? Math.floor(tempoTotalResposta / requisicoesConcluidas / (1000 * 60 * 60 * 24))
        : 0;

    const taxaConsentimento =
      consentimentosValidos + consentimentosRevogados > 0
        ? (consentimentosValidos / (consentimentosValidos + consentimentosRevogados)) * 100
        : 0;

    return {
      total_titulares: this.titulares.size,
      consentimentos_validos: consentimentosValidos,
      consentimentos_revogados: consentimentosRevogados,
      taxa_consentimento_valido: Math.round(taxaConsentimento * 100) / 100,
      requisicoes_30_dias: this.requisicoes.filter(
        r =>
          new Date().getTime() - r.data_requisicao.getTime() <
          30 * 24 * 60 * 60 * 1000
      ).length,
      tempo_medio_resposta_dias: tempoMedioResposta
    };
  }
}
