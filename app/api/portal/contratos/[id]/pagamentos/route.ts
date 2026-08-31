import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface Pagamento {
  id: string;
  data_vencimento: string;
  valor: number;
  status: string;
  data_pagamento: string | null;
  dias_atraso: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: contratoId } = await params;

    // Get user session from Supabase
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's pessoa_id from usuarios table
    const { rows: usuarios } = await pool.query(
      'select pessoa_id from usuarios where id = $1',
      [user.id]
    );

    if (usuarios.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const pessoaId = usuarios[0].pessoa_id;

    // Verify user is locatario_principal on this contract
    const { rows: contratoParte } = await pool.query(
      `select 1 from contrato_partes
       where contrato_id = $1 and pessoa_id = $2 and papel = 'locatario_principal'`,
      [contratoId, pessoaId]
    );

    if (contratoParte.length === 0) {
      return NextResponse.json(
        { error: 'Not authorized to view this contract' },
        { status: 403 }
      );
    }

    // Get payment history (cobrancas_asaas) for this contract
    const { rows: pagamentos } = await pool.query(
      `select
        ca.id,
        f.vencimento as data_vencimento,
        ca.valor_cobrado as valor,
        ca.status,
        ca.data_pagamento
      from cobrancas_asaas ca
      join faturas f on ca.fatura_id = f.id
      where f.contrato_id = $1
      order by f.vencimento desc`,
      [contratoId]
    );

    // Map to Pagamento interface and calculate dias_atraso
    const resultado: Pagamento[] = pagamentos.map((p: any) => {
      let diasAtraso = 0;

      if (p.status !== 'pago' && p.data_vencimento) {
        const vencimento = new Date(p.data_vencimento);
        const hoje = new Date();
        const diffTime = hoje.getTime() - vencimento.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        diasAtraso = diffDays > 0 ? diffDays : 0;
      }

      return {
        id: p.id,
        data_vencimento: p.data_vencimento,
        valor: parseFloat(p.valor),
        status: p.status,
        data_pagamento: p.data_pagamento,
        dias_atraso: diasAtraso,
      };
    });

    return NextResponse.json(resultado);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500 }
    );
  }
}
