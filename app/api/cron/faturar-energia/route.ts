// Mesmo padrão de app/api/cron/gerar-fatura-mensal/route.ts (docs/13):
// autenticação por segredo compartilhado, chama a função de integração,
// devolve o resultado. Liga o cronograma ao faturamento de energia por
// medidor individual (server/integracao/faturarEnergia.ts, docs/11) —
// sem este cron, a fatura de energia só era gerada rodando o código à
// mão, nunca de forma agendada.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { faturarEnergiaConfirmada } from '@/server/integracao/faturarEnergia';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return tratarChamada(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return tratarChamada(request);
}

async function tratarChamada(request: NextRequest): Promise<NextResponse> {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado) {
    return NextResponse.json({ erro: 'CRON_SECRET não configurado no ambiente.' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const competenciaParam = request.nextUrl.searchParams.get('competencia'); // 'YYYY-MM', opcional
  let competencia: Date;
  try {
    competencia = competenciaParam ? parseCompetencia(competenciaParam) : primeiroDiaDoMesAtual();
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 400 });
  }

  const pool = obterPool();
  const resultado = await faturarEnergiaConfirmada(pool, competencia);

  return NextResponse.json({
    competencia: formatarPrimeiroDiaDoMes(competencia),
    faturadas: resultado.faturadas.length,
    detalhe: resultado.faturadas,
    puladas: resultado.puladas,
  });
}

function primeiroDiaDoMesAtual(): Date {
  const agora = new Date();
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
}

function parseCompetencia(valor: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(valor);
  if (!match) {
    throw new Error(`Parâmetro competencia inválido: "${valor}" (formato esperado YYYY-MM)`);
  }
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  if (mes < 1 || mes > 12) {
    throw new Error(`Parâmetro competencia inválido: "${valor}" (mês fora do intervalo 1-12)`);
  }
  return new Date(Date.UTC(ano, mes - 1, 1));
}

function formatarPrimeiroDiaDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
