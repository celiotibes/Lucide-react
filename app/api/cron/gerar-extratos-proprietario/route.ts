// Mesmo padrão das outras rotas de cron (docs/13). Diferença: o extrato é
// de um mês FECHADO — o default é o mês ANTERIOR ao atual (não o corrente,
// como em gerar-fatura-mensal), porque só faz sentido depois que
// distribuir-recebimentos já rodou para (quase) todo aquele mês.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { gerarExtratosMensaisProprietario } from '@/server/integracao/gerarExtratoProprietario';

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

  const competenciaParam = request.nextUrl.searchParams.get('competencia');
  let competencia: Date;
  try {
    competencia = competenciaParam ? parseCompetencia(competenciaParam) : mesAnterior();
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 400 });
  }

  const pool = obterPool();
  const resultado = await gerarExtratosMensaisProprietario(pool, competencia);

  return NextResponse.json({
    competencia: formatarPrimeiroDiaDoMes(competencia),
    gerados: resultado.gerados.length,
    extratos: resultado.gerados,
  });
}

function mesAnterior(): Date {
  const agora = new Date();
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
}

function parseCompetencia(valor: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(valor);
  if (!match) {
    throw new Error(`Parâmetro competencia inválido: "${valor}" (formato esperado YYYY-MM)`);
  }
  const mes = Number(match[2]);
  if (mes < 1 || mes > 12) {
    throw new Error(`Parâmetro competencia inválido: "${valor}" (mês fora do intervalo 1-12)`);
  }
  return new Date(Date.UTC(Number(match[1]), mes - 1, 1));
}

function formatarPrimeiroDiaDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
