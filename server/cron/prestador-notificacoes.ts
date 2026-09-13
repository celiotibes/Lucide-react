/**
 * ============================================================================
 * Lógica: Notificações Automáticas de Prestador
 * ============================================================================
 * Contém toda a lógica de negócio para notificações de prestador, extraída
 * de app/api/cron/prestador/notificacoes-auto/route.ts (334 linhas).
 *
 * Funções:
 * - executarNotificacoesPrestador() -> resultados de todas as tarefas
 * - lembrarApontamentosNaoFeitos()
 * - submeterFechamentoAutomatico()
 * - rastrearTodosOsPix()
 * - gerarNfsesPendentes()
 */

import { createClient } from '@/lib/supabase/server';
import { Notificador } from '@/server/notificacao/Notificador';
import { gerarNfsePorFechamento } from '@/app/actions/prestador/nfse';
import { rastrearConfirmacaoPix } from '@/app/actions/prestador/pix';
import { logError } from '@/server/api/middleware';

/**
 * Verifica se é um horário específico em UTC
 */
function ehHorario(hora: number, minuto: number = 0): boolean {
  const agora = new Date();
  return (
    agora.getUTCHours() === hora &&
    agora.getUTCMinutes() >= minuto &&
    agora.getUTCMinutes() < minuto + 1
  );
}

/**
 * Verifica se é um dia específico da semana ou do mês
 */
function ehDiaDaSemana(dia: number): boolean {
  const agora = new Date();
  if (dia < 7) {
    // 0 = domingo, 5 = sexta
    return agora.getDay() === dia;
  }
  // dia >= 7 = dia do mês (ex: 9 = dia 9 do mês)
  return agora.getDate() === dia;
}

/**
 * Executa todas as rotinas de notificação de prestador
 */
export async function executarNotificacoesPrestador(): Promise<
  Record<string, unknown>
> {
  const supabase = await createClient();
  const resultados: Record<string, unknown> = {};

  try {
    // 1. Diário 17:30 BRT (20:30 UTC): Lembrar apontamentos não feitos
    if (ehHorario(20, 30)) {
      resultados.lembrarApontamentos = await lembrarApontamentosNaoFeitos(
        supabase
      );
    }

    // 2. Sexta-feira 23:59 BRT (sábado 02:59 UTC): Submeter fechamento
    if (ehDiaDaSemana(5) && ehHorario(2, 59)) {
      resultados.fecharCristiano = await submeterFechamentoAutomatico(
        supabase,
        'cristiano'
      );
    }

    // 3. Dia 9 23:59 BRT (dia 10 02:59 UTC): Submeter fechamento
    if (ehDiaDaSemana(9) && ehHorario(2, 59)) {
      resultados.fecharPaulo = await submeterFechamentoAutomatico(
        supabase,
        'paulo'
      );
    }

    // 4. A cada 5 minutos: Rastrear confirmação de PIX
    resultados.rastrearPix = await rastrearTodosOsPix(supabase);

    // 5. Diário 01:00 BRT (04:00 UTC): Gerar NFS-e de fechamentos pagos
    if (ehHorario(4)) {
      resultados.gerarNfse = await gerarNfsesPendentes(supabase);
    }

    return resultados;
  } catch (erro) {
    logError('Erro geral em notificações de prestador', erro);
    throw erro;
  }
}

/**
 * Lembra prestadores que ainda não anotaram suas horas
 */
async function lembrarApontamentosNaoFeitos(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    const { data: prestadores, error } = await supabase
      .from('prestadores_servico')
      .select(
        `
        id, nome_completo,
        pessoas (email, telefone),
        contratos_prestador (id)
      `
      )
      .eq('status', 'ativo');

    if (error) throw error;
    if (!prestadores || prestadores.length === 0) {
      return { avisados: 0 };
    }

    const notificador = new Notificador();
    let avisados = 0;

    for (const prest of prestadores) {
      const pessoa = (prest as any).pessoas;
      if (!pessoa?.email) continue;

      const { data: apontamentosHoje } = await supabase
        .from('apontamentos_prestador')
        .select('id')
        .eq('data', hoje)
        .eq(
          'contrato_id',
          ((prest as any).contratos_prestador?.[0]?.id as string) || ''
        );

      if (!apontamentosHoje || apontamentosHoje.length === 0) {
        await notificador.enviar({
          canais: ['email'],
          destinatario: {
            email: pessoa.email,
            telefone: pessoa.telefone,
            nome: (prest as any).nome_completo,
          },
          template: {
            titulo: 'Lembrete: Anotações de Hoje',
            corpo:
              'Não encontramos registros de apontamentos de hoje. Não esqueça de anotar suas horas!',
            acaoUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/painel-prestador`,
            acaoTexto: 'Ir para o Painel',
          },
        });

        avisados++;
      }
    }

    return { avisados };
  } catch (erro) {
    logError('Erro ao lembrar apontamentos', erro);
    return { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
  }
}

/**
 * Submete fechamento automático para um prestador específico
 */
async function submeterFechamentoAutomatico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prestador: 'paulo' | 'cristiano'
) {
  try {
    const nomePrestador =
      prestador === 'paulo' ? 'Paulo Bruxel' : 'Cristiano Rodrigues de Souza';

    const { data: prest, error: prestError } = await supabase
      .from('prestadores_servico')
      .select('id')
      .in('nome_completo', [nomePrestador])
      .single();

    if (prestError || !prest) {
      return { erro: `Prestador ${prestador} não encontrado` };
    }

    const { data: contrato, error: contratoError } = await supabase
      .from('contratos_prestador')
      .select('id')
      .eq('prestador_id', prest.id)
      .eq('tipo_contrato', 'fixo')
      .single();

    if (contratoError || !contrato) {
      return { erro: `Contrato de ${prestador} não encontrado` };
    }

    // Calcular período do fechamento
    const hoje = new Date();
    let dataInicio: Date;
    let dataFim: Date;

    if (prestador === 'cristiano') {
      // Última segunda até domingo
      dataInicio = new Date(hoje);
      dataInicio.setDate(dataInicio.getDate() - dataInicio.getDay() + 1);
      dataFim = new Date(dataInicio);
      dataFim.setDate(dataFim.getDate() + 6);
    } else {
      // Último dia do mês anterior
      dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      dataInicio = new Date(dataFim.getFullYear(), dataFim.getMonth(), 1);
    }

    const { data: apontamentos, error: apontError } = await supabase
      .from('apontamentos_prestador')
      .select('id')
      .eq('contrato_id', contrato.id)
      .gte('data', dataInicio.toISOString().split('T')[0])
      .lte('data', dataFim.toISOString().split('T')[0])
      .eq('status', 'rascunho');

    if (apontError) throw apontError;

    if (!apontamentos || apontamentos.length === 0) {
      return {
        submetidos: 0,
        motivo: 'Nenhum apontamento rascunho encontrado',
      };
    }

    return {
      encontrados: apontamentos.length,
      submetidos: 0,
      nota: 'Submissão manual ainda necessária via Server Action',
    };
  } catch (erro) {
    logError(`Erro ao submeter fechamento de ${prestador}`, erro);
    return { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
  }
}

/**
 * Rastreia confirmação de PIX para todos os fechamentos pendentes
 */
async function rastrearTodosOsPix(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  try {
    const { data: fechamentos, error } = await supabase
      .from('fechamentos_prestador')
      .select('id, pix_id, pix_status')
      .eq('pix_status', 'enviado')
      .not('pix_id', 'is', null);

    if (error) throw error;
    if (!fechamentos || fechamentos.length === 0) {
      return { rastreados: 0 };
    }

    let rastreados = 0;
    for (const fech of fechamentos) {
      try {
        const resultado = await rastrearConfirmacaoPix(fech.id);
        if ((resultado as any).sucesso) {
          rastreados++;
        }
      } catch (e) {
        logError(`Erro ao rastrear PIX de ${fech.id}`, e);
      }
    }

    return { rastreados };
  } catch (erro) {
    logError('Erro ao rastrear PIX', erro);
    return { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
  }
}

/**
 * Gera NFS-e automática para fechamentos pagos que ainda não têm NFS-e
 */
async function gerarNfsesPendentes(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  try {
    const { data: fechamentos, error } = await supabase
      .from('fechamentos_prestador')
      .select('id, nfse_id')
      .eq('status', 'pago')
      .is('nfse_id', null);

    if (error) throw error;
    if (!fechamentos || fechamentos.length === 0) {
      return { geradas: 0 };
    }

    let geradas = 0;
    for (const fech of fechamentos) {
      try {
        const resultado = await gerarNfsePorFechamento(fech.id);
        if ((resultado as any).sucesso) {
          geradas++;
        }
      } catch (e) {
        logError(`Erro ao gerar NFS-e de ${fech.id}`, e);
      }
    }

    return { geradas };
  } catch (erro) {
    logError('Erro ao gerar NFS-e', erro);
    return { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
  }
}
