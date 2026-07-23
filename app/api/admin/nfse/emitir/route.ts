// API endpoint para emitir NFS-e automática

import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { obterPool } from '@/server/integracao/db';
import { criarRPS, emitirNFSe } from '@/server/integracao/gerarNFSe';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Autenticar admin
    const cookieStore = cookies();
    const supabase = createServerComponentClient({
      cookies: () => cookieStore,
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { faturasIds, municipio, cnpjPrestador } = body;

    if (!faturasIds || !Array.isArray(faturasIds) || faturasIds.length === 0) {
      return NextResponse.json(
        { erro: 'faturasIds obrigatório (array)' },
        { status: 400 }
      );
    }

    if (!municipio || !cnpjPrestador) {
      return NextResponse.json(
        { erro: 'municipio e cnpjPrestador obrigatórios' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    // Etapa 1: Criar RPS
    const { rpsNumero } = await criarRPS(pool, {
      faturasIds,
      municipio,
      cnpjPrestador,
      certificadoPath: '', // seria configurado no ambiente
    });

    // Etapa 2: Emitir NFS-e a partir do RPS
    const resultado = await emitirNFSe(pool, rpsNumero, {
      certificadoPath: '', // seria configurado no ambiente
    });

    if (!resultado.sucesso) {
      return NextResponse.json(
        { erro: resultado.erro },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      numeroNFSe: resultado.numeroNFSe,
      codigoVerificacao: resultado.codigoVerificacao,
      dataEmissao: resultado.dataEmissao,
      rpsNumero,
    });
  } catch (erro) {
    console.error('Erro ao emitir NFS-e:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
