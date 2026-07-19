// Mesmo padrão de app/api/cron/reequilibrio-trienal/route.ts.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { processarReajusteAnual } from '@/server/integracao/processarReajusteAnual';

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

  const pool = obterPool();
  const resultado = await processarReajusteAnual(pool);

  return NextResponse.json({
    processados: resultado.length,
    notificacaoEnviada: resultado.filter((r) => r.notificacaoEnviada).length,
    propostasGeradas: resultado.filter((r) => r.reajustePropostoId).length,
    detalhe: resultado,
  });
}
