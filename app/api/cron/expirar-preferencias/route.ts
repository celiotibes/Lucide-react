// Detectar e marcar preferências expiradas como 'sem_resposta'
// Executa diariamente para verificar prazos que ultrapassaram 30 dias

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { detectarPrazosExpirados } from '@/server/integracao/registrarDireitoPreferencia';

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

  try {
    const pool = obterPool();
    const prazosExpirados = await detectarPrazosExpirados(pool);

    console.log(
      `Detectadas ${prazosExpirados.length} preferências expiradas, marcadas como 'sem_resposta'`
    );

    return NextResponse.json({
      expiradas: prazosExpirados.length,
      detalhes: prazosExpirados,
    });
  } catch (erro) {
    console.error('Erro ao detectar preferências expiradas:', erro);
    return NextResponse.json({ erro: (erro as Error).message }, { status: 500 });
  }
}
