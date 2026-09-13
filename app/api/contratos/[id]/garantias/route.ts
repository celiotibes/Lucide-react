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
      `select id, tipo, valor, data_inicio, data_vencimento_apolice,
              apolice_numero, status, criado_em
       from garantias
       where contrato_id = $1
       order by criado_em desc`,
      [id]
    );

    return NextResponse.json(rows);
  } catch (erro) {
    console.error('Erro ao buscar garantias:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar garantias' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { tipo, valor, data_inicio, data_vencimento_apolice, apolice_numero } = await request.json();

    if (!tipo) {
      return NextResponse.json(
        { erro: 'Tipo de garantia é obrigatório' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    const { rows } = await pool.query(
      `insert into garantias (contrato_id, tipo, valor, data_inicio, data_vencimento_apolice, apolice_numero)
       values ($1, $2, $3, $4, $5, $6)
       returning id, tipo, valor, data_inicio, data_vencimento_apolice, apolice_numero, status, criado_em`,
      [id, tipo, valor || null, data_inicio || null, data_vencimento_apolice || null, apolice_numero || null]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (erro) {
    console.error('Erro ao criar garantia:', erro);
    return NextResponse.json({ erro: 'Erro ao criar garantia' }, { status: 500 });
  }
}
