// Mesmo padrão de app/api/cron/reequilibrio-trienal/route.ts. Roda
// diariamente — cobre a notificação de planejamento (60 dias) e a de
// ajuste/proposta de reajuste (30 dias) antes do fim de cada contrato.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { processarRenovacaoContratual } from '@/server/integracao/processarRenovacaoContratual';

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
  const resultado = await processarRenovacaoContratual(pool);

  return NextResponse.json({
    processados: resultado.length,
    planejamentoEnviado: resultado.filter((r) => r.planejamentoEnviado).length,
    ajusteEnviado: resultado.filter((r) => r.ajusteEnviado).length,
    propostasGeradas: resultado.filter((r) => r.reajustePropostoId).length,
    detalhe: resultado,
  });
}
