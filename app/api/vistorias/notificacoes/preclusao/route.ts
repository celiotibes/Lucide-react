import { NextRequest, NextResponse } from 'next/server';
import { dispararNotificacoesPreclusao } from '@/server/vistorias/notificadorPreclusao';

/**
 * Endpoint para disparar notificações de preclusão
 *
 * Pode ser acionado por:
 * 1. Vercel Crons: adicionar em vercel.json
 * 2. Sistema externo via POST com Authorization header
 * 3. Manualmente via curl/Postman
 *
 * Segurança: valida CRON_SECRET enviado via header
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

    const resultado = await dispararNotificacoesPreclusao();

    return NextResponse.json(resultado, {
      status: resultado.success ? 200 : 500,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro no endpoint de notificações:', mensagem);
    return NextResponse.json(
      { error: mensagem, success: false },
      { status: 500 }
    );
  }
}

/**
 * Validação de Vercel Crons
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { message: 'Use POST com Authorization: Bearer <CRON_SECRET>' },
    { status: 405 }
  );
}
