import { NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const pool = obterPool();
    const { rows } = await pool.query(`select id, instituicao from contas_bancarias order by instituicao`);
    return NextResponse.json(rows);
  } catch (erro) {
    console.error('Erro ao buscar contas bancárias:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar contas' }, { status: 500 });
  }
}
