// API endpoint para listar NFS-e emitidas

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { obterPool } from '@/server/integracao/db';
import { obterHistoricoNFSe } from '@/server/integracao/gerarNFSe';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Autenticar admin
    const cookieStore = cookies();
    const supabase = createClient({
      cookies: () => cookieStore,
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { filtroStatus, dataInicio, dataFim } = body;

    const pool = obterPool();

    const dados = await obterHistoricoNFSe(pool, {
      status: filtroStatus,
      dataInicio,
      dataFim,
    });

    return NextResponse.json({ dados });
  } catch (erro) {
    console.error('Erro ao listar NFS-e:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
