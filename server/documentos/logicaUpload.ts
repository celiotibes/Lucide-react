// Mesmo padrão de app/contratos/logicaCadastro.ts: função que recebe o Pool
// já aberto e dados já validados pela camada de action, faz a gravação, e
// devolve { sucesso, erro? } em vez de lançar — a action decide o que fazer
// com o erro (mostrar no formulário, por exemplo).

import type { Pool } from 'pg';

export const TIPOS_DOCUMENTO_ANEXADO = [
  'contrato_assinado',
  'aditivo',
  'comunicacao_renovacao',
  'comunicacao_negociacao',
  'outro',
] as const;
export type TipoDocumentoAnexado = (typeof TIPOS_DOCUMENTO_ANEXADO)[number];

export const TIPOS_MIME_ACEITOS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'Imagem (JPEG)',
  'image/png': 'Imagem (PNG)',
  'image/webp': 'Imagem (WEBP)',
  'application/msword': 'Word (.doc)',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
};

export const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024; // 25MB

export interface DadosDocumentoAnexado {
  contratoId: string | null;
  tipo: TipoDocumentoAnexado;
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
  hashSha256: string;
  storagePath: string;
  enviadoPorPessoaId: string | null;
}

export interface ResultadoRegistrarDocumento {
  sucesso: boolean;
  documentoId?: string;
  jaExistia?: boolean;
  erro?: string;
}

/** Valida o arquivo antes de qualquer upload — barato, roda antes de tocar em storage/rede. */
export function validarArquivo(mimeType: string, tamanhoBytes: number): { valido: boolean; erro?: string } {
  if (!TIPOS_MIME_ACEITOS[mimeType]) {
    return {
      valido: false,
      erro: `Formato não aceito: ${mimeType || 'desconhecido'}. Envie PDF, imagem (JPEG/PNG/WEBP) ou Word (.doc/.docx).`,
    };
  }
  if (tamanhoBytes <= 0) {
    return { valido: false, erro: 'Arquivo vazio' };
  }
  if (tamanhoBytes > TAMANHO_MAXIMO_BYTES) {
    return { valido: false, erro: `Arquivo excede o limite de ${TAMANHO_MAXIMO_BYTES / 1024 / 1024}MB` };
  }
  return { valido: true };
}

export async function registrarDocumentoAnexado(
  pool: Pool,
  dados: DadosDocumentoAnexado,
): Promise<ResultadoRegistrarDocumento> {
  // Idempotência por conteúdo, escopada por contrato: o mesmo arquivo (mesmo
  // hash) enviado duas vezes PARA O MESMO CONTRATO não gera um segundo
  // upload nem uma segunda linha — devolve o documento já existente. Evita
  // reprocessamento de IA duplicado (Fase 4) se o operador re-enviar o
  // mesmo PDF por engano. Escopado por contrato_id (não global) porque um
  // arquivo byte-idêntico (ex.: um modelo de aditivo em branco) pode ser
  // legitimamente anexado a dois contratos diferentes — um unique global
  // faria o segundo upload apontar silenciosamente para o documento do
  // PRIMEIRO contrato, sumindo da tela do segundo. `is not distinct from`
  // trata contrato_id nulo corretamente (NULL = NULL aqui, ao contrário de
  // `=` puro em SQL).
  const { rows: existentes } = await pool.query<{ id: string }>(
    `select id from documentos_anexados where hash_sha256 = $1 and contrato_id is not distinct from $2`,
    [dados.hashSha256, dados.contratoId],
  );
  if (existentes.length > 0) {
    return { sucesso: true, documentoId: existentes[0].id, jaExistia: true };
  }

  try {
    const { rows } = await pool.query<{ id: string }>(
      `insert into documentos_anexados
        (contrato_id, tipo, nome_arquivo, mime_type, tamanho_bytes, hash_sha256, storage_path, enviado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        dados.contratoId,
        dados.tipo,
        dados.nomeArquivo,
        dados.mimeType,
        dados.tamanhoBytes,
        dados.hashSha256,
        dados.storagePath,
        dados.enviadoPorPessoaId,
      ],
    );
    return { sucesso: true, documentoId: rows[0].id };
  } catch (erro) {
    return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro ao registrar documento' };
  }
}

export function sanitizarNomeArquivo(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}
