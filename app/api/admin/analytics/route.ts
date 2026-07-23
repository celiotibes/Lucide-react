// API endpoint for aggregating all analytics data

import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { obterPool } from '@/server/integracao/db';
import { analisarCohortePagamentos } from '@/server/analytics/cohortAnalysis';
import { analisarRiscoContratos } from '@/server/analytics/churnPrediction';
import { analisarReceita } from '@/server/analytics/revenueForecasting';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Autenticar admin
    const cookieStore = cookies();
    const supabase = createServerComponentClient({
      cookies: () => cookieStore,
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { filtroRisco, dataInicio, dataFim } = body;

    const pool = obterPool();

    // Carrega dados em paralelo
    const [cohorts, riscos, receita] = await Promise.all([
      analisarCohortePagamentos(pool, {
        dataInicioFiltro: dataInicio ? new Date(dataInicio) : undefined,
        dataFimFiltro: dataFim ? new Date(dataFim) : undefined,
      }),
      analisarRiscoContratos(pool),
      analisarReceita(pool, 12),
    ]);

    // Transformar dados de coortes
    const cohortesFlat = cohorts.flatMap((c) =>
      c.metricas.map((m) => ({
        cohortMes: c.cohortMes,
        numeroContratos: m.numeroContratos,
        taxaPagamentoAdia: m.taxaPagamentoAdia,
        diasMedioAtraso: m.diasMedioAtraso,
        valorMedioAluguel: m.valorMedioAluguel,
      }))
    );

    // Filtrar riscos se necessário
    const riscosFiltrados =
      filtroRisco === 'todos' || !filtroRisco
        ? riscos
        : riscos.filter((r) => r.recomenacao === filtroRisco);

    // Transformar dados para o frontend
    const dados = {
      cohorts: cohortesFlat,
      riscos: riscosFiltrados.map((r) => ({
        contratoId: r.contratoId,
        locatarioNome: r.locatarioNome,
        imovelIdentificacao: r.imovelIdentificacao,
        scoreRisco: r.scoreRisco,
        motivoRisco: r.motivoRisco,
        recomenacao: r.recomenacao,
      })),
      previsoes: receita.previsoes,
      historico: receita.historico,
      taxaColetaMedia: receita.taxaColetaMedia,
    };

    return NextResponse.json({ dados });
  } catch (erro) {
    console.error('Erro ao carregar analytics:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
