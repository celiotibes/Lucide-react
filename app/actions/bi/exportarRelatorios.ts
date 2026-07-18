'use server';

import { createClient } from '@/lib/supabase/server';
import {
  exportarRelatorio,
  type ConfiguracaoRelatorio,
} from '@/server/relatorios/geradorRelatorios';
import { auditLogger } from '@/server/compliance/auditLogger';

/**
 * Exportar relatório BI
 */
export async function exportarRelatorioBi(config: ConfiguracaoRelatorio): Promise<{
  sucesso: boolean;
  url?: string;
  nomeArquivo?: string;
  mensagem?: string;
  erro?: string;
}> {
  try {
    const supabase = await createClient();

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    // Gerar relatório
    const resultado = await exportarRelatorio(config);

    if (!resultado.sucesso) {
      return { sucesso: false, erro: resultado.erro };
    }

    // Salvar arquivo em storage (se implementado)
    // Por enquanto, retornar como data URL
    const dataUrl = `data:${resultado.tipo};base64,${Buffer.from(resultado.conteudo || '').toString('base64')}`;

    // Log auditoria
    await auditLogger.logAuditoria({
      acao: 'exportar_relatorio',
      tabela: 'relatorios',
      valores_depois: {
        formato: config.formato,
        tipo_arquivo: config.tipo,
        periodo: `${config.dataInicio} a ${config.dataFim}`,
        nomeArquivo: resultado.nomeArquivo,
      },
      endpoint: '/api/bi/exportar',
    });

    return {
      sucesso: true,
      url: dataUrl,
      nomeArquivo: resultado.nomeArquivo,
      mensagem: `Relatório ${config.formato} exportado com sucesso`,
    };
  } catch (erro) {
    console.error('Erro ao exportar relatório:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

/**
 * Agendar exportação periódica de relatórios
 */
export async function agendarExportacaoPeriodia(
  formato: string,
  frequencia: 'diaria' | 'semanal' | 'mensal',
  emailDestino: string
): Promise<{
  sucesso: boolean;
  mensagem?: string;
  erro?: string;
}> {
  try {
    const supabase = await createClient();

    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão' };
    }

    // Salvar configuração (tabela relatorios_agendados)
    const { error: erroInsert } = await supabase.from('relatorios_agendados').insert({
      formato,
      frequencia,
      email_destino: emailDestino,
      proximo_envio: new Date(),
      ativo: true,
      criado_em: new Date(),
    });

    if (erroInsert) throw erroInsert;

    await auditLogger.logAuditoria({
      acao: 'agendar_exportacao_relatorio',
      tabela: 'relatorios_agendados',
      valores_depois: {
        formato,
        frequencia,
        email_destino: emailDestino,
      },
      endpoint: '/api/bi/agendar-exportacao',
    });

    return {
      sucesso: true,
      mensagem: `Relatório agendado para envio ${frequencia}`,
    };
  } catch (erro) {
    console.error('Erro ao agendar exportação:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}
