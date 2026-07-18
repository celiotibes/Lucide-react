/**
 * Preparação de dados para heatmap de centros de custo
 * Mostra a intensidade de custos por categoria e período (ou residencial)
 */

import { createClient } from '@/lib/supabase/server';
import type { CelulaPorCalor, DadosAnaliseCalor } from './analiseCalorCores';

export type { CelulaPorCalor, DadosAnaliseCalor };
export { mapearValorParaCor } from './analiseCalorCores';

/**
 * Obter dados de análise de custos por calor (heatmap)
 */
export async function obterDadosAnaliseCalor(
  dataInicio: string,
  dataFim: string,
  agruparPor: 'categoria' | 'residencial' = 'categoria'
): Promise<{ sucesso: boolean; dados?: DadosAnaliseCalor; erro?: string }> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('fact_despesa')
      .select(
        agruparPor === 'categoria'
          ? 'data_despesa, categoria_despesa, valor_total'
          : 'data_despesa, residencial_id, valor_total'
      )
      .gte('data_despesa', dataInicio)
      .lte('data_despesa', dataFim);

    const { data: despesas, error: erroFetch } = await query;

    if (erroFetch) throw erroFetch;

    if (!despesas || despesas.length === 0) {
      return {
        sucesso: false,
        erro: 'Nenhum dado encontrado para o período',
      };
    }

    // Processar dados
    const mapaPeriodoCategoria: Record<string, Record<string, number>> = {};
    const setPeriodos = new Set<string>();
    const setCategorias = new Set<string>();
    let total = 0;

    for (const despesa of despesas) {
      const data = new Date(despesa.data_despesa);
      const periodo = `${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
      const categoria =
        agruparPor === 'categoria'
          ? despesa.categoria_despesa || 'Sem Categoria'
          : despesa.residencial_id || 'Sem Residencial';

      setPeriodos.add(periodo);
      setCategorias.add(categoria);

      if (!mapaPeriodoCategoria[periodo]) {
        mapaPeriodoCategoria[periodo] = {};
      }

      if (!mapaPeriodoCategoria[periodo][categoria]) {
        mapaPeriodoCategoria[periodo][categoria] = 0;
      }

      mapaPeriodoCategoria[periodo][categoria] += despesa.valor_total || 0;
      total += despesa.valor_total || 0;
    }

    // Construir células
    const celulas: CelulaPorCalor[] = [];
    const valores: number[] = [];

    for (const periodo of Array.from(setPeriodos).sort()) {
      for (const categoria of Array.from(setCategorias).sort()) {
        const valor = mapaPeriodoCategoria[periodo]?.[categoria] || 0;
        celulas.push({
          periodo,
          categoria,
          valor,
          percentual: total > 0 ? (valor / total) * 100 : 0,
        });
        if (valor > 0) {
          valores.push(valor);
        }
      }
    }

    const minimo = valores.length > 0 ? Math.min(...valores) : 0;
    const maximo = valores.length > 0 ? Math.max(...valores) : 0;
    const media = valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;

    return {
      sucesso: true,
      dados: {
        celulas,
        periodos: Array.from(setPeriodos).sort(),
        categorias: Array.from(setCategorias).sort(),
        minimo,
        maximo,
        media,
      },
    };
  } catch (erro) {
    console.error('Erro ao obter dados de análise de calor:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}
