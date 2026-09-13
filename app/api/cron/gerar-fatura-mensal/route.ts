// Rota chamada pelo agendador externo (n8n — docs/03-arquitetura-e-stack.md:
// "n8n orquestra, não calcula" — ou Vercel Cron/GitHub Actions como
// alternativa mais simples enquanto não há instância de n8n neste ambiente;
// ver docs/13-agendamento-fatura-mensal.md). A lógica de cálculo em si mora
// em server/integracao/gerarFaturaMensal.ts; esta rota só autentica a
// chamada, resolve a competência e devolve o resultado.
//
// Autenticação por segredo compartilhado (CRON_SECRET), não pela sessão de
// um usuário — quem chama é um agendador de infraestrutura, não uma pessoa
// logada. Aceita GET (Vercel Cron manda GET) e POST (n8n HTTP Request node,
// mais comum em POST) com a mesma lógica.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { gerarFaturaMensal } from '@/server/integracao/gerarFaturaMensal';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return tratarChamada(request);
}

export async function POST(request: NextRequest) {
  return tratarChamada(request);
}

async function tratarChamada(request: NextRequest): Promise<NextResponse> {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado) {
    return NextResponse.json({ erro: 'CRON_SECRET não configurado no ambiente.' }, { status: 500 });
  }

  const autorizacao = request.headers.get('authorization');
  if (autorizacao !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const competenciaParam = request.nextUrl.searchParams.get('competencia'); // 'YYYY-MM', opcional
  let competencia: Date;
  try {
    competencia = competenciaParam ? parseCompetencia(competenciaParam) : primeiroDiaDoMesAtual();
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 400 });
  }

  try {
    const pool = obterPool();
    const resultado = await gerarFaturaMensal(pool, competencia);
    return NextResponse.json({
      competencia: formatarPrimeiroDiaDoMes(competencia),
      geradas: resultado.geradas.length,
      contratos: resultado.geradas.map((g) => ({ contratoId: g.contratoId, faturaId: g.faturaId, valorTotal: g.valorTotal })),
      puladas: resultado.puladas,
    });
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 500 });
  }
}

function primeiroDiaDoMesAtual(): Date {
  const agora = new Date();
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
}

function parseCompetencia(valor: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(valor);
  if (!match) {
    throw new Error(`Parâmetro competencia inválido: "${valor}" (formato esperado YYYY-MM)`);
  }
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  if (mes < 1 || mes > 12) {
    throw new Error(`Parâmetro competencia inválido: "${valor}" (mês fora do intervalo 1-12)`);
  }
  return new Date(Date.UTC(ano, mes - 1, 1));
}

function formatarPrimeiroDiaDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
