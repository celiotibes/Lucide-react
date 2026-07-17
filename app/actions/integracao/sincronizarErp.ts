'use server';

import { createClient } from '@/lib/supabase/server';
import { dispararSincronizacao, STATUS_MAPPING } from '@/server/integracao/n8nWorkflows';
import { auditLogger } from '@/server/compliance/auditLogger';

/**
 * Sincronizar manualmente pedidos do Omie
 */
export async function sincronizarOmie() {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    const resultado = await dispararSincronizacao('omie-sync-orders', {
      event: 'manual_sync',
      data: { manual: true },
      timestamp: new Date().toISOString(),
      source: 'crmt',
    });

    if (!resultado.sucesso) {
      return { erro: resultado.erro, sucesso: false };
    }

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'sincronizar_omie',
      tabela: 'ordens_servico',
      valores_depois: resultado.resultado,
      endpoint: '/api/integracao/omie/sync',
    });

    return {
      sucesso: true,
      mensagem: 'Sincronização Omie iniciada',
      resultado: resultado.resultado,
    };
  } catch (erro) {
    console.error('Erro ao sincronizar Omie:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Sincronizar manualmente pedidos do Bluesoft
 */
export async function sincronizarBluesoft() {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    const resultado = await dispararSincronizacao('bluesoft-sync-orders', {
      event: 'manual_sync',
      data: { manual: true },
      timestamp: new Date().toISOString(),
      source: 'crmt',
    });

    if (!resultado.sucesso) {
      return { erro: resultado.erro, sucesso: false };
    }

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'sincronizar_bluesoft',
      tabela: 'ordens_servico',
      valores_depois: resultado.resultado,
      endpoint: '/api/integracao/bluesoft/sync',
    });

    return {
      sucesso: true,
      mensagem: 'Sincronização Bluesoft iniciada',
      resultado: resultado.resultado,
    };
  } catch (erro) {
    console.error('Erro ao sincronizar Bluesoft:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Notificar n8n quando ordem de serviço muda de status
 */
export async function notificarMudancaStatus(
  ordemId: string,
  novoStatus: string,
  statusAnterior: string
) {
  try {
    const supabase = createClient();

    // Buscar detalhes da ordem
    const { data: ordem, error: erroOrdem } = await supabase
      .from('ordens_servico')
      .select(
        `
        *,
        imovel_id,
        residencial:imoveis(residencial_id)
      `
      )
      .eq('id', ordemId)
      .single();

    if (erroOrdem || !ordem) {
      return { erro: 'Ordem não encontrada', sucesso: false };
    }

    // Buscar mapeamento externo (ID Omie/Bluesoft)
    const { data: referencia } = await supabase
      .from('referencias_externas')
      .select('*')
      .eq('ordem_servico_id', ordemId)
      .single();

    if (!referencia) {
      // Ordem sem referência externa - não sincronizar
      return {
        sucesso: true,
        mensagem: 'Ordem sem referência externa - sync não aplicável',
      };
    }

    // Preparar payload para n8n
    const eventos = [];

    if (referencia.omie_id) {
      const statusOmie = STATUS_MAPPING.crmt_to_omie[novoStatus as keyof typeof STATUS_MAPPING.crmt_to_omie];
      if (statusOmie) {
        eventos.push({
          erp: 'omie',
          id: referencia.omie_id,
          novoStatus: statusOmie,
        });
      }
    }

    if (referencia.bluesoft_id) {
      const statusBluesoft =
        STATUS_MAPPING.crmt_to_bluesoft[novoStatus as keyof typeof STATUS_MAPPING.crmt_to_bluesoft];
      if (statusBluesoft) {
        eventos.push({
          erp: 'bluesoft',
          id: referencia.bluesoft_id,
          novoStatus: statusBluesoft,
        });
      }
    }

    // Disparar sincronização para cada ERP
    const resultados = [];
    for (const evento of eventos) {
      const resultado = await dispararSincronizacao(
        evento.erp === 'omie' ? 'crmt-push-omie-status' : 'crmt-push-bluesoft-status',
        {
          event: 'status_change',
          data: {
            ordem_id: ordemId,
            id_externo: evento.id,
            novo_status: evento.novoStatus,
            status_anterior: statusAnterior,
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
          source: 'crmt',
        }
      );

      resultados.push({
        erp: evento.erp,
        sucesso: resultado.sucesso,
        resultado: resultado.resultado,
      });
    }

    return {
      sucesso: true,
      mensagem: `Notificação enviada para ${resultados.length} ERP(s)`,
      resultados,
    };
  } catch (erro) {
    console.error('Erro ao notificar mudança de status:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Reconciliar dados entre CRMT e ERPs
 */
export async function reconciliarComErps() {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { erro: 'Sem permissão', sucesso: false };
    }

    const resultado = await dispararSincronizacao('reconciliacao-erp', {
      event: 'manual_reconciliation',
      data: { timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
      source: 'crmt',
    });

    if (!resultado.sucesso) {
      return { erro: resultado.erro, sucesso: false };
    }

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'reconciliar_erp',
      tabela: 'referencias_externas',
      valores_depois: resultado.resultado,
      endpoint: '/api/integracao/reconciliacao',
    });

    return {
      sucesso: true,
      mensagem: 'Reconciliação iniciada',
      resultado: resultado.resultado,
    };
  } catch (erro) {
    console.error('Erro ao reconciliar:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Registrar referência externa (vinculação entre CRMT e ERP)
 */
export async function registrarReferenciaExterna(
  ordemId: string,
  omieId?: string,
  blueSoftId?: string
) {
  try {
    const supabase = createClient();

    // Validar que pelo menos um ID foi fornecido
    if (!omieId && !blueSoftId) {
      return {
        erro: 'Pelo menos um ID externo (Omie ou Bluesoft) é obrigatório',
        sucesso: false,
      };
    }

    // Verificar se ordem existe
    const { data: ordem, error: erroOrdem } = await supabase
      .from('ordens_servico')
      .select('id')
      .eq('id', ordemId)
      .single();

    if (erroOrdem || !ordem) {
      return { erro: 'Ordem de serviço não encontrada', sucesso: false };
    }

    // Inserir referência
    const { error: erroInsert } = await supabase.from('referencias_externas').insert({
      ordem_servico_id: ordemId,
      omie_id: omieId || null,
      bluesoft_id: blueSoftId || null,
      mapeado_em: new Date().toISOString(),
      status_sincronizacao: 'pendente',
    });

    if (erroInsert) {
      // Se já existe, tentar update
      const { error: erroUpdate } = await supabase
        .from('referencias_externas')
        .update({
          omie_id: omieId || null,
          bluesoft_id: blueSoftId || null,
          mapeado_em: new Date().toISOString(),
        })
        .eq('ordem_servico_id', ordemId);

      if (erroUpdate) throw erroUpdate;
    }

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'registrar_referencia_externa',
      tabela: 'referencias_externas',
      registro_id: ordemId,
      valores_depois: { omie_id: omieId, bluesoft_id: blueSoftId },
      endpoint: '/api/integracao/referencias',
    });

    return {
      sucesso: true,
      mensagem: 'Referência externa registrada com sucesso',
    };
  } catch (erro) {
    console.error('Erro ao registrar referência:', erro);
    return {
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
      sucesso: false,
    };
  }
}

/**
 * Obter status de sincronização de uma ordem
 */
export async function obterStatusSincronizacao(ordemId: string) {
  try {
    const supabase = createClient();

    const { data: referencia, error } = await supabase
      .from('referencias_externas')
      .select('*')
      .eq('ordem_servico_id', ordemId)
      .single();

    if (error) {
      return {
        sucesso: false,
        sincronizado: false,
        mensagem: 'Ordem sem referência externa',
      };
    }

    return {
      sucesso: true,
      sincronizado: true,
      referencia: {
        omie_id: referencia.omie_id,
        bluesoft_id: referencia.bluesoft_id,
        status: referencia.status_sincronizacao,
        mapeado_em: referencia.mapeado_em,
      },
    };
  } catch (erro) {
    console.error('Erro ao obter status:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}
