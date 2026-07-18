'use server';

import { createClient } from '@/lib/supabase/server';
import {
  calcularApontamentoTotal,
  calcularFechamento,
  rateiarAutomatico,
  type ApontamentoDado,
  type RegrasApontamento,
} from '@/server/prestador/logicaApontamento';

/**
 * Submete apontamentos de uma semana/mês para fechamento
 * Calcula totais, cria registro de fechamento, muda status para "enviado_para_gestao"
 */
export async function submeterParaFechamento(contratoId: string, dataInicio: Date, dataFim: Date) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Não autenticado' };
  }

  // Buscar contrato
  const { data: contrato, error: contratoError } = await supabase
    .from('contratos_prestador')
    .select('id, prestador_id, frequencia_fechamento')
    .eq('id', contratoId)
    .single();

  if (contratoError || !contrato) {
    return { error: 'Contrato não encontrado' };
  }

  // Validar permissão (prestador ou admin)
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
    return { error: 'Pessoa não encontrado' };
  }

  const { data: adminCheck } = await supabase.rpc('fn_eh_admin_ou_economista');
  if (!adminCheck && pessoa.email !== user.email) {
    return { error: 'Sem permissão para submeter fechamento deste contrato' };
  }

  // Buscar apontamentos do período
  const { data: apontamentos, error: apontamentosError } = await supabase
    .from('apontamentos_prestador')
    .select('*')
    .eq('contrato_id', contratoId)
    .gte('data', dataInicio.toISOString())
    .lte('data', dataFim.toISOString())
    .eq('status', 'rascunho')
    .order('data', { ascending: true });

  if (apontamentosError) {
    return { error: 'Erro ao buscar apontamentos' };
  }

  if (!apontamentos || apontamentos.length === 0) {
    return { error: 'Nenhum apontamento encontrado para este período' };
  }

  // Buscar regras do prestador
  const { data: regras, error: regrasError } = await supabase
    .from('regras_prestador')
    .select('regras')
    .eq('contrato_id', contratoId)
    .single();

  if (regrasError || !regras) {
    return { error: 'Regras do prestador não configuradas' };
  }

  const regrasApontamento = regras.regras as RegrasApontamento;

  // Calcular total de cada apontamento
  let totalProventos = 0;
  const itemsFechamento: Array<{
    apontamento_id: string;
    descricao: string;
    valor: number;
    tipo: string;
  }> = [];

  for (const apt of apontamentos) {
    const apontamentoDado: ApontamentoDado = {
      data: new Date(apt.data),
      hora_inicio: apt.hora_inicio,
      hora_saida: apt.hora_saida,
      intervalo_almoco_minutos: apt.intervalo_almoco_minutos,
      descricao_atividades: apt.descricao_atividades,
      quilometragem_extra: apt.quilometragem_extra,
      tipo_deslocamento: apt.tipo_deslocamento,
      quantidade_kits_pos_hospedagem: apt.quantidade_kits_pos_hospedagem,
      quantidade_kits_dentro_horario: apt.quantidade_kits_dentro_horario,
      eh_emergencia: apt.eh_emergencia,
      residenciais_ids: apt.residenciais_ids,
      residencial_horas: apt.residencial_horas,
    };

    const resultado = calcularApontamentoTotal(apontamentoDado, regrasApontamento);

    totalProventos += resultado.total;

    // Registrar componentes para auditoria
    if (resultado.valor_diaria > 0) {
      itemsFechamento.push({
        apontamento_id: apt.id,
        descricao: `Diária - ${apt.data}`,
        valor: resultado.valor_diaria,
        tipo: 'diaria',
      });
    }
    if (resultado.valor_horas_adicionais > 0) {
      itemsFechamento.push({
        apontamento_id: apt.id,
        descricao: `Horas adicionais (${resultado.horas_trabalhadas - 8}h) - ${apt.data}`,
        valor: resultado.valor_horas_adicionais,
        tipo: 'horas_adicionais',
      });
    }
    if (resultado.valor_combustivel > 0) {
      itemsFechamento.push({
        apontamento_id: apt.id,
        descricao: `Combustível - ${apt.data}`,
        valor: resultado.valor_combustivel,
        tipo: 'combustivel',
      });
    }
    if (resultado.valor_kits > 0) {
      itemsFechamento.push({
        apontamento_id: apt.id,
        descricao: `Kits Airbnb - ${apt.data}`,
        valor: resultado.valor_kits,
        tipo: 'kits',
      });
    }
    if (resultado.valor_emergencia > 0) {
      itemsFechamento.push({
        apontamento_id: apt.id,
        descricao: `Emergência - ${apt.data}`,
        valor: resultado.valor_emergencia,
        tipo: 'emergencia',
      });
    }
  }

  // Buscar adiantamentos ativo do período
  const { data: adiantamentosAtivos, error: adError } = await supabase
    .from('adiantamentos_prestador')
    .select('id, valor_total, numero_parcelas, tipo')
    .eq('prestador_id', contrato.prestador_id)
    .eq('status', 'ativo')
    .lte('data_inicio', dataFim.toISOString())
    .or(`data_fim.is.null,data_fim.gte.${dataInicio.toISOString()}`);

  let totalDeducoes = 0;

  if (!adError && adiantamentosAtivos) {
    for (const ad of adiantamentosAtivos) {
      // Calcular parcela do período (simplificado: valor total / meses)
      if (ad.numero_parcelas && ad.numero_parcelas > 0) {
        const parcelaValor = ad.valor_total / ad.numero_parcelas;
        totalDeducoes += parcelaValor;

        itemsFechamento.push({
          apontamento_id: null,
          descricao: `Desconto - ${ad.tipo}`,
          valor: -parcelaValor,
          tipo: 'deducao',
        });
      }
    }
  }

  const valorLiquido = totalProventos - totalDeducoes;

  // Criar registro de fechamento
  const { data: fechamento, error: fechamentoError } = await supabase
    .from('fechamentos_prestador')
    .insert([
      {
        contrato_id: contratoId,
        prestador_id: contrato.prestador_id,
        data_inicio: dataInicio,
        data_fim: dataFim,
        total_proventos: totalProventos,
        total_deducoes: totalDeducoes,
        valor_liquido: valorLiquido,
        status: 'enviado_para_gestao',
        detalhes_calculo: {
          quantidade_apontamentos: apontamentos.length,
          horas_totais: apontamentos.reduce((sum, a) => sum + (a.horas_trabalhadas || 0), 0),
        },
        criado_em: new Date(),
        atualizado_em: new Date(),
      },
    ])
    .select()
    .single();

  if (fechamentoError || !fechamento) {
    return { error: fechamentoError?.message || 'Erro ao criar fechamento' };
  }

  // Criar itens de detalhe do fechamento
  const itensInserts = itemsFechamento.map((item) => ({
    fechamento_id: fechamento.id,
    apontamento_id: item.apontamento_id,
    descricao: item.descricao,
    valor: item.valor,
    tipo: item.tipo,
    criado_em: new Date(),
  }));

  if (itensInserts.length > 0) {
    const { error: itensError } = await supabase
      .from('fechamento_itens_prestador')
      .insert(itensInserts);

    if (itensError) {
      console.error('Erro ao criar itens de fechamento:', itensError);
    }
  }

  // Fazer rateio automático dos apontamentos que não têm rateio manual
  for (const apt of apontamentos) {
    const detalheExistente = await supabase
      .from('apontamentos_residencial_detalhe')
      .select('id')
      .eq('apontamento_id', apt.id);

    if (!detalheExistente.data || detalheExistente.data.length === 0) {
      // Precisa de rateio automático
      const rateioAuto = rateiarAutomatico(
        apt.horas_trabalhadas,
        apt.residenciais_ids,
        undefined
      );

      if (Object.keys(rateioAuto).length > 0) {
        const detalheAuto = Object.entries(rateioAuto).map(([residencialId, horas]) => ({
          apontamento_id: apt.id,
          residencial_id: residencialId,
          horas_trabalhadas: horas,
          foi_rateado_automatico: true,
          criado_em: new Date(),
        }));

        await supabase.from('apontamentos_residencial_detalhe').insert(detalheAuto);
      }
    }
  }

  // Marcar apontamentos como enviados
  await supabase
    .from('apontamentos_prestador')
    .update({ status: 'enviado' })
    .in(
      'id',
      apontamentos.map((a) => a.id)
    );

  return {
    success: true,
    fechamento,
  };
}

/**
 * Aprova um fechamento (apenas admin/gestor)
 */
export async function aprovarFechamento(fechamentoId: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Não autenticado' };
  }

  // Validar permissão (admin/gestor)
  const { data: adminCheck } = await supabase.rpc('fn_eh_admin_ou_economista');
  if (!adminCheck) {
    return { error: 'Sem permissão para aprovar fechamentos' };
  }

  // Buscar fechamento
  const { data: fechamento, error: fechamentoError } = await supabase
    .from('fechamentos_prestador')
    .select('id, status')
    .eq('id', fechamentoId)
    .single();

  if (fechamentoError || !fechamento) {
    return { error: 'Fechamento não encontrado' };
  }

  if (fechamento.status !== 'enviado_para_gestao') {
    return { error: 'Apenas fechamentos enviados podem ser aprovados' };
  }

  // Atualizar status
  const { data: aprovado, error: updateError } = await supabase
    .from('fechamentos_prestador')
    .update({
      status: 'aprovado',
      atualizado_em: new Date(),
    })
    .eq('id', fechamentoId)
    .select()
    .single();

  if (updateError || !aprovado) {
    return { error: updateError?.message || 'Erro ao aprovar fechamento' };
  }

  return {
    success: true,
    fechamento: aprovado,
  };
}

/**
 * Devolve um fechamento para ajuste (apenas admin/gestor)
 */
export async function devolverFechamento(fechamentoId: string, motivo: string) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Não autenticado' };
  }

  // Validar permissão (admin/gestor)
  const { data: adminCheck } = await supabase.rpc('fn_eh_admin_ou_economista');
  if (!adminCheck) {
    return { error: 'Sem permissão para devolver fechamentos' };
  }

  // Buscar fechamento
  const { data: fechamento, error: fechamentoError } = await supabase
    .from('fechamentos_prestador')
    .select('id, status')
    .eq('id', fechamentoId)
    .single();

  if (fechamentoError || !fechamento) {
    return { error: 'Fechamento não encontrado' };
  }

  if (fechamento.status !== 'enviado_para_gestao') {
    return { error: 'Apenas fechamentos enviados podem ser devolvidos' };
  }

  // Atualizar status e registrar motivo
  const { data: devolvido, error: updateError } = await supabase
    .from('fechamentos_prestador')
    .update({
      status: 'devolvido',
      motivo_devolucao: motivo,
      atualizado_em: new Date(),
    })
    .eq('id', fechamentoId)
    .select()
    .single();

  if (updateError || !devolvido) {
    return { error: updateError?.message || 'Erro ao devolver fechamento' };
  }

  // Reverter apontamentos para rascunho
  const { error: apontamentoError } = await supabase
    .from('apontamentos_prestador')
    .update({ status: 'rascunho' })
    .eq('fechamento_id', fechamentoId);

  if (apontamentoError) {
    console.error('Erro ao reverter apontamentos:', apontamentoError);
  }

  return {
    success: true,
    fechamento: devolvido,
  };
}

/**
 * Marca um fechamento como pago
 */
export async function registrarPagamento(
  fechamentoId: string,
  dataPagamento: Date,
  chavePix?: string
) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Não autenticado' };
  }

  // Validar permissão (admin/gestor)
  const { data: adminCheck } = await supabase.rpc('fn_eh_admin_ou_economista');
  if (!adminCheck) {
    return { error: 'Sem permissão para registrar pagamentos' };
  }

  // Buscar fechamento
  const { data: fechamento, error: fechamentoError } = await supabase
    .from('fechamentos_prestador')
    .select('id, status, valor_liquido')
    .eq('id', fechamentoId)
    .single();

  if (fechamentoError || !fechamento) {
    return { error: 'Fechamento não encontrado' };
  }

  if (fechamento.status !== 'aprovado') {
    return { error: 'Apenas fechamentos aprovados podem ser pagos' };
  }

  // Atualizar status
  const { data: pago, error: updateError } = await supabase
    .from('fechamentos_prestador')
    .update({
      status: 'pago',
      data_pagamento: dataPagamento,
      chave_pix_usada: chavePix,
      atualizado_em: new Date(),
    })
    .eq('id', fechamentoId)
    .select()
    .single();

  if (updateError || !pago) {
    return { error: updateError?.message || 'Erro ao registrar pagamento' };
  }

  return {
    success: true,
    fechamento: pago,
  };
}
