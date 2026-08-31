import { NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const pool = obterPool();
    const { rows } = await pool.query(`select id, nome from categorias_financeiras order by nome`);
    return NextResponse.json(rows);
  } catch (erro) {
    console.error('Erro ao buscar categorias:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar categorias' }, { status: 500 });
  }
}
