import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const busca = searchParams.get('busca');

    const pool = obterPool();

    let query = `
      select id, imovel_id, numero_contrato, valor_aluguel, status,
             data_inicio, data_fim, confianca_extracao, criado_em
      from contratos_aluguel
      where 1=1
    `;

    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` and status = $${params.length}`;
    }

    if (busca) {
      params.push(`%${busca}%`);
      query += ` and (numero_contrato ilike $${params.length} or id ilike $${params.length} or imovel_id ilike $${params.length})`;
    }

    query += ` order by criado_em desc`;

    const resultado = await pool.query(query, params);

    return NextResponse.json({
      sucesso: true,
      contratos: resultado.rows,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao listar contratos:', mensagem);
    return NextResponse.json(
      { error: mensagem },
      { status: 500 }
    );
  }
}
