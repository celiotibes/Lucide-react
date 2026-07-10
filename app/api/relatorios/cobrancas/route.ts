import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { exportarExtratoCobrancasOFX } from '@/server/integracao/relatorios';
import { formatarNomeArquivo, resolverPeriodo } from '../_lib/periodo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let periodo;
  try {
    periodo = resolverPeriodo(request.nextUrl.searchParams);
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 400 });
  }

  const pool = obterPool();
  const ofx = await exportarExtratoCobrancasOFX(pool, periodo);

  return new NextResponse(ofx, {
    headers: {
      'Content-Type': 'application/x-ofx',
      'Content-Disposition': `attachment; filename="cobrancas_${formatarNomeArquivo(periodo)}.ofx"`,
    },
  });
}
