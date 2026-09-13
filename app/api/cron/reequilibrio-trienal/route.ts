// Mesmo padrão de app/api/cron/regua-cobranca/route.ts: autenticação por
// segredo compartilhado, chama a função de integração, devolve o resultado.
// Roda diariamente — o calendário puro (server/juridico/reequilibrioTrienal.ts)
// e o upsert idempotente garantem que rodar mais de uma vez no mesmo dia (ou
// atrasar alguns dias) nunca duplica notificação.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { processarReequilibrioTrienal } from '@/server/integracao/processarReequilibrioTrienal';

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
  const resultado = await processarReequilibrioTrienal(pool);

  return NextResponse.json({
    processados: resultado.length,
    planejamentoEnviado: resultado.filter((r) => r.planejamentoEnviado).length,
    oficialEnviado: resultado.filter((r) => r.oficialEnviado).length,
    detalhe: resultado,
  });
}
