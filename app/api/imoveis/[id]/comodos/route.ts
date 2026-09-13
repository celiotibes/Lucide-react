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
      `select id, identificacao from comodos where imovel_id = $1 order by identificacao`,
      [id]
    );

    return NextResponse.json(rows);
  } catch (erro) {
    console.error('Erro ao buscar cômodos:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar cômodos' }, { status: 500 });
  }
}
