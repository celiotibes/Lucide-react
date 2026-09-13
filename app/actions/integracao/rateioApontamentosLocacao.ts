'use server';

import { createClient } from '@/lib/supabase/server';
import { auditLogger } from '@/server/compliance/auditLogger';

/**
 * Calcular e aplicar rateio automático de apontamento entre residenciais
 * Quando um prestador visita múltiplas residências no mesmo dia,
 * as horas são rateadas proporcionalmente aos imóveis visitados
 */
export async function aplicarRateioApontamento(
  apontamentoId: string,
  residenciaisHoras: Record<string, number> // { residencial_id: horas }
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
      .select('*')
      .eq('id', apontamentoId)
      .single();

    if (erroApontamento || !apontamento) {
      return { erro: 'Apontamento não encontrado', sucesso: false };
    }

    // Validar que soma das horas não excede o total
    const totalHoras = Object.values(residenciaisHoras).reduce((a, b) => a + b, 0);
    if (totalHoras > (apontamento.horas_trabalhadas || 0) * 1.01) {
      // Tolerar 1% de arredondamento
      return {
        erro: `Soma das horas (${totalHoras}) não pode exceder total do apontamento (${apontamento.horas_trabalhadas})`,
        sucesso: false,
      };
    }

    // Deletar registros anteriores de rateio
    const { error: erroDel } = await supabase
      .from('apontamentos_residencial_detalhe')
      .delete()
      .eq('apontamento_id', apontamentoId);

    if (erroDel) throw erroDel;

    // Criar novos registros de rateio
    const rateios = Object.entries(residenciaisHoras).map(([residencialId, horas]) => ({
      apontamento_id: apontamentoId,
      residencial_id: residencialId,
      horas_trabalhadas: horas,
      foi_rateado_automatico: true,
      criado_em: new Date().toISOString(),
    }));

    const { error: erroInsert } = await supabase
      .from('apontamentos_residencial_detalhe')
      .insert(rateios);

    if (erroInsert) throw erroInsert;

    // Atualizar flag de rateio no apontamento
    const { error: erroUpdate } = await supabase
      .from('apontamentos_prestador')
      .update({
        residenciais_ids: Object.keys(residenciaisHoras).join(','),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', apontamentoId);

    if (erroUpdate) throw erroUpdate;

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'aplicar_rateio_apontamento',
      tabela: 'apontamentos_prestador',
      registro_id: apontamentoId,
      valores_depois: {
        residenciais_rateados: Object.keys(residenciaisHoras),
        horas_por_residencial: residenciaisHoras,
      },
      endpoint: '/api/integracao/apontamentos/rateio',
    });

    return {
      sucesso: true,
      mensagem: 'Rateio aplicado com sucesso',
      residenciaisRateadas: Object.keys(residenciaisHoras).length,
    };
  } catch (erro) {
    console.error('Erro ao aplicar rateio:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Obter resumo de custos por residencial para um período
 * Useful para análise de custos por localização
 */
export async function obterCustosPorResidencial(
  dataInicio: Date,
  dataFim: Date,
  residencialId?: string
) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar dados de rateio
    let query = supabase
      .from('apontamentos_residencial_detalhe')
      .select(
        `
        *,
        residenciais (nome),
        apontamentos_prestador (
          data,
          contratos_prestador (
            prestadores_servico (valor_hora_padrao)
          )
        )
      `
      );

    if (residencialId) {
      query = query.eq('residencial_id', residencialId);
    }

    const { data: rateios, error: erroRateios } = await query;

    if (erroRateios) throw erroRateios;

    // Agrupar por residencial
    const custoPorResidencial: Record<
      string,
      {
        residencial_id: string;
        residencial_nome: string;
        totalHoras: number;
        totalCusto: number;
        apontamentos: number;
      }
    > = {};

    (rateios || []).forEach((rateio) => {
      const data = rateio.apontamentos_prestador?.data;
      const horas = rateio.horas_trabalhadas;
      const valorHora =
        rateio.apontamentos_prestador?.contratos_prestador?.prestadores_servico?.valor_hora_padrao ||
        0;
      const custo = horas * valorHora;

      // Validar se está no período
      if (data && new Date(data) >= dataInicio && new Date(data) <= dataFim) {
        const residencialId = rateio.residencial_id;
        const residencialNome = rateio.residenciais?.nome || 'Desconhecido';

        if (!custoPorResidencial[residencialId]) {
          custoPorResidencial[residencialId] = {
            residencial_id: residencialId,
            residencial_nome: residencialNome,
            totalHoras: 0,
            totalCusto: 0,
            apontamentos: 0,
          };
        }

        custoPorResidencial[residencialId].totalHoras += horas;
        custoPorResidencial[residencialId].totalCusto += custo;
        custoPorResidencial[residencialId].apontamentos += 1;
      }
    });

    const resumo = Object.values(custoPorResidencial);
    const totalHoras = resumo.reduce((sum, r) => sum + r.totalHoras, 0);
    const totalCusto = resumo.reduce((sum, r) => sum + r.totalCusto, 0);

    return {
      sucesso: true,
      resumo: resumo.sort((a, b) => b.totalCusto - a.totalCusto),
      totais: {
        totalHoras: totalHoras.toFixed(2),
        totalCusto: totalCusto.toFixed(2),
        residenciais: resumo.length,
      },
    };
  } catch (erro) {
    console.error('Erro ao obter custos por residencial:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Gerar faturas automáticas de serviços para residenciais
 * Com base nos custos de apontamentos rateados
 */
export async function gerarFaturaServicosResidencial(
  residencialId: string,
  competencia: Date,
  descricao?: string
) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar custos do período
    const dataInicio = new Date(competencia.getFullYear(), competencia.getMonth(), 1);
    const dataFim = new Date(competencia.getFullYear(), competencia.getMonth() + 1, 0);

    // Cada relação abaixo é uma FK direta (to-one), então o PostgREST
    // retorna objeto singular — sem tipos gerados do schema, o client
    // infere array por padrão; sobrescrevemos via .overrideTypes().
    interface RateioComRelacoes {
      horas_trabalhadas: number;
      apontamentos_prestador: {
        data: string;
        contratos_prestador: {
          prestadores_servico: { valor_hora_padrao: number } | null;
        } | null;
      } | null;
    }

    const { data: rateios, error: erroRateios } = await supabase
      .from('apontamentos_residencial_detalhe')
      .select(
        `
        horas_trabalhadas,
        apontamentos_prestador (
          data,
          contratos_prestador (
            prestadores_servico (valor_hora_padrao)
          )
        )
      `
      )
      .eq('residencial_id', residencialId)
      .gte('criado_em', dataInicio.toISOString())
      .lt('criado_em', dataFim.toISOString())
      .overrideTypes<RateioComRelacoes[], { merge: false }>();

    if (erroRateios) throw erroRateios;

    // Calcular total
    const totalCusto = (rateios || []).reduce((sum, r) => {
      const horas = r.horas_trabalhadas;
      const valorHora =
        r.apontamentos_prestador?.contratos_prestador?.prestadores_servico?.valor_hora_padrao || 0;
      return sum + horas * valorHora;
    }, 0);

    if (totalCusto === 0) {
      return {
        sucesso: true,
        mensagem: 'Nenhum custo para este período',
        faturaGerada: false,
      };
    }

    // Buscar residencial
    const { data: residencial, error: erroResidencial } = await supabase
      .from('residenciais')
      .select('*')
      .eq('id', residencialId)
      .single();

    if (erroResidencial || !residencial) {
      return { erro: 'Residencial não encontrado', sucesso: false };
    }

    // Para cada proprietário da residencial, criar fatura
    const { data: proprietarios, error: erroProprietarios } = await supabase
      .from('imovel_propriedade')
      .select('*, imoveis(residencial_id)')
      .eq('imovel_id', residencial.id);

    if (erroProprietarios) throw erroProprietarios;

    // Gerar faturas (simplificado: uma fatura por residencial)
    // Em produção, você pode querer distribuir proporcionalmente entre proprietários
    const { data: fatura, error: erroFatura } = await supabase
      .from('faturas')
      .insert({
        imovel_id: residencial.id, // Usar primeiro imóvel como referência
        competencia: dataInicio.toISOString().split('T')[0],
        tipo: 'taxa_condominio',
        valor_bruto: totalCusto,
        valor_liquido: totalCusto,
        vencimento: new Date(dataInicio.getTime() + 15 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0], // 15 dias depois
        status: 'aberta',
      })
      .select();

    if (erroFatura) throw erroFatura;

    // Criar item de fatura
    if (fatura && fatura.length > 0) {
      const { error: erroItem } = await supabase
        .from('fatura_itens')
        .insert({
          fatura_id: fatura[0].id,
          descricao: descricao || `Serviços de manutenção - ${residencial.nome}`,
          valor: totalCusto,
        });

      if (erroItem) throw erroItem;
    }

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'gerar_fatura_servicos_residencial',
      tabela: 'faturas',
      valores_depois: {
        residencial_id: residencialId,
        competencia: dataInicio,
        valor_total: totalCusto,
      },
      endpoint: '/api/integracao/locacao/gerar-fatura',
    });

    return {
      sucesso: true,
      faturaGerada: true,
      mensagem: 'Fatura gerada com sucesso',
      faturaId: fatura && fatura.length > 0 ? fatura[0].id : null,
      valor: totalCusto.toFixed(2),
    };
  } catch (erro) {
    console.error('Erro ao gerar fatura:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Listar apontamentos não rateados (que visitaram múltiplas residências)
 */
export async function listarApontamentosNaoRateados() {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar apontamentos com múltiplas residências mas sem detalhes de rateio
    const { data: apontamentos, error: erroApontamentos } = await supabase
      .from('apontamentos_prestador')
      .select(
        `
        *,
        contratos_prestador (
          prestadores_servico (nome_completo)
        ),
        apontamentos_residencial_detalhe (id)
      `
      )
      .not('residenciais_ids', 'is', null)
      .order('criado_em', { ascending: false });

    if (erroApontamentos) throw erroApontamentos;

    // Filtrar apenas aqueles sem rateio detalhado
    const naoRateados = (apontamentos || []).filter(
      (ap) => !ap.apontamentos_residencial_detalhe || ap.apontamentos_residencial_detalhe.length === 0
    );

    return {
      sucesso: true,
      apontamentos: naoRateados,
      total: naoRateados.length,
    };
  } catch (erro) {
    console.error('Erro ao listar apontamentos não rateados:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}
