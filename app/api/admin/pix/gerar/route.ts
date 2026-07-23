// API endpoint para gerar QR code PIX dinâmico

import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { obterPool } from '@/server/integracao/db';
import { gerarCobrancaPIX } from '@/server/integracao/pixAsaas';

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
    const { faturasIds, descricao, diaVencimento } = body;

    if (!faturasIds || !Array.isArray(faturasIds)) {
      return NextResponse.json(
        { erro: 'faturasIds obrigatório (array)' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    // Recuperar faturas
    const { rows: faturas } = await pool.query<{
      id: string;
      valor_bruto: string;
      contrato_id: string;
    }>(
      `
      select id, valor_bruto, contrato_id
      from faturas
      where id = any($1::uuid[])
        and status != 'paga'
      order by vencimento asc
    `,
      [faturasIds]
    );

    if (faturas.length === 0) {
      return NextResponse.json(
        { erro: 'Nenhuma fatura elegível encontrada' },
        { status: 404 }
      );
    }

    const valorTotal = faturas.reduce((sum, f) => sum + parseFloat(f.valor_bruto), 0);

    // Recuperar cliente Asaas para o primeiro contrato
    const { rows: clienteAsaas } = await pool.query<{
      asaas_customer_id: string;
    }>(
      `
      select asaas_customer_id
      from contratos
      where id = $1
      limit 1
    `,
      [faturas[0].contrato_id]
    );

    if (!clienteAsaas[0]?.asaas_customer_id) {
      return NextResponse.json(
        { erro: 'Cliente não vinculado ao Asaas' },
        { status: 400 }
      );
    }

    // Gerar cobrança PIX
    const resultado = await gerarCobrancaPIX(pool, {
      faturasIds: faturasIds,
      valorTotal,
      descricao: descricao || 'Pagamento de faturas de aluguel',
      diaVencimento: diaVencimento || 1,
      clienteAsaasId: clienteAsaas[0].asaas_customer_id,
    });

    if (!resultado.sucesso) {
      return NextResponse.json(
        { erro: resultado.erro },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      pix: {
        qrCode: resultado.cobrancaPIX!.qrCodeDinamico,
        copiaCola: resultado.cobrancaPIX!.copiaCola,
        urlQRCode: resultado.cobrancaPIX!.urlQRCode,
        valor: resultado.cobrancaPIX!.valorCobrado,
        expiracao: resultado.cobrancaPIX!.expiracao,
      },
    });
  } catch (erro) {
    console.error('Erro ao gerar PIX:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
