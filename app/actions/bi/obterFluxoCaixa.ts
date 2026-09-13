'use server';

import { createClient } from '@/lib/supabase/server';
import { obterDadosFluxoCaixa, type DadosFluxoCaixa } from '@/server/bi/fluxoCaixaData';

/**
 * Obter dados de fluxo de caixa para visualização Sankey
 */
export async function obterFluxoCaixa(
  dataInicio: string,
  dataFim: string
): Promise<{
  sucesso: boolean;
  dados?: DadosFluxoCaixa;
  erro?: string;
}> {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    // Obter dados de fluxo de caixa
    const resultado = await obterDadosFluxoCaixa(dataInicio, dataFim);

    return resultado;
  } catch (erro) {
    console.error('Erro ao obter fluxo de caixa:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}
