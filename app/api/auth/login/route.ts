import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { erro: 'Email é obrigatório' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });

    if (error) {
      console.error('Erro ao enviar magic link:', error);
      return NextResponse.json(
        { erro: 'Erro ao enviar link de login. Tente novamente.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Link de login enviado para o email',
    });
  } catch (erro) {
    console.error('Erro na rota de login:', erro);
    return NextResponse.json(
      { erro: 'Erro ao processar requisição' },
      { status: 500 }
    );
  }
}
