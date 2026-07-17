'use server';

import { createClient } from '@/lib/supabase/server';
import { auditLogger } from '@/server/compliance/auditLogger';

export interface KPIFinanceiro {
  ano: number;
  mes: number;
  nomeMes: string;
  faturamentoTotal: number;
  deducoesTotal: number;
  receitaLiquida: number;
  custoOperacional: number;
  custoDespesas: number;
  margemBruta: number;
  margemPercentual: number;
  totalRecebido: number;
  quantidadeFaturas: number;
}

export interface ResumenMensalResidencial {
  residencial: string;
  ano: number;
  mes: number;
  totalApontamentos: number;
  totalHoras: number;
  custoTotal: number;
  anomaliasDetectadas: number;
  faturamento: number;
  faturamentoLiquido: number;
  recebimento: number;
}

export interface PerformancePrestador {
  nomePrestador: string;
  ano: number;
  mes: number;
  apontamentos: number;
  horasTotais: number;
  mediaHorasDia: number;
  valorTotal: number;
  valorHoraEfetivo: number;
  anomalias: number;
  taxaAnomalia: number;
}

/**
 * Obter KPIs financeiros de um período
 */
export async function obterKPIsFinanceiros(
  dataInicio: string,
  dataFim: string
): Promise<{
  sucesso: boolean;
  kpis?: KPIFinanceiro[];
  totalizadores?: {
    faturamentoTotal: number;
    receitaLiquidaTotal: number;
    custoTotal: number;
    margemMedia: number;
  };
  erro?: string;
}> {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    const { data: kpis, error: erroFetch } = await supabase.from('vw_kpi_financeiro').select('*');

    if (erroFetch) throw erroFetch;

    if (!kpis || kpis.length === 0) {
      return { sucesso: true, kpis: [] };
    }

    // Transformar e filtrar por período
    const kpisFormatados: KPIFinanceiro[] = kpis
      .filter((k) => {
        const dataKpi = new Date(k.ano, k.mes - 1, 1);
        const dataInicioObj = new Date(dataInicio);
        const dataFimObj = new Date(dataFim);
        return dataKpi >= dataInicioObj && dataKpi <= dataFimObj;
      })
      .map((k) => ({
        ano: k.ano,
        mes: k.mes,
        nomeMes: k.nome_mes,
        faturamentoTotal: parseFloat(k.faturamento_total || 0),
        deducoesTotal: parseFloat(k.deducoes_total || 0),
        receitaLiquida: parseFloat(k.receita_liquida || 0),
        custoOperacional: parseFloat(k.custo_operacional || 0),
        custoDespesas: parseFloat(k.custo_despesas || 0),
        margemBruta: parseFloat(k.margem_bruta || 0),
        margemPercentual: parseFloat(k.margem_percentual || 0),
        totalRecebido: parseFloat(k.total_recebido || 0),
        quantidadeFaturas: k.quantidade_faturas || 0,
      }));

    // Calcular totalizadores
    const totalizadores = {
      faturamentoTotal: kpisFormatados.reduce((sum, k) => sum + k.faturamentoTotal, 0),
      receitaLiquidaTotal: kpisFormatados.reduce((sum, k) => sum + k.receitaLiquida, 0),
      custoTotal:
        kpisFormatados.reduce((sum, k) => sum + k.custoOperacional, 0) +
        kpisFormatados.reduce((sum, k) => sum + k.custoDespesas, 0),
      margemMedia:
        kpisFormatados.length > 0
          ? kpisFormatados.reduce((sum, k) => sum + k.margemPercentual, 0) / kpisFormatados.length
          : 0,
    };

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'consultar_kpi_financeiro',
      tabela: 'vw_kpi_financeiro',
      valores_depois: {
        periodo: `${dataInicio} a ${dataFim}`,
        registros: kpisFormatados.length,
      },
      endpoint: '/api/bi/kpis',
    });

    return { sucesso: true, kpis: kpisFormatados, totalizadores };
  } catch (erro) {
    console.error('Erro ao obter KPIs:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

/**
 * Obter resumo por residencial
 */
export async function obterResumoResidenciais(
  dataInicio: string,
  dataFim: string
): Promise<{
  sucesso: boolean;
  residenciais?: ResumenMensalResidencial[];
  erro?: string;
}> {
  try {
    const supabase = createClient();

    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    const { data: resumo, error: erroFetch } = await supabase
      .from('vw_resumo_mensal_residencial')
      .select('*');

    if (erroFetch) throw erroFetch;

    if (!resumo || resumo.length === 0) {
      return { sucesso: true, residenciais: [] };
    }

    const residenciaisFormatadas: ResumenMensalResidencial[] = resumo
      .filter((r) => {
        const dataRes = new Date(r.ano, r.mes - 1, 1);
        const dataInicioObj = new Date(dataInicio);
        const dataFimObj = new Date(dataFim);
        return dataRes >= dataInicioObj && dataRes <= dataFimObj;
      })
      .map((r) => ({
        residencial: r.nome,
        ano: r.ano,
        mes: r.mes,
        totalApontamentos: r.total_apontamentos || 0,
        totalHoras: parseFloat(r.total_horas || 0),
        custoTotal: parseFloat(r.custo_total || 0),
        anomaliasDetectadas: r.anomalias_detectadas || 0,
        faturamento: parseFloat(r.faturamento || 0),
        faturamentoLiquido: parseFloat(r.faturamento_liquido || 0),
        recebimento: parseFloat(r.recebimento || 0),
      }));

    return { sucesso: true, residenciais: residenciaisFormatadas };
  } catch (erro) {
    console.error('Erro ao obter resumo residenciais:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

/**
 * Obter performance por prestador
 */
export async function obterPerformancePrestadores(
  dataInicio: string,
  dataFim: string
): Promise<{
  sucesso: boolean;
  prestadores?: PerformancePrestador[];
  erro?: string;
}> {
  try {
    const supabase = createClient();

    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    const { data: performance, error: erroFetch } = await supabase
      .from('vw_performance_prestador')
      .select('*');

    if (erroFetch) throw erroFetch;

    if (!performance || performance.length === 0) {
      return { sucesso: true, prestadores: [] };
    }

    const prestadoresFormatados: PerformancePrestador[] = performance
      .filter((p) => {
        const dataPrest = new Date(p.ano, p.mes - 1, 1);
        const dataInicioObj = new Date(dataInicio);
        const dataFimObj = new Date(dataFim);
        return dataPrest >= dataInicioObj && dataPrest <= dataFimObj;
      })
      .map((p) => ({
        nomePrestador: p.nome_completo,
        ano: p.ano,
        mes: p.mes,
        apontamentos: p.apontamentos || 0,
        horasTotais: parseFloat(p.horas_totais || 0),
        mediaHorasDia: parseFloat(p.media_horas_dia || 0),
        valorTotal: parseFloat(p.valor_total || 0),
        valorHoraEfetivo: parseFloat(p.valor_hora_efetivo || 0),
        anomalias: p.anomalias || 0,
        taxaAnomalia: parseFloat(p.taxa_anomalia || 0),
      }));

    return { sucesso: true, prestadores: prestadoresFormatados };
  } catch (erro) {
    console.error('Erro ao obter performance:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}
