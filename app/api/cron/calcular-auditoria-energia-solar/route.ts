// Mesmo padrão de app/api/cron/gerar-fatura-mensal/route.ts (docs/13):
// autenticação por segredo compartilhado, chama a função de integração,
// devolve o resultado. `calcularAuditoriaEnergiaSolarDoResidencial`
// (server/integracao/calcularAuditoriaEnergiaSolar.ts, docs/30) calcula
// por residencial — esta rota descobre para quais residenciais já existe
// pelo menos uma fonte confirmada na competência (geração solar ou
// fatura Celesc GD) e chama a função para cada um, sempre pulando sem
// erro quando falta a outra fonte (a própria função decide isso).

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { calcularAuditoriaEnergiaSolarDoResidencial } from '@/server/integracao/calcularAuditoriaEnergiaSolar';

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

  const competenciaParam = request.nextUrl.searchParams.get('competencia'); // 'YYYY-MM', opcional
  let competencia: Date;
  try {
    competencia = competenciaParam ? parseCompetencia(competenciaParam) : mesAnteriorAoAtual();
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 400 });
  }
  const competenciaISO = formatarPrimeiroDiaDoMes(competencia);

  const pool = obterPool();
  const { rows: residenciais } = await pool.query<{ residencial_id: string }>(
    `select distinct residencial_id from (
       select residencial_id from geracao_solar where competencia = $1 and status = 'confirmada'
       union
       select residencial_id from faturas_celesc_gd where competencia = $1 and status = 'confirmada'
     ) candidatos`,
    [competenciaISO],
  );

  const calculadas: Array<{ residencialId: string; areaComumKwh: number; resultadoFinanceiroValor: number; inconsistente: boolean }> = [];
  const puladas: Array<{ residencialId: string; motivo: string }> = [];

  for (const { residencial_id: residencialId } of residenciais) {
    const resultado = await calcularAuditoriaEnergiaSolarDoResidencial(pool, residencialId, competencia);
    if (resultado.calculada) {
      calculadas.push({
        residencialId,
        areaComumKwh: resultado.areaComumKwh,
        resultadoFinanceiroValor: resultado.resultadoFinanceiroValor,
        inconsistente: resultado.inconsistente,
      });
    } else {
      puladas.push({ residencialId, motivo: resultado.motivo });
    }
  }

  return NextResponse.json({ competencia: competenciaISO, calculadas, puladas });
}

function mesAnteriorAoAtual(): Date {
  const agora = new Date();
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
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
