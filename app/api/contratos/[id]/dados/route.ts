import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = obterPool();

    const resultado = await pool.query(
      `select id, arquivo_id, analise_ia, dados_extraidos, confianca_extracao
       from contratos_aluguel
       where id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return NextResponse.json(
        { error: 'Contrato não encontrado' },
        { status: 404 }
      );
    }

    const contrato = resultado.rows[0];
    const analise = typeof contrato.analise_ia === 'string'
      ? JSON.parse(contrato.analise_ia)
      : contrato.analise_ia;
    const dados_extraidos = typeof contrato.dados_extraidos === 'string'
      ? JSON.parse(contrato.dados_extraidos)
      : contrato.dados_extraidos;

    return NextResponse.json({
      contrato_id: contrato.id,
      arquivo_id: contrato.arquivo_id,
      analise: {
        confianca: contrato.confianca_extracao || analise.confianca,
        dados_extraidos: dados_extraidos,
        alertas: analise.alertas || [],
        recomendacoes: analise.recomendacoes || [],
        campos_incertos: analise.campos_incertos || [],
        resume_executivo: analise.resume_executivo || '',
      },
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao buscar contrato:', mensagem);
    return NextResponse.json(
      { error: mensagem },
      { status: 500 }
    );
  }
}
