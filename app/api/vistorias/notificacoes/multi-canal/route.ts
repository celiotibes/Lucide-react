import { NextRequest, NextResponse } from 'next/server';
import { dispararNotificacoesMultiCanal } from '@/server/vistorias/notificadorMultiCanal';

/**
 * Endpoint para disparar notificações multi-canal (email, SMS, WhatsApp)
 *
 * Uso:
 * curl -X POST https://app.com/api/vistorias/notificacoes/multi-canal \
 *   -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: NextRequest) {
  try {
    // Validar segredo de cron
    const secret = request.headers.get('authorization')?.replace('Bearer ', '');
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const resultado = await dispararNotificacoesMultiCanal();

    return NextResponse.json(resultado, {
      status: resultado.success ? 200 : 500,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro no endpoint de notificações multi-canal:', mensagem);
    return NextResponse.json(
      { error: mensagem, success: false },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { message: 'Use POST com Authorization: Bearer <CRON_SECRET>' },
    { status: 405 }
  );
}
