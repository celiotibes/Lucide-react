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
      `select c.id, c.imovel_id, c.tipo, c.data_inicio, c.data_fim,
              c.dia_vencimento, c.valor_aluguel, c.indice_reajuste,
              c.aviso_previo_dias, c.status,
              i.identificacao as imovel_identificacao
       from contratos c
       join imoveis i on i.id = c.imovel_id
       where c.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ erro: 'Contrato não encontrado' }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (erro) {
    console.error('Erro ao buscar contrato:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar contrato' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const {
      dia_vencimento,
      valor_aluguel,
      indice_reajuste,
      aviso_previo_dias,
      status,
    } = await request.json();

    if (!valor_aluguel || valor_aluguel <= 0) {
      return NextResponse.json(
        { erro: 'Valor do aluguel deve ser maior que zero' },
        { status: 400 }
      );
    }

    if (dia_vencimento && (dia_vencimento < 1 || dia_vencimento > 31)) {
      return NextResponse.json(
        { erro: 'Dia de vencimento deve estar entre 1 e 31' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    await pool.query(
      `update contratos
       set dia_vencimento = $1, valor_aluguel = $2, indice_reajuste = $3,
           aviso_previo_dias = $4, status = $5, atualizado_em = now()
       where id = $6`,
      [
        dia_vencimento || null,
        valor_aluguel,
        indice_reajuste || null,
        aviso_previo_dias || 30,
        status || 'ativo',
        id,
      ]
    );

    const { rows } = await pool.query(
      `select c.id, c.imovel_id, c.tipo, c.data_inicio, c.data_fim,
              c.dia_vencimento, c.valor_aluguel, c.indice_reajuste,
              c.aviso_previo_dias, c.status,
              i.identificacao as imovel_identificacao
       from contratos c
       join imoveis i on i.id = c.imovel_id
       where c.id = $1`,
      [id]
    );

    return NextResponse.json(rows[0]);
  } catch (erro) {
    console.error('Erro ao atualizar contrato:', erro);
    return NextResponse.json({ erro: 'Erro ao atualizar contrato' }, { status: 500 });
  }
}
