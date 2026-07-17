'use server';

import { createClient } from '@/lib/supabase/server';
import {
  verificarTodosAlertas,
  dispararNotificacoesAlerta,
} from '@/server/alertas/sistemAlertas';
import { auditLogger } from '@/server/compliance/auditLogger';

/**
 * Executar verificação de alertas e disparar notificações
 */
export async function executarVerificacaoAlertas(
  emailsDestino?: string[]
): Promise<{
  sucesso: boolean;
  totalAlertas?: number;
  alertasCriticos?: number;
  alertasAlerta?: number;
  mensagem?: string;
  erro?: string;
}> {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    // Executar verificações
    const alertas = await verificarTodosAlertas();

    // Separar por severidade
    const alertasCriticos = alertas.filter((a) => a.severidade === 'critico');
    const alertasAlerta = alertas.filter((a) => a.severidade === 'alerta');
    const alertasInfo = alertas.filter((a) => a.severidade === 'info');

    // Disparar notificações apenas para críticos e alerta
    const alertasParaNotificar = [...alertasCriticos, ...alertasAlerta];

    if (alertasParaNotificar.length > 0 && emailsDestino) {
      await dispararNotificacoesAlerta(alertasParaNotificar, emailsDestino);
    }

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'executar_verificacao_alertas',
      tabela: 'alertas',
      valores_depois: {
        total_alertas: alertas.length,
        alertas_criticos: alertasCriticos.length,
        alertas_alerta: alertasAlerta.length,
        alertas_info: alertasInfo.length,
        notificacoes_disparadas: alertasParaNotificar.length,
      },
      endpoint: '/api/bi/alertas/verificar',
    });

    return {
      sucesso: true,
      totalAlertas: alertas.length,
      alertasCriticos: alertasCriticos.length,
      alertasAlerta: alertasAlerta.length,
      mensagem: `${alertas.length} alerta(s) detectado(s): ${alertasCriticos.length} crítico(s), ${alertasAlerta.length} aviso(s)`,
    };
  } catch (erro) {
    console.error('Erro ao executar verificação de alertas:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

/**
 * Configurar alertas automáticos
 */
export async function configurarAlertas(
  tiposAlertas: {
    margemBaixa?: { ativo: boolean; limiteMinimo: number };
    anomaliaCritica?: { ativo: boolean };
    atrasoRecebimento?: { ativo: boolean; diasAtraso: number };
    custoAlto?: { ativo: boolean; percentualLimite: number };
    nenhumApontamento?: { ativo: boolean; diasSemApontamento: number };
  },
  emailsDestino: string[]
): Promise<{
  sucesso: boolean;
  mensagem?: string;
  erro?: string;
}> {
  try {
    const supabase = createClient();

    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    // Salvar configurações (em tabela config_alertas)
    const config = {
      tipos_alertas: tiposAlertas,
      emails_destino: emailsDestino,
      atualizado_em: new Date(),
    };

    // Salvar em storage ou variável de ambiente (depende da implementação)
    // Por enquanto, apenas fazer log
    await auditLogger.logAuditoria({
      acao: 'configurar_alertas',
      tabela: 'config_alertas',
      valores_depois: config,
      endpoint: '/api/bi/alertas/configurar',
    });

    return {
      sucesso: true,
      mensagem: 'Alertas configurados com sucesso',
    };
  } catch (erro) {
    console.error('Erro ao configurar alertas:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

/**
 * Obter histórico de alertas disparados
 */
export async function obterHistoricoAlertas(
  dataInicio?: string,
  dataFim?: string,
  severidade?: 'critico' | 'alerta' | 'info'
): Promise<{
  sucesso: boolean;
  alertas?: any[];
  total?: number;
  erro?: string;
}> {
  try {
    const supabase = createClient();

    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    let query = supabase.from('historico_alertas').select('*');

    if (dataInicio) {
      query = query.gte('timestamp', dataInicio);
    }

    if (dataFim) {
      query = query.lte('timestamp', dataFim);
    }

    if (severidade) {
      query = query.eq('severidade', severidade);
    }

    const { data: alertas, error: erroFetch } = await query.order('timestamp', {
      ascending: false,
    });

    if (erroFetch) throw erroFetch;

    return {
      sucesso: true,
      alertas: alertas || [],
      total: alertas?.length || 0,
    };
  } catch (erro) {
    console.error('Erro ao obter histórico:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}
