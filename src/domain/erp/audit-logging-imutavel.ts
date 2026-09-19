/**
 * Phase 7e: Audit Logging & Immutable Records (WORM)
 * Immutable audit log with blockchain-like chaining
 * Tamper detection and verification
 */

import { v4 as uuidv4 } from 'uuid';

// BUG REAL corrigido (achado ao integrar este módulo, até então órfão, ao Painel de
// Auditoria): `import * as crypto from 'crypto'` é o módulo nativo do Node — não existe
// no navegador. Este código roda no cliente (sql.js em WASM, sem backend), então ao ser
// finalmente chamado por uma tela de verdade, o bundler (Vite) externaliza o import e a
// primeira chamada a `crypto.createHash(...)` estoura em runtime: "Module 'crypto' has
// been externalized for browser compatibility". `npx vite build` confirma o aviso de
// externalização; os testes deste módulo nunca pegam o problema porque rodam sob Vitest
// em Node, onde o `crypto` do Node existe de verdade.
// A correção usa a Web Crypto API (`crypto.subtle`, global do navegador — e também do
// Node 19+, então os testes continuam passando), o mesmo mecanismo já usado em
// `src/domain/backupIntegridade.ts` para o hash do arquivo de backup real do app. Isso
// obriga `gerarHash`/`gerarAssinatura`/`validarAssinatura`/`calcularMerkleRoot` a virar
// assíncronas — todos os chamadores já são métodos `async`, então o único ponto afetado
// fora deles é o bloco de gênesis, criado no construtor (síncrono): em vez de chamar
// gerarHash ali, usa-se o hash SHA-256 de 'GENESIS' e de '' pré-calculado (são sempre a
// mesma string de entrada, logo sempre o mesmo hash — não há nada para recalcular).
async function sha256Hex(conteudo: string): Promise<string> {
  const bytes = new TextEncoder().encode(conteudo);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 de 'GENESIS', pré-calculado (ver nota acima). */
const HASH_GENESIS = '901131d838b17aac0f7885b81e03cbdc9f5157a00343d30ab22083685ed1416a';
/** SHA-256 da string vazia, pré-calculado. */
const HASH_VAZIO = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export enum TipoOperacao {
  LEITURA = 'LEITURA',
  CRIACAO = 'CRIACAO',
  ATUALIZACAO = 'ATUALIZACAO',
  DELECAO = 'DELECAO',
  EXPORTACAO = 'EXPORTACAO',
  IMPORTACAO = 'IMPORTACAO',
  AUTENTICACAO = 'AUTENTICACAO',
  AUTORIZACAO = 'AUTORIZACAO',
  CONFIGURACAO = 'CONFIGURACAO'
}

export enum NivelSensibilidade {
  PUBLICO = 'PUBLICO',
  INTERNO = 'INTERNO',
  CONFIDENCIAL = 'CONFIDENCIAL',
  RESTRITO = 'RESTRITO'
}

export interface RegistroAudit {
  id: string;
  sequencia: number;
  timestamp: Date;
  usuario_id: string;
  usuario_email: string;
  tipo_operacao: TipoOperacao;
  entidade_tipo: string;
  entidade_id: string;
  entidade_descricao: string;
  dados_anteriores?: Record<string, any>;
  dados_novos?: Record<string, any>;
  endereco_ip: string;
  user_agent: string;
  resultado: 'SUCESSO' | 'FALHA' | 'PARCIAL';
  mensagem_erro?: string;
  nivel_sensibilidade: NivelSensibilidade;
  motivo: string;
  aprovado_por?: string;
  hash_registro: string;
  hash_anterior: string;
  assinatura_digital?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CadeiaBlocos {
  numero_bloco: number;
  timestamp: Date;
  registros_quantidade: number;
  hash_bloco: string;
  hash_bloco_anterior: string;
  merkle_root: string;
  nonce: number;
  verificado: boolean;
  data_verificacao: Date | null;
}

export interface ResultadoVerificacao {
  integro: boolean;
  registros_verificados: number;
  registros_corrompidos: number;
  blocos_verificados: number;
  blocos_corrompidos: number;
  primeiro_erro_sequencia?: number;
  detalhes: string[];
  timestamp_verificacao: Date;
}

export interface ConsentimentoAuditoria {
  id: string;
  usuario_id: string;
  tipo_consentimento: 'AUDITORIA' | 'RASTREAMENTO' | 'EXPORTACAO';
  concedido: boolean;
  data_concessao: Date;
  data_revogacao?: Date;
  motivo: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelatorioAudit {
  id: string;
  titulo: string;
  filtros: {
    data_inicio: Date;
    data_fim: Date;
    usuarios?: string[];
    tipos_operacao?: TipoOperacao[];
    entidades?: string[];
    resultado?: 'SUCESSO' | 'FALHA' | 'PARCIAL';
  };
  registros_encontrados: number;
  operacoes_por_tipo: Record<TipoOperacao, number>;
  usuarios_ativos: string[];
  entidades_afetadas: Record<string, number>;
  taxa_sucesso_percentual: number;
  avisos: string[];
  criado_por: string;
  assinado_digitalmente: boolean;
  createdAt: Date;
}

export class GerenciadorAuditLoggingImutavel {
  private registros: RegistroAudit[] = [];
  private blocos: Map<number, CadeiaBlocos> = new Map();
  private consentimentos: Map<string, ConsentimentoAuditoria> = new Map();
  private relatorios: RelatorioAudit[] = [];

  private sequenciaAtual = 0;
  private blocoAtual = 0;
  private tamanhoBlockoRegistros = 1000;

  constructor() {
    this.criarBlocoGenesis();
  }

  /**
   * Cria bloco de gênesis
   */
  private criarBlocoGenesis(): void {
    const blocoGenesis: CadeiaBlocos = {
      numero_bloco: 0,
      timestamp: new Date(),
      registros_quantidade: 0,
      hash_bloco: HASH_GENESIS,
      hash_bloco_anterior: '0x0000',
      merkle_root: HASH_VAZIO,
      nonce: 0,
      verificado: true,
      data_verificacao: new Date()
    };

    this.blocos.set(0, blocoGenesis);
    this.blocoAtual = 0;
  }

  /**
   * Registra operação no audit log (imutável)
   */
  async registrarAudit(
    usuario_id: string,
    usuario_email: string,
    tipo_operacao: TipoOperacao,
    entidade_tipo: string,
    entidade_id: string,
    entidade_descricao: string,
    endereco_ip: string,
    user_agent: string,
    resultado: 'SUCESSO' | 'FALHA' | 'PARCIAL',
    motivo: string,
    nivel_sensibilidade: NivelSensibilidade = NivelSensibilidade.INTERNO,
    dados_anteriores?: Record<string, any>,
    dados_novos?: Record<string, any>,
    mensagem_erro?: string
  ): Promise<RegistroAudit> {
    this.sequenciaAtual++;

    // Calcular hash do registro anterior
    const hashAnterior =
      this.registros.length > 0
        ? this.registros[this.registros.length - 1].hash_registro
        : this.blocos.get(0)?.hash_bloco || '0x0000';

    // Criar registro
    const conteudoRegistro = JSON.stringify({
      sequencia: this.sequenciaAtual,
      timestamp: new Date(),
      usuario_id,
      tipo_operacao,
      entidade_tipo,
      entidade_id,
      resultado,
      motivo
    });

    const hashRegistro = await this.gerarHash(conteudoRegistro + hashAnterior);
    const assinatura = await this.gerarAssinatura(hashRegistro);

    const registro: RegistroAudit = {
      id: uuidv4(),
      sequencia: this.sequenciaAtual,
      timestamp: new Date(),
      usuario_id,
      usuario_email,
      tipo_operacao,
      entidade_tipo,
      entidade_id,
      entidade_descricao,
      dados_anteriores: this.sanitizarDados(dados_anteriores),
      dados_novos: this.sanitizarDados(dados_novos),
      endereco_ip,
      user_agent,
      resultado,
      mensagem_erro,
      nivel_sensibilidade,
      motivo,
      hash_registro: hashRegistro,
      hash_anterior: hashAnterior,
      assinatura_digital: assinatura,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Adicionar ao registro imutável
    this.registros.push(registro);

    // Verificar se precisa criar novo bloco
    const blocoAtualObj = this.blocos.get(this.blocoAtual);
    if (blocoAtualObj && blocoAtualObj.registros_quantidade >= this.tamanhoBlockoRegistros) {
      await this.finalizarBlocoAtual();
      this.criarNovoBlocoVazio();
    } else if (blocoAtualObj) {
      blocoAtualObj.registros_quantidade++;
    }

    return registro;
  }

  /**
   * Finaliza bloco atual e cria novo
   */
  private async finalizarBlocoAtual(): Promise<void> {
    const bloco = this.blocos.get(this.blocoAtual);
    if (!bloco) return;

    // Calcular Merkle root dos registros do bloco
    const registrosDoBloco = this.registros.slice(-bloco.registros_quantidade);
    bloco.merkle_root = await this.calcularMerkleRoot(registrosDoBloco);

    // Proof of Work simulado
    bloco.hash_bloco = await this.gerarHash(
      JSON.stringify({
        numero: bloco.numero_bloco,
        timestamp: bloco.timestamp,
        merkle_root: bloco.merkle_root,
        nonce: bloco.nonce
      })
    );

    bloco.verificado = true;
    bloco.data_verificacao = new Date();
  }

  /**
   * Cria novo bloco vazio
   */
  private criarNovoBlocoVazio(): void {
    this.blocoAtual++;
    const blocoAnterior = this.blocos.get(this.blocoAtual - 1);

    const novoBloco: CadeiaBlocos = {
      numero_bloco: this.blocoAtual,
      timestamp: new Date(),
      registros_quantidade: 0,
      hash_bloco: '0x' + '0'.repeat(64),
      hash_bloco_anterior: blocoAnterior?.hash_bloco || '0x0000',
      merkle_root: HASH_VAZIO,
      nonce: 0,
      verificado: false,
      data_verificacao: null
    };

    this.blocos.set(this.blocoAtual, novoBloco);
  }

  /**
   * Valida integridade da cadeia
   */
  async validarIntegridade(): Promise<ResultadoVerificacao> {
    const detalhes: string[] = [];
    let registrosCorrompidos = 0;
    let blocosCorrompidos = 0;
    let primeiroErroSequencia: number | undefined;

    // Validar sequência de registros
    let hashAnterior = this.blocos.get(0)?.hash_bloco || '0x0000';

    for (let i = 0; i < this.registros.length; i++) {
      const registro = this.registros[i];

      // Verificar hash anterior
      if (registro.hash_anterior !== hashAnterior) {
        registrosCorrompidos++;
        if (!primeiroErroSequencia) primeiroErroSequencia = i;
        detalhes.push(`Registro ${i}: Hash anterior inválido`);
      }

      // Verificar assinatura digital
      const assinaturaValida = await this.validarAssinatura(registro.hash_registro, registro.assinatura_digital || '');
      if (!assinaturaValida) {
        registrosCorrompidos++;
        if (!primeiroErroSequencia) primeiroErroSequencia = i;
        detalhes.push(`Registro ${i}: Assinatura digital inválida`);
      }

      hashAnterior = registro.hash_registro;
    }

    // Validar blocos
    let blocoAnterior = this.blocos.get(0);
    for (let i = 1; i <= this.blocoAtual; i++) {
      const blocoAtual = this.blocos.get(i);
      if (!blocoAtual) continue;

      if (blocoAtual.hash_bloco_anterior !== (blocoAnterior?.hash_bloco || '0x0000')) {
        blocosCorrompidos++;
        detalhes.push(`Bloco ${i}: Hash anterior inválido`);
      }

      blocoAnterior = blocoAtual;
    }

    const integro = registrosCorrompidos === 0 && blocosCorrompidos === 0;

    return {
      integro,
      registros_verificados: this.registros.length,
      registros_corrompidos: registrosCorrompidos,
      blocos_verificados: this.blocos.size,
      blocos_corrompidos: blocosCorrompidos,
      primeiro_erro_sequencia: primeiroErroSequencia,
      detalhes,
      timestamp_verificacao: new Date()
    };
  }

  /**
   * Consulta audit log com filtros
   */
  async consultarAudit(filtros: {
    data_inicio?: Date;
    data_fim?: Date;
    usuario_id?: string;
    tipos_operacao?: TipoOperacao[];
    entidade_tipo?: string;
    resultado?: 'SUCESSO' | 'FALHA' | 'PARCIAL';
    limite?: number;
  }): Promise<RegistroAudit[]> {
    let resultado = [...this.registros];

    if (filtros.data_inicio) {
      resultado = resultado.filter(r => r.timestamp >= filtros.data_inicio!);
    }

    if (filtros.data_fim) {
      resultado = resultado.filter(r => r.timestamp <= filtros.data_fim!);
    }

    if (filtros.usuario_id) {
      resultado = resultado.filter(r => r.usuario_id === filtros.usuario_id);
    }

    if (filtros.tipos_operacao && filtros.tipos_operacao.length > 0) {
      resultado = resultado.filter(r => filtros.tipos_operacao!.includes(r.tipo_operacao));
    }

    if (filtros.entidade_tipo) {
      resultado = resultado.filter(r => r.entidade_tipo === filtros.entidade_tipo);
    }

    if (filtros.resultado) {
      resultado = resultado.filter(r => r.resultado === filtros.resultado);
    }

    // Ordenar por sequência (mais recentes primeiro)
    resultado.sort((a, b) => b.sequencia - a.sequencia);

    if (filtros.limite) {
      resultado = resultado.slice(0, filtros.limite);
    }

    return resultado;
  }

  /**
   * Exporta audit log (com assinatura digital)
   */
  async exportarAudit(filtros?: any): Promise<{
    arquivo_url: string;
    checksum: string;
    data_exportacao: Date;
    assinado: boolean;
    quantidade_registros: number;
  }> {
    const registrosFiltrados = await this.consultarAudit(filtros || {});

    const conteudo = JSON.stringify(registrosFiltrados, null, 2);
    const checksum = await this.gerarHash(conteudo);
    const assinatura = await this.gerarAssinatura(checksum);

    // Simular upload para armazenamento seguro
    const arquivoUrl = `s3://erp-audit-logs/exports/audit-${new Date().toISOString()}.json.gpg`;

    return {
      arquivo_url: arquivoUrl,
      checksum,
      data_exportacao: new Date(),
      assinado: true,
      quantidade_registros: registrosFiltrados.length
    };
  }

  /**
   * Gera relatório de auditoria
   */
  async gerarRelatorio(filtros: {
    data_inicio: Date;
    data_fim: Date;
    usuarios?: string[];
    tipos_operacao?: TipoOperacao[];
    entidades?: string[];
  }): Promise<RelatorioAudit> {
    const registrosFiltrados = await this.consultarAudit({
      data_inicio: filtros.data_inicio,
      data_fim: filtros.data_fim,
      usuario_id: filtros.usuarios?.[0],
      tipos_operacao: filtros.tipos_operacao,
      entidade_tipo: filtros.entidades?.[0]
    });

    // Calcular estatísticas
    const operacoesPorTipo: Record<string, number> = {};
    const usuariosAtivos = new Set<string>();
    const entidadesAfetadas: Record<string, number> = {};
    let sucessos = 0;

    for (const registro of registrosFiltrados) {
      // Contar por tipo
      operacoesPorTipo[registro.tipo_operacao] = (operacoesPorTipo[registro.tipo_operacao] || 0) + 1;

      // Usuarios ativos
      usuariosAtivos.add(registro.usuario_email);

      // Entidades
      entidadesAfetadas[registro.entidade_tipo] = (entidadesAfetadas[registro.entidade_tipo] || 0) + 1;

      // Taxa de sucesso
      if (registro.resultado === 'SUCESSO') sucessos++;
    }

    const taxaSucesso =
      registrosFiltrados.length > 0 ? (sucessos / registrosFiltrados.length) * 100 : 0;

    const relatorio: RelatorioAudit = {
      id: uuidv4(),
      titulo: `Relatório de Auditoria - ${filtros.data_inicio.toISOString()} a ${filtros.data_fim.toISOString()}`,
      filtros,
      registros_encontrados: registrosFiltrados.length,
      operacoes_por_tipo: operacoesPorTipo as Record<TipoOperacao, number>,
      usuarios_ativos: Array.from(usuariosAtivos),
      entidades_afetadas: entidadesAfetadas,
      taxa_sucesso_percentual: Math.round(taxaSucesso * 100) / 100,
      avisos: this.gerarAvisosRelatorio(registrosFiltrados),
      criado_por: 'System',
      assinado_digitalmente: true,
      createdAt: new Date()
    };

    this.relatorios.push(relatorio);
    return relatorio;
  }

  /**
   * Registra consentimento
   */
  async registrarConsentimento(
    usuario_id: string,
    tipo_consentimento: 'AUDITORIA' | 'RASTREAMENTO' | 'EXPORTACAO',
    concedido: boolean,
    motivo: string
  ): Promise<ConsentimentoAuditoria> {
    const consentimento: ConsentimentoAuditoria = {
      id: uuidv4(),
      usuario_id,
      tipo_consentimento,
      concedido,
      data_concessao: new Date(),
      motivo,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.consentimentos.set(`${usuario_id}-${tipo_consentimento}`, consentimento);

    // Registrar no audit log
    await this.registrarAudit(
      'SISTEMA',
      'system@erp.com',
      TipoOperacao.AUTORIZACAO,
      'ConsentimentoAuditoria',
      consentimento.id,
      `Consentimento ${tipo_consentimento}: ${concedido ? 'CONCEDIDO' : 'NEGADO'}`,
      '0.0.0.0',
      'System',
      'SUCESSO',
      motivo,
      NivelSensibilidade.CONFIDENCIAL
    );

    return consentimento;
  }

  /**
   * Obtém registros para sujeito de dados
   */
  async obterRegistrosPessoais(usuario_id: string): Promise<RegistroAudit[]> {
    // Verificar consentimento
    const consentimento = this.consentimentos.get(`${usuario_id}-AUDITORIA`);
    if (!consentimento?.concedido) {
      throw new Error('Consentimento para acesso a registros não concedido');
    }

    return this.registros.filter(r => r.usuario_id === usuario_id);
  }

  /**
   * Sanitiza dados sensíveis
   */
  private sanitizarDados(dados?: Record<string, any>): Record<string, any> | undefined {
    if (!dados) return undefined;

    const sanitizado = { ...dados };
    const camposSensiveis = ['senha', 'token', 'cpf', 'numero_conta', 'chave_nf'];

    for (const campo of camposSensiveis) {
      if (campo in sanitizado) {
        sanitizado[campo] = '[REDACTED]';
      }
    }

    return sanitizado;
  }

  /**
   * Gera hash SHA256 (Web Crypto API — ver nota no topo do arquivo sobre por que não é
   * o módulo `crypto` do Node)
   */
  private async gerarHash(conteudo: string): Promise<string> {
    return sha256Hex(conteudo);
  }

  /**
   * Gera assinatura digital simulada
   */
  private async gerarAssinatura(hash: string): Promise<string> {
    return sha256Hex(hash + 'PRIVATE_KEY');
  }

  /**
   * Valida assinatura digital
   */
  private async validarAssinatura(hash: string, assinatura: string): Promise<boolean> {
    const assinaturaEsperada = await this.gerarAssinatura(hash);
    return assinatura === assinaturaEsperada;
  }

  /**
   * Calcula Merkle root
   */
  private async calcularMerkleRoot(registros: RegistroAudit[]): Promise<string> {
    if (registros.length === 0) return HASH_VAZIO;

    let hashes = registros.map(r => r.hash_registro);

    while (hashes.length > 1) {
      const novasHashes: string[] = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const hash1 = hashes[i];
        const hash2 = hashes[i + 1] || hashes[i];
        novasHashes.push(await this.gerarHash(hash1 + hash2));
      }
      hashes = novasHashes;
    }

    return hashes[0];
  }

  /**
   * Gera avisos do relatório
   */
  private gerarAvisosRelatorio(registros: RegistroAudit[]): string[] {
    const avisos: string[] = [];

    // Falhas detectadas
    const falhas = registros.filter(r => r.resultado === 'FALHA');
    if (falhas.length > 0) {
      avisos.push(`${falhas.length} operações falhadas detectadas`);
    }

    // Operações de exclusão
    const delecoes = registros.filter(r => r.tipo_operacao === TipoOperacao.DELECAO);
    if (delecoes.length > 0) {
      avisos.push(`${delecoes.length} operações de exclusão registradas`);
    }

    return avisos;
  }

  /**
   * Obtém estatísticas gerais
   */
  obterEstatisticas(): {
    total_registros: number;
    total_blocos: number;
    sequencia_atual: number;
    integridade_verificada: boolean;
    data_ultima_verificacao: Date | null;
    registros_por_tipo: Record<TipoOperacao, number>;
  } {
    const registrosPorTipo: Record<string, number> = {};

    for (const registro of this.registros) {
      registrosPorTipo[registro.tipo_operacao] =
        (registrosPorTipo[registro.tipo_operacao] || 0) + 1;
    }

    const ultimoBloco = this.blocos.get(this.blocoAtual);

    return {
      total_registros: this.registros.length,
      total_blocos: this.blocos.size,
      sequencia_atual: this.sequenciaAtual,
      integridade_verificada: ultimoBloco?.verificado || false,
      data_ultima_verificacao: ultimoBloco?.data_verificacao || null,
      registros_por_tipo: registrosPorTipo as Record<TipoOperacao, number>
    };
  }
}
