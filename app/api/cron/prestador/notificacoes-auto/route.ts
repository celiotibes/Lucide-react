// ============================================================================
// Cron: Notificações Automáticas de Prestador
// ============================================================================
// Rotina que:
// 1. Lembra prestador de anotar horas (diário 17:30)
// 2. Submete fechamentos automaticamente (sexta 23:59 / dia 9 23:59)
// 3. Rastreia confirmação de PIX (a cada 5 min)
// 4. Gera NFS-e automática (diário 01:00)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Notificador } from '@/server/notificacao/Notificador';
import { gerarNfsePorFechamento } from '@/app/actions/prestador/nfse';
import { rastrearConfirmacaoPix } from '@/app/actions/prestador/pix';

export const dynamic = 'force-dynamic';

// CRON_SECRET é a variável que a Vercel injeta automaticamente como
// "Authorization: Bearer" em todo cron agendado via vercel.json — mesma
// variável usada pelos demais crons do projeto. Corrigido de
// X-CRON-SECRET/CRON_SECRET_KEY (nunca bateria com o que a Vercel envia) e
// removido o bypass "=== 'dev'" (autenticava qualquer chamada se essa
// variável de ambiente estivesse com o valor literal "dev").
function validarTokenCron(request: NextRequest): boolean {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado) return false;
  return request.headers.get('authorization') === `Bearer ${segredoEsperado}`;
}

function agora(): Date {
  return new Date();
}

function ehHorario(hora: number, minuto: number = 0): boolean {
  const agora = new Date();
  return agora.getUTCHours() === hora && agora.getUTCMinutes() >= minuto && agora.getUTCMinutes() < minuto + 1;
}

function ehDiaDaSemana(dia: number): boolean {
  // 0 = domingo, 5 = sexta, 9 = dia do mês
  const agora = new Date();
  if (dia < 7) {
    return agora.getDay() === dia;
  }
  return agora.getDate() === dia;
}

// GET é o método que a Vercel usa para disparar crons agendados via
// vercel.json — POST continua suportado (delegando para cá) para quem
// preferir chamar assim manualmente.
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!validarTokenCron(request)) {
    return NextResponse.json({ erro: 'Token inválido' }, { status: 401 });
  }

  const supabase = await createClient();
  const resultados: Record<string, unknown> = {};

  try {
    // ========================================================================
    // 1. Diário 17:30 (horário Brasília): Lembrar apontamentos não feitos
    // ========================================================================
    if (ehHorario(20, 30)) {
      // 17:30 BRT = 20:30 UTC
      resultados.lembrarApontamentos = await lembrarApontamentosNaoFeitos(supabase);
    }

    // ========================================================================
    // 2. Sexta-feira 23:59: Submeter fechamento de Cristiano
    // ========================================================================
    if (ehDiaDaSemana(5) && ehHorario(2, 59)) {
      // Sexta 23:59 BRT = sábado 02:59 UTC
      resultados.fecharCristiano = await submeterFechamentoAutomatico(supabase, 'cristiano');
    }

    // ========================================================================
    // 3. Dia 9 23:59: Submeter fechamento de Paulo
    // ========================================================================
    if (ehDiaDaSemana(9) && ehHorario(2, 59)) {
      // Dia 9 23:59 BRT = dia 10 02:59 UTC
      resultados.fecharPaulo = await submeterFechamentoAutomatico(supabase, 'paulo');
    }

    // ========================================================================
    // 4. A cada 5 minutos: Rastrear confirmação de PIX
    // ========================================================================
    resultados.rastrearPix = await rastrearTodosOsPix(supabase);

    // ========================================================================
    // 5. Diário 01:00: Gerar NFS-e de fechamentos pagos
    // ========================================================================
    if (ehHorario(4)) {
      // 01:00 BRT = 04:00 UTC
      resultados.gerarNfse = await gerarNfsesPendentes(supabase);
    }

    return NextResponse.json({
      ok: true,
      timestamp: agora().toISOString(),
      ...resultados,
    });
  } catch (erro) {
    console.error('Erro no cron de notificações:', erro);
    return NextResponse.json(
      {
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
        timestamp: agora().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}

// ============================================================================
// Funções auxiliares
// ============================================================================

async function lembrarApontamentosNaoFeitos(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    // Buscar prestadores que NÃO anotaram hoje
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

      // Verificar se anotou hoje
      const { data: apontamentosHoje } = await supabase
        .from('apontamentos_prestador')
        .select('id')
        .eq('data', hoje)
        .eq(
          'contrato_id',
          ((prest as any).contratos_prestador?.[0]?.id as string) || ''
        );

      if (!apontamentosHoje || apontamentosHoje.length === 0) {
        // Não anotou, enviar lembrete
        await notificador.enviar({
          canais: ['email'],
          destinatario: {
            email: pessoa.email,
            telefone: pessoa.telefone,
            nome: (prest as any).nome_completo,
          },
          template: {
            titulo: 'Lembrete: Anotações de Hoje',
            corpo: 'Não encontramos registros de apontamentos de hoje. Não esqueça de anotar suas horas!',
            acaoUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/painel-prestador`,
            acaoTexto: 'Ir para o Painel',
          },
        });

        avisados++;
      }
    }

    return { avisados };
  } catch (erro) {
    console.error('Erro ao lembrar apontamentos:', erro);
    return { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
  }
}

async function submeterFechamentoAutomatico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prestador: 'paulo' | 'cristiano'
) {
  try {
    // Buscar prestador por nome (simplificado)
    const { data: prest, error: prestError } = await supabase
      .from('prestadores_servico')
      .select('id')
      .in('nome_completo', [
        prestador === 'paulo' ? 'Paulo Bruxel' : 'Cristiano Rodrigues de Souza',
      ])
      .single();

    if (prestError || !prest) {
      return { erro: `Prestador ${prestador} não encontrado` };
    }

    // Buscar contrato ativo
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
      dataInicio.setDate(dataInicio.getDate() - dataInicio.getDay() + 1); // Segunda
      dataFim = new Date(dataInicio);
      dataFim.setDate(dataFim.getDate() + 6); // Domingo
    } else {
      // Último dia do mês anterior
      dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      dataInicio = new Date(dataFim.getFullYear(), dataFim.getMonth(), 1);
    }

    // Buscar apontamentos rascunho
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

    // Para este cron simplificado, apenas contar
    // A submissão real seria feita via Server Action
    return {
      encontrados: apontamentos.length,
      submetidos: 0,
      nota: 'Submissão manual ainda necessária via Server Action',
    };
  } catch (erro) {
    console.error('Erro ao submeter fechamento:', erro);
    return { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
  }
}

async function rastrearTodosOsPix(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    // Buscar PIXes enviados mas não confirmados
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
        console.error(`Erro ao rastrear PIX de ${fech.id}:`, e);
      }
    }

    return { rastreados };
  } catch (erro) {
    console.error('Erro ao rastrear PIX:', erro);
    return { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
  }
}

async function gerarNfsesPendentes(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    // Buscar fechamentos pagos mas sem NFS-e
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
        console.error(`Erro ao gerar NFS-e de ${fech.id}:`, e);
      }
    }

    return { geradas };
  } catch (erro) {
    console.error('Erro ao gerar NFS-e:', erro);
    return { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
  }
}
