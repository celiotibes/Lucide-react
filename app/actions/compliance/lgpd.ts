'use server';

import { createClient } from '@/lib/supabase/server';
import { auditLogger } from '@/server/compliance/auditLogger';

/**
 * Solicitar anonimização de dados (LGPD)
 */
export async function solicitarAnonimizacao(pessoa_id: string, motivo?: string) {
  try {
    const supabase = await createClient();

    // Validar autenticação
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { erro: 'Não autenticado', sucesso: false };
    }

    // Registrar requisição LGPD
    const resultado = await auditLogger.registrarRequisicaoLgpd(
      pessoa_id,
      'anonimizacao',
      motivo || 'Solicitação de anonimização via sistema'
    );

    if (!resultado.sucesso) {
      return { erro: resultado.erro, sucesso: false };
    }

    // Notificar administrador
    const { data: admin } = await supabase
      .from('pessoas')
      .select('email')
      .eq('email', process.env.ADMIN_EMAIL || 'admin@crmt.dev')
      .single();

    if (admin?.email) {
      // Aqui enviaria notificação para compliance
      console.log(`Requisição LGPD de anonimização para ${pessoa_id} registrada`);
    }

    return {
      sucesso: true,
      requisicao_id: resultado.requisicao_id,
      mensagem: 'Sua solicitação foi registrada e será processada em até 30 dias',
    };
  } catch (erro) {
    console.error('Erro ao solicitar anonimização:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Executar anonimização aprovada
 */
export async function executarAnonimizacao(requisicao_id: string) {
  try {
    const supabase = await createClient();

    // Validar permissão (apenas compliance officer)
    const { data: user } = await supabase.auth.getUser();
    if (!user) {
      return { erro: 'Não autenticado', sucesso: false };
    }

    // Verificar se é compliance officer
    const { data: role } = await supabase
      .from('pessoas')
      .select('papel')
      .eq('id', user.user?.id)
      .single();

    if (role?.papel !== 'compliance_officer') {
      return { erro: 'Permissão negada', sucesso: false };
    }

    // Buscar requisição
    const { data: requisicao, error: erroRequisicao } = await supabase
      .from('requisicoes_lgpd')
      .select('*, pessoa_id')
      .eq('id', requisicao_id)
      .single();

    if (erroRequisicao || !requisicao) {
      return { erro: 'Requisição não encontrada', sucesso: false };
    }

    // Executar anonimização
    const resultado = await auditLogger.anonimizarPessoa(
      requisicao.pessoa_id,
      requisicao_id
    );

    if (!resultado.sucesso) {
      return { erro: resultado.erro, sucesso: false };
    }

    return {
      sucesso: true,
      mensagem: 'Pessoa anonimizada com sucesso',
      detalhes: resultado.resultado,
    };
  } catch (erro) {
    console.error('Erro ao executar anonimização:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Exportar dados para portabilidade (LGPD)
 */
export async function exportarDadosPessoa(pessoa_id: string) {
  try {
    const supabase = await createClient();

    // Validar que está solicitando seus próprios dados ou é admin
    const { data: user } = await supabase.auth.getUser();
    if (!user) {
      return { erro: 'Não autenticado', sucesso: false };
    }

    // Se não é admin, valida que está solicitando seus dados
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin && user.user?.id !== pessoa_id) {
      return { erro: 'Permissão negada', sucesso: false };
    }

    // Registrar requisição de portabilidade
    const { data: requisicao } = await supabase
      .from('requisicoes_lgpd')
      .insert({
        pessoa_id,
        tipo: 'portabilidade',
        status: 'pendente',
        solicitado_por: user.user?.id,
      })
      .select('id')
      .single();

    // Buscar dados da pessoa
    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('*')
      .eq('id', pessoa_id)
      .single();

    // Buscar contratos (se for prestador)
    const { data: prestador } = await supabase
      .from('prestadores_servico')
      .select('*, contratos_prestador(*)')
      .eq('pessoa_id', pessoa_id)
      .single();

    // Buscar apontamentos
    const { data: apontamentos } = await supabase
      .from('apontamentos_prestador')
      .select('*')
      .eq('contrato_id', prestador?.contratos_prestador?.[0]?.id || null);

    // Buscar fechamentos
    const { data: fechamentos } = await supabase
      .from('fechamentos_prestador')
      .select('*')
      .eq('contrato_id', prestador?.contratos_prestador?.[0]?.id || null);

    const dados = {
      pessoa,
      prestador: prestador ? {
        id: prestador.id,
        nome_completo: prestador.nome_completo,
        categoria: prestador.categoria,
        contratos: prestador.contratos_prestador,
      } : null,
      apontamentos: apontamentos || [],
      fechamentos: fechamentos || [],
      exportado_em: new Date().toISOString(),
      requisicao_id: requisicao?.id,
    };

    // Atualizar requisição como exportada
    if (requisicao) {
      await supabase
        .from('requisicoes_lgpd')
        .update({
          status: 'executado',
          arquivo_exportado_em: new Date().toISOString(),
          arquivo_format: 'json',
        })
        .eq('id', requisicao.id);
    }

    return {
      sucesso: true,
      dados,
      mensagem: 'Seus dados foram exportados com sucesso',
    };
  } catch (erro) {
    console.error('Erro ao exportar dados:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Revogar consentimento
 */
export async function revogarConsentimento(tipo_consentimento: string) {
  try {
    const supabase = await createClient();

    const { data: user } = await supabase.auth.getUser();
    if (!user) {
      return { erro: 'Não autenticado', sucesso: false };
    }

    // Buscar pessoa
    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('id')
      .eq('id', user.user?.id)
      .single();

    if (!pessoa) {
      return { erro: 'Pessoa não encontrada', sucesso: false };
    }

    // Atualizar consentimento como revogado
    const { error } = await supabase
      .from('auditoria_consentimento')
      .update({
        status: 'revogado',
        revogado_em: new Date().toISOString(),
      })
      .eq('pessoa_id', pessoa.id)
      .eq('tipo_consentimento', tipo_consentimento)
      .eq('status', 'concedido');

    if (error) {
      return { erro: error.message, sucesso: false };
    }

    return {
      sucesso: true,
      mensagem: `Consentimento para ${tipo_consentimento} foi revogado`,
    };
  } catch (erro) {
    console.error('Erro ao revogar consentimento:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Listar requisições LGPD (admin only)
 */
export async function listarRequisicoes(filtro?: { status?: string; tipo?: string }) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Permissão negada', sucesso: false };
    }

    let query = supabase
      .from('requisicoes_lgpd')
      .select('*, pessoas(nome, email)')
      .order('solicitado_em', { ascending: false });

    if (filtro?.status) {
      query = query.eq('status', filtro.status);
    }

    if (filtro?.tipo) {
      query = query.eq('tipo', filtro.tipo);
    }

    const { data, error } = await query;

    if (error) {
      return { erro: error.message, sucesso: false };
    }

    return {
      sucesso: true,
      requisicoes: data || [],
    };
  } catch (erro) {
    console.error('Erro ao listar requisições:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Verificar alertas de compliance
 */
export async function verificarAlertas() {
  try {
    const resultado = await auditLogger.verificarAlertas();

    if (!resultado.sucesso) {
      return { erro: resultado.erro, sucesso: false };
    }

    // Agrupar alertas por severidade
    const porSeveridade = {
      critical: (resultado.alertas || []).filter(a => a.severidade === 'critical'),
      warning: (resultado.alertas || []).filter(a => a.severidade === 'warning'),
      info: (resultado.alertas || []).filter(a => a.severidade === 'info'),
    };

    return {
      sucesso: true,
      alertas: resultado.alertas || [],
      resumo: {
        total: (resultado.alertas || []).length,
        criticos: porSeveridade.critical.length,
        avisos: porSeveridade.warning.length,
        informativos: porSeveridade.info.length,
      },
    };
  } catch (erro) {
    console.error('Erro ao verificar alertas:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}
