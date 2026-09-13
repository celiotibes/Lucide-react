import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface UsuarioComPessoa {
  id: string;
  email: string;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  papel: string;
  criado_em: string;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    // Verify user is admin
    const { data: usuarioAdmin, error: errorAdmin } = await supabase
      .from('usuarios')
      .select('papel')
      .eq('id', user.id)
      .single();

    if (errorAdmin || !usuarioAdmin || !['admin', 'economista'].includes(usuarioAdmin.papel)) {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
    }

    // Fetch all usuarios with their pessoa info
    const { data, error } = await supabase.rpc('fn_usuarios_com_pessoa');

    if (error) {
      console.error('Erro ao buscar usuários:', error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (erro) {
    console.error('Erro ao buscar usuários:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar usuários' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    // Verify user is admin
    const { data: usuarioAdmin, error: errorAdmin } = await supabase
      .from('usuarios')
      .select('papel')
      .eq('id', user.id)
      .single();

    if (errorAdmin || !usuarioAdmin || !['admin', 'economista'].includes(usuarioAdmin.papel)) {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
    const { usuario_id, pessoa_id, papel } = body;

    if (!usuario_id) {
      return NextResponse.json({ erro: 'usuario_id é obrigatório' }, { status: 400 });
    }

    if (papel && !['admin', 'economista', 'inquilino', 'investidor', 'prestador'].includes(papel)) {
      return NextResponse.json({ erro: 'papel inválido' }, { status: 400 });
    }

    // Update usuario
    const updateData: { pessoa_id?: string; papel?: string; atualizado_em?: string } = {
      atualizado_em: new Date().toISOString(),
    };

    if (pessoa_id !== undefined) {
      updateData.pessoa_id = pessoa_id || null;
    }

    if (papel) {
      updateData.papel = papel;
    }

    const { data, error } = await supabase
      .from('usuarios')
      .update(updateData)
      .eq('id', usuario_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ erro: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (erro) {
    console.error('Erro ao atualizar usuário:', erro);
    return NextResponse.json({ erro: 'Erro ao atualizar usuário' }, { status: 500 });
  }
}
