'use server';

import { createClient } from '@/lib/supabase/server';
import { materializarChecklist, type TemplateAmbiente } from '@/server/vistorias/materializarChecklist';

export interface CriarVistoriaInput {
  contratoId: string;
  imovelId: string;
  tipo: 'entrada' | 'periodica' | 'saida' | 'conferencia';
  modo?: 'presencial' | 'autovistoria';
  vistoriadorPessoaId?: string;
  /** Vistoria de saída/conferência: aponta para a entrada usada na comparação. */
  vistoriaBaseId?: string;
  dataAgendada?: string; // ISO
  /**
   * Só usado quando `tipo === 'entrada'` e o imóvel ainda não tem
   * ambientes/itens de checklist cadastrados — materializa a partir de um
   * `templates_checklist` existente.
   */
  templateChecklistId?: string;
}

export async function criarVistoria(input: CriarVistoriaInput) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: 'Não autenticado' };
  }

  if (input.tipo === 'saida' || input.tipo === 'conferencia') {
    if (!input.vistoriaBaseId) {
      return { error: `vistoria do tipo "${input.tipo}" exige vistoriaBaseId (a vistoria de entrada de referência)` };
    }
  }

  // Vistoria de entrada: garante que o imóvel tem checklist antes de abrir
  // a vistoria — materializa a partir do template na primeira vez.
  if (input.tipo === 'entrada' && input.templateChecklistId) {
    const { count, error: countError } = await supabase
      .from('ambientes_vistoria')
      .select('id', { count: 'exact', head: true })
      .eq('imovel_id', input.imovelId);

    if (countError) {
      return { error: `Falha ao checar ambientes existentes: ${countError.message}` };
    }

    if (!count) {
      const materializado = await materializarChecklistDoTemplate(supabase, input.templateChecklistId, input.imovelId);
      if (materializado?.error) {
        return materializado;
      }
    }
  }

  const { data: vistoria, error: vistoriaError } = await supabase
    .from('vistorias')
    .insert({
      contrato_id: input.contratoId,
      imovel_id: input.imovelId,
      tipo: input.tipo,
      modo: input.modo ?? 'presencial',
      realizada_por: input.vistoriadorPessoaId ?? null,
      vistoria_base_id: input.vistoriaBaseId ?? null,
      data_agendada: input.dataAgendada ?? null,
      status: input.dataAgendada ? 'agendada' : 'em_andamento',
    })
    .select('id')
    .single();

  if (vistoriaError || !vistoria) {
    return { error: `Falha ao criar vistoria: ${vistoriaError?.message ?? 'erro desconhecido'}` };
  }

  return { data: { vistoriaId: vistoria.id as string } };
}

async function materializarChecklistDoTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateChecklistId: string,
  imovelId: string,
) {
  const { data: template, error: templateError } = await supabase
    .from('templates_checklist')
    .select('estrutura')
    .eq('id', templateChecklistId)
    .single();

  if (templateError || !template) {
    return { error: `Template de checklist não encontrado: ${templateError?.message ?? templateChecklistId}` };
  }

  let ambientesParaInserir;
  try {
    ambientesParaInserir = materializarChecklist(template.estrutura as TemplateAmbiente[]);
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : 'Template de checklist inválido' };
  }

  for (const ambiente of ambientesParaInserir) {
    const { data: ambienteInserido, error: ambienteError } = await supabase
      .from('ambientes_vistoria')
      .insert({ imovel_id: imovelId, nome: ambiente.nome, ordem: ambiente.ordem })
      .select('id')
      .single();

    if (ambienteError || !ambienteInserido) {
      return { error: `Falha ao criar ambiente "${ambiente.nome}": ${ambienteError?.message ?? 'erro desconhecido'}` };
    }

    const { error: itensError } = await supabase.from('itens_checklist').insert(
      ambiente.itens.map((item) => ({
        ambiente_id: ambienteInserido.id,
        nome: item.nome,
        ordem: item.ordem,
      })),
    );

    if (itensError) {
      return { error: `Falha ao criar itens do ambiente "${ambiente.nome}": ${itensError.message}` };
    }
  }

  return null;
}
