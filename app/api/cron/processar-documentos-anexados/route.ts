// Mesmo padrão de app/api/cron/regua-cobranca/route.ts: autenticação por
// segredo compartilhado, chama a função de integração, devolve o resultado.
// Converte documentos anexados pendentes (server/integracao/
// processarDocumentosAnexados.ts) para Markdown, preparando o texto que a
// Fase 3/4 (adapter de IA + extração estruturada) vai consumir.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { processarDocumentosAnexados } from '@/server/integracao/processarDocumentosAnexados';

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
  const resultado = await processarDocumentosAnexados(pool);

  return NextResponse.json({
    processados: resultado.length,
    sucesso: resultado.filter((r) => r.sucesso).length,
    falhas: resultado.filter((r) => !r.sucesso).length,
    detalhe: resultado,
  });
}
