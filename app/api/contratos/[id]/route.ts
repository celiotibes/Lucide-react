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
      `select c.id, c.tipo, c.status, c.data_inicio, c.data_fim, c.valor_aluguel,
              c.dia_vencimento, c.imovel_id, c.comodo_id,
              i.identificacao as imovel_identificacao,
              co.identificacao as comodo_identificacao,
              p.nome as locatario_nome, p.cpf_cnpj as locatario_cpf_cnpj
       from contratos c
       join imoveis i on i.id = c.imovel_id
       left join comodos co on co.id = c.comodo_id
       left join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
       left join pessoas p on p.id = cp.pessoa_id
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
