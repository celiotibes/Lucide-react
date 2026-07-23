import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    // Verificar se é admin
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('papel')
      .eq('id', user.id)
      .single();

    if (!usuario || !['admin', 'economista'].includes(usuario.papel)) {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
    }

    const asaasApiKey = process.env.NEXT_PUBLIC_ASAAS_API_KEY;
    if (!asaasApiKey) {
      return NextResponse.json(
        { erro: 'API Key não configurada' },
        { status: 500 },
      );
    }

    // Testar conexão fazendo uma requisição simples
    const response = await fetch('https://www.asaas.com/api/v3/balance', {
      method: 'GET',
      headers: {
        'access_token': asaasApiKey,
      },
    });

    if (!response.ok) {
      const errorData = (await response.json()) as any;
      return NextResponse.json(
        {
          erro: errorData.errors?.[0]?.description || 'Erro ao conectar com Asaas',
          status: response.status,
        },
        { status: 400 },
      );
    }

    const data = (await response.json()) as any;

    return NextResponse.json({
      mensagem: 'Conexão bem-sucedida',
      saldo: data.balance || 0,
      ambiente: asaasApiKey.includes('sandbox') ? 'Sandbox' : 'Produção',
    });
  } catch (erro) {
    console.error('Erro ao testar Asaas:', erro);
    return NextResponse.json(
      {
        erro: erro instanceof Error ? erro.message : 'Erro ao testar conexão',
      },
      { status: 500 },
    );
  }
}
