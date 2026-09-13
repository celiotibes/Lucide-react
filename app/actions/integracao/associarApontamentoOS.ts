'use server';

import { createClient } from '@/lib/supabase/server';
import { auditLogger } from '@/server/compliance/auditLogger';

/**
 * Associar um apontamento com uma ordem de serviço
 * Cria registro de custo automaticamente
 */
export async function associarApontamentoAOS(
  apontamentoId: string,
  ordemServicoId: string
) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar apontamento
    const { data: apontamento, error: erroApontamento } = await supabase
      .from('apontamentos_prestador')
      .select('*, contratos_prestador(prestadores_servico(id, valor_hora_padrao))')
      .eq('id', apontamentoId)
      .single();

    if (erroApontamento || !apontamento) {
      return { erro: 'Apontamento não encontrado', sucesso: false };
    }

    // Buscar ordem de serviço
    const { data: ordemServico, error: erroOS } = await supabase
      .from('ordens_servico')
      .select('*')
      .eq('id', ordemServicoId)
      .single();

    if (erroOS || !ordemServico) {
      return { erro: 'Ordem de serviço não encontrada', sucesso: false };
    }

    // Atualizar apontamento com referência à OS
    const { error: erroUpdate } = await supabase
      .from('apontamentos_prestador')
      .update({
        ordem_servico_id: ordemServicoId,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', apontamentoId);

    if (erroUpdate) throw erroUpdate;

    // Calcular valor de custo
    const horasTrabalhadas = parseFloat(apontamento.horas_trabalhadas || '0');
    const valorHora = parseFloat(
      apontamento.contratos_prestador?.prestadores_servico?.valor_hora_padrao || '0'
    );
    const valorDeslocamento = parseFloat(apontamento.valor_deslocamento || '0');
    const valorTotal = horasTrabalhadas * valorHora + valorDeslocamento;

    // Criar registro de custo de apontamento
    const { error: erroCusto } = await supabase
      .from('apontamento_custos')
      .insert({
        apontamento_id: apontamentoId,
        ordem_servico_id: ordemServicoId,
        horas_trabalhadas: horasTrabalhadas,
        valor_hora_prestador: valorHora,
        valor_total: valorTotal,
        valor_deslocamento: valorDeslocamento,
        descricao: apontamento.descricao_atividades || 'Apontamento associado',
      });

    if (erroCusto) throw erroCusto;

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'associar_apontamento_ordem_servico',
      tabela: 'apontamentos_prestador',
      registro_id: apontamentoId,
      valores_depois: {
        ordem_servico_id: ordemServicoId,
        valor_custo: valorTotal,
      },
      endpoint: '/api/integracao/apontamentos/associar-os',
    });

    return {
      sucesso: true,
      mensagem: 'Apontamento associado à ordem de serviço com sucesso',
      valorTotal: valorTotal.toFixed(2),
    };
  } catch (erro) {
    console.error('Erro ao associar apontamento à OS:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Desassociar um apontamento da ordem de serviço
 * Remove registro de custo automaticamente
 */
export async function desassociarApontamentoDeOS(apontamentoId: string) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar apontamento
    const { data: apontamento, error: erroApontamento } = await supabase
      .from('apontamentos_prestador')
      .select('ordem_servico_id')
      .eq('id', apontamentoId)
      .single();

    if (erroApontamento || !apontamento) {
      return { erro: 'Apontamento não encontrado', sucesso: false };
    }

    if (!apontamento.ordem_servico_id) {
      return {
        erro: 'Apontamento não está associado a nenhuma ordem de serviço',
        sucesso: false,
      };
    }

    // Deletar custos de apontamento
    const { error: erroCusto } = await supabase
      .from('apontamento_custos')
      .delete()
      .eq('apontamento_id', apontamentoId);

    if (erroCusto) throw erroCusto;

    // Desassociar apontamento
    const { error: erroUpdate } = await supabase
      .from('apontamentos_prestador')
      .update({
        ordem_servico_id: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', apontamentoId);

    if (erroUpdate) throw erroUpdate;

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'desassociar_apontamento_ordem_servico',
      tabela: 'apontamentos_prestador',
      registro_id: apontamentoId,
      valores_antes: {
        ordem_servico_id: apontamento.ordem_servico_id,
      },
      valores_depois: {
        ordem_servico_id: null,
      },
      endpoint: '/api/integracao/apontamentos/desassociar-os',
    });

    return {
      sucesso: true,
      mensagem: 'Apontamento desassociado da ordem de serviço com sucesso',
    };
  } catch (erro) {
    console.error('Erro ao desassociar apontamento:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Obter custos totais de apontamentos vinculados a uma OS
 */
export async function obterCustosApontamentosOS(ordemServicoId: string) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar custos
    const { data: custos, error: erroCustos } = await supabase
      .from('apontamento_custos')
      .select(
        `
        *,
        apontamentos_prestador (
          data,
          descricao_atividades,
          contratos_prestador (
            prestadores_servico (nome_completo)
          )
        )
      `
      )
      .eq('ordem_servico_id', ordemServicoId)
      .order('criado_em', { ascending: false });

    if (erroCustos) throw erroCustos;

    // Calcular totais
    const totalHoras = custos.reduce((sum, c) => sum + (c.horas_trabalhadas || 0), 0);
    const totalCusto = custos.reduce((sum, c) => sum + (c.valor_total || 0), 0);
    const totalDeslocamento = custos.reduce((sum, c) => sum + (c.valor_deslocamento || 0), 0);

    return {
      sucesso: true,
      custos,
      resumo: {
        quantidadeApontamentos: custos.length,
        totalHoras: totalHoras.toFixed(2),
        totalCusto: totalCusto.toFixed(2),
        totalDeslocamento: totalDeslocamento.toFixed(2),
      },
    };
  } catch (erro) {
    console.error('Erro ao obter custos de apontamentos:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Listar apontamentos disponíveis para associação com uma OS
 * (apontamentos ainda não associados, do período da OS)
 */
export async function listarApontamentosDisponiveis(
  ordemServicoId: string,
  dataInicio: Date,
  dataFim: Date
) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar apontamentos não associados no período
    const { data: apontamentos, error: erroApontamentos } = await supabase
      .from('apontamentos_prestador')
      .select(
        `
        *,
        contratos_prestador (
          prestadores_servico (id, nome_completo, valor_hora_padrao)
        )
      `
      )
      .is('ordem_servico_id', null)
      .gte('data', dataInicio.toISOString().split('T')[0])
      .lte('data', dataFim.toISOString().split('T')[0])
      .not('enviado_para_fechamento', 'eq', true)
      .order('data', { ascending: false });

    if (erroApontamentos) throw erroApontamentos;

    return {
      sucesso: true,
      apontamentos: apontamentos || [],
    };
  } catch (erro) {
    console.error('Erro ao listar apontamentos disponíveis:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Associar múltiplos apontamentos a uma OS (ação em lote)
 */
export async function associarMultiplosApontamentosAOS(
  apontamentoIds: string[],
  ordemServicoId: string
) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    if (!apontamentoIds || apontamentoIds.length === 0) {
      return { erro: 'Nenhum apontamento selecionado', sucesso: false };
    }

    // Buscar ordem de serviço
    const { data: ordemServico, error: erroOS } = await supabase
      .from('ordens_servico')
      .select('*')
      .eq('id', ordemServicoId)
      .single();

    if (erroOS || !ordemServico) {
      return { erro: 'Ordem de serviço não encontrada', sucesso: false };
    }

    // Atualizar todos os apontamentos
    const { error: erroUpdate } = await supabase
      .from('apontamentos_prestador')
      .update({
        ordem_servico_id: ordemServicoId,
        atualizado_em: new Date().toISOString(),
      })
      .in('id', apontamentoIds);

    if (erroUpdate) throw erroUpdate;

    // Buscar apontamentos para calcular custos
    const { data: apontamentos, error: erroApontamentos } = await supabase
      .from('apontamentos_prestador')
      .select('*, contratos_prestador(prestadores_servico(valor_hora_padrao))')
      .in('id', apontamentoIds);

    if (erroApontamentos) throw erroApontamentos;

    // Criar custos para cada apontamento
    const custosList = (apontamentos || []).map((ap) => {
      const horasTrabalhadas = parseFloat(ap.horas_trabalhadas || '0');
      const valorHora = parseFloat(
        ap.contratos_prestador?.prestadores_servico?.valor_hora_padrao || '0'
      );
      const valorDeslocamento = parseFloat(ap.valor_deslocamento || '0');
      const valorTotal = horasTrabalhadas * valorHora + valorDeslocamento;

      return {
        apontamento_id: ap.id,
        ordem_servico_id: ordemServicoId,
        horas_trabalhadas: horasTrabalhadas,
        valor_hora_prestador: valorHora,
        valor_total: valorTotal,
        valor_deslocamento: valorDeslocamento,
        descricao: ap.descricao_atividades || 'Apontamento associado',
      };
    });

    const { error: erroCustos } = await supabase
      .from('apontamento_custos')
      .insert(custosList);

    if (erroCustos) throw erroCustos;

    // Log auditoria
    const totalCusto = custosList.reduce((sum, c) => sum + c.valor_total, 0);
    await auditLogger.logAuditoria({
      acao: 'associar_multiplos_apontamentos_ordem_servico',
      tabela: 'apontamentos_prestador',
      valores_depois: {
        quantidade: apontamentoIds.length,
        ordem_servico_id: ordemServicoId,
        total_custo: totalCusto,
      },
      endpoint: '/api/integracao/apontamentos/associar-multiplos-os',
    });

    return {
      sucesso: true,
      associados: apontamentoIds.length,
      mensagem: `${apontamentoIds.length} apontamento(s) associado(s) com sucesso`,
      totalCusto: totalCusto.toFixed(2),
    };
  } catch (erro) {
    console.error('Erro ao associar múltiplos apontamentos:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}
