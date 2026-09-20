/**
 * Phase 7e: Audit Logging & Immutable Records (WORM)
 * Immutable audit log with blockchain-like chaining
 * Tamper detection and verification
 */

import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sql.js';

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

// ─── Persistência em `auditoria_log` (achado ao dar sobrevida real à trilha do Painel de
// Auditoria — ver singletons.ts e o relatório da tarefa) ──────────────────────────────
//
// Este gerenciador guardava tudo só em memória (arrays/Maps da instância): um F5 zerava a
// trilha inteira. A tabela `auditoria_log` (contabilidade-reconstituicao/schema.sql) existe
// para isso, mas foi desenhada e já é usada por `compliance-audit-log.ts` — módulo síncrono,
// ainda com o bug do `crypto` do Node (import proibido no navegador) e coberto por um teste
// síncrono (integracao-externa-completa.test.ts) que quebraria se ele virasse assíncrono
// para trocar para Web Crypto. Reescrever aquele módulo estava fora do escopo desta tarefa
// (exigiria editar aquele teste). Por isso a persistência foi dada a ESTE gerenciador (já
// assíncrono, já corrigido para Web Crypto, e já é o que o Painel usa) escrevendo direto na
// mesma tabela com sua própria série de colunas → hash, sem depender de
// `compliance-audit-log.ts`. As duas fontes nunca se misturam: cada linha carrega
// `modulo_chamador = MODULO_LOCAL`, e todo SELECT daqui filtra por isso.

/** Identifica, na coluna `modulo_chamador`, as linhas de `auditoria_log` escritas por este
 * gerenciador — distingue de qualquer outra fonte que também grave nessa tabela (hoje
 * nenhuma: `compliance-audit-log.ts` continua sem uso por nenhuma tela). */
const MODULO_LOCAL = 'painel-auditoria';

/** `RegistroAudit.resultado` tem 3 estados; a coluna `status` de `auditoria_log` (também
 * usada por compliance-audit-log.ts) usa outro vocabulário. Mapeamento fixo nos dois
 * sentidos. */
const MAPA_STATUS: Record<'SUCESSO' | 'FALHA' | 'PARCIAL', string> = {
  SUCESSO: 'sucesso',
  FALHA: 'erro',
  PARCIAL: 'pendente',
};
const MAPA_STATUS_REVERSO: Record<string, 'SUCESSO' | 'FALHA' | 'PARCIAL'> = {
  sucesso: 'SUCESSO',
  erro: 'FALHA',
  pendente: 'PARCIAL',
};

/** `usuario_id` em memória é uma string livre ("operador-local"); a coluna `usuario_id` de
 * `auditoria_log` é INTEGER. Gravar a string ali sofreria conversão de afinidade do SQLite
 * sempre que o valor parecer um inteiro puro (um id "123" viraria o número 123 na leitura, e
 * a releitura para o hash deixaria de bater com o que foi gravado). Em vez de arriscar essa
 * armadilha, id e e-mail vão compostos, sempre como TEXTO, em `usuario_nome` — `usuario_id`
 * fica sempre NULL aqui. */
function combinarUsuario(usuario_id: string, usuario_email: string): string {
  return `${usuario_id} <${usuario_email}>`;
}
function separarUsuario(usuarioNome: string): [string, string] {
  const m = /^(.*) <(.*)>$/.exec(usuarioNome);
  return m ? [m[1], m[2]] : [usuarioNome, ''];
}

/** Mesmo problema de afinidade de `usuario_id`, agora para `id_entidade` (INTEGER) contra
 * `entidade_id` (string livre — uuid, slug...). Quando não é um inteiro puro grava-se NULL
 * na coluna; o valor original não se perde porque `descricao_alteracao` o embute por
 * extenso (ver embutirEntidadeId/separarEntidadeId). */
function idEntidadeNumerico(entidade_id: string): number | null {
  return /^\d+$/.test(entidade_id) ? Number(entidade_id) : null;
}

const SEPARADOR_ENTIDADE_ID = '\u0001';
function embutirEntidadeId(entidade_id: string, entidade_descricao: string): string {
  return `${entidade_id}${SEPARADOR_ENTIDADE_ID}${entidade_descricao}`;
}
function separarEntidadeId(descricaoArmazenada: string): [string, string] {
  const indice = descricaoArmazenada.indexOf(SEPARADOR_ENTIDADE_ID);
  if (indice === -1) return ['', descricaoArmazenada];
  return [descricaoArmazenada.slice(0, indice), descricaoArmazenada.slice(indice + 1)];
}

/** Campos que compõem o hash de cada registro persistido — EXATAMENTE os mesmos valores
 * gravados nas colunas correspondentes de `auditoria_log`, na mesma ordem (ver
 * `serializarCampos`). É isso que torna a verificação capaz de detectar adulteração: ela
 * reconstrói este objeto a partir da LINHA do banco e recalcula o hash — se qualquer coluna,
 * inclusive `valor_novo`/`valor_anterior`, foi alterada por um UPDATE direto no banco depois
 * do INSERT original, o hash recalculado não bate mais com `hash_sha256`. */
interface CamposParaHash {
  timestamp: string;
  usuario_nome: string;
  ip_origem: string;
  modulo_chamador: string;
  tipo_operacao: string;
  entidade_afetada: string;
  id_entidade: number | null;
  descricao_alteracao: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  status: string;
  mensagem_erro: string | null;
}

/** Serialização única usada tanto para calcular o hash na gravação quanto para
 * recalculá-lo na verificação — a ORDEM das chaves do objeto literal precisa ser idêntica
 * nos dois lugares (registrarAudit / validarIntegridadeDoBanco) para o mesmo conteúdo
 * produzir o mesmo hash. */
function serializarCampos(campos: CamposParaHash): string {
  return JSON.stringify(campos);
}

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

  /** Quando setado (via `definirBanco`), todo novo registro também é gravado em
   * `auditoria_log` e `validarIntegridade()` passa a reler do banco em vez de só da
   * memória do processo. `null` (padrão) preserva o comportamento 100% em memória de
   * sempre — é o que os testes que instanciam esta classe sem chamar `definirBanco`
   * continuam exercitando. */
  private db: Database | null = null;

  constructor() {
    this.criarBlocoGenesis();
  }

  /**
   * Liga este gerenciador a um banco sql.js real. A partir daqui todo novo registro
   * também é gravado na tabela `auditoria_log` (INSERT) e `validarIntegridade()` passa a
   * reler do banco em vez de só da memória do processo (ver o relatório da tarefa para o
   * porquê de dar persistência a este módulo em vez de trocar o Painel para
   * `compliance-audit-log.ts`).
   *
   * Troca de instância de banco (ex.: "Limpar tudo"/importar um .sqlite) descarta o que
   * estava em memória e recarrega a trilha inteira a partir do banco novo — sem isso, um
   * banco reiniciado deixaria registros "fantasma" de um banco que não existe mais na
   * tela. Passe `null` para voltar ao modo só-memória (ex.: banco ainda carregando).
   */
  definirBanco(db: Database | null): void {
    if (db === this.db) return;
    this.db = db;
    if (db) {
      this.hidratarDeBanco(db);
    }
  }

  /** Recarrega `this.registros` a partir das linhas já gravadas em `auditoria_log` — é o
   * que faz a trilha sobreviver a um F5: sem isto a tela ficaria vazia até a próxima ação
   * do operador, mesmo com histórico real salvo no arquivo .sqlite. */
  private hidratarDeBanco(db: Database): void {
    try {
      const resultado = db.exec(
        `SELECT timestamp, usuario_nome, ip_origem, tipo_operacao, entidade_afetada,
                descricao_alteracao, valor_anterior, valor_novo, hash_sha256, hash_anterior,
                status, mensagem_erro, assinatura_digital, criado_em
         FROM auditoria_log
         WHERE modulo_chamador = ?
         ORDER BY id ASC`,
        [MODULO_LOCAL],
      );

      const linhas = resultado[0]?.values ?? [];
      this.registros = linhas.map((linha, indice) => {
        const [
          timestamp, usuarioNomeArmazenado, ip_origem, tipo_operacao, entidade_afetada,
          descricaoArmazenada, valor_anterior, valor_novo, hash_sha256, hash_anterior,
          status, mensagem_erro, assinatura_digital, criado_em,
        ] = linha as any[];

        const [usuario_id, usuario_email] = separarUsuario(String(usuarioNomeArmazenado ?? ''));
        const [entidade_id, entidade_descricao] = separarEntidadeId(String(descricaoArmazenada ?? ''));
        const dataCriacao = new Date(String(criado_em ?? timestamp));

        const registroHidratado: RegistroAudit = {
          id: `db-${indice + 1}`,
          sequencia: indice + 1,
          timestamp: new Date(String(timestamp)),
          usuario_id,
          usuario_email,
          tipo_operacao: tipo_operacao as TipoOperacao,
          entidade_tipo: String(entidade_afetada ?? ''),
          entidade_id,
          entidade_descricao,
          dados_anteriores: valor_anterior ? JSON.parse(String(valor_anterior)) : undefined,
          dados_novos: valor_novo ? JSON.parse(String(valor_novo)) : undefined,
          endereco_ip: String(ip_origem ?? ''),
          user_agent: '',
          resultado: MAPA_STATUS_REVERSO[String(status)] ?? 'SUCESSO',
          mensagem_erro: mensagem_erro ? String(mensagem_erro) : undefined,
          nivel_sensibilidade: NivelSensibilidade.INTERNO,
          // `motivo` não tem coluna própria em `auditoria_log` — não sobrevive separado do
          // resto da descrição (ver embutirEntidadeId/CamposParaHash). Nenhuma informação
          // é perdida (o texto continua dentro de entidade_descricao), só deixa de aparecer
          // como uma coluna à parte depois de um reload.
          motivo: '',
          hash_registro: String(hash_sha256 ?? ''),
          hash_anterior: String(hash_anterior ?? ''),
          assinatura_digital: assinatura_digital ? String(assinatura_digital) : undefined,
          createdAt: dataCriacao,
          updatedAt: dataCriacao,
        };
        return registroHidratado;
      });

      this.sequenciaAtual = this.registros.length;
      const blocoGenesis = this.blocos.get(0);
      if (blocoGenesis) blocoGenesis.registros_quantidade = this.registros.length;
    } catch (erro) {
      console.error('Falha ao hidratar a trilha de auditoria a partir do banco:', erro);
      this.registros = [];
      this.sequenciaAtual = 0;
    }
  }

  /** Grava a linha correspondente a `registro` em `auditoria_log`. `campos` é o MESMO
   * objeto usado para calcular `registro.hash_registro` — reaproveitado aqui para garantir
   * que o que foi hasheado é exatamente o que vai para as colunas. */
  private persistirRegistro(db: Database, registro: RegistroAudit, campos: CamposParaHash): void {
    const dataRetencao = new Date(registro.createdAt);
    dataRetencao.setFullYear(dataRetencao.getFullYear() + 7);

    db.run(
      `INSERT INTO auditoria_log (
        timestamp, usuario_id, usuario_nome, ip_origem, modulo_chamador, tipo_operacao,
        entidade_afetada, id_entidade, descricao_alteracao, valor_anterior, valor_novo,
        hash_sha256, hash_anterior, status, mensagem_erro, tempo_processamento_ms,
        retencao_ate, assinado, assinatura_digital, criado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        campos.timestamp,
        null,
        campos.usuario_nome,
        campos.ip_origem,
        campos.modulo_chamador,
        campos.tipo_operacao,
        campos.entidade_afetada,
        campos.id_entidade,
        campos.descricao_alteracao,
        campos.valor_anterior,
        campos.valor_novo,
        registro.hash_registro,
        registro.hash_anterior,
        campos.status,
        campos.mensagem_erro,
        0,
        dataRetencao.toISOString().substring(0, 10),
        1,
        registro.assinatura_digital ?? null,
        registro.createdAt.toISOString(),
      ],
    );
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

    const agora = new Date();
    const dadosAnterioresSanitizados = this.sanitizarDados(dados_anteriores);
    const dadosNovosSanitizados = this.sanitizarDados(dados_novos);

    // Campos exatamente como vão para as colunas de `auditoria_log` — usados tanto para
    // calcular o hash quanto (quando há banco associado) para a linha persistida, de
    // propósito os MESMOS valores nos dois lugares (ver CamposParaHash). É isso que faz um
    // UPDATE direto em qualquer uma dessas colunas, inclusive `valor_novo`, ser detectável:
    // recalcular o hash a partir da linha do banco deixa de bater com `hash_sha256`.
    const campos: CamposParaHash = {
      timestamp: agora.toISOString(),
      usuario_nome: combinarUsuario(usuario_id, usuario_email),
      ip_origem: endereco_ip,
      modulo_chamador: MODULO_LOCAL,
      tipo_operacao,
      entidade_afetada: entidade_tipo,
      id_entidade: idEntidadeNumerico(entidade_id),
      descricao_alteracao: embutirEntidadeId(entidade_id, entidade_descricao),
      valor_anterior: dadosAnterioresSanitizados ? JSON.stringify(dadosAnterioresSanitizados) : null,
      valor_novo: dadosNovosSanitizados ? JSON.stringify(dadosNovosSanitizados) : null,
      status: MAPA_STATUS[resultado],
      mensagem_erro: mensagem_erro ?? null,
    };

    const hashRegistro = await this.gerarHash(serializarCampos(campos) + hashAnterior);
    const assinatura = await this.gerarAssinatura(hashRegistro);

    const registro: RegistroAudit = {
      id: uuidv4(),
      sequencia: this.sequenciaAtual,
      timestamp: agora,
      usuario_id,
      usuario_email,
      tipo_operacao,
      entidade_tipo,
      entidade_id,
      entidade_descricao,
      dados_anteriores: dadosAnterioresSanitizados,
      dados_novos: dadosNovosSanitizados,
      endereco_ip,
      user_agent,
      resultado,
      mensagem_erro,
      nivel_sensibilidade,
      motivo,
      hash_registro: hashRegistro,
      hash_anterior: hashAnterior,
      assinatura_digital: assinatura,
      createdAt: agora,
      updatedAt: agora
    };

    // Persistir ANTES de tocar no array em memória: se a escrita no banco falhar, o
    // chamador recebe o erro (nada de engolir em silêncio, como o bug histórico de
    // compliance-audit-log.ts gravando contra uma tabela inexistente) e a memória não fica
    // um passo à frente do que está realmente gravado no arquivo .sqlite.
    if (this.db) {
      this.persistirRegistro(this.db, registro, campos);
    }

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
    if (this.db) {
      return this.validarIntegridadeDoBanco(this.db);
    }

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
   * Verifica a cadeia relendo `auditoria_log` do BANCO (não a memória do processo):
   * recalcula o hash de cada linha a partir das próprias colunas gravadas e confere contra
   * `hash_sha256` — qualquer UPDATE direto no banco depois do INSERT original, inclusive em
   * `valor_novo`/`valor_anterior`, muda o conteúdo recalculado e portanto o hash, que deixa
   * de bater com o que foi gravado na hora do registro. Também confere a cadeia
   * (`hash_anterior` de cada linha contra o `hash_sha256` da linha anterior) e a assinatura
   * digital. `primeiro_erro_sequencia` é o índice (0-based, ordem de gravação) da primeira
   * linha em que qualquer uma dessas checagens falhar — sem ambiguidade sobre onde a cadeia
   * quebrou.
   */
  private async validarIntegridadeDoBanco(db: Database): Promise<ResultadoVerificacao> {
    const detalhes: string[] = [];
    let registrosCorrompidos = 0;
    let primeiroErroSequencia: number | undefined;

    const resultado = db.exec(
      `SELECT id, timestamp, usuario_nome, ip_origem, modulo_chamador, tipo_operacao,
              entidade_afetada, id_entidade, descricao_alteracao, valor_anterior, valor_novo,
              hash_sha256, hash_anterior, status, mensagem_erro, assinatura_digital
       FROM auditoria_log
       WHERE modulo_chamador = ?
       ORDER BY id ASC`,
      [MODULO_LOCAL],
    );

    const linhas = resultado[0]?.values ?? [];
    let hashAnteriorEsperado = this.blocos.get(0)?.hash_bloco || '0x0000';

    for (let indice = 0; indice < linhas.length; indice++) {
      const [
        id, timestamp, usuario_nome, ip_origem, modulo_chamador, tipo_operacao,
        entidade_afetada, id_entidade, descricao_alteracao, valor_anterior, valor_novo,
        hashGravado, hashAnteriorGravado, status, mensagem_erro, assinatura,
      ] = linhas[indice] as any[];

      let registroOk = true;
      const hashAnteriorGravadoStr = String(hashAnteriorGravado ?? '');

      if (hashAnteriorGravadoStr !== hashAnteriorEsperado) {
        registroOk = false;
        detalhes.push(
          `Registro #${id} (índice ${indice}): hash_anterior não confere com o registro anterior da cadeia`,
        );
      }

      const campos: CamposParaHash = {
        timestamp: String(timestamp ?? ''),
        usuario_nome: String(usuario_nome ?? ''),
        ip_origem: String(ip_origem ?? ''),
        modulo_chamador: String(modulo_chamador ?? ''),
        tipo_operacao: String(tipo_operacao ?? ''),
        entidade_afetada: String(entidade_afetada ?? ''),
        id_entidade: id_entidade === null || id_entidade === undefined ? null : Number(id_entidade),
        descricao_alteracao: String(descricao_alteracao ?? ''),
        valor_anterior: valor_anterior === null || valor_anterior === undefined ? null : String(valor_anterior),
        valor_novo: valor_novo === null || valor_novo === undefined ? null : String(valor_novo),
        status: String(status ?? ''),
        mensagem_erro: mensagem_erro === null || mensagem_erro === undefined ? null : String(mensagem_erro),
      };

      const hashRecalculado = await this.gerarHash(serializarCampos(campos) + hashAnteriorGravadoStr);
      const hashGravadoStr = String(hashGravado ?? '');

      if (hashRecalculado !== hashGravadoStr) {
        registroOk = false;
        detalhes.push(
          `Registro #${id} (índice ${indice}): hash não confere com o conteúdo gravado — o registro foi alterado depois de criado`,
        );
      } else {
        const assinaturaEsperada = await this.gerarAssinatura(hashGravadoStr);
        if (assinaturaEsperada !== String(assinatura ?? '')) {
          registroOk = false;
          detalhes.push(`Registro #${id} (índice ${indice}): assinatura digital inválida`);
        }
      }

      if (!registroOk) {
        registrosCorrompidos++;
        if (primeiroErroSequencia === undefined) primeiroErroSequencia = indice;
      }

      hashAnteriorEsperado = hashGravadoStr;
    }

    return {
      integro: registrosCorrompidos === 0,
      registros_verificados: linhas.length,
      registros_corrompidos: registrosCorrompidos,
      blocos_verificados: this.blocos.size,
      blocos_corrompidos: 0,
      primeiro_erro_sequencia: primeiroErroSequencia,
      detalhes,
      timestamp_verificacao: new Date(),
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
