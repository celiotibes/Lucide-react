// Mesmo padrão de app/api/cron/gerar-fatura-mensal/route.ts (docs/13):
// autenticação por segredo compartilhado, chama a função de integração,
// devolve o resultado. Liga o cronograma à régua de cobrança
// (server/integracao/reguaCobranca.ts) — recalcula juros/multa das
// faturas vencidas e registra a passagem pelos marcos D5/D15/D30, de
// forma idempotente (rodar duas vezes no mesmo dia não duplica evento).
// O envio de WhatsApp/e-mail a partir desses marcos continua sendo
// responsabilidade do n8n (docs/03) — esta rota só grava o estado.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { processarReguaCobranca } from '@/server/integracao/reguaCobranca';

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
  const resultado = await processarReguaCobranca(pool);

  return NextResponse.json({
    processadas: resultado.length,
    comEventoNovo: resultado.filter((r) => r.eventosRegistrados.length > 0).length,
    detalhe: resultado,
  });
}
