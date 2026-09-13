// Webhook para receber confirmações de pagamento PIX do Asaas

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { processarWebhookPagamentoPIX } from '@/server/integracao/pixAsaas';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Validar token do webhook
    const token = request.headers.get('authorization');
    if (token !== `Bearer ${process.env.ASAAS_WEBHOOK_TOKEN}`) {
      return NextResponse.json({ erro: 'Token inválido' }, { status: 401 });
    }

    const body = await request.json();

    // Validar que é um evento de cobrança
    if (body.event !== 'payment_received' && body.event !== 'payment_confirmed') {
      return NextResponse.json({ processado: false });
    }

    const pool = obterPool();

    // Processar pagamento PIX
    const resultado = await processarWebhookPagamentoPIX(pool, {
      id: body.id || body.chargeId,
      status: body.status,
      value: body.value,
      confirmedAmount: body.confirmedAmount,
    });

    if (!resultado.processado) {
      console.warn('Webhook não processado:', resultado.erro);
      return NextResponse.json({ processado: false, erro: resultado.erro });
    }

    // Registrar evento bem-sucedido na auditoria
    await pool.query(
      `
      insert into auditoria_pix (cobranca_pix_id, tipo_evento, descricao, dados_evento)
      select
        cp.id,
        'pagamento_confirmado',
        $1,
        $2::jsonb
      from cobrancas_pix cp
      where cp.cobranca_asaas_id = $3
      limit 1
    `,
      [
        'Pagamento confirmado via webhook Asaas',
        JSON.stringify(body),
        body.id || body.chargeId,
      ]
    );

    return NextResponse.json({ processado: true });
  } catch (erro) {
    console.error('Erro ao processar webhook PIX:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
