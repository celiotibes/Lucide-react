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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: cobrancaId } = await params;

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

    const { rows: cobranca } = await pool.query(
      `select ca.id, ca.asaas_id, f.contrato_id
       from cobrancas_asaas ca
       join faturas f on ca.fatura_id = f.id
       where ca.id = $1`,
      [cobrancaId]
    );

    if (cobranca.length === 0) {
      return NextResponse.json({ error: 'Boleto not found' }, { status: 404 });
    }

    const contratoId = cobranca[0].contrato_id;
    const asaasId = cobranca[0].asaas_id;

    const { rows: contratoParte } = await pool.query(
      `select 1 from contrato_partes
       where contrato_id = $1 and pessoa_id = $2 and papel = 'locatario_principal'`,
      [contratoId, pessoaId]
    );

    if (contratoParte.length === 0) {
      return NextResponse.json(
        { error: 'Not authorized to download this boleto' },
        { status: 403 }
      );
    }

    if (!asaasId) {
      return NextResponse.json(
        { error: 'Boleto not available for download' },
        { status: 400 }
      );
    }

    try {
      const asaasUrl = `https://www.asaas.com/boleto/${asaasId}/pdf`;

      const pdfResponse = await fetch(asaasUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.ASAAS_API_KEY}`,
        },
      });

      if (!pdfResponse.ok) {
        console.error('Asaas PDF fetch failed:', pdfResponse.status);
        return NextResponse.json(
          { error: 'Failed to fetch boleto PDF' },
          { status: 500 }
        );
      }

      const pdfBuffer = await pdfResponse.arrayBuffer();

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="boleto-${asaasId}.pdf"`,
        },
      });
    } catch (asaasError) {
      console.error('Error downloading boleto from Asaas:', asaasError);
      return NextResponse.json(
        { error: 'Failed to download boleto' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error downloading boleto:', error);
    return NextResponse.json(
      { error: 'Failed to download boleto' },
      { status: 500 }
    );
  }
}
