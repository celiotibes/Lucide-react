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

export async function POST(
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
        { error: 'Not authorized to perform this action' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { assunto, mensagem, tipo } = body;

    if (!assunto || !mensagem) {
      return NextResponse.json(
        { error: 'Subject and message are required' },
        { status: 400 }
      );
    }

    const { rows: contrato } = await pool.query(
      'select imovel_id from contratos where id = $1',
      [contratoId]
    );

    if (contrato.length === 0) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    const imovelId = contrato[0].imovel_id;

    const { rows: pessoa } = await pool.query(
      'select nome, email, telefone from pessoas where id = $1',
      [pessoaId]
    );

    const pessoaNome = pessoa.length > 0 ? pessoa[0].nome : 'Unknown';
    const pessoaEmail = pessoa.length > 0 ? pessoa[0].email : null;

    const { rows: inserted } = await pool.query(
      `insert into chamados (contrato_id, imovel_id, pessoa_id, titulo, descricao, natureza, status)
       values ($1, $2, $3, $4, $5, $6, 'novo')
       returning id`,
      [
        contratoId,
        imovelId,
        pessoaId,
        assunto,
        mensagem,
        tipo || 'outro'
      ]
    );

    const chamadoId = inserted.length > 0 ? inserted[0].id : null;

    console.log(
      `Chamado criado: ${chamadoId} - ${pessoaNome} (${pessoaEmail}) - ${assunto}`
    );

    return NextResponse.json(
      {
        success: true,
        chamado_id: chamadoId,
        message: 'Support request submitted successfully'
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating support request:', error);
    return NextResponse.json(
      { error: 'Failed to create support request' },
      { status: 500 }
    );
  }
}
