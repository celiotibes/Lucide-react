'use server';

import { createClient } from '@/lib/supabase/server';
import { auditLogger } from '@/server/compliance/auditLogger';
import { Notificador } from '@/server/notificacao/Notificador';

/**
 * Aprovar fechamento individual
 */
export async function aprovarFechamento(fechamentoId: string, observacoes?: string) {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar fechamento
    const { data: fechamento, error: erroFechamento } = await supabase
      .from('fechamentos_prestador')
      .select(
        `
        *,
        contratos_prestador (
          prestadores_servico (id, nome_completo, email, telefone)
        )
      `
      )
      .eq('id', fechamentoId)
      .single();

    if (erroFechamento || !fechamento) {
      return { erro: 'Fechamento não encontrado', sucesso: false };
    }

    // Validar status
    if (fechamento.status !== 'enviado_para_gestao' && fechamento.status !== 'devolvido') {
      return {
        erro: `Apenas fechamentos em "Enviado para Gestão" ou "Devolvido" podem ser aprovados (status atual: ${fechamento.status})`,
        sucesso: false,
      };
    }

    // Atualizar status
    const { error: erroUpdate } = await supabase
      .from('fechamentos_prestador')
      .update({
        status: 'aprovado',
        observacoes_gestor: observacoes || null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', fechamentoId);

    if (erroUpdate) throw erroUpdate;

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'aprovar',
      tabela: 'fechamentos_prestador',
      registro_id: fechamentoId,
      valores_antes: { status: fechamento.status },
      valores_depois: { status: 'aprovado' },
      endpoint: '/api/fechamentos/aprovar',
    });

    // Notificar prestador
    const prestador = fechamento.contratos_prestador?.prestadores_servico;
    if (prestador?.email) {
      const notificador = new Notificador();
      await notificador.enviar({
        canais: ['email'],
        destinatario: {
          email: prestador.email,
          telefone: prestador.telefone,
          nome: prestador.nome_completo,
        },
        template: {
          titulo: 'Fechamento Aprovado! ✓',
          corpo: `Seu fechamento de R$ {{valor}} foi aprovado!\n\nEm breve você receberá o pagamento via PIX.`,
          acaoUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/painel-prestador/fechamentos/${fechamentoId}`,
          acaoTexto: 'Ver Fechamento',
        },
        variaveis: {
          valor: fechamento.valor_liquido.toFixed(2),
        },
      });
    }

    return {
      sucesso: true,
      mensagem: 'Fechamento aprovado com sucesso',
    };
  } catch (erro) {
    console.error('Erro ao aprovar fechamento:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Devolver fechamento para revisão
 */
export async function devolverFechamento(fechamentoId: string, motivo: string) {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    if (!motivo || motivo.trim().length === 0) {
      return { erro: 'Motivo da devolução é obrigatório', sucesso: false };
    }

    // Buscar fechamento
    const { data: fechamento, error: erroFechamento } = await supabase
      .from('fechamentos_prestador')
      .select(
        `
        *,
        contratos_prestador (
          prestadores_servico (id, nome_completo, email, telefone)
        )
      `
      )
      .eq('id', fechamentoId)
      .single();

    if (erroFechamento || !fechamento) {
      return { erro: 'Fechamento não encontrado', sucesso: false };
    }

    // Atualizar status
    const { error: erroUpdate } = await supabase
      .from('fechamentos_prestador')
      .update({
        status: 'devolvido',
        observacoes_gestor: motivo,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', fechamentoId);

    if (erroUpdate) throw erroUpdate;

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'devolver',
      tabela: 'fechamentos_prestador',
      registro_id: fechamentoId,
      valores_antes: { status: fechamento.status },
      valores_depois: { status: 'devolvido', motivo },
      endpoint: '/api/fechamentos/devolver',
    });

    // Notificar prestador
    const prestador = fechamento.contratos_prestador?.prestadores_servico;
    if (prestador?.email) {
      const notificador = new Notificador();
      await notificador.enviar({
        canais: ['email'],
        destinatario: {
          email: prestador.email,
          telefone: prestador.telefone,
          nome: prestador.nome_completo,
        },
        template: {
          titulo: 'Fechamento Devolvido para Revisão',
          corpo: `Seu fechamento foi devolvido para revisão.\n\nMotivo: {{motivo}}\n\nFavor revisar e reenviar quando corrigido.`,
          acaoUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/painel-prestador/fechamentos/${fechamentoId}`,
          acaoTexto: 'Ver Detalhes',
        },
        variaveis: {
          motivo: motivo,
        },
      });
    }

    return {
      sucesso: true,
      mensagem: 'Fechamento devolvido com sucesso',
    };
  } catch (erro) {
    console.error('Erro ao devolver fechamento:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Aprovar múltiplos fechamentos (ação em lote)
 */
export async function aprovarMultiplosFechamentos(ids: string[], observacoes?: string) {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    if (!ids || ids.length === 0) {
      return { erro: 'Nenhum fechamento selecionado', sucesso: false };
    }

    // Atualizar todos
    const { error: erroUpdate, data: updated } = await supabase
      .from('fechamentos_prestador')
      .update({
        status: 'aprovado',
        observacoes_gestor: observacoes || null,
        atualizado_em: new Date().toISOString(),
      })
      .in('id', ids)
      .select();

    if (erroUpdate) throw erroUpdate;

    // Log para cada um
    for (const id of ids) {
      await auditLogger.logAuditoria({
        acao: 'aprovar_em_lote',
        tabela: 'fechamentos_prestador',
        registro_id: id,
        valores_antes: { status: 'enviado_para_gestao' },
        valores_depois: { status: 'aprovado' },
        endpoint: '/api/fechamentos/aprovar-lote',
      });
    }

    return {
      sucesso: true,
      aprovados: ids.length,
      mensagem: `${ids.length} fechamento(s) aprovado(s) com sucesso`,
    };
  } catch (erro) {
    console.error('Erro ao aprovar múltiplos:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Devolver múltiplos fechamentos (ação em lote)
 */
export async function devolverMultiplosFechamentos(ids: string[], motivo: string) {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    if (!ids || ids.length === 0) {
      return { erro: 'Nenhum fechamento selecionado', sucesso: false };
    }

    if (!motivo || motivo.trim().length === 0) {
      return { erro: 'Motivo da devolução é obrigatório', sucesso: false };
    }

    // Atualizar todos
    const { error: erroUpdate } = await supabase
      .from('fechamentos_prestador')
      .update({
        status: 'devolvido',
        observacoes_gestor: motivo,
        atualizado_em: new Date().toISOString(),
      })
      .in('id', ids);

    if (erroUpdate) throw erroUpdate;

    // Log para cada um
    for (const id of ids) {
      await auditLogger.logAuditoria({
        acao: 'devolver_em_lote',
        tabela: 'fechamentos_prestador',
        registro_id: id,
        valores_antes: { status: 'aprovado' },
        valores_depois: { status: 'devolvido', motivo },
        endpoint: '/api/fechamentos/devolver-lote',
      });
    }

    return {
      sucesso: true,
      devolvidos: ids.length,
      mensagem: `${ids.length} fechamento(s) devolvido(s) com sucesso`,
    };
  } catch (erro) {
    console.error('Erro ao devolver múltiplos:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Gerar PDF do fechamento para download
 */
export async function gerarPdfFechamento(fechamentoId: string) {
  try {
    const supabase = createClient();

    // Buscar fechamento
    const { data: fechamento, error: erroFechamento } = await supabase
      .from('fechamentos_prestador')
      .select(
        `
        *,
        contratos_prestador (
          prestadores_servico (nome_completo, categoria, email, telefone, cpf_cnpj)
        )
      `
      )
      .eq('id', fechamentoId)
      .single();

    if (erroFechamento || !fechamento) {
      return { erro: 'Fechamento não encontrado', sucesso: false };
    }

    // Buscar itens
    const { data: itens, error: erroItens } = await supabase
      .from('fechamento_itens_prestador')
      .select('*')
      .eq('fechamento_id', fechamentoId)
      .order('data', { ascending: true });

    if (erroItens) throw erroItens;

    // Aqui poderia gerar PDF usando biblioteca como pdfkit
    // Por ora, retornar dados para gerar no cliente
    return {
      sucesso: true,
      fechamento,
      itens: itens || [],
      mensagem: 'Dados para PDF gerados com sucesso',
    };
  } catch (erro) {
    console.error('Erro ao gerar PDF:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}
