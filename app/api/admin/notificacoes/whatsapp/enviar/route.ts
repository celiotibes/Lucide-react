// API endpoint para enviar notificações via WhatsApp

import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { obterPool } from '@/server/integracao/db';
import { enviarNotificacaoWhatsApp } from '@/server/integracao/whatsappTwilio';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Autenticar admin
    const cookieStore = cookies();
    const supabase = createServerComponentClient({
      cookies: () => cookieStore,
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { numeroCelular, tipoNotificacao, dadosRelevantes, nomeDestinatario } = body;

    if (!numeroCelular || !tipoNotificacao) {
      return NextResponse.json(
        { erro: 'numeroCelular e tipoNotificacao obrigatórios' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    // Verificar preferências de notificação do usuário
    const { rows: prefs } = await pool.query<{
      notificacoes_ativas: boolean;
    }>(
      `
      select notificacoes_ativas
      from preferencias_notificacao_whatsapp
      where numero_celular = $1
      limit 1
    `,
      [numeroCelular]
    );

    if (prefs.length > 0 && !prefs[0].notificacoes_ativas) {
      return NextResponse.json(
        { erro: 'Notificações desativadas para este número' },
        { status: 403 }
      );
    }

    // Enviar notificação
    const resultado = await enviarNotificacaoWhatsApp(pool, {
      recipienteNumeroCelular: numeroCelular,
      destinatarioNome: nomeDestinatario || 'Usuário',
      tipoNotificacao: tipoNotificacao,
      conteudo: '',
      dadosRelevantes,
    });

    if (!resultado.sucesso) {
      return NextResponse.json(
        { erro: resultado.erro },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      messageSid: resultado.messageSid,
      dataEnvio: resultado.dataEnvio,
    });
  } catch (erro) {
    console.error('Erro ao enviar WhatsApp:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
