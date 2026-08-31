// Devolve o HTML final do contrato (motor de Legal Design/Visual Law,
// docs/27-motor-de-contratos.md) — usado pela pré-visualização em
// app/contratos/[id]/contrato (iframe) e, mais adiante, pelo passo de
// conversão para PDF (Puppeteer navegaria direto para esta URL).

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { ContratoSemModeloError, gerarContratoHtml } from '@/server/integracao/gerarContratoHtml';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;

  try {
    const resultado = await gerarContratoHtml(obterPool(), id);
    return new NextResponse(resultado.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (erro) {
    if (erro instanceof ContratoSemModeloError) {
      return new NextResponse(`<p style="font-family: system-ui, sans-serif; padding: 2rem;">${erro.message}</p>`, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    throw erro;
  }
}
