import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; garantiaId: string }> }
) {
  try {
    const { id, garantiaId } = await params;
    const { tipo, valor, data_inicio, data_vencimento_apolice, apolice_numero, status } = await request.json();

    const pool = obterPool();

    await pool.query(
      `update garantias
       set tipo = $1, valor = $2, data_inicio = $3, data_vencimento_apolice = $4,
           apolice_numero = $5, status = $6
       where id = $7 and contrato_id = $8`,
      [
        tipo || 'caucao',
        valor || null,
        data_inicio || null,
        data_vencimento_apolice || null,
        apolice_numero || null,
        status || 'ativa',
        garantiaId,
        id,
      ]
    );

    const { rows } = await pool.query(
      `select id, tipo, valor, data_inicio, data_vencimento_apolice, apolice_numero, status, criado_em
       from garantias where id = $1 and contrato_id = $2`,
      [garantiaId, id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ erro: 'Garantia não encontrada' }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (erro) {
    console.error('Erro ao atualizar garantia:', erro);
    return NextResponse.json({ erro: 'Erro ao atualizar garantia' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; garantiaId: string }> }
) {
  try {
    const { id, garantiaId } = await params;
    const pool = obterPool();

    const { rowCount } = await pool.query(
      `delete from garantias where id = $1 and contrato_id = $2`,
      [garantiaId, id]
    );

    if (rowCount === 0) {
      return NextResponse.json({ erro: 'Garantia não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    console.error('Erro ao deletar garantia:', erro);
    return NextResponse.json({ erro: 'Erro ao deletar garantia' }, { status: 500 });
  }
}
