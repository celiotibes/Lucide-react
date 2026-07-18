'use server';

import { createClient } from '@/lib/supabase/server';
import { compararVistorias, type ItemParaComparar } from '@/server/vistorias/compararVistorias';

export interface ItemComparativo {
  itemChecklistId: string;
  itemNome: string;
  ambienteNome: string;
  estadoAnterior: string | null;
  estadoAtual: string | null;
  observacaoAnterior: string | null;
  observacaoAtual: string | null;
}

export interface ComparativoVistoria {
  vistoriaBaseId: string;
  vistoriaSaidaId: string;
  itensComparados: number;
  divergencias: ItemComparativo[];
}

// Compara a vistoria de saída (ou conferência) com a vistoria de entrada
// apontada por `vistoria_base_id`. Nesta primeira versão a comparação é
// direta entrada x saída — a resolução de "estado mais recente antes da
// saída, considerando periódicas intermediárias" (docs/plano-
// desenvolvimento-vistorias.md §2.5) fica para uma segunda iteração desta
// action, quando o volume de vistorias periódicas em produção justificar
// a complexidade extra de montar a linha do tempo por item.
export async function obterComparativoVistoria(vistoriaSaidaId: string) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: 'Não autenticado' };
  }

  const { data: vistoriaSaida, error: vistoriaError } = await supabase
    .from('vistorias')
    .select('id, vistoria_base_id')
    .eq('id', vistoriaSaidaId)
    .single();

  if (vistoriaError || !vistoriaSaida) {
    return { error: `Vistoria não encontrada: ${vistoriaError?.message ?? vistoriaSaidaId}` };
  }
  if (!vistoriaSaida.vistoria_base_id) {
    return { error: 'Esta vistoria não tem uma vistoria de entrada de referência (vistoria_base_id)' };
  }

  const [entradaResult, saidaResult] = await Promise.all([
    supabase
      .from('itens_vistoria')
      .select('item_checklist_id, estado, observacao')
      .eq('vistoria_id', vistoriaSaida.vistoria_base_id),
    supabase
      .from('itens_vistoria')
      .select('item_checklist_id, estado, observacao')
      .eq('vistoria_id', vistoriaSaidaId),
  ]);

  if (entradaResult.error) {
    return { error: `Falha ao carregar itens da entrada: ${entradaResult.error.message}` };
  }
  if (saidaResult.error) {
    return { error: `Falha ao carregar itens da saída: ${saidaResult.error.message}` };
  }

  const paraComparar = (linhas: typeof entradaResult.data): ItemParaComparar[] =>
    (linhas ?? []).map((linha) => ({
      itemChecklistId: linha.item_checklist_id as string,
      estado: linha.estado as string | null,
      observacao: linha.observacao as string | null,
    }));

  const resultado = compararVistorias(paraComparar(entradaResult.data), paraComparar(saidaResult.data));

  if (resultado.divergencias.length === 0) {
    return {
      data: {
        vistoriaBaseId: vistoriaSaida.vistoria_base_id as string,
        vistoriaSaidaId,
        itensComparados: resultado.itensComparados,
        divergencias: [],
      } satisfies ComparativoVistoria,
    };
  }

  const idsDosItensDivergentes = resultado.divergencias.map((d) => d.itemChecklistId);
  const { data: itensChecklist, error: itensChecklistError } = await supabase
    .from('itens_checklist')
    .select('id, nome, ambiente_id, ambientes_vistoria(nome)')
    .in('id', idsDosItensDivergentes);

  if (itensChecklistError) {
    return { error: `Falha ao carregar nomes dos itens: ${itensChecklistError.message}` };
  }

  const nomesPorItem = new Map(
    (itensChecklist ?? []).map((item) => [
      item.id as string,
      {
        itemNome: item.nome as string,
        // Supabase retorna a relação embutida como array mesmo em N:1 quando não há foreign key hint explícito.
        ambienteNome: (Array.isArray(item.ambientes_vistoria) ? item.ambientes_vistoria[0]?.nome : (item.ambientes_vistoria as { nome: string } | null)?.nome) ?? '',
      },
    ]),
  );

  const divergencias: ItemComparativo[] = resultado.divergencias.map((divergencia) => ({
    ...divergencia,
    itemNome: nomesPorItem.get(divergencia.itemChecklistId)?.itemNome ?? '(item removido)',
    ambienteNome: nomesPorItem.get(divergencia.itemChecklistId)?.ambienteNome ?? '',
  }));

  return {
    data: {
      vistoriaBaseId: vistoriaSaida.vistoria_base_id as string,
      vistoriaSaidaId,
      itensComparados: resultado.itensComparados,
      divergencias,
    } satisfies ComparativoVistoria,
  };
}
