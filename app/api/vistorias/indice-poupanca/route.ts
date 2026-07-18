import { NextRequest, NextResponse } from 'next/server';
import { obterTaxaPoupanca } from '@/server/vistorias/integracao-bacen';

export async function GET(req: NextRequest) {
  try {
    const indice = await obterTaxaPoupanca();

    if (!indice) {
      return NextResponse.json(
        { error: 'Índice de poupança não disponível' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        data: indice.data,
        valor: indice.valor,
        taxa: indice.taxa,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
        },
      }
    );
  } catch (error) {
    console.error('Erro ao buscar taxa poupança:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao buscar índice' },
      { status: 500 }
    );
  }
}
