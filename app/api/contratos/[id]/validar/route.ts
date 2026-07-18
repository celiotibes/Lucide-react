import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

interface ValidacaoRequest {
  dados_extraidos: Record<string, any>;
  validado_por: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as ValidacaoRequest;

    if (!body.dados_extraidos) {
      return NextResponse.json(
        { error: 'Dados extraídos são obrigatórios' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    // Atualizar contrato com dados validados
    const resultado = await pool.query(
      `update contratos_aluguel
       set
        numero_contrato = $1,
        valor_aluguel = $2,
        valor_caucao = $3,
        valor_taxa_condominio = $4,
        valor_iptu = $5,
        valor_seguro = $6,
        valor_agua_esgoto = $7,
        valor_luz = $8,
        valor_outras_despesas = $9,
        indice_reajuste = $10,
        percentual_reajuste = $11,
        dados_extraidos = $12,
        status = 'ativo',
        validado_por = $13,
        data_validacao = now(),
        atualizado_em = now()
       where id = $14
       returning id`,
      [
        body.dados_extraidos.numero_contrato || null,
        body.dados_extraidos.valor_aluguel || null,
        body.dados_extraidos.valor_caucao || null,
        body.dados_extraidos.valor_taxa_condominio || null,
        body.dados_extraidos.valor_iptu || null,
        body.dados_extraidos.valor_seguro || null,
        body.dados_extraidos.valor_agua_esgoto || null,
        body.dados_extraidos.valor_luz || null,
        body.dados_extraidos.valor_outras_despesas || null,
        body.dados_extraidos.indice_reajuste || null,
        body.dados_extraidos.percentual_reajuste || null,
        JSON.stringify(body.dados_extraidos),
        body.validado_por,
        id,
      ]
    );

    if (resultado.rows.length === 0) {
      return NextResponse.json(
        { error: 'Contrato não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        sucesso: true,
        contrato_id: resultado.rows[0].id,
        mensagem: 'Validação salva com sucesso',
      },
      { status: 200 }
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao validar contrato:', mensagem);
    return NextResponse.json(
      { error: mensagem },
      { status: 500 }
    );
  }
}
