/**
 * ============================================================================
 * Database Queries: Contratos
 * ============================================================================
 * Centraliza todas as queries de contratos do Supabase para eliminar
 * duplicação em rotas de API. Padrão: cada função é uma query com
 * tratamento de erro consistente.
 */

import { createClient } from '@/lib/supabase/server';
import { logError } from '@/server/api/middleware';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Busca um contrato ativo pelo ID
 */
export async function obterContratoAtivo(contratoId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contratos')
      .select('id, status, valor_mensal, data_inicio, data_fim')
      .eq('id', contratoId)
      .eq('status', 'ativo')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao obter contrato ativo', erro, { contratoId });
    return { data: null, error: erro };
  }
}

/**
 * Busca contrato de prestador pelo ID do prestador
 */
export async function obterContratoPrestador(
  prestadorId: string,
  tipoContrato?: 'fixo' | 'variavel'
) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from('contratos_prestador')
      .select('id, prestador_id, tipo_contrato, status');

    query = query.eq('prestador_id', prestadorId);

    if (tipoContrato) {
      query = query.eq('tipo_contrato', tipoContrato);
    }

    const { data, error } = await query.single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao obter contrato de prestador', erro, {
      prestadorId,
      tipoContrato,
    });
    return { data: null, error: erro };
  }
}

/**
 * Busca todos os contratos ativos de um cliente
 */
export async function obterContratosCliente(clienteId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contratos')
      .select(
        'id, status, tipo_imovel, valor_mensal, data_inicio, data_fim, pessoas (id, nome_completo)'
      )
      .eq('cliente_id', clienteId)
      .eq('status', 'ativo')
      .order('data_inicio', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao obter contratos do cliente', erro, { clienteId });
    return { data: null, error: erro };
  }
}

/**
 * Busca contratos que vão vencer em N dias
 */
export async function obterContratosVencimento(diasAnticipado: number = 30) {
  try {
    const supabase = await createClient();
    const hoje = new Date();
    const dataLimite = new Date(hoje.getTime() + diasAnticipado * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('contratos')
      .select('id, cliente_id, data_fim, valor_mensal')
      .eq('status', 'ativo')
      .lte('data_fim', dataLimite.toISOString())
      .gte('data_fim', hoje.toISOString())
      .order('data_fim', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao obter contratos com vencimento próximo', erro, {
      diasAnticipado,
    });
    return { data: null, error: erro };
  }
}

/**
 * Cria um novo contrato
 */
export async function criarContrato(
  clienteId: string,
  dados: {
    tipo_imovel: string;
    valor_mensal: number;
    data_inicio: string;
    data_fim?: string;
    descricao?: string;
  }
) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contratos')
      .insert({
        cliente_id: clienteId,
        status: 'ativo',
        ...dados,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao criar contrato', erro, { clienteId, dados });
    return { data: null, error: erro };
  }
}

/**
 * Atualiza status de contrato
 */
export async function atualizarStatusContrato(
  contratoId: string,
  novoStatus: string
) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contratos')
      .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
      .eq('id', contratoId)
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao atualizar status do contrato', erro, {
      contratoId,
      novoStatus,
    });
    return { data: null, error: erro };
  }
}
