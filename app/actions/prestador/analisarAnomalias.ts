'use server';

import { createClient } from '@/lib/supabase/server';
import {
  detectarMultiplasAnomalias,
  gerarRelatorioAnomalias,
  type AnomaliaApontamento,
  type RelatorioAnomalias,
} from '@/server/ml/detectarAnomalias';
import { auditLogger } from '@/server/compliance/auditLogger';

/**
 * Analisar anomalias em apontamentos de um período
 * Detecta padrões incomuns (horas extremas, desvios, mudanças)
 */
export async function analisarAnomaliasApontamentos(
  dataInicio: string,
  dataFim: string,
  prestador_id?: string
): Promise<{
  sucesso: boolean;
  relatorio?: RelatorioAnomalias;
  anomalias?: Map<string, AnomaliaApontamento[]>;
  erro?: string;
}> {
  try {
    const supabase = await createClient();

    // Validar permissão (admin ou economista)
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    // Buscar apontamentos do período
    let query = supabase
      .from('apontamentos_prestador')
      .select(
        `
        id,
        data,
        horas_trabalhadas,
        contrato_id,
        contratos_prestador (
          prestador_id,
          prestadores_servico (pessoa_id, nome_completo)
        )
      `
      )
      .gte('data', dataInicio)
      .lte('data', dataFim);

    const { data: apontamentos, error: erroApontamentos } = await query;

    if (erroApontamentos || !apontamentos) {
      return { sucesso: false, erro: `Erro ao buscar apontamentos: ${erroApontamentos?.message}` };
    }

    // Agrupar por prestador
    const groupedByPrestador: {
      [prestador_id: string]: Array<{ horas_trabalhadas: number; data: string }>;
    } = {};

    const apontamentosFormatados = apontamentos
      .map((a) => ({
        id: a.id,
        data: a.data,
        horas_trabalhadas: a.horas_trabalhadas,
        prestador_id: a.contratos_prestador?.prestador_id || '',
      }))
      .filter((a) => !prestador_id || a.prestador_id === prestador_id);

    for (const apontamento of apontamentosFormatados) {
      if (!groupedByPrestador[apontamento.prestador_id]) {
        groupedByPrestador[apontamento.prestador_id] = [];
      }
      groupedByPrestador[apontamento.prestador_id].push({
        horas_trabalhadas: apontamento.horas_trabalhadas,
        data: apontamento.data,
      });
    }

    // Detectar anomalias
    const anomalias = detectarMultiplasAnomalias(
      apontamentosFormatados,
      groupedByPrestador
    );

    // Gerar relatório
    const relatorio = gerarRelatorioAnomalias(
      apontamentosFormatados,
      groupedByPrestador
    );

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'analise_anomalias_apontamentos',
      tabela: 'apontamentos_prestador',
      valores_depois: {
        periodo_inicio: dataInicio,
        periodo_fim: dataFim,
        total_apontamentos: relatorio.total_apontamentos,
        total_anomalias: relatorio.total_anomalias,
        taxa_anomalia: `${relatorio.taxa_anomalia}%`,
      },
      endpoint: '/api/prestador/anomalias',
    });

    return {
      sucesso: true,
      relatorio,
      anomalias,
    };
  } catch (erro) {
    console.error('Erro ao analisar anomalias:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

/**
 * Marcar anomalia como revisada
 */
export async function marcarAnomaliaRevisada(
  apontamento_id: string,
  observacoes?: string
) {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    // Buscar apontamento
    const { data: apontamento, error: erroApontamento } = await supabase
      .from('apontamentos_prestador')
      .select('id, observacoes')
      .eq('id', apontamento_id)
      .single();

    if (erroApontamento || !apontamento) {
      return { sucesso: false, erro: 'Apontamento não encontrado' };
    }

    // Atualizar com flag de anomalia revisada
    const { error: erroUpdate } = await supabase
      .from('apontamentos_prestador')
      .update({
        observacoes: `${apontamento.observacoes || ''}\n[ANOMALIA REVISADA] ${observacoes || 'Sem observações'}`,
      })
      .eq('id', apontamento_id);

    if (erroUpdate) throw erroUpdate;

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'marcar_anomalia_revisada',
      tabela: 'apontamentos_prestador',
      registro_id: apontamento_id,
      valores_depois: {
        anomalia_revisada: true,
        observacoes,
      },
      endpoint: '/api/prestador/anomalias/marcar-revisada',
    });

    return { sucesso: true, mensagem: 'Anomalia marcada como revisada' };
  } catch (erro) {
    console.error('Erro ao marcar anomalia:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}
