import { supabase } from '../supabase';
import { obterFilaSync, marcarComoSincronizado, registrarErroSync, SyncQueueItem } from './queue';
import { getDatabase } from '../db';

export async function sincronizarFila(): Promise<{
  sucesso: number;
  falhas: number;
  erros: string[];
}> {
  const fila = await obterFilaSync();
  let sucesso = 0;
  let falhas = 0;
  const erros: string[] = [];

  for (const item of fila) {
    try {
      await sincronizarItem(item);
      await marcarComoSincronizado(item.id);
      sucesso++;
    } catch (erro) {
      falhas++;
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      erros.push(`${item.tipo} ${item.acao}: ${mensagem}`);
      await registrarErroSync(item.id, mensagem);
    }
  }

  return { sucesso, falhas, erros };
}

async function sincronizarItem(item: SyncQueueItem): Promise<void> {
  const dados = JSON.parse(item.dados_json);

  switch (item.tipo) {
    case 'vistoria':
      await sincronizarVistoria(item.acao, dados);
      break;
    case 'item':
      await sincronizarItem_(item.acao, dados);
      break;
    case 'media':
      await sincronizarMedia(item.acao, dados);
      break;
    case 'anotacao':
      await sincronizarAnotacao(item.acao, dados);
      break;
    case 'chave':
      await sincronizarChave(item.acao, dados);
      break;
    case 'leitura':
      await sincronizarLeitura(item.acao, dados);
      break;
    default:
      throw new Error(`Tipo desconhecido: ${item.tipo}`);
  }
}

async function sincronizarVistoria(acao: string, dados: any): Promise<void> {
  if (acao === 'create' || acao === 'update') {
    const { error } = await supabase
      .from('vistorias')
      .upsert({ ...dados, realizada_por: await obterPessoaId() });
    if (error) throw error;
  } else if (acao === 'delete') {
    const { error } = await supabase
      .from('vistorias')
      .delete()
      .eq('id', dados.id);
    if (error) throw error;
  }
}

async function sincronizarItem_(acao: string, dados: any): Promise<void> {
  if (acao === 'create' || acao === 'update') {
    const { error } = await supabase
      .from('itens_vistoria')
      .upsert(dados);
    if (error) throw error;
  } else if (acao === 'delete') {
    const { error } = await supabase
      .from('itens_vistoria')
      .delete()
      .eq('id', dados.id);
    if (error) throw error;
  }
}

async function sincronizarMedia(acao: string, dados: any): Promise<void> {
  if (acao === 'create') {
    // Upload de arquivo para Supabase Storage
    const caminhoLocal = dados.caminho_local;
    const bucketPath = `vistorias/${dados.vistoria_id}/${dados.id}`;

    // Ler arquivo e fazer upload
    const { error: uploadError } = await supabase.storage
      .from('vistorias-media')
      .upload(bucketPath, new File([], caminhoLocal));

    if (uploadError) throw uploadError;

    // Registrar URL remota no banco
    const { data } = supabase.storage
      .from('vistorias-media')
      .getPublicUrl(bucketPath);

    const { error } = await supabase
      .from('medias')
      .upsert({ ...dados, url_remota: data.publicUrl });
    if (error) throw error;
  }
}

async function sincronizarAnotacao(acao: string, dados: any): Promise<void> {
  if (acao === 'create' || acao === 'update') {
    const { error } = await supabase
      .from('anotacoes_foto')
      .upsert(dados);
    if (error) throw error;
  }
}

async function sincronizarChave(acao: string, dados: any): Promise<void> {
  if (acao === 'create' || acao === 'update') {
    const { error } = await supabase
      .from('chaves_controles')
      .upsert(dados);
    if (error) throw error;
  }
}

async function sincronizarLeitura(acao: string, dados: any): Promise<void> {
  if (acao === 'create' || acao === 'update') {
    const { error } = await supabase
      .from('leituras_medidor')
      .upsert(dados);
    if (error) throw error;
  }
}

async function obterPessoaId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Usuário não autenticado');

  const db = await getDatabase();
  const result = await db.getFirstAsync(
    `SELECT id FROM sync_metadata WHERE chave = 'pessoa_id' LIMIT 1`
  ) as any;

  if (result) return result.valor;

  // Buscar do backend baseado no usuário autenticado
  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('id')
    .eq('email', data.user.email)
    .single();

  if (!pessoa) throw new Error('Pessoa não encontrada');

  // Armazenar localmente para futuro uso
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_metadata (chave, valor) VALUES (?, ?)`,
    ['pessoa_id', pessoa.id]
  );

  return pessoa.id;
}
