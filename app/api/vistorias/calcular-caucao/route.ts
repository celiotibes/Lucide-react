import { NextRequest, NextResponse } from 'next/server';
import { calcularCaucaoAtualizada } from '@/server/vistorias/integracao-bacen';

interface CalculoCaucaoRequest {
  valorOriginal: number;
  dataInicio: string;
  dataFim?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CalculoCaucaoRequest = await req.json();

    if (!body.valorOriginal || !body.dataInicio) {
      return NextResponse.json(
        { error: 'Parâmetros inválidos: valorOriginal e dataInicio são obrigatórios' },
        { status: 400 }
      );
    }

    const dataFim = body.dataFim || new Date().toISOString().split('T')[0];

    // Validar datas
    const dI = new Date(body.dataInicio);
    const dF = new Date(dataFim);

    if (dI > dF) {
      return NextResponse.json(
        { error: 'Data de início deve ser anterior à data de término' },
        { status: 400 }
      );
    }

    const resultado = await calcularCaucaoAtualizada(body.valorOriginal, body.dataInicio, dataFim);

    if (!resultado) {
      return NextResponse.json(
        { error: 'Índices não disponíveis para o período solicitado' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        valorOriginal: body.valorOriginal,
        valorAtualizado: Math.round(resultado.valor * 100) / 100,
        percentualVariacao: resultado.taxa,
        periodo: {
          dataInicio: resultado.periodo.dataInicio,
          dataFim: resultado.periodo.dataFim,
          valorInicio: resultado.periodo.valorInicio,
          valorFim: resultado.periodo.valorFim,
          percentualVariacao: resultado.periodo.percentualVariacao,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=3600',
        },
      }
    );
  } catch (error) {
    console.error('Erro ao calcular caução:', error);

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao calcular caução' },
      { status: 500 }
    );
  }
}
