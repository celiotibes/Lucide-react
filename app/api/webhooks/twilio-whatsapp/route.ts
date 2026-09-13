// Webhook para receber atualizações de status de mensagens WhatsApp do Twilio

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { processarWebhookStatusWhatsApp } from '@/server/integracao/whatsappTwilio';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Validar token do webhook (Twilio envia este header)
    const twilioSignature = request.headers.get('x-twilio-signature');
    if (!twilioSignature) {
      return NextResponse.json({ erro: 'Assinatura Twilio ausente' }, { status: 401 });
    }

    const body = await request.json();

    // Validar que é uma atualização de status de mensagem
    if (!body.MessageSid || !body.MessageStatus) {
      return NextResponse.json({ processado: false });
    }

    const pool = obterPool();

    // Processar atualização de status
    const resultado = await processarWebhookStatusWhatsApp(pool, {
      messageSid: body.MessageSid,
      status: body.MessageStatus,
      timestamp: body.Timestamp,
    });

    return NextResponse.json({ processado: resultado.processado });
  } catch (erro) {
    console.error('Erro ao processar webhook Twilio:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
