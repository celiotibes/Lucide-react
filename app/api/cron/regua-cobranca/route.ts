/**
 * Cron: Processar Régua de Cobrança
 * Usa middleware centralizado em server/api/middleware.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronAuth } from '@/server/api/middleware';
import { obterPool } from '@/server/integracao/db';
import { processarReguaCobranca } from '@/server/integracao/reguaCobranca';

export const dynamic = 'force-dynamic';

const handler = async (_request: NextRequest): Promise<NextResponse> => {
  const pool = obterPool();
  const resultado = await processarReguaCobranca(pool);

  return NextResponse.json({
    processadas: resultado.length,
    comEventoNovo: resultado.filter((r) => r.eventosRegistrados.length > 0)
      .length,
    detalhe: resultado,
  });
};

export const GET = withCronAuth(handler);
export const POST = withCronAuth(handler);
