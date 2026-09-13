/**
 * Cron: Distribuir Recebimentos Pendentes
 * Usa middleware centralizado em server/api/middleware.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronAuth } from '@/server/api/middleware';
import { obterPool } from '@/server/integracao/db';
import { distribuirRecebimentosPendentes } from '@/server/integracao/distribuirRecebimento';

export const dynamic = 'force-dynamic';

const handler = async (_request: NextRequest): Promise<NextResponse> => {
  const pool = obterPool();
  const resultado = await distribuirRecebimentosPendentes(pool);

  return NextResponse.json({
    distribuidas: resultado.distribuidas.length,
    detalhe: resultado.distribuidas,
    semDistribuicao: resultado.semDistribuicao,
  });
};

export const GET = withCronAuth(handler);
export const POST = withCronAuth(handler);
