import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AsaasClient } from '@/server/asaas/client';

export async function GET(request: NextRequest) {
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

    // Inicializar Asaas client
    const asaasApiKey = process.env.NEXT_PUBLIC_ASAAS_API_KEY;
    if (!asaasApiKey) {
      return NextResponse.json({
        conectado: false,
        ambiente: 'sandbox' as const,
        saldo: 0,
        cobrancas_pendentes: 0,
        cobrancas_pagas: 0,
        cobrancas_atrasadas: 0,
        ultimaVerificacao: new Date().toISOString(),
        erro: 'API Key não configurada',
      });
    }

    const asaas = new AsaasClient(asaasApiKey);

    // Tentar verificar saldo (este endpoint valida a chave)
    let saldo = 0;
    let conectado = false;

    try {
      const response = await fetch('https://www.asaas.com/api/v3/balance', {
        method: 'GET',
        headers: {
          'access_token': asaasApiKey,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        saldo = data.balance || 0;
        conectado = true;
      }
    } catch (erro) {
      console.error('Erro ao obter saldo:', erro);
    }

    // Contar cobranças
    let cobrancas_pendentes = 0;
    let cobrancas_pagas = 0;
    let cobrancas_atrasadas = 0;

    try {
      const response = await fetch(
        'https://www.asaas.com/api/v3/payments?status=PENDING&limit=1',
        {
          method: 'GET',
          headers: {
            'access_token': asaasApiKey,
          },
        },
      );

      if (response.ok) {
        const data = (await response.json()) as any;
        cobrancas_pendentes = data.totalCount || 0;
      }
    } catch (erro) {
      console.error('Erro ao contar cobrancas pendentes:', erro);
    }

    try {
      const response = await fetch(
        'https://www.asaas.com/api/v3/payments?status=RECEIVED&limit=1',
        {
          method: 'GET',
          headers: {
            'access_token': asaasApiKey,
          },
        },
      );

      if (response.ok) {
        const data = (await response.json()) as any;
        cobrancas_pagas = data.totalCount || 0;
      }
    } catch (erro) {
      console.error('Erro ao contar cobrancas pagas:', erro);
    }

    try {
      const response = await fetch(
        'https://www.asaas.com/api/v3/payments?status=OVERDUE&limit=1',
        {
          method: 'GET',
          headers: {
            'access_token': asaasApiKey,
          },
        },
      );

      if (response.ok) {
        const data = (await response.json()) as any;
        cobrancas_atrasadas = data.totalCount || 0;
      }
    } catch (erro) {
      console.error('Erro ao contar cobrancas atrasadas:', erro);
    }

    return NextResponse.json({
      conectado,
      ambiente: asaasApiKey.includes('sandbox') ? ('sandbox' as const) : ('producao' as const),
      saldo,
      cobrancas_pendentes,
      cobrancas_pagas,
      cobrancas_atrasadas,
      ultimaVerificacao: new Date().toISOString(),
    });
  } catch (erro) {
    console.error('Erro ao obter status Asaas:', erro);
    return NextResponse.json(
      { erro: 'Erro ao obter status' },
      { status: 500 },
    );
  }
}
