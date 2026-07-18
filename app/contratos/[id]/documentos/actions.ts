'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import { uploadDocumentoStorage } from '@/lib/supabase/storage';
import {
  registrarDocumentoAnexado,
  sanitizarNomeArquivo,
  validarArquivo,
  type TipoDocumentoAnexado,
} from '@/server/documentos/logicaUpload';

export interface EstadoUploadDocumento {
  erro?: string;
  sucesso?: boolean;
}

export async function uploadDocumentoContrato(
  contratoId: string,
  _estadoAnterior: EstadoUploadDocumento,
  formData: FormData,
): Promise<EstadoUploadDocumento> {
  const arquivo = formData.get('arquivo');
  const tipo = String(formData.get('tipo') ?? '') as TipoDocumentoAnexado;

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: 'Selecione um arquivo' };
  }
  if (!tipo) {
    return { erro: 'Selecione o tipo de documento' };
  }

  const validacao = validarArquivo(arquivo.type, arquivo.size);
  if (!validacao.valido) {
    return { erro: validacao.erro };
  }

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  const caminhoStorage = `${contratoId}/${Date.now()}-${sanitizarNomeArquivo(arquivo.name)}`;

  try {
    await uploadDocumentoStorage(caminhoStorage, bytes, arquivo.type);
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : 'Erro ao subir arquivo' };
  }

  const resultado = await registrarDocumentoAnexado(obterPool(), {
    contratoId,
    tipo,
    nomeArquivo: arquivo.name,
    mimeType: arquivo.type,
    tamanhoBytes: arquivo.size,
    hashSha256: hash,
    storagePath: caminhoStorage,
    // Sem sessão de usuário wireada no back-office ainda (ver docs/09) —
    // quando existir, resolver a partir de auth.uid()/usuarios.pessoa_id.
    enviadoPorPessoaId: null,
  });

  if (!resultado.sucesso) {
    return { erro: resultado.erro };
  }

  revalidatePath(`/contratos/${contratoId}/documentos`);
  return { sucesso: true };
}
