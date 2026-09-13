import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function GET(request: NextRequest) {
  try {
    const pool = obterPool();
    const { rows } = await pool.query('select id, nome from cidades order by nome');
    return NextResponse.json(rows);
  } catch (erro) {
    console.error('Erro ao buscar cidades:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar cidades' }, { status: 500 });
  }
}
