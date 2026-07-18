import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

interface ReparoPendente {
  id: string;
  contestacao_id: string;
  status: string;
  orcamento_valor: number | null;
  data_agendamento: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const pool = obterPool();

    const result = await pool.query<ReparoPendente>(
      `select
        id,
        contestacao_id,
        status,
        orcamento_valor,
        data_agendamento
       from reparos_vistoria
       where status in ('agendado', 'em_execucao', 'concluido')
       order by data_agendamento asc`
    );

    return NextResponse.json({
      success: true,
      reparos: result.rows,
      total: result.rows.length,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao listar reparos pendentes:', mensagem);
    return NextResponse.json(
      { error: mensagem, success: false },
      { status: 500 }
    );
  }
}
