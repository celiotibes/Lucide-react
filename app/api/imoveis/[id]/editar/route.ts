import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = obterPool();

    const { rows } = await pool.query(
      `select id, identificacao, tipo, cep, endereco, cidade_id,
              permite_coliving, permite_temporada, observacoes
       from imoveis where id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ erro: 'Imóvel não encontrado' }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (erro) {
    console.error('Erro ao buscar imóvel:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar imóvel' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { identificacao, tipo, cep, endereco, cidade_id, permite_coliving, permite_temporada, observacoes } = body;

    if (!identificacao || !tipo || !cidade_id) {
      return NextResponse.json(
        { erro: 'identificacao, tipo e cidade_id são obrigatórios' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    await pool.query(
      `update imoveis
       set identificacao = $1, tipo = $2, cep = $3, endereco = $4,
           cidade_id = $5, permite_coliving = $6, permite_temporada = $7,
           observacoes = $8, atualizado_em = now()
       where id = $9`,
      [identificacao, tipo, cep || null, endereco || null, cidade_id, permite_coliving, permite_temporada, observacoes || null, id]
    );

    return NextResponse.json({ sucesso: true, mensagem: 'Imóvel atualizado' });
  } catch (erro) {
    console.error('Erro ao atualizar imóvel:', erro);
    return NextResponse.json({ erro: 'Erro ao atualizar imóvel' }, { status: 500 });
  }
}
