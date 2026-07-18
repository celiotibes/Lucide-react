import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

interface ReparoComContestacao {
  reparo_id: string;
  contestacao_id: string;
  status: string;
  orcamento_valor: number | null;
  orcamento_data: string | null;
  orcamento_fornecedor: string | null;
  data_agendamento: string | null;
  data_inicio_execucao: string | null;
  data_conclusao_execucao: string | null;
  descricao_trabalho_realizado: string | null;
  contestacao_motivo: string;
  contestacao_descricao_desacordo: string;
  vistoria_saida_id: string;
  data_aceitacao: string | null;
  preclusao_data_limite: string | null;
  dias_uteis_restantes: number | null;
  status_contestacao: string;
  fotos: Array<{
    id: string;
    url_foto: string;
    tipo: string;
    data_upload: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: any
) {
  try {
    const { reparoId } = await context.params;
    const pool = obterPool();

    const result = await pool.query<ReparoComContestacao>(
      `select
        r.id as reparo_id,
        r.contestacao_id,
        r.status,
        r.orcamento_valor,
        r.orcamento_data,
        r.orcamento_fornecedor,
        r.data_agendamento,
        r.data_inicio_execucao,
        r.data_conclusao_execucao,
        r.descricao_trabalho_realizado,
        c.motivo as contestacao_motivo,
        c.descricao_desacordo as contestacao_descricao_desacordo,
        c.vistoria_saida_id,
        c.data_aceitacao,
        c.preclusao_data_limite,
        c.dias_uteis_restantes,
        c.status as status_contestacao
       from reparos_vistoria r
       join contestacoes c on c.id = r.contestacao_id
       where r.id = $1`,
      [reparoId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Reparo não encontrado' },
        { status: 404 }
      );
    }

    const reparoData = result.rows[0];

    // Buscar fotos associadas ao reparo
    const fotosResult = await pool.query(
      `select id, url_foto, tipo, data_upload
       from fotos_reparo
       where reparo_id = $1
       order by data_upload asc`,
      [reparoId]
    );

    return NextResponse.json({
      reparo: {
        id: reparoData.reparo_id,
        contestacao_id: reparoData.contestacao_id,
        status: reparoData.status,
        orcamento_valor: reparoData.orcamento_valor,
        orcamento_data: reparoData.orcamento_data,
        orcamento_fornecedor: reparoData.orcamento_fornecedor,
        data_agendamento: reparoData.data_agendamento,
        data_inicio_execucao: reparoData.data_inicio_execucao,
        data_conclusao_execucao: reparoData.data_conclusao_execucao,
        descricao_trabalho_realizado: reparoData.descricao_trabalho_realizado,
      },
      contestacao: {
        id: reparoData.contestacao_id,
        motivo: reparoData.contestacao_motivo,
        descricao_desacordo: reparoData.contestacao_descricao_desacordo,
        vistoria_saida_id: reparoData.vistoria_saida_id,
        data_aceitacao: reparoData.data_aceitacao,
        preclusao_data_limite: reparoData.preclusao_data_limite,
        dias_uteis_restantes: reparoData.dias_uteis_restantes,
        status: reparoData.status_contestacao,
      },
      fotos: fotosResult.rows,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao buscar reparo:', mensagem);
    return NextResponse.json(
      { error: mensagem },
      { status: 500 }
    );
  }
}
