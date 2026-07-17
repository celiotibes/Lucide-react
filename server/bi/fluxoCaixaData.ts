/**
 * Preparação de dados para visualização de fluxo de caixa em Sankey
 * Mostra o movimento de dinheiro entre: Receitas → Deduções → Custos → Resultado
 */

import { createClient } from '@/lib/supabase/server';

export interface SankeyNode {
  name: string;
  id: string;
  color?: string;
}

export interface SankeyLink {
  source: number; // índice do nó de origem
  target: number; // índice do nó de destino
  value: number; // valor do fluxo
  label?: string;
}

export interface DadosFluxoCaixa {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalizadores: {
    recebitasTotal: number;
    deducoesTotal: number;
    custosTotal: number;
    resultadoLiquido: number;
  };
}

/**
 * Obter dados de fluxo de caixa para Sankey
 * Estrutura: Receitas → Deduções (devoluções, impostos) → Custos → Resultado Líquido
 */
export async function obterDadosFluxoCaixa(
  dataInicio: string,
  dataFim: string
): Promise<{ sucesso: boolean; dados?: DadosFluxoCaixa; erro?: string }> {
  try {
    const supabase = createClient();

    // Buscar KPIs financeiros
    const { data: kpis, error: erroKpi } = await supabase
      .from('vw_kpi_financeiro')
      .select('*')
      .gte('ano_mes', dataInicio.replace('-', ''))
      .lte('ano_mes', dataFim.replace('-', ''));

    if (erroKpi) throw erroKpi;

    if (!kpis || kpis.length === 0) {
      return {
        sucesso: false,
        erro: 'Nenhum dado encontrado para o período',
      };
    }

    // Agregar valores do período
    let recebitasTotal = 0;
    let deducoesTotal = 0;
    let custosTotal = 0;
    let resultadoLiquido = 0;

    for (const kpi of kpis) {
      recebitasTotal += kpi.faturamento_total || 0;
      deducoesTotal += (kpi.deducoes || 0) + (kpi.impostos || 0);
      custosTotal += (kpi.custo_operacional || 0) + (kpi.custo_despesas || 0);
      resultadoLiquido += (kpi.faturamento_total || 0) - (kpi.custo_operacional || 0) - (kpi.custo_despesas || 0);
    }

    // Buscar detalhamento de custos por categoria
    const { data: custosCategoria, error: erroCusto } = await supabase
      .from('fact_despesa')
      .select('categoria_despesa, SUM(valor_total) as total')
      .gte('data_despesa', dataInicio)
      .lte('data_despesa', dataFim)
      .group_by('categoria_despesa');

    if (erroCusto) throw erroCusto;

    // Construir nós e links
    const nodes: SankeyNode[] = [
      { id: 'receitas', name: 'Receitas', color: '#10B981' }, // Verde
      { id: 'receita_liquida', name: 'Receita Líquida', color: '#3B82F6' }, // Azul
      { id: 'custos', name: 'Custos', color: '#EF4444' }, // Vermelho
      { id: 'resultado', name: 'Resultado Líquido', color: '#8B5CF6' }, // Roxo
    ];

    // Adicionar categorias de custo como nós (se houver dados)
    const nodesCusto = (custosCategoria || []).map((cat: any, idx: number) => ({
      id: `custo_${cat.categoria_despesa || 'sem_categoria'}`,
      name: cat.categoria_despesa || 'Sem Categoria',
      color: getCor(idx),
    }));

    const links: SankeyLink[] = [];

    // Link: Receitas → Receita Líquida
    links.push({
      source: 0, // receitas
      target: 1, // receita_liquida
      value: recebitasTotal - deducoesTotal,
      label: 'Receita Líquida',
    });

    // Link: Receita Líquida → Resultado (após custos)
    const valorLiquido = recebitasTotal - deducoesTotal;
    links.push({
      source: 1, // receita_liquida
      target: 3, // resultado
      value: Math.max(0, valorLiquido - custosTotal),
      label: 'Resultado Positivo',
    });

    // Links de custos por categoria
    if (custosCategoria && custosCategoria.length > 0) {
      for (let i = 0; i < custosCategoria.length; i++) {
        const cat = custosCategoria[i];
        const total = cat.total || 0;

        // Adicionar nó de categoria se não existir
        const nodeIdx = nodes.findIndex((n) => n.id === `custo_${cat.categoria_despesa || 'sem_categoria'}`);
        if (nodeIdx === -1) {
          nodes.push(nodesCusto[i]);
        }

        // Link: Receita Líquida → Categoria de Custo
        const catIdx = nodes.findIndex((n) => n.id === `custo_${cat.categoria_despesa || 'sem_categoria'}`);
        links.push({
          source: 1, // receita_liquida
          target: catIdx, // categoria de custo
          value: total,
          label: `${cat.categoria_despesa || 'Sem Categoria'}: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        });

        // Link: Categoria de Custo → Resultado (desconta do resultado)
        links.push({
          source: catIdx, // categoria de custo
          target: 3, // resultado
          value: total,
          label: '',
        });
      }
    }

    // Se não houver categorias, mostrar custo total
    if (!custosCategoria || custosCategoria.length === 0) {
      nodes.push({ id: 'custo_total', name: 'Custos Totais', color: '#F59E0B' });
      links.push({
        source: 1, // receita_liquida
        target: 3, // custo_total
        value: custosTotal,
        label: 'Custos Totais',
      });
    }

    return {
      sucesso: true,
      dados: {
        nodes,
        links,
        totalizadores: {
          recebitasTotal,
          deducoesTotal,
          custosTotal,
          resultadoLiquido,
        },
      },
    };
  } catch (erro) {
    console.error('Erro ao obter dados de fluxo de caixa:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

/**
 * Cores para categorias de custo (6 cores principais)
 */
function getCor(indice: number): string {
  const cores = [
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#14B8A6', // Teal
    '#F97316', // Orange
  ];
  return cores[indice % cores.length];
}
