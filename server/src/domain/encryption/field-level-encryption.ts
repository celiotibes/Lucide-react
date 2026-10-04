/**
 * Field-Level Encryption para LGPD Compliance
 *
 * Implementa criptografia em nível de campo usando algoritmo ChaCha20-Poly1305
 * Campos sensíveis são criptografados no INSERT e descriptografados no SELECT
 */

import crypto from 'crypto';

/**
 * Configuração de criptografia
 * Em produção, a chave deve vir de um Key Management Service (AWS KMS, HashiCorp Vault, etc)
 */
export interface ConfiguraCriptografia {
  chaveSecreta: Buffer | string; // 32 bytes para ChaCha20-Poly1305
  algoritmo: string;
  modo: string;
}

/**
 * Dados criptografados incluem nonce e tag de autenticação
 */
export interface DadosCriptografados {
  iv: string; // Nonce (12 bytes) em hex
  conteudo: string; // Conteúdo criptografado em hex
  tag: string; // Tag de autenticação (16 bytes) em hex
  versao: number; // Versão do esquema de criptografia
  /**
   * Identificador da chave (kid). Ausente em dados legados, anteriores à rotação:
   * esses são tratados como cifrados com a chave legada (kid "1"). Ver chaveiro.ts.
   */
  kid?: string;
}

/**
 * Campos que devem ser criptografados
 */
export const CAMPOS_ENCRYPTA_OBRIGATORIO = [
  'cpf',
  'cnpj',
  'email',
  'telefone',
  'numero_cartao',
  'cvv',
  'token_pagamento',
  'senha',
  'chave_privada',
  'token',
  'api_key',
  'secret_key',
  'private_key',
];

/**
 * Decorator TypeScript para marcar propriedades que devem ser encriptadas
 * Uso: @Encrypted class Cliente { @Encrypted cpf: string }
 */
export function Encrypted(target: unknown, propertyKey: string) {
  // Metadata para framework detectar campos encriptados
  if (!target.constructor._encryptedFields) {
    target.constructor._encryptedFields = [];
  }
  target.constructor._encryptedFields.push(propertyKey);
}

/**
 * Gera uma chave de criptografia segura (32 bytes para ChaCha20-Poly1305)
 */
export function gerarChaveCriptografia(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Gera um nonce (IV) seguro para ChaCha20 (12 bytes)
 */
export function gerarNonce(): Buffer {
  return crypto.randomBytes(12);
}

/**
 * Criptografa dados sensíveis usando ChaCha20-Poly1305
 *
 * @param dados - Dados a criptografar
 * @param chaveSecreta - Chave de criptografia (32 bytes)
 * @returns Objeto com IV, conteúdo criptografado, tag e versão
 */
export function criptografar(
  dados: string,
  chaveSecreta: Buffer | string
): DadosCriptografados {
  // Garantir que a chave é um Buffer
  const chave = typeof chaveSecreta === 'string'
    ? Buffer.from(chaveSecreta, 'hex')
    : chaveSecreta;

  // Validar comprimento da chave (32 bytes = 256 bits para ChaCha20)
  if (chave.length !== 32) {
    throw new Error(`Chave deve ter 32 bytes, recebido ${chave.length}`);
  }

  // Gerar nonce aleatório (12 bytes para ChaCha20-Poly1305)
  const nonce = gerarNonce();

  // Criar cipher
  const cipher = crypto.createCipheriv('chacha20-poly1305', chave, nonce);

  // Criptografar dados
  let criptografado = cipher.update(dados, 'utf8', 'hex');
  criptografado += cipher.final('hex');

  // Obter tag de autenticação
  const tag = cipher.getAuthTag();

  return {
    iv: nonce.toString('hex'),
    conteudo: criptografado,
    tag: tag.toString('hex'),
    versao: 1,
  };
}

/**
 * Descriptografa dados usando ChaCha20-Poly1305
 *
 * @param dados - Objeto com IV, conteúdo criptografado e tag
 * @param chaveSecreta - Chave de criptografia (32 bytes)
 * @returns Dados descriptografados
 */
export function descriptografar(
  dados: DadosCriptografados,
  chaveSecreta: Buffer | string
): string {
  // Garantir que a chave é um Buffer
  const chave = typeof chaveSecreta === 'string'
    ? Buffer.from(chaveSecreta, 'hex')
    : chaveSecreta;

  // Validar comprimento da chave
  if (chave.length !== 32) {
    throw new Error(`Chave deve ter 32 bytes, recebido ${chave.length}`);
  }

  // Converter IV de hex para Buffer
  const nonce = Buffer.from(dados.iv, 'hex');

  // Validar comprimento do nonce
  if (nonce.length !== 12) {
    throw new Error(`Nonce deve ter 12 bytes, recebido ${nonce.length}`);
  }

  // Converter tag de autenticação de hex para Buffer
  const tag = Buffer.from(dados.tag, 'hex');

  // Criar decipher
  const decipher = crypto.createDecipheriv('chacha20-poly1305', chave, nonce);

  // Definir tag de autenticação
  decipher.setAuthTag(tag);

  // Descriptografar
  let descriptografado = decipher.update(dados.conteudo, 'hex', 'utf8');
  descriptografado += decipher.final('utf8');

  return descriptografado;
}

/**
 * Criptografa um objeto, encriptando apenas campos sensíveis
 */
export function criptografarObjeto(
  objeto: Record<string, any>,
  chaveSecreta: Buffer | string,
  camposAcriptografar?: string[]
): Record<string, any> {
  const criptografado = { ...objeto };

  // Usar campos marcados com @Encrypted ou lista fornecida
  const campos = camposAcriptografar ||
    (objeto.constructor._encryptedFields || CAMPOS_ENCRYPTA_OBRIGATORIO);

  for (const campo of campos) {
    if (campo in criptografado && criptografado[campo] != null) {
      const valor = String(criptografado[campo]);

      // Não criptografar valores já criptografados (que têm estrutura DadosCriptografados)
      if (typeof criptografado[campo] === 'object' && 'iv' in criptografado[campo]) {
        continue;
      }

      criptografado[campo] = criptografar(valor, chaveSecreta);
    }
  }

  return criptografado;
}

/**
 * Descriptografa um objeto, descriptografando campos sensíveis
 */
export function descriptografarObjeto(
  objeto: Record<string, any>,
  chaveSecreta: Buffer | string,
  camposDesencriptar?: string[]
): Record<string, any> {
  const descriptografado = { ...objeto };

  const campos = camposDesencriptar ||
    (objeto.constructor._encryptedFields || CAMPOS_ENCRYPTA_OBRIGATORIO);

  for (const campo of campos) {
    if (campo in descriptografado && descriptografado[campo] != null) {
      const valor = descriptografado[campo];

      // Verificar se é um objeto criptografado
      if (typeof valor === 'object' && valor.iv && valor.conteudo && valor.tag) {
        try {
          descriptografado[campo] = descriptografar(valor as DadosCriptografados, chaveSecreta);
        } catch (erro) {
          console.error(`Erro ao descriptografar ${campo}:`, erro);
          // Deixar como está se falhar
        }
      }
    }
  }

  return descriptografado;
}

/**
 * Serializa um objeto com campos criptografados para JSON
 */
export function serializarComEncriptacao(
  objeto: Record<string, any>,
  chaveSecreta: Buffer | string
): string {
  const criptografado = criptografarObjeto(objeto, chaveSecreta);
  return JSON.stringify(criptografado);
}

/**
 * Desserializa um objeto com campos criptografados de JSON
 */
export function desserializarComDescriptografia(
  json: string,
  chaveSecreta: Buffer | string
): Record<string, any> {
  const objeto = JSON.parse(json);
  return descriptografarObjeto(objeto, chaveSecreta);
}

/**
 * Verifica se um campo é sensível e deve ser encriptado
 */
export function ehCampoSensivel(nomeCampo: string): boolean {
  return CAMPOS_ENCRYPTA_OBRIGATORIO.some(
    campo => campo.toLowerCase() === nomeCampo.toLowerCase()
  );
}

/**
 * Máscara um campo sensível para display (ex: CPF 123.456.789-00 -> ***456***-**)
 */
export function mascararCampoSensivel(
  valor: string,
  tipo: 'cpf' | 'cnpj' | 'cartao' | 'email' | 'telefone' = 'cpf'
): string {
  if (!valor) return '';

  switch (tipo) {
    case 'cpf':
      // Mostra apenas 3 dígitos do meio: XXX.456.XXX-XX
      return valor.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.$3-**');

    case 'cnpj':
      // CNPJ: XXX.XXX.XXX-XXXX -> XXX.XXX.**-****
      return valor.replace(/(\d{8})(\d{4})/, '$1-****').replace(/(\d{6})/, '***.**');

    case 'cartao':
      // Cartão: mostra apenas últimos 4: ****-****-****-1234
      return '****-****-****-' + valor.slice(-4);

    case 'email':
      // Email: u***@example.com
      const [user, domain] = valor.split('@');
      return user.charAt(0) + '***@' + domain;

    case 'telefone':
      // Telefone: ***-****-*890
      return valor.replace(/\d/g, '*').replace(/(.{7})(\d{4})$/, '$1' + valor.slice(-4));

    default:
      return '****';
  }
}
