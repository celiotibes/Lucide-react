// API endpoint para proprietário aprovar plano de pagamento

import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { obterPool } from '@/server/integracao/db';
import { aprovarPlanoPagamento } from '@/server/integracao/criarPlanoPagamento';

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
    const { planoId } = body;

    if (!planoId) {
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

    // Aprovar plano
    const pool = obterPool();
    const resultado = await aprovarPlanoPagamento(pool, {
      planoId,
      proprietarioId: pessoaData.id,
    });

    return NextResponse.json({
      sucesso: true,
      planoId: resultado.id,
      status: resultado.status,
    });
  } catch (erro) {
    console.error('Erro ao aprovar plano:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
