'use server';

import { createClient } from '@/lib/supabase/server';
import { auditLogger } from '@/server/compliance/auditLogger';
import { Notificador } from '@/server/notificacao/Notificador';

interface RequisicaoReembolsoInput {
  contratoId: string;
  itens: Array<{
    descricao: string;
    valor: number;
    dataCompra: string;
    categoriaMaterial: 'limpeza' | 'manutencao' | 'ferramentas' | 'outro';
    comprovante_url?: string;
  }>;
  observacoes?: string;
}

interface ArquivoReembolsoItem {
  descricao: string;
  valor_unitario: number;
  quantidade: number;
  valor_total: number;
  categoria_material: string;
  data_compra: string;
  comprovante_url?: string;
}

/**
 * Criar requisição de reembolso de insumos
 * Agrupa despesas de prestador para reembolso automático
 */
export async function criarRequisicaoReembolso(input: RequisicaoReembolsoInput) {
  try {
    const supabase = await createClient();

    // Validar permissão (prestador ve apenas seu contrato)
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { erro: 'Não autenticado', sucesso: false };
    }

    // Buscar contrato
    const { data: contrato, error: erroContrato } = await supabase
      .from('contratos_prestador')
      .select('*, prestadores_servico(pessoa_id, email)')
      .eq('id', input.contratoId)
      .single();

    if (erroContrato || !contrato) {
      return { erro: 'Contrato não encontrado', sucesso: false };
    }

    if (!input.itens || input.itens.length === 0) {
      return { erro: 'Nenhum item para reembolso', sucesso: false };
    }

    // Calcular total
    const totalReembolso = input.itens.reduce((sum, item) => sum + item.valor, 0);

    // Criar requisição (usando tabela adiantamentos_prestador com tipo 'gasto_ressarcimento')
    const { data: requisicao, error: erroRequisicao } = await supabase
      .from('adiantamentos_prestador')
      .insert({
        contrato_id: input.contratoId,
        data_lancamento: new Date().toISOString().split('T')[0],
        tipo: 'gasto_ressarcimento',
        descricao: `Reembolso de insumos - ${input.itens.length} item(s)`,
        valor_total: totalReembolso,
        status: 'ativo',
        observacoes: input.observacoes || 'Requisição de reembolso de insumos',
      })
      .select();

    if (erroRequisicao || !requisicao || requisicao.length === 0) throw erroRequisicao;

    const requisicaoId = requisicao[0].id;

    // Salvar itens (via tabela auxiliar if needed, ou JSON no campo observacoes)
    const itensJSON = JSON.stringify(
      input.itens.map((item) => ({
        descricao: item.descricao,
        valor: item.valor,
        data_compra: item.dataCompra,
        categoria: item.categoriaMaterial,
        comprovante_url: item.comprovante_url,
      }))
    );

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'criar_requisicao_reembolso_insumos',
      tabela: 'adiantamentos_prestador',
      registro_id: requisicaoId,
      valores_depois: {
        total_reembolso: totalReembolso,
        quantidade_itens: input.itens.length,
        itens: itensJSON,
      },
      endpoint: '/api/prestador/reembolso-insumos',
    });

    return {
      sucesso: true,
      mensagem: 'Requisição de reembolso criada com sucesso',
      requisicaoId,
      totalReembolso: totalReembolso.toFixed(2),
      itemsCount: input.itens.length,
    };
  } catch (erro) {
    console.error('Erro ao criar requisição de reembolso:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Aprovar requisição de reembolso
 * Após aprovação, o sistema deve preparar o pagamento automático via PIX/TED
 */
export async function aprovarReembolsoInsumos(requisicaoId: string, observacoes?: string) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    // Buscar requisição
    const { data: requisicao, error: erroRequisicao } = await supabase
      .from('adiantamentos_prestador')
      .select('*, contratos_prestador(prestadores_servico(pessoa_id, email))')
      .eq('id', requisicaoId)
      .single();

    if (erroRequisicao || !requisicao) {
      return { erro: 'Requisição não encontrada', sucesso: false };
    }

    // Atualizar status
    const { error: erroUpdate } = await supabase
      .from('adiantamentos_prestador')
      .update({
        status: 'quitado',
        observacoes: observacoes || requisicao.observacoes,
      })
      .eq('id', requisicaoId);

    if (erroUpdate) throw erroUpdate;

    // Disparar processamento de pagamento (via fila de jobs/webhook)
    // TODO: Integrar com sistema de pagamento (Asaas PIX)

    // Notificar prestador
    const prestador = requisicao.contratos_prestador?.prestadores_servico;
    if (prestador?.email) {
      const notificador = new Notificador();
      await notificador.enviar({
        canais: ['email'],
        destinatario: {
          email: prestador.email,
          nome: prestador.pessoa_id,
        },
        template: {
          titulo: 'Reembolso de Insumos Aprovado ✓',
          corpo: `Sua requisição de reembolso de R$ {{valor}} foi aprovada!\n\nEm breve você receberá o valor via PIX.`,
          acaoUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/painel-prestador/reembolsos/${requisicaoId}`,
          acaoTexto: 'Ver Detalhes',
        },
        variaveis: {
          valor: requisicao.valor_total.toFixed(2),
        },
      });
    }

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'aprovar_reembolso_insumos',
      tabela: 'adiantamentos_prestador',
      registro_id: requisicaoId,
      valores_antes: { status: requisicao.status },
      valores_depois: { status: 'quitado' },
      endpoint: '/api/prestador/reembolso-insumos/aprovar',
    });

    return {
      sucesso: true,
      mensagem: 'Reembolso aprovado e pagamento agendado',
      requisicaoId,
      valor: requisicao.valor_total.toFixed(2),
    };
  } catch (erro) {
    console.error('Erro ao aprovar reembolso:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Rejeitar requisição de reembolso
 */
export async function rejeitarReembolsoInsumos(
  requisicaoId: string,
  motivo: string
) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    if (!motivo || motivo.trim().length === 0) {
      return { erro: 'Motivo da rejeição é obrigatório', sucesso: false };
    }

    // Buscar requisição
    const { data: requisicao, error: erroRequisicao } = await supabase
      .from('adiantamentos_prestador')
      .select('*, contratos_prestador(prestadores_servico(email))')
      .eq('id', requisicaoId)
      .single();

    if (erroRequisicao || !requisicao) {
      return { erro: 'Requisição não encontrada', sucesso: false };
    }

    // Atualizar status
    const { error: erroUpdate } = await supabase
      .from('adiantamentos_prestador')
      .update({
        status: 'suspenso',
        observacoes: `Rejeitado: ${motivo}`,
      })
      .eq('id', requisicaoId);

    if (erroUpdate) throw erroUpdate;

    // Notificar prestador
    const prestador = requisicao.contratos_prestador?.prestadores_servico;
    if (prestador?.email) {
      const notificador = new Notificador();
      await notificador.enviar({
        canais: ['email'],
        destinatario: {
          email: prestador.email,
        },
        template: {
          titulo: 'Reembolso de Insumos Rejeitado ✗',
          corpo: `Sua requisição de reembolso foi rejeitada.\n\nMotivo: {{motivo}}\n\nFavor entrar em contato para esclarecimentos.`,
          acaoUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/painel-prestador/reembolsos/${requisicaoId}`,
          acaoTexto: 'Ver Detalhes',
        },
        variaveis: {
          motivo: motivo,
        },
      });
    }

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'rejeitar_reembolso_insumos',
      tabela: 'adiantamentos_prestador',
      registro_id: requisicaoId,
      valores_antes: { status: requisicao.status },
      valores_depois: { status: 'suspenso', motivo },
      endpoint: '/api/prestador/reembolso-insumos/rejeitar',
    });

    return {
      sucesso: true,
      mensagem: 'Reembolso rejeitado com sucesso',
    };
  } catch (erro) {
    console.error('Erro ao rejeitar reembolso:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Listar requisições de reembolso pendentes
 */
export async function listarReembolsosPendentes() {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    const { data: requisicoes, error: erroRequisicoes } = await supabase
      .from('adiantamentos_prestador')
      .select(
        `
        *,
        contratos_prestador (
          prestadores_servico (nome_completo, email)
        )
      `
      )
      .eq('tipo', 'gasto_ressarcimento')
      .eq('status', 'ativo')
      .order('data_lancamento', { ascending: true });

    if (erroRequisicoes) throw erroRequisicoes;

    const totalPendente = (requisicoes || []).reduce(
      (sum, r) => sum + (r.valor_total || 0),
      0
    );

    return {
      sucesso: true,
      requisicoes: requisicoes || [],
      total: requisicoes?.length || 0,
      valorTotal: totalPendente.toFixed(2),
    };
  } catch (erro) {
    console.error('Erro ao listar reembolsos pendentes:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}
