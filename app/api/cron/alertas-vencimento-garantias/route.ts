// Cron: Alertar vencimento de garantias (diário às 9:00 AM)

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { alertarVencimentoGarantias } from '@/server/integracao/alertarVencimentoGarantias';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Validar token CRON_SECRET
  const token = request.headers.get('authorization');
  if (token !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }

  try {
    const pool = obterPool();
    const resultado = await alertarVencimentoGarantias(pool);

    console.log(
      `✓ Alertas de garantias: ${resultado.total_detectadas} garantias, ` +
        `${resultado.emails_enviados} emails, ${resultado.whatsapp_enviados} WhatsApp, ` +
        `${resultado.falhas_totais} falhas`
    );

    return NextResponse.json({
      sucesso: true,
      total_detectadas: resultado.total_detectadas,
      emails_enviados: resultado.emails_enviados,
      whatsapp_enviados: resultado.whatsapp_enviados,
      falhas_totais: resultado.falhas_totais,
      detalhes: resultado.detalhes,
    });
  } catch (erro) {
    console.error('Erro no cron de alertas de garantias:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
