import { NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const pool = obterPool();
    const { rows } = await pool.query(`
      select t.id, cb.instituicao as conta, t.data, t.valor, t.descricao, t.origem,
             cf.nome as categoria_sugerida
      from transacoes_bancarias t
      join contas_bancarias cb on cb.id = t.conta_id
      left join categorias_financeiras cf on cf.id = t.categoria_sugerida
      where t.status = 'sugerido'
      order by t.data desc
      limit 200
    `);
    return NextResponse.json(rows);
  } catch (erro) {
    console.error('Erro ao buscar transações pendentes:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar transações' }, { status: 500 });
  }
}
