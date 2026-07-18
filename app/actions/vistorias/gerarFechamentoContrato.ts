'use server';

import { createClient } from '@/lib/supabase/server';
import {
  calcularFechamentoContrato,
  type ItemCreditoInput,
  type ItemDebitoInput,
} from '@/server/vistorias/fechamentoContrato';

export interface GerarFechamentoInput {
  vistoriaSaidaId: string;
  contratoId: string;
  debitos: ItemDebitoInput[];
  creditos: ItemCreditoInput[];
  caucao:
    | { fonte: 'extrato_manual'; valorAtualizado: number }
    | {
        fonte: 'indice_bacen';
        /**
         * Taxa mensal (ou média do período) já resolvida a partir da série
         * SGS do Bacen. A integração com a API do Bacen (docs/plano-
         * desenvolvimento-vistorias.md §3) ainda não está conectada nesta
         * action — por ora quem chama precisa resolver a taxa e passá-la
         * aqui, igual ao contrato já assumido por calcularRendimentoCaucao.
         */
        taxaMensal: number;
        indicePeriodo?: string;
      }
    | null;
}

// RLS (migration-modulo-vistorias.sql) restringe a escrita em
// `fechamentos_contrato`/`itens_fechamento` a admin/economista — este
// action não duplica a checagem de papel, só repassa o erro do Postgres
// se a política negar.
export async function gerarFechamentoContrato(input: GerarFechamentoInput) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: 'Não autenticado' };
  }

  let caucaoParaCalculo: Parameters<typeof calcularFechamentoContrato>[0]['caucao'] = null;
  let caucaoGarantiaId: string | null = null;

  if (input.caucao) {
    const { data: garantia, error: garantiaError } = await supabase
      .from('garantias')
      .select('id, valor, data_inicio')
      .eq('contrato_id', input.contratoId)
      .eq('tipo', 'caucao')
      .eq('status', 'ativa')
      .maybeSingle();

    if (garantiaError) {
      return { error: `Falha ao buscar garantia de caução: ${garantiaError.message}` };
    }
    if (!garantia) {
      return { error: 'Contrato não tem garantia do tipo caução ativa cadastrada' };
    }

    caucaoGarantiaId = garantia.id as string;

    if (input.caucao.fonte === 'extrato_manual') {
      caucaoParaCalculo = { fonte: 'extrato_manual', valorAtualizado: input.caucao.valorAtualizado };
    } else {
      const diasDecorridos = Math.max(
        0,
        Math.round((Date.now() - new Date(garantia.data_inicio as string).getTime()) / (1000 * 60 * 60 * 24)),
      );
      caucaoParaCalculo = {
        fonte: 'indice_bacen',
        valorBase: garantia.valor as number,
        taxaMensal: input.caucao.taxaMensal,
        diasDecorridos,
        indicePeriodo: input.caucao.indicePeriodo,
      };
    }
  }

  let resultado;
  try {
    resultado = calcularFechamentoContrato({
      debitos: input.debitos,
      creditos: input.creditos,
      caucao: caucaoParaCalculo,
    });
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : 'Falha ao calcular fechamento' };
  }

  const { data: fechamento, error: fechamentoError } = await supabase
    .from('fechamentos_contrato')
    .upsert(
      {
        contrato_id: input.contratoId,
        vistoria_saida_id: input.vistoriaSaidaId,
        caucao_garantia_id: caucaoGarantiaId,
        caucao_valor_atualizado: resultado.caucaoValorAtualizado,
        caucao_fonte: resultado.caucaoFonte,
        caucao_indice_periodo: resultado.caucaoIndicePeriodo,
        total_debitos: resultado.totalDebitos,
        total_creditos: resultado.totalCreditos,
        saldo_final: resultado.saldoFinal,
        status: 'rascunho',
      },
      { onConflict: 'vistoria_saida_id' },
    )
    .select('id')
    .single();

  if (fechamentoError || !fechamento) {
    return { error: `Falha ao gravar fechamento: ${fechamentoError?.message ?? 'erro desconhecido'}` };
  }

  // Substitui os itens anteriores (se o fechamento estava em rascunho e foi
  // recalculado) para não acumular lançamentos duplicados a cada chamada.
  const { error: deleteError } = await supabase
    .from('itens_fechamento')
    .delete()
    .eq('fechamento_id', fechamento.id);

  if (deleteError) {
    return { error: `Falha ao limpar itens anteriores do fechamento: ${deleteError.message}` };
  }

  const { error: itensError } = await supabase.from('itens_fechamento').insert(
    resultado.itens.map((item) => ({
      fechamento_id: fechamento.id,
      tipo: item.tipo,
      origem: item.origem,
      descricao: item.descricao,
      valor: item.valor,
      item_vistoria_id: item.itemVistoriaId ?? null,
      ordem_servico_id: item.ordemServicoId ?? null,
      anexo_url: item.anexoUrl ?? null,
    })),
  );

  if (itensError) {
    return { error: `Falha ao gravar itens do fechamento: ${itensError.message}` };
  }

  return {
    data: {
      fechamentoId: fechamento.id as string,
      totalDebitos: resultado.totalDebitos,
      totalCreditos: resultado.totalCreditos,
      saldoFinal: resultado.saldoFinal,
      caucaoValorAtualizado: resultado.caucaoValorAtualizado,
    },
  };
}
