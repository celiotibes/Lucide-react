import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
    });
  } catch (erro) {
    console.error('Erro ao buscar usuário:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar usuário' }, { status: 500 });
  }
}
