/**
 * ============================================================================
 * Database Queries: Faturas
 * ============================================================================
 * Centraliza todas as queries de faturas do Supabase para eliminar
 * duplicação em rotas de API e crons.
 */

import { createClient } from '@/lib/supabase/server';
import { logError } from '@/server/api/middleware';

/**
 * Busca uma fatura pelo ID
 */
export async function obterFatura(faturaId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('faturas')
      .select(
        'id, contrato_id, cliente_id, valor, status, data_emissao, data_vencimento, descricao'
      )
      .eq('id', faturaId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao obter fatura', erro, { faturaId });
    return { data: null, error: erro };
  }
}

/**
 * Lista faturas de um contrato
 */
export async function listarFaturasContrato(
  contratoId: string,
  status?: string
) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from('faturas')
      .select('id, valor, status, data_vencimento, data_pagamento')
      .eq('contrato_id', contratoId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('data_emissao', {
      ascending: false,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao listar faturas do contrato', erro, {
      contratoId,
      status,
    });
    return { data: null, error: erro };
  }
}

/**
 * Busca faturas vencidas ou vencendo em breve
 */
export async function obterFaturasVencimento(diasAntecipado: number = 7) {
  try {
    const supabase = await createClient();
    const hoje = new Date();
    const dataLimite = new Date(
      hoje.getTime() + diasAntecipado * 24 * 60 * 60 * 1000
    );

    const { data, error } = await supabase
      .from('faturas')
      .select(
        'id, contrato_id, cliente_id, valor, status, data_vencimento, pessoas (email, telefone)'
      )
      .eq('status', 'aberta')
      .lte('data_vencimento', dataLimite.toISOString())
      .order('data_vencimento', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao obter faturas com vencimento próximo', erro, {
      diasAntecipado,
    });
    return { data: null, error: erro };
  }
}

/**
 * Cria uma nova fatura
 */
export async function criarFatura(dados: {
  contrato_id: string;
  cliente_id: string;
  valor: number;
  data_vencimento: string;
  descricao?: string;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('faturas')
      .insert({
        status: 'aberta',
        data_emissao: new Date().toISOString(),
        ...dados,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao criar fatura', erro, { dados });
    return { data: null, error: erro };
  }
}

/**
 * Atualiza o status de uma fatura
 */
export async function atualizarStatusFatura(
  faturaId: string,
  novoStatus: 'aberta' | 'paga' | 'cancelada' | 'renegociada'
) {
  try {
    const supabase = await createClient();
    const atualizacoes: any = { status: novoStatus, atualizado_em: new Date().toISOString() };

    if (novoStatus === 'paga') {
      atualizacoes.data_pagamento = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('faturas')
      .update(atualizacoes)
      .eq('id', faturaId)
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao atualizar status da fatura', erro, {
      faturaId,
      novoStatus,
    });
    return { data: null, error: erro };
  }
}

/**
 * Obtém valor total em aberto de um cliente
 */
export async function obterTotalEmAbertoCliente(clienteId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('faturas')
      .select('valor')
      .eq('cliente_id', clienteId)
      .eq('status', 'aberta');

    if (error) throw error;

    const total = data?.reduce((sum, fatura) => sum + (fatura.valor || 0), 0) ?? 0;
    return { data: { total }, error: null };
  } catch (erro) {
    logError('Erro ao obter total em aberto do cliente', erro, { clienteId });
    return { data: null, error: erro };
  }
}

/**
 * Lista faturas para um período específico
 */
export async function listarFaturasPeríodo(
  dataInicio: string,
  dataFim: string,
  status?: string
) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from('faturas')
      .select(
        'id, contrato_id, cliente_id, valor, status, data_emissao, data_vencimento'
      )
      .gte('data_emissao', dataInicio)
      .lte('data_emissao', dataFim);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('data_emissao', {
      ascending: false,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao listar faturas por período', erro, {
      dataInicio,
      dataFim,
      status,
    });
    return { data: null, error: erro };
  }
}
