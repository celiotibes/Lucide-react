import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface AuditLogRow {
  id: string;
  tabela: string;
  registro_id: string;
  operacao: string;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  usuario_email: string | null;
  usuario_id: string | null;
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
    const { data: usuarioAdmin } = await supabase
      .from('usuarios')
      .select('papel')
      .eq('id', user.id)
      .single();

    if (!usuarioAdmin || !['admin', 'economista'].includes(usuarioAdmin.papel)) {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const tabela = searchParams.get('tabela');
    const registroId = searchParams.get('registro_id');
    const operacao = searchParams.get('operacao');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = supabase
      .from('audit_log')
      .select(
        `
        id,
        tabela,
        registro_id,
        operacao,
        dados_antes,
        dados_depois,
        criado_em,
        usuarios:usuario_id (
          id,
          usuarios_auth:id (email)
        )
      `,
        { count: 'exact' }
      )
      .order('criado_em', { ascending: false });

    if (tabela) {
      query = query.eq('tabela', tabela);
    }

    if (registroId) {
      query = query.eq('registro_id', registroId);
    }

    if (operacao) {
      query = query.eq('operacao', operacao);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Erro ao buscar audit logs:', error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    // Transform response to flatten nested usuario data
    const logs = (data || []).map((log: any) => ({
      id: log.id,
      tabela: log.tabela,
      registro_id: log.registro_id,
      operacao: log.operacao,
      dados_antes: log.dados_antes,
      dados_depois: log.dados_depois,
      usuario_id: log.usuario_id,
      usuario_email: log.usuarios?.usuarios_auth?.[0]?.email || null,
      criado_em: log.criado_em,
    }));

    return NextResponse.json({
      data: logs,
      total: count || 0,
      limit,
      offset,
    });
  } catch (erro) {
    console.error('Erro ao buscar audit logs:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar audit logs' }, { status: 500 });
  }
}
