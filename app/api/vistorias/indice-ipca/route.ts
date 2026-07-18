import { NextRequest, NextResponse } from 'next/server';
import { obterUltimoIPCA } from '@/server/vistorias/integracao-bacen';

export async function GET(req: NextRequest) {
  try {
    const indice = await obterUltimoIPCA();

    if (!indice) {
      return NextResponse.json(
        { error: 'Índice IPCA não disponível' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        data: indice.data,
        valor: indice.valor,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
        },
      }
    );
  } catch (error) {
    console.error('Erro ao buscar IPCA:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao buscar índice' },
      { status: 500 }
    );
  }
}
