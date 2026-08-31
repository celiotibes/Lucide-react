// API endpoint para proprietário rejeitar plano de pagamento

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { obterPool } from '@/server/integracao/db';
import { rejeitarPlanoPagamento } from '@/server/integracao/criarPlanoPagamento';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Autenticar admin
    const cookieStore = cookies();
    const supabase = createClient({
      cookies: () => cookieStore,
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { planoId, motivo } = body;

    if (!planoId || !motivo) {
      return NextResponse.json(
        { erro: 'Dados obrigatórios faltando' },
        { status: 400 }
      );
    }

    // Obter proprietario_id do usuário
    const { data: pessoaData, error: pessoaError } = await supabase
      .from('pessoas')
      .select('id')
      .eq('auth_id', session.user.id)
      .single();

    if (pessoaError || !pessoaData) {
      return NextResponse.json({ erro: 'Pessoa não encontrada' }, { status: 404 });
    }

    // Rejeitar plano
    const pool = obterPool();
    const resultado = await rejeitarPlanoPagamento(pool, {
      planoId,
      proprietarioId: pessoaData.id,
      motivo,
    });

    return NextResponse.json({
      sucesso: true,
      planoId: resultado.id,
      status: resultado.status,
    });
  } catch (erro) {
    console.error('Erro ao rejeitar plano:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
