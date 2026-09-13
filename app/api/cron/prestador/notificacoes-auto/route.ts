/**
 * ============================================================================
 * Cron: Notificações Automáticas de Prestador
 * ============================================================================
 * Rotina que:
 * 1. Lembra prestador de anotar horas (diário 17:30)
 * 2. Submete fechamentos automaticamente (sexta 23:59 / dia 9 23:59)
 * 3. Rastreia confirmação de PIX (a cada 5 min)
 * 4. Gera NFS-e automática (diário 01:00)
 *
 * Refactored: Agora usa server/cron/prestador-notificacoes.ts para lógica.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronAuth } from '@/server/api/middleware';
import { executarNotificacoesPrestador } from '@/server/cron/prestador-notificacoes';

export const dynamic = 'force-dynamic';

export const GET = withCronAuth(async (request: NextRequest) => {
  const resultados = await executarNotificacoesPrestador();
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    ...resultados,
  });
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
