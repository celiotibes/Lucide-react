import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function GET(request: NextRequest) {
  try {
    const pool = obterPool();
    const permitTemporada = request.nextUrl.searchParams.get('permite_temporada');

    let query = 'select id, identificacao, permite_temporada from imoveis';
    const params: any[] = [];

    if (permitTemporada === 'true') {
      query += ' where permite_temporada = true';
    }

    query += ' order by identificacao';

    const { rows } = await pool.query(query, params);
    return NextResponse.json(rows);
  } catch (erro) {
    console.error('Erro ao buscar imóveis:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar imóveis' }, { status: 500 });
  }
}
