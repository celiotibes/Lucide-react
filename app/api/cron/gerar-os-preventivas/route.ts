// Mesmo padrão de app/api/cron/gerar-fatura-mensal/route.ts (docs/13):
// autenticação por segredo compartilhado, chama a função de integração,
// devolve o resultado. Liga o cronograma ao gerador de OS de manutenção
// preventiva (server/integracao/gerarOrdensServicoPreventivas.ts,
// docs/14) — cada execução avança uma ocorrência por plano vencido
// (recuperação gradual de atraso, não um flood retroativo), então rodar
// este cron diariamente é o uso pretendido.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { gerarOrdensServicoPreventivas } from '@/server/integracao/gerarOrdensServicoPreventivas';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return tratarChamada(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return tratarChamada(request);
}

async function tratarChamada(request: NextRequest): Promise<NextResponse> {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado) {
    return NextResponse.json({ erro: 'CRON_SECRET não configurado no ambiente.' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const pool = obterPool();
  const resultado = await gerarOrdensServicoPreventivas(pool);

  return NextResponse.json({
    geradas: resultado.geradas.length,
    detalhe: resultado.geradas,
  });
}
