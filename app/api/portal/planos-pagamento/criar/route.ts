// API endpoint para tenant criar plano de pagamento para fatura atrasada

import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { obterPool } from '@/server/integracao/db';
import { criarPlanoPagamento } from '@/server/integracao/criarPlanoPagamento';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Autenticar tenant
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
    const { faturaId, numParcelas, motivo } = body;

    if (!faturaId || !numParcelas) {
      return NextResponse.json(
        { erro: 'Dados obrigatórios faltando' },
        { status: 400 }
      );
    }

    if (numParcelas < 2 || numParcelas > 24) {
      return NextResponse.json(
        { erro: 'Número de parcelas deve estar entre 2 e 24' },
        { status: 400 }
      );
    }

    // Obter locatario_id do usuário
    const { data: pessoaData, error: pessoaError } = await supabase
      .from('pessoas')
      .select('id')
      .eq('auth_id', session.user.id)
      .single();

    if (pessoaError || !pessoaData) {
      return NextResponse.json({ erro: 'Pessoa não encontrada' }, { status: 404 });
    }

    // Criar plano de pagamento
    const pool = obterPool();
    const plano = await criarPlanoPagamento(pool, {
      faturaId,
      locatarioId: pessoaData.id,
      numParcelas,
      motivo,
    });

    return NextResponse.json({
      sucesso: true,
      planoId: plano.id,
      numeroParcelas: plano.numParcelas,
      valorParcela: plano.valorParcela,
      mensagem: `Plano de pagamento criado com ${plano.numParcelas} parcelas de R$ ${plano.valorParcela.toFixed(2)}. Aguardando aprovação do proprietário.`,
    });
  } catch (erro) {
    console.error('Erro ao criar plano de pagamento:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
