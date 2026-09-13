// Gera faturas tipo='multa_juros' para encargos de atraso após reguaCobranca
// ter calculado e atualizado valor_liquido. Roda após regua-cobranca no
// agendador (n8n / Vercel Crons).
//
// Padrão idêntico aos demais crons: autenticação por segredo compartilhado,
// chama a função de integração, devolve o resultado.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { gerarMultaJurosFaturas } from '@/server/integracao/gerarMultaJurosFaturas';

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

  try {
    const pool = obterPool();
    const resultado = await gerarMultaJurosFaturas(pool);

    return NextResponse.json({
      geradas: resultado.geradas.length,
      detalhes: resultado.geradas,
      puladas: resultado.puladas,
    });
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 500 });
  }
}
