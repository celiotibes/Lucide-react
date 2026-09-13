import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { exportarRelatorioFaturasCSV } from '@/server/integracao/relatorios';
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
  const csv = await exportarRelatorioFaturasCSV(pool, periodo);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="faturas_${formatarNomeArquivo(periodo)}.csv"`,
    },
  });
}
