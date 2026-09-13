/**
 * ============================================================================
 * Database Queries: Pessoas
 * ============================================================================
 * Centraliza todas as queries de pessoas/clientes do Supabase para eliminar
 * duplicação em rotas de API.
 */

import { createClient } from '@/lib/supabase/server';
import { logError } from '@/server/api/middleware';

/**
 * Busca uma pessoa pelo ID
 */
export async function obterPessoa(pessoaId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pessoas')
      .select('id, nome_completo, email, telefone, cpf, tipo')
      .eq('id', pessoaId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao obter pessoa', erro, { pessoaId });
    return { data: null, error: erro };
  }
}

/**
 * Busca pessoa por email
 */
export async function obterPessoaPorEmail(email: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pessoas')
      .select('id, nome_completo, email, telefone, cpf, tipo')
      .eq('email', email)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao obter pessoa por email', erro, { email });
    return { data: null, error: erro };
  }
}

/**
 * Lista todas as pessoas ativas de um tipo específico
 */
export async function listarPessoas(tipo?: 'cliente' | 'prestador' | 'funcionario') {
  try {
    const supabase = await createClient();
    let query = supabase
      .from('pessoas')
      .select('id, nome_completo, email, telefone, cpf, tipo, ativo')
      .eq('ativo', true);

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query.order('nome_completo', {
      ascending: true,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao listar pessoas', erro, { tipo });
    return { data: null, error: erro };
  }
}

/**
 * Cria uma nova pessoa
 */
export async function criarPessoa(dados: {
  nome_completo: string;
  email: string;
  telefone?: string;
  cpf?: string;
  tipo: 'cliente' | 'prestador' | 'funcionario';
  documento_rg?: string;
  data_nascimento?: string;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pessoas')
      .insert({
        ativo: true,
        ...dados,
      })
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao criar pessoa', erro, { dados });
    return { data: null, error: erro };
  }
}

/**
 * Atualiza dados de uma pessoa
 */
export async function atualizarPessoa(
  pessoaId: string,
  dados: Partial<{
    nome_completo: string;
    email: string;
    telefone: string;
    cpf: string;
    ativo: boolean;
  }>
) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pessoas')
      .update({
        ...dados,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', pessoaId)
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao atualizar pessoa', erro, { pessoaId, dados });
    return { data: null, error: erro };
  }
}

/**
 * Desativa uma pessoa (soft delete)
 */
export async function desativarPessoa(pessoaId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pessoas')
      .update({
        ativo: false,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', pessoaId)
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao desativar pessoa', erro, { pessoaId });
    return { data: null, error: erro };
  }
}

/**
 * Busca pessoas com contatos específicos
 */
export async function buscarPessoasComContato(termo: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pessoas')
      .select('id, nome_completo, email, telefone, tipo')
      .eq('ativo', true)
      .or(
        `nome_completo.ilike.%${termo}%,email.ilike.%${termo}%,telefone.ilike.%${termo}%`
      )
      .limit(10);

    if (error) throw error;
    return { data, error: null };
  } catch (erro) {
    logError('Erro ao buscar pessoas com contato', erro, { termo });
    return { data: null, error: erro };
  }
}
