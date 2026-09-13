import { criarClienteServico } from './serviceClient';

// Bucket privado — nunca público. Acesso só via URL assinada com expiração
// curta, gerada sob demanda (nunca guardamos a URL assinada em banco: ela
// expira e uma antiga guardada ficaria enganosamente "quebrada" mais tarde).
const BUCKET_DOCUMENTOS = 'documentos';

export interface ResultadoUploadStorage {
  path: string;
}

export async function uploadDocumentoStorage(
  caminho: string,
  arquivo: Buffer,
  contentType: string,
): Promise<ResultadoUploadStorage> {
  const supabase = criarClienteServico();

  const { error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(caminho, arquivo, { contentType, cacheControl: '3600', upsert: false });

  if (error) {
    throw new Error(`Falha ao subir arquivo para o storage: ${error.message}`);
  }

  return { path: caminho };
}

export async function obterUrlAssinadaDocumento(
  caminho: string,
  expiraEmSegundos = 3600,
): Promise<string> {
  const supabase = criarClienteServico();
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(caminho, expiraEmSegundos);

  if (error || !data) {
    throw new Error(`Falha ao gerar URL assinada: ${error?.message ?? 'sem dados'}`);
  }

  return data.signedUrl;
}

export async function baixarDocumentoStorage(caminho: string): Promise<Buffer> {
  const supabase = criarClienteServico();
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).download(caminho);

  if (error || !data) {
    throw new Error(`Falha ao baixar arquivo do storage: ${error?.message ?? 'sem dados'}`);
  }

  return Buffer.from(await data.arrayBuffer());
}
