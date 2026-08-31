// Mesmo padrão de app/api/cron/gerar-fatura-mensal/route.ts (docs/13):
// autenticação por segredo compartilhado, chama a função de integração,
// devolve o resultado. Não depende do Asaas diretamente — só do banco já
// ter faturas de aluguel marcadas como pagas (pelo webhook,
// app/api/webhooks/asaas/route.ts).

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { distribuirRecebimentosPendentes } from '@/server/integracao/distribuirRecebimento';

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
  const resultado = await distribuirRecebimentosPendentes(pool);

  return NextResponse.json({
    distribuidas: resultado.distribuidas.length,
    detalhe: resultado.distribuidas,
    semDistribuicao: resultado.semDistribuicao,
  });
}
