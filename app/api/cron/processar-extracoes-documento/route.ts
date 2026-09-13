// Mesmo padrão de app/api/cron/processar-documentos-anexados/route.ts:
// autenticação por segredo compartilhado, chama a função de integração,
// devolve o resultado. Roda DEPOIS do cron de conversão para Markdown —
// só processa documentos com status_extracao = 'concluida' (ver
// server/integracao/processarExtracoesDocumento.ts).

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { processarExtracoesDocumento } from '@/server/integracao/processarExtracoesDocumento';

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
  const resultado = await processarExtracoesDocumento(pool);

  return NextResponse.json({
    processados: resultado.length,
    sucesso: resultado.filter((r) => r.sucesso).length,
    falhas: resultado.filter((r) => !r.sucesso).length,
    detalhe: resultado,
  });
}
