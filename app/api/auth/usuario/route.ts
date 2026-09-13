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

    // Ensure usuario entry exists (RLS bridge) — called automatically on each GET
    try {
      const { data, error } = await supabase.rpc('fn_upsert_usuario');
      if (error) {
        console.warn('Aviso ao criar entrada usuarios:', error.message);
      }
    } catch (err) {
      console.warn('Aviso ao chamar fn_upsert_usuario:', err);
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { pessoa_id, papel } = body;

    if (!pessoa_id) {
      return NextResponse.json({ erro: 'pessoa_id é obrigatório' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('fn_vincular_usuario_a_pessoa', {
      p_pessoa_id: pessoa_id,
      p_papel: papel || 'inquilino',
    });

    if (error) {
      return NextResponse.json({ erro: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (erro) {
    console.error('Erro ao vincular usuário a pessoa:', erro);
    return NextResponse.json({ erro: 'Erro ao vincular usuário a pessoa' }, { status: 500 });
  }
}
