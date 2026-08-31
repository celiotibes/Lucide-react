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

interface Boleto {
  id: string;
  data_vencimento: string;
  valor: number;
  numero_boleto: string;
  status: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: contratoId } = await params;

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

    const { rows: usuarios } = await pool.query(
      'select pessoa_id from usuarios where id = $1',
      [user.id]
    );

    if (usuarios.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const pessoaId = usuarios[0].pessoa_id;

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

    const { rows: boletos } = await pool.query(
      `select
        ca.id,
        f.vencimento as data_vencimento,
        ca.valor_cobrado as valor,
        ca.status,
        ca.asaas_id as numero_boleto
      from cobrancas_asaas ca
      join faturas f on ca.fatura_id = f.id
      where f.contrato_id = $1 and ca.tipo = 'boleto'
      order by f.vencimento desc`,
      [contratoId]
    );

    const resultado: Boleto[] = boletos.map((b: any) => ({
      id: b.id,
      data_vencimento: b.data_vencimento,
      valor: parseFloat(b.valor),
      numero_boleto: b.numero_boleto || 'N/A',
      status: b.status
    }));

    return NextResponse.json(resultado);
  } catch (error) {
    console.error('Error fetching boletos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch boletos' },
      { status: 500 }
    );
  }
}
