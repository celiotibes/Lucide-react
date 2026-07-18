'use server';

import { createClient } from '@/lib/supabase/server';

export interface MidiaItemVistoria {
  url: string;
  tipo: 'foto' | 'video';
  largura?: number;
  altura?: number;
}

export interface RegistrarItemVistoriaInput {
  vistoriaId: string;
  itemChecklistId: string;
  estado?: 'novo' | 'bom' | 'regular' | 'danificado' | 'inexistente';
  observacao?: string;
  transcricaoAudio?: string;
  audioUrl?: string;
  midia?: MidiaItemVistoria[];
  latitude?: number;
  longitude?: number;
  exifCapturadoEm?: string; // ISO — vem do metadado da mídia, não do relógio do servidor
  hashSha256?: string;
}

// Upsert por design: o app de campo pode registrar o item aos poucos
// (primeiro a foto, depois o áudio transcrito) tanto online quanto ao
// sincronizar a fila offline — cada chamada só atualiza os campos
// enviados, sem apagar o que já foi salvo antes.
export async function registrarItemVistoria(input: RegistrarItemVistoriaInput) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: 'Não autenticado' };
  }

  const { data: existente, error: existenteError } = await supabase
    .from('itens_vistoria')
    .select('id, midia')
    .eq('vistoria_id', input.vistoriaId)
    .eq('item_checklist_id', input.itemChecklistId)
    .maybeSingle();

  if (existenteError) {
    return { error: `Falha ao consultar item existente: ${existenteError.message}` };
  }

  const midiaAcumulada = existente?.midia
    ? [...(existente.midia as MidiaItemVistoria[]), ...(input.midia ?? [])]
    : (input.midia ?? []);

  const payload = {
    vistoria_id: input.vistoriaId,
    item_checklist_id: input.itemChecklistId,
    ...(input.estado !== undefined && { estado: input.estado }),
    ...(input.observacao !== undefined && { observacao: input.observacao }),
    ...(input.transcricaoAudio !== undefined && { transcricao_audio: input.transcricaoAudio }),
    ...(input.audioUrl !== undefined && { audio_url: input.audioUrl }),
    ...(midiaAcumulada.length > 0 && { midia: midiaAcumulada }),
    ...(input.latitude !== undefined && { latitude: input.latitude }),
    ...(input.longitude !== undefined && { longitude: input.longitude }),
    ...(input.exifCapturadoEm !== undefined && { exif_capturado_em: input.exifCapturadoEm }),
    ...(input.hashSha256 !== undefined && { hash_sha256: input.hashSha256 }),
    atualizado_em: new Date().toISOString(),
  };

  // RLS (migration-modulo-vistorias.sql) é a autoridade real aqui:
  // vistoriador só grava em vistoria com `realizada_por` igual a si
  // mesmo; inquilino só em autovistoria da própria vistoria em andamento;
  // admin/economista sempre. Este action não duplica essa checagem — só
  // repassa o erro do Postgres se a política negar.
  const { data: item, error: upsertError } = await supabase
    .from('itens_vistoria')
    .upsert(payload, { onConflict: 'vistoria_id,item_checklist_id' })
    .select('id')
    .single();

  if (upsertError || !item) {
    return { error: `Falha ao registrar item de vistoria: ${upsertError?.message ?? 'erro desconhecido'}` };
  }

  return { data: { itemVistoriaId: item.id as string } };
}
