'use server';

import { createClient } from '@/lib/supabase/server';
import { obterDadosAnaliseCalor, type DadosAnaliseCalor } from '@/server/bi/analiseCalorData';

/**
 * Obter dados de análise de custos por calor (heatmap)
 */
export async function obterAnaliseCalor(
  dataInicio: string,
  dataFim: string,
  agruparPor: 'categoria' | 'residencial' = 'categoria'
): Promise<{
  sucesso: boolean;
  dados?: DadosAnaliseCalor;
  erro?: string;
}> {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    // Obter dados de análise de calor
    const resultado = await obterDadosAnaliseCalor(dataInicio, dataFim, agruparPor);

    return resultado;
  } catch (erro) {
    console.error('Erro ao obter análise de calor:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}
