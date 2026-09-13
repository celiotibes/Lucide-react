import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = obterPool();

    // Buscar o contrato original para pegar imovel_id e comodo_id
    const { rows: contratoOriginal } = await pool.query(
      `select imovel_id, comodo_id from contratos where id = $1`,
      [id]
    );

    if (contratoOriginal.length === 0) {
      return NextResponse.json({ erro: 'Contrato não encontrado' }, { status: 404 });
    }

    const { imovel_id, comodo_id } = contratoOriginal[0];

    // Se é coliving (comodo_id != null), buscar outros contratos no mesmo quarto
    // Se é full-property (comodo_id = null), não há candidatos válidos
    if (!comodo_id) {
      return NextResponse.json([]);
    }

    const { rows: candidatos } = await pool.query(
      `select c.id, c.tipo, c.status
       from contratos c
       where c.imovel_id = $1
         and c.comodo_id = $2
         and c.id != $3
         and c.status = 'ativo'
       order by c.data_inicio desc`,
      [imovel_id, comodo_id, id]
    );

    return NextResponse.json(candidatos);
  } catch (erro) {
    console.error('Erro ao buscar candidatos:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar candidatos' }, { status: 500 });
  }
}
