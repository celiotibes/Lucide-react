/**
 * Cron: Emitir Cobranças Pendentes
 * Usa middleware centralizado em server/api/middleware.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronAuth } from '@/server/api/middleware';
import { AsaasClient } from '@/server/asaas/client';
import { obterPool } from '@/server/integracao/db';
import { emitirCobrancasPendentes } from '@/server/integracao/emitirCobranca';

export const dynamic = 'force-dynamic';

const handler = async (_request: NextRequest): Promise<NextResponse> => {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erro: 'ASAAS_API_KEY não configurada no ambiente.' },
      { status: 500 }
    );
  }

  const asaasClient = new AsaasClient({
    apiKey,
    baseUrl: process.env.ASAAS_BASE_URL,
  });
  const pool = obterPool();
  const resultado = await emitirCobrancasPendentes(pool, asaasClient);

  return NextResponse.json({
    emitidas: resultado.emitidas.length,
    cobrancas: resultado.emitidas,
    puladas: resultado.puladas,
  });
};

export const GET = withCronAuth(handler);
export const POST = withCronAuth(handler);
