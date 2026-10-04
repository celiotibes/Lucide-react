/**
 * Chaveiro e envelope versionado para rotação de chaves da criptografia de campo.
 *
 * - Cifra sempre com a chave ativa e grava o `kid` no envelope.
 * - Decifra com a chave do `kid` do envelope; kid desconhecido => falha fechada.
 * - Dados legados (sem `kid`) são tratados como kid "1" (chave legada).
 * - Nenhuma mensagem de erro ou log contém material de chave ou texto em claro.
 */

import {
  criptografar,
  descriptografar,
  type DadosCriptografados,
} from './field-level-encryption';

/** kid atribuído a dados legados (sem versão) e à variável de chave única. */
export const KID_LEGADO = '1';

/** Envelope serializado em coluna de texto: fle:<kid>:<iv>:<tag>:<conteudo> */
export const PREFIXO_ENVELOPE = 'fle:';

const REGEX_KID = /^[A-Za-z0-9_-]{1,32}$/;
const REGEX_HEX = /^[0-9a-fA-F]+$/;
const REGEX_BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** Erro de configuração/uso das chaves. Nunca carrega material de chave na mensagem. */
export class ErroChaveCriptografia extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroChaveCriptografia';
  }
}

/** Envelope aponta para um kid ausente do chaveiro (falha fechada). */
export class ErroChaveDesconhecida extends ErroChaveCriptografia {
  constructor(public readonly kid: string) {
    super(
      `Chave de criptografia desconhecida: kid "${kid}". ` +
        'Inclua essa chave em FIELD_ENCRYPTION_KEYS antes de ler este dado.'
    );
    this.name = 'ErroChaveDesconhecida';
  }
}

function decodificarChave(texto: string, kid: string): Buffer {
  const t = texto.trim();
  let buf: Buffer | null = null;
  if (t.length === 64 && REGEX_HEX.test(t)) {
    buf = Buffer.from(t, 'hex');
  } else if (REGEX_BASE64.test(t)) {
    buf = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  }
  if (!buf || buf.length !== 32) {
    // Mensagem deliberadamente sem o valor da chave.
    throw new ErroChaveCriptografia(`Chave do kid "${kid}" inválida: esperado 32 bytes em base64 ou hex.`);
  }
  return buf;
}

function validarKid(kid: string): string {
  if (!REGEX_KID.test(kid)) {
    throw new ErroChaveCriptografia('kid inválido: use 1 a 32 caracteres entre letras, dígitos, "_" e "-".');
  }
  return kid;
}

/**
 * Conjunto de chaves por kid. O material fica em campo privado e não aparece em
 * console.log, JSON.stringify nem em mensagens de erro.
 */
export class Chaveiro {
  #chaves = new Map<string, Buffer>();
  readonly kidAtivo: string;
  readonly kidLegado: string;

  constructor(chaves: Record<string, Buffer | string>, kidAtivo: string, kidLegado: string = KID_LEGADO) {
    for (const [kid, valor] of Object.entries(chaves)) {
      validarKid(kid);
      this.#chaves.set(kid, typeof valor === 'string' ? decodificarChave(valor, kid) : Buffer.from(valor));
    }
    if (this.#chaves.size === 0) throw new ErroChaveCriptografia('Nenhuma chave de criptografia configurada.');
    for (const [kid, buf] of this.#chaves) {
      if (buf.length !== 32) throw new ErroChaveCriptografia(`Chave do kid "${kid}" deve ter 32 bytes.`);
    }
    if (!this.#chaves.has(kidAtivo)) {
      throw new ErroChaveCriptografia(`Chave ativa (kid "${kidAtivo}") não está entre as chaves configuradas.`);
    }
    this.kidAtivo = kidAtivo;
    this.kidLegado = kidLegado;
  }

  kids(): string[] {
    return [...this.#chaves.keys()];
  }

  possui(kid: string): boolean {
    return this.#chaves.has(kid);
  }

  /** Uso interno do módulo de criptografia. */
  obter(kid: string): Buffer {
    const chave = this.#chaves.get(kid);
    if (!chave) throw new ErroChaveDesconhecida(kid);
    return chave;
  }

  toJSON() {
    return { kidAtivo: this.kidAtivo, kids: this.kids() };
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `Chaveiro(ativo=${this.kidAtivo}, kids=[${this.kids().join(',')}])`;
  }
}

function parseListaChaves(bruto: string): Record<string, string> {
  const texto = bruto.trim();
  const out: Record<string, string> = {};
  if (texto.startsWith('{')) {
    let obj: unknown;
    try {
      obj = JSON.parse(texto);
    } catch {
      // Não repassa a mensagem do parser: ela pode ecoar trecho do conteúdo.
      throw new ErroChaveCriptografia('FIELD_ENCRYPTION_KEYS não é um JSON válido.');
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new ErroChaveCriptografia('FIELD_ENCRYPTION_KEYS em JSON deve ser um objeto {kid: chave}.');
    }
    for (const [kid, v] of Object.entries(obj)) {
      if (typeof v !== 'string') throw new ErroChaveCriptografia(`Chave do kid "${kid}" deve ser texto.`);
      out[kid] = v;
    }
    return out;
  }
  for (const par of texto.split(',')) {
    const p = par.trim();
    if (!p) continue;
    const i = p.indexOf(':');
    if (i <= 0) throw new ErroChaveCriptografia('FIELD_ENCRYPTION_KEYS deve ser JSON ou "kid:base64,kid:base64".');
    const kid = p.slice(0, i).trim();
    if (kid in out) throw new ErroChaveCriptografia(`kid "${kid}" duplicado em FIELD_ENCRYPTION_KEYS.`);
    out[kid] = p.slice(i + 1);
  }
  return out;
}

/**
 * Monta o chaveiro a partir do ambiente.
 *  - FIELD_ENCRYPTION_KEYS (JSON ou "kid:base64,...") + FIELD_ENCRYPTION_ACTIVE_KID; ou
 *  - variável legada de chave única FIELD_ENCRYPTION_KEY (hex/base64), tratada como kid "1".
 * Se ambas existirem, a chave única entra como kid "1" caso esse kid não esteja na lista
 * (dados legados continuam legíveis durante a migração).
 * FIELD_ENCRYPTION_LEGACY_KID (opcional) muda o kid usado para dados sem versão.
 */
export function carregarChaveiro(env: Record<string, string | undefined> = process.env): Chaveiro {
  const kidLegado = env.FIELD_ENCRYPTION_LEGACY_KID?.trim() || KID_LEGADO;
  const listaBruta = env.FIELD_ENCRYPTION_KEYS?.trim();
  const unica = env.FIELD_ENCRYPTION_KEY?.trim();
  const chaves: Record<string, string> = listaBruta ? parseListaChaves(listaBruta) : {};

  if (unica && !(kidLegado in chaves)) chaves[kidLegado] = unica;
  if (Object.keys(chaves).length === 0) {
    throw new ErroChaveCriptografia('Nenhuma chave configurada: defina FIELD_ENCRYPTION_KEYS ou FIELD_ENCRYPTION_KEY.');
  }

  let ativo = env.FIELD_ENCRYPTION_ACTIVE_KID?.trim();
  if (!ativo) {
    if (listaBruta) {
      throw new ErroChaveCriptografia('Defina FIELD_ENCRYPTION_ACTIVE_KID ao usar FIELD_ENCRYPTION_KEYS.');
    }
    ativo = kidLegado; // somente a chave única
  }
  return new Chaveiro(chaves, ativo, kidLegado);
}

/** Cifra com a chave ativa e grava o kid no envelope. */
export function criptografarVersionado(texto: string, chaveiro: Chaveiro = carregarChaveiro()): DadosCriptografados {
  const env = criptografar(texto, chaveiro.obter(chaveiro.kidAtivo));
  return { ...env, versao: 2, kid: chaveiro.kidAtivo };
}

/** Serializa o envelope para guardar numa coluna de texto. */
export function serializarEnvelope(env: DadosCriptografados): string {
  const kid = validarKid(env.kid ?? KID_LEGADO);
  return `${PREFIXO_ENVELOPE}${kid}:${env.iv}:${env.tag}:${env.conteudo}`;
}

/** Cifra com a chave ativa e devolve a string pronta para a coluna. */
export function criptografarParaColuna(texto: string, chaveiro: Chaveiro = carregarChaveiro()): string {
  return serializarEnvelope(criptografarVersionado(texto, chaveiro));
}

/**
 * Interpreta um valor como envelope: objeto, JSON legado ({iv,conteudo,tag}) ou string
 * "fle:kid:iv:tag:conteudo". Retorna null se não for um envelope (ex.: texto puro).
 */
export function lerEnvelope(valor: unknown): DadosCriptografados | null {
  let o: unknown = valor;
  if (typeof valor === 'string') {
    if (valor.startsWith(PREFIXO_ENVELOPE)) {
      const partes = valor.slice(PREFIXO_ENVELOPE.length).split(':');
      if (partes.length !== 4) return null;
      const [kid, iv, tag, conteudo] = partes;
      const hexOk = (s: string) => s === '' || REGEX_HEX.test(s);
      if (!REGEX_KID.test(kid) || !REGEX_HEX.test(iv) || !REGEX_HEX.test(tag) || !hexOk(conteudo)) return null;
      return { iv, tag, conteudo, versao: 2, kid };
    }
    if (!valor.startsWith('{')) return null;
    try {
      o = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  if (typeof o.iv !== 'string' || typeof o.tag !== 'string' || typeof o.conteudo !== 'string') return null;
  const env: DadosCriptografados = {
    iv: o.iv,
    tag: o.tag,
    conteudo: o.conteudo,
    versao: typeof o.versao === 'number' ? o.versao : 1,
  };
  if (o.kid !== undefined) {
    if (typeof o.kid !== 'string' || !REGEX_KID.test(o.kid)) return null;
    env.kid = o.kid;
  }
  return env;
}

/** kid efetivo de um envelope (legado sem kid => kid legado do chaveiro). */
export function kidDoEnvelope(env: DadosCriptografados, chaveiro: Chaveiro): string {
  return env.kid ?? chaveiro.kidLegado;
}

/**
 * Decifra com a chave do kid do envelope. Kid desconhecido => ErroChaveDesconhecida.
 * Dado adulterado/chave errada => erro genérico, sem plaintext nem chave.
 */
export function descriptografarVersionado(
  valor: DadosCriptografados | string,
  chaveiro: Chaveiro = carregarChaveiro()
): string {
  const env = lerEnvelope(valor);
  if (!env) throw new ErroChaveCriptografia('Valor não é um envelope criptografado reconhecido.');
  const kid = kidDoEnvelope(env, chaveiro);
  const chave = chaveiro.obter(kid);
  try {
    return descriptografar(env, chave);
  } catch {
    throw new ErroChaveCriptografia(`Falha ao decifrar com o kid "${kid}": dado adulterado ou chave incorreta.`);
  }
}

/** true se o envelope já está versionado e cifrado com a chave ativa. */
export function estaNaChaveAtiva(env: DadosCriptografados, chaveiro: Chaveiro): boolean {
  return env.kid !== undefined && env.kid === chaveiro.kidAtivo;
}
