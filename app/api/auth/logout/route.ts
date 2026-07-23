import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();

    return NextResponse.json({ sucesso: true }, { status: 200 });
  } catch (erro) {
    console.error('Erro ao fazer logout:', erro);
    return NextResponse.json(
      { erro: 'Erro ao fazer logout' },
      { status: 500 }
    );
  }
}
