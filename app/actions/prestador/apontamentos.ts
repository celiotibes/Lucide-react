'use server';

import { createClient } from '@/lib/supabase/server';
import { calcularHoras } from '@/server/prestador/logicaApontamento';

export interface CriarApontamentoInput {
  contratoId: string;
  data: Date;
  horaInicio?: string; // HH:mm
  horaSaida?: string;
  intervaloAlmocoMinutos: number;
  descricaoAtividades?: string;
  quilometragemExtra?: number;
  tipoDeslocamento?: 'corrego_grande' | 'suprimentos_ate5km' | 'quilometragem' | 'interno';
  quantidadeKitsPosHospedagem?: number;
  quantidadeKitsDentroHorario?: number;
  ehEmergencia?: boolean;
  residenciaisIds?: string[];
  residencialHoras?: Record<string, number>; // { residencial_id: horas }
}

export interface EditarApontamentoInput extends CriarApontamentoInput {
  apontamentoId: string;
}

/**
 * Cria um novo apontamento de prestador
 * Valida permissões (prestador ve apenas seus dados, admin ve todos)
 */
export async function criarApontamento(input: CriarApontamentoInput) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Não autenticado' };
  }

  // Buscar contrato e validar propriedade
  const { data: contrato, error: contratoError } = await supabase
    .from('contratos_prestador')
    .select('id, prestador_id')
    .eq('id', input.contratoId)
    .single();

  if (contratoError || !contrato) {
    return { error: 'Contrato não encontrado' };
  }

  // Validar permissão: prestador ve apenas seu contrato, ou é admin
  const { data: prestadorData, error: prestadorError } = await supabase
    .from('prestadores_servico')
    .select('pessoa_id')
    .eq('id', contrato.prestador_id)
    .single();

  if (prestadorError || !prestadorData) {
    return { error: 'Prestador não encontrado' };
  }

  // Verificar se é o próprio prestador ou admin
  const { data: pessoa, error: pessoaError } = await supabase
    .from('pessoas')
    .select('email')
    .eq('id', prestadorData.pessoa_id)
    .single();

  if (pessoaError || !pessoa) {
    return { error: 'Pessoa não encontrada' };
  }

  // RLS: prestador ve apenas seu email, admin ve tudo
  // Se não é admin, validar que é o próprio email
  const { data: adminCheck } = await supabase.rpc('fn_eh_admin_ou_economista');
  if (!adminCheck && pessoa.email !== user.email) {
    return { error: 'Sem permissão para criar apontamento neste contrato' };
  }

  // Calcular horas trabalhadas
  const horasTrabalhadas =
    input.horaInicio && input.horaSaida
      ? calcularHoras(input.horaInicio, input.horaSaida, input.intervaloAlmocoMinutos)
      : 0;

  // Validar horas razoáveis (0-24)
  if (horasTrabalhadas < 0 || horasTrabalhadas > 24) {
    return { error: 'Horas trabalhadas devem estar entre 0 e 24' };
  }

  // Criar apontamento
  const { data: apontamento, error: insertError } = await supabase
    .from('apontamentos_prestador')
    .insert([
      {
        contrato_id: input.contratoId,
        data: input.data,
        hora_inicio: input.horaInicio,
        hora_saida: input.horaSaida,
        intervalo_almoco_minutos: input.intervaloAlmocoMinutos,
        horas_trabalhadas: parseFloat(horasTrabalhadas.toFixed(2)),
        descricao_atividades: input.descricaoAtividades,
        quilometragem_extra: input.quilometragemExtra,
        tipo_deslocamento: input.tipoDeslocamento,
        quantidade_kits_pos_hospedagem: input.quantidadeKitsPosHospedagem,
        quantidade_kits_dentro_horario: input.quantidadeKitsDentroHorario,
        eh_emergencia: input.ehEmergencia || false,
        residenciais_ids: input.residenciaisIds,
        residencial_horas: input.residencialHoras,
        status: 'rascunho',
        criado_em: new Date(),
        atualizado_em: new Date(),
      },
    ])
    .select()
    .single();

  if (insertError || !apontamento) {
    return { error: insertError?.message || 'Erro ao criar apontamento' };
  }

  // Se há residenciais e rateio manual preenchido, criar apontamentos_residencial_detalhe
  if (input.residencialHoras && Object.keys(input.residencialHoras).length > 0) {
    const detalheInserts = Object.entries(input.residencialHoras).map(
      ([residencialId, horas]) => ({
        apontamento_id: apontamento.id,
        residencial_id: residencialId,
        horas_trabalhadas: parseFloat(horas.toFixed(2)),
        foi_rateado_automatico: false,
        criado_em: new Date(),
      })
    );

    const { error: detalheError } = await supabase
      .from('apontamentos_residencial_detalhe')
      .insert(detalheInserts);

    if (detalheError) {
      console.error('Erro ao criar detalhes de rateio:', detalheError);
      // Não falha a operação principal, apenas loga
    }
  }

  return {
    success: true,
    apontamento,
  };
}

/**
 * Edita um apontamento existente
 * Apenas admin ou o próprio prestador pode editar
 */
export async function editarApontamento(input: EditarApontamentoInput) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Não autenticado' };
  }

  // Buscar apontamento existente
  const { data: apontamentoAtual, error: apontamentoError } = await supabase
    .from('apontamentos_prestador')
    .select('id, contrato_id, status')
    .eq('id', input.apontamentoId)
    .single();

  if (apontamentoError || !apontamentoAtual) {
    return { error: 'Apontamento não encontrado' };
  }

  // Apenas rascunho pode ser editado (não fechamentos já submetidos)
  if (apontamentoAtual.status !== 'rascunho') {
    return { error: 'Apenas apontamentos em rascunho podem ser editados' };
  }

  // Validar permissão
  const { data: contrato } = await supabase
    .from('contratos_prestador')
    .select('prestador_id')
    .eq('id', apontamentoAtual.contrato_id)
    .single();

  if (!contrato) {
    return { error: 'Contrato não encontrado' };
  }

  const { data: prestador } = await supabase
    .from('prestadores_servico')
    .select('pessoa_id')
    .eq('id', contrato.prestador_id)
    .single();

  if (!prestador) {
    return { error: 'Prestador não encontrado' };
  }

  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('email')
    .eq('id', prestador.pessoa_id)
    .single();

  if (!pessoa) {
    return { error: 'Pessoa não encontrada' };
  }

  const { data: adminCheck } = await supabase.rpc('fn_eh_admin_ou_economista');
  if (!adminCheck && pessoa.email !== user.email) {
    return { error: 'Sem permissão para editar este apontamento' };
  }

  // Calcular horas
  const horasTrabalhadas =
    input.horaInicio && input.horaSaida
      ? calcularHoras(input.horaInicio, input.horaSaida, input.intervaloAlmocoMinutos)
      : 0;

  if (horasTrabalhadas < 0 || horasTrabalhadas > 24) {
    return { error: 'Horas trabalhadas devem estar entre 0 e 24' };
  }

  // Atualizar apontamento
  const { data: apontamentoAtualizado, error: updateError } = await supabase
    .from('apontamentos_prestador')
    .update({
      data: input.data,
      hora_inicio: input.horaInicio,
      hora_saida: input.horaSaida,
      intervalo_almoco_minutos: input.intervaloAlmocoMinutos,
      horas_trabalhadas: parseFloat(horasTrabalhadas.toFixed(2)),
      descricao_atividades: input.descricaoAtividades,
      quilometragem_extra: input.quilometragemExtra,
      tipo_deslocamento: input.tipoDeslocamento,
      quantidade_kits_pos_hospedagem: input.quantidadeKitsPosHospedagem,
      quantidade_kits_dentro_horario: input.quantidadeKitsDentroHorario,
      eh_emergencia: input.ehEmergencia || false,
      residenciais_ids: input.residenciaisIds,
      residencial_horas: input.residencialHoras,
      atualizado_em: new Date(),
    })
    .eq('id', input.apontamentoId)
    .select()
    .single();

  if (updateError || !apontamentoAtualizado) {
    return { error: updateError?.message || 'Erro ao atualizar apontamento' };
  }

  // Atualizar ou criar detalhes de rateio
  if (input.residencialHoras && Object.keys(input.residencialHoras).length > 0) {
    // Deletar antigos
    await supabase
      .from('apontamentos_residencial_detalhe')
      .delete()
      .eq('apontamento_id', input.apontamentoId);

    // Inserir novos
    const detalheInserts = Object.entries(input.residencialHoras).map(
      ([residencialId, horas]) => ({
        apontamento_id: input.apontamentoId,
        residencial_id: residencialId,
        horas_trabalhadas: parseFloat(horas.toFixed(2)),
        foi_rateado_automatico: false,
        criado_em: new Date(),
      })
    );

    const { error: detalheError } = await supabase
      .from('apontamentos_residencial_detalhe')
      .insert(detalheInserts);

    if (detalheError) {
      console.error('Erro ao atualizar detalhes de rateio:', detalheError);
    }
  }

  return {
    success: true,
    apontamento: apontamentoAtualizado,
  };
}

/**
 * Deleta um apontamento (apenas em rascunho)
 */
export async function deletarApontamento(apontamentoId: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Não autenticado' };
  }

  // Buscar apontamento
  const { data: apontamento, error: apontamentoError } = await supabase
    .from('apontamentos_prestador')
    .select('id, contrato_id, status')
    .eq('id', apontamentoId)
    .single();

  if (apontamentoError || !apontamento) {
    return { error: 'Apontamento não encontrado' };
  }

  if (apontamento.status !== 'rascunho') {
    return { error: 'Apenas apontamentos em rascunho podem ser deletados' };
  }

  // Validar permissão
  const { data: contrato } = await supabase
    .from('contratos_prestador')
    .select('prestador_id')
    .eq('id', apontamento.contrato_id)
    .single();

  if (!contrato) {
    return { error: 'Contrato não encontrado' };
  }

  const { data: prestador } = await supabase
    .from('prestadores_servico')
    .select('pessoa_id')
    .eq('id', contrato.prestador_id)
    .single();

  if (!prestador) {
    return { error: 'Prestador não encontrado' };
  }

  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('email')
    .eq('id', prestador.pessoa_id)
    .single();

  if (!pessoa) {
    return { error: 'Pessoa não encontrada' };
  }

  const { data: adminCheck } = await supabase.rpc('fn_eh_admin_ou_economista');
  if (!adminCheck && pessoa.email !== user.email) {
    return { error: 'Sem permissão para deletar este apontamento' };
  }

  // Deletar detalhes de rateio primeiro
  await supabase
    .from('apontamentos_residencial_detalhe')
    .delete()
    .eq('apontamento_id', apontamentoId);

  // Deletar apontamento
  const { error: deleteError } = await supabase
    .from('apontamentos_prestador')
    .delete()
    .eq('id', apontamentoId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  return { success: true };
}
