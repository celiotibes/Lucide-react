// Mesmo padrão de app/api/cron/gerar-fatura-mensal/route.ts (docs/13):
// autenticação por segredo compartilhado, chama a função de integração,
// devolve o resultado. Só roda de verdade quando ASAAS_API_KEY existir
// (docs/09) — sem ela, responde 500 em vez de fingir que emitiu algo.

import { NextRequest, NextResponse } from 'next/server';
import { AsaasClient } from '@/server/asaas/client';
import { obterPool } from '@/server/integracao/db';
import { emitirCobrancasPendentes } from '@/server/integracao/emitirCobranca';

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

  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ erro: 'ASAAS_API_KEY não configurada no ambiente.' }, { status: 500 });
  }

  const asaasClient = new AsaasClient({ apiKey, baseUrl: process.env.ASAAS_BASE_URL });
  const pool = obterPool();
  const resultado = await emitirCobrancasPendentes(pool, asaasClient);

  return NextResponse.json({
    emitidas: resultado.emitidas.length,
    cobrancas: resultado.emitidas,
    puladas: resultado.puladas,
  });
}
