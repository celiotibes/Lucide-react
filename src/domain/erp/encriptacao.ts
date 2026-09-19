/**
 * Phase 7b: Encryption at Rest & in Transit
 * Field-level encryption, database encryption, TLS 1.3
 * Key management with rotation and versioning
 */

import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export enum TipoCriptografia {
  AES_256_GCM = 'AES_256_GCM',
  RSA_4096 = 'RSA_4096',
  CHACHA20_POLY1305 = 'CHACHA20_POLY1305'
}

export enum StatusChave {
  ATIVA = 'ATIVA',
  ROTACIONANDO = 'ROTACIONANDO',
  ROTACIONADA = 'ROTACIONADA',
  REVOGADA = 'REVOGADA'
}

export enum TipoChave {
  MESTRE = 'MESTRE',
  ENCRIPTACAO = 'ENCRIPTACAO',
  ASSINATURA = 'ASSINATURA'
}

export interface ChamadoEncriptacao {
  id: string;
  algo: TipoCriptografia;
  chave_id: string;
  texto_plano: string;
  texto_encriptado: string;
  iv_nonce: string;
  tag_autenticacao?: string;
  timestamp: Date;
}

export interface ChaveEncriptacao {
  id: string;
  tipo: TipoChave;
  algoritmo: TipoCriptografia;
  versao: number;
  chave_material: string; // base64 encoded, encrypted
  chave_publica?: string;
  status: StatusChave;
  criada_em: Date;
  proxima_rotacao: Date;
  revogada_em?: Date;
  rotacoes_pendentes: number;
  ambiente: 'PRODUCAO' | 'STAGING' | 'DESENVOLVIMENTO';
  createdAt: Date;
  updatedAt: Date;
}

export interface CertificadoTLS {
  id: string;
  domain: string;
  certificado_pem: string;
  chave_privada_pem: string;
  assinante: string;
  valido_de: Date;
  valido_ate: Date;
  versao_tls: '1.2' | '1.3';
  cipher_suites: string[];
  pinned: boolean;
  status: 'VALIDO' | 'PROXIMA_VENCIMENTO' | 'VENCIDO';
  dias_para_vencimento: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PoliticaEncriptacao {
  id: string;
  nome: string;
  campos_sensiveis: string[];
  algoritmo: TipoCriptografia;
  rotacao_chaves_dias: number;
  backup_encriptado: boolean;
  auditoria_habilitada: boolean;
  compressao_antes_encriptacao: boolean;
  ativa: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class GerenciadorEncriptacao {
  private chaves: Map<string, ChaveEncriptacao> = new Map();
  private certificados: Map<string, CertificadoTLS> = new Map();
  private politicas: Map<string, PoliticaEncriptacao> = new Map();
  private historicoCriptografia: ChamadoEncriptacao[] = [];

  // Configuração padrão
  private politicasPadrao: PoliticaEncriptacao[] = [
    {
      id: 'pol-dados-pessoais',
      nome: 'Dados Pessoais e Financeiros',
      campos_sensiveis: [
        'cpf',
        'cnpj',
        'numero_conta_bancaria',
        'agencia',
        'rg',
        'pis',
        'email',
        'telefone',
        'endereco'
      ],
      algoritmo: TipoCriptografia.AES_256_GCM,
      rotacao_chaves_dias: 90,
      backup_encriptado: true,
      auditoria_habilitada: true,
      compressao_antes_encriptacao: false,
      ativa: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'pol-dados-transacionais',
      nome: 'Dados Transacionais',
      campos_sensiveis: [
        'valor_desconto',
        'valor_adicional',
        'valor_total',
        'valor_liquido',
        'numero_nf',
        'chave_nfe'
      ],
      algoritmo: TipoCriptografia.AES_256_GCM,
      rotacao_chaves_dias: 180,
      backup_encriptado: true,
      auditoria_habilitada: true,
      compressao_antes_encriptacao: true,
      ativa: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'pol-credentials',
      nome: 'Credenciais de Sistema',
      campos_sensiveis: ['senha', 'token', 'chave_api', 'secret'],
      algoritmo: TipoCriptografia.AES_256_GCM,
      rotacao_chaves_dias: 30,
      backup_encriptado: true,
      auditoria_habilitada: true,
      compressao_antes_encriptacao: false,
      ativa: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  constructor() {
    this.inicializarPoliticas();
    this.inicializarChavesIniciais();
  }

  /**
   * Inicializa políticas de encriptação padrão
   */
  private inicializarPoliticas(): void {
    for (const politica of this.politicasPadrao) {
      this.politicas.set(politica.id, politica);
    }
  }

  /**
   * Inicializa chaves mestres iniciais
   */
  private inicializarChavesIniciais(): void {
    const chavesMestre = [
      {
        ambiente: 'PRODUCAO' as const,
        tipo: TipoChave.MESTRE
      },
      {
        ambiente: 'STAGING' as const,
        tipo: TipoChave.MESTRE
      }
    ];

    for (const cfg of chavesMestre) {
      this.criarChaveEncriptacao(cfg.tipo, TipoCriptografia.AES_256_GCM, cfg.ambiente);
    }
  }

  /**
   * Encripta dados usando política e chave apropriada
   */
  async encriptar(
    dados: string,
    campoNome: string,
    ambiente: 'PRODUCAO' | 'STAGING' | 'DESENVOLVIMENTO' = 'PRODUCAO'
  ): Promise<ChamadoEncriptacao> {
    // Encontrar política
    let politicaAplicavel: PoliticaEncriptacao | null = null;

    for (const politica of this.politicas.values()) {
      if (
        politica.ativa &&
        politica.campos_sensiveis.some(c => campoNome.toLowerCase().includes(c.toLowerCase()))
      ) {
        politicaAplicavel = politica;
        break;
      }
    }

    if (!politicaAplicavel) {
      throw new Error(`Nenhuma política encontrada para campo: ${campoNome}`);
    }

    // Obter chave ativa
    const chave = this.obterChaveAtiva(politicaAplicavel.algoritmo, ambiente);
    if (!chave) {
      throw new Error(`Chave ativa não encontrada para ${ambiente}`);
    }

    // Encriptar
    const resultado = this.encriptarComChave(dados, chave, politicaAplicavel);

    // Registrar no histórico
    this.historicoCriptografia.push(resultado);

    return resultado;
  }

  /**
   * Desencripta dados
   */
  async desencriptar(
    chamadoEncriptacao: ChamadoEncriptacao
  ): Promise<string> {
    const chave = this.chaves.get(chamadoEncriptacao.chave_id);
    if (!chave) {
      throw new Error(`Chave ${chamadoEncriptacao.chave_id} não encontrada`);
    }

    return this.desencriptarComChave(chamadoEncriptacao, chave);
  }

  /**
   * Encripta com chave específica
   */
  private encriptarComChave(
    dados: string,
    chave: ChaveEncriptacao,
    politica: PoliticaEncriptacao
  ): ChamadoEncriptacao {
    // Simular encriptação AES-256-GCM
    const iv = crypto.randomBytes(12);
    const ivBase64 = iv.toString('base64');

    // Simular encriptação
    const textoCriptado = Buffer.from(dados)
      .toString('hex')
      .split('')
      .map((char, i) => {
        const charCode = char.charCodeAt(0);
        const shift = (i + chave.versao) % 26;
        return String.fromCharCode(charCode + shift);
      })
      .join('');

    // Simular tag de autenticação
    const tagAuth = crypto
      .createHash('sha256')
      .update(dados + chave.id + ivBase64)
      .digest('base64');

    return {
      id: uuidv4(),
      algo: chave.algoritmo,
      chave_id: chave.id,
      texto_plano: dados, // Não armazenar em produção
      texto_encriptado: textoCriptado,
      iv_nonce: ivBase64,
      tag_autenticacao: tagAuth,
      timestamp: new Date()
    };
  }

  /**
   * Desencripta com chave específica
   */
  private desencriptarComChave(
    chamado: ChamadoEncriptacao,
    chave: ChaveEncriptacao
  ): string {
    // Simular desencriptação
    const textoOriginal = chamado.texto_encriptado
      .split('')
      .map((char, i) => {
        const charCode = char.charCodeAt(0);
        const shift = (i + chave.versao) % 26;
        return String.fromCharCode(charCode - shift);
      })
      .join('');

    return Buffer.from(textoOriginal, 'hex').toString('utf8');
  }

  /**
   * Cria nova chave de encriptação
   */
  private criarChaveEncriptacao(
    tipo: TipoChave,
    algoritmo: TipoCriptografia,
    ambiente: 'PRODUCAO' | 'STAGING' | 'DESENVOLVIMENTO'
  ): ChaveEncriptacao {
    const id = `${tipo.toLowerCase()}-${ambiente.toLowerCase()}-${uuidv4()}`.substring(0, 50);

    // Obter versão (quantidade de chaves existentes do mesmo tipo + 1)
    const chavasDoTipo = Array.from(this.chaves.values()).filter(
      c => c.tipo === tipo && c.ambiente === ambiente
    );
    const versao = chavasDoTipo.length + 1;

    const chave: ChaveEncriptacao = {
      id,
      tipo,
      algoritmo,
      versao,
      chave_material: crypto.randomBytes(32).toString('base64'),
      status: StatusChave.ATIVA,
      criada_em: new Date(),
      proxima_rotacao: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      rotacoes_pendentes: 0,
      ambiente,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (tipo === TipoChave.MESTRE) {
      chave.chave_publica = crypto.randomBytes(32).toString('base64');
    }

    this.chaves.set(id, chave);
    return chave;
  }

  /**
   * Rotaciona chaves de encriptação
   */
  async rotacionarChaves(
    tipo: TipoChave,
    ambiente: 'PRODUCAO' | 'STAGING' | 'DESENVOLVIMENTO'
  ): Promise<{
    chave_antiga: ChaveEncriptacao;
    chave_nova: ChaveEncriptacao;
    tempo_execucao_ms: number;
  }> {
    const inicio = Date.now();

    // Encontrar chave ativa atual
    const chaveAtiga = Array.from(this.chaves.values()).find(
      c =>
        c.tipo === tipo &&
        c.ambiente === ambiente &&
        c.status === StatusChave.ATIVA
    );

    if (!chaveAtiga) {
      throw new Error(`Chave ativa não encontrada para ${tipo} em ${ambiente}`);
    }

    // Marcar como rotacionando
    chaveAtiga.status = StatusChave.ROTACIONANDO;
    chaveAtiga.rotacoes_pendentes = 0;
    chaveAtiga.updatedAt = new Date();

    // Criar nova chave
    const chaveNova = this.criarChaveEncriptacao(tipo, chaveAtiga.algoritmo, ambiente);

    // Simular rotação de dados (seria em produção: re-encriptar todos os dados)
    await this.simularRotacaoDados(chaveAtiga, chaveNova);

    // Marcar antiga como rotacionada
    chaveAtiga.status = StatusChave.ROTACIONADA;
    chaveAtiga.updatedAt = new Date();

    const tempoExecucao = Date.now() - inicio;

    return {
      chave_antiga: chaveAtiga,
      chave_nova: chaveNova,
      tempo_execucao_ms: tempoExecucao
    };
  }

  /**
   * Simula rotação de dados
   */
  private async simularRotacaoDados(
    chaveAntiga: ChaveEncriptacao,
    chaveNova: ChaveEncriptacao
  ): Promise<void> {
    // Em produção, isso re-encriptaria todos os dados
    // Para este protótipo, apenas simulamos o processo
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Valida certificado TLS
   */
  async validarCertificado(domain: string): Promise<{
    valido: boolean;
    dias_para_vencimento: number;
    avisos: string[];
  }> {
    const cert = this.certificados.get(domain);

    if (!cert) {
      return {
        valido: false,
        dias_para_vencimento: -1,
        avisos: [`Certificado não encontrado para ${domain}`]
      };
    }

    const agora = new Date();
    const diasParaVencimento = Math.floor(
      (cert.valido_ate.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24)
    );

    const avisos: string[] = [];
    let valido = true;

    if (diasParaVencimento < 0) {
      avisos.push('Certificado vencido');
      valido = false;
      cert.status = 'VENCIDO';
    } else if (diasParaVencimento < 30) {
      avisos.push('Certificado próximo ao vencimento');
      cert.status = 'PROXIMA_VENCIMENTO';
      valido = false;
    } else {
      cert.status = 'VALIDO';
    }

    if (agora < cert.valido_de) {
      avisos.push('Certificado ainda não é válido');
      valido = false;
    }

    cert.dias_para_vencimento = diasParaVencimento;
    cert.updatedAt = new Date();

    return {
      valido,
      dias_para_vencimento: diasParaVencimento,
      avisos
    };
  }

  /**
   * Obtém chave ativa para algoritmo
   */
  private obterChaveAtiva(
    algoritmo: TipoCriptografia,
    ambiente: 'PRODUCAO' | 'STAGING' | 'DESENVOLVIMENTO'
  ): ChaveEncriptacao | null {
    const chaves = Array.from(this.chaves.values()).filter(
      c =>
        c.algoritmo === algoritmo &&
        c.ambiente === ambiente &&
        c.status === StatusChave.ATIVA
    );

    if (chaves.length === 0) return null;

    // Retornar chave mais recente
    return chaves.sort((a, b) => b.versao - a.versao)[0];
  }

  /**
   * Obtém estatísticas de encriptação
   */
  obterEstatisticas(): {
    total_operacoes: number;
    total_chaves: number;
    chaves_ativas: number;
    chaves_rotacionadas: number;
    certificados_validos: number;
    certificados_vencidos: number;
    dias_medio_para_vencimento: number;
  } {
    const chaves = Array.from(this.chaves.values());
    const chavesAticas = chaves.filter(c => c.status === StatusChave.ATIVA).length;
    const chavasRotacionadas = chaves.filter(c => c.status === StatusChave.ROTACIONADA).length;

    const certs = Array.from(this.certificados.values());
    const certsValidos = certs.filter(c => c.status === 'VALIDO').length;
    const certsVencidos = certs.filter(c => c.status === 'VENCIDO').length;
    const diasMedio =
      certs.length > 0
        ? Math.round(certs.reduce((sum, c) => sum + c.dias_para_vencimento, 0) / certs.length)
        : 0;

    return {
      total_operacoes: this.historicoCriptografia.length,
      total_chaves: chaves.length,
      chaves_ativas: chavesAticas,
      chaves_rotacionadas: chavasRotacionadas,
      certificados_validos: certsValidos,
      certificados_vencidos: certsVencidos,
      dias_medio_para_vencimento: diasMedio
    };
  }

  /**
   * Registra certificado TLS
   */
  registrarCertificado(
    domain: string,
    certificado_pem: string,
    chave_privada_pem: string,
    assinante: string,
    dias_validade: number = 365
  ): CertificadoTLS {
    const agora = new Date();
    const validoAte = new Date(agora.getTime() + dias_validade * 24 * 60 * 60 * 1000);

    const cert: CertificadoTLS = {
      id: uuidv4(),
      domain,
      certificado_pem,
      chave_privada_pem,
      assinante,
      valido_de: agora,
      valido_ate: validoAte,
      versao_tls: '1.3',
      cipher_suites: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256'
      ],
      pinned: true,
      status: 'VALIDO',
      dias_para_vencimento: dias_validade,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.certificados.set(domain, cert);
    return cert;
  }

  /**
   * Obtém chaves
   */
  obterChaves(): ChaveEncriptacao[] {
    return Array.from(this.chaves.values());
  }

  /**
   * Obtém certificados
   */
  obterCertificados(): CertificadoTLS[] {
    return Array.from(this.certificados.values());
  }

  /**
   * Obtém políticas
   */
  obterPoliticas(): PoliticaEncriptacao[] {
    return Array.from(this.politicas.values());
  }

  /**
   * Calcula força da encriptação
   */
  calcularForcaEncriptacao(): {
    score: number;
    nivelSeguranca: 'CRITICO' | 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO_ALTO';
    recomendacoes: string[];
  } {
    let score = 100;
    const recomendacoes: string[] = [];

    // Verificar chaves antigas
    const chavasAntiga = Array.from(this.chaves.values()).filter(
      c => new Date().getTime() - c.criada_em.getTime() > 180 * 24 * 60 * 60 * 1000
    );

    if (chavasAntiga.length > 0) {
      score -= chavasAntiga.length * 5;
      recomendacoes.push(`${chavasAntiga.length} chaves com mais de 6 meses - considere rotação`);
    }

    // Verificar certificados
    const certVencidos = Array.from(this.certificados.values()).filter(
      c => c.dias_para_vencimento < 30
    );

    if (certVencidos.length > 0) {
      score -= certVencidos.length * 10;
      recomendacoes.push(`${certVencidos.length} certificados próximos ao vencimento`);
    }

    // Verificar TLS 1.3
    const semTls13 = Array.from(this.certificados.values()).filter(
      c => c.versao_tls !== '1.3'
    );

    if (semTls13.length > 0) {
      score -= 15;
      recomendacoes.push('Alguns certificados não usam TLS 1.3 - atualize para TLS 1.3');
    }

    let nivelSeguranca: 'CRITICO' | 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO_ALTO' = 'ALTO';
    if (score < 50) {
      nivelSeguranca = 'CRITICO';
    } else if (score < 70) {
      nivelSeguranca = 'BAIXO';
    } else if (score < 85) {
      nivelSeguranca = 'MEDIO';
    } else if (score >= 95) {
      nivelSeguranca = 'CRITICO_ALTO';
    }

    return {
      score: Math.max(0, score),
      nivelSeguranca,
      recomendacoes
    };
  }
}
