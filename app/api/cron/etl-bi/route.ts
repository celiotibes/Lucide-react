/**
 * Cron endpoint para executar ETL Pipeline
 * Deve ser chamado periodicamente (ex: a cada 6 horas)
 */

import { NextRequest, NextResponse } from 'next/server';
import { executarPipelineCompleto } from '@/server/bi/etlPipeline';

export async function GET(request: NextRequest) {
  // Verificar token de autorização — CRON_SECRET é a variável que a Vercel
  // injeta automaticamente como "Authorization: Bearer" em todo cron
  // agendado via vercel.json (mesma variável usada pelos demais crons do
  // projeto). Corrigido de CRON_SECRET_TOKEN, que nunca bateria com o
  // header que a Vercel envia.
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      { erro: 'Não autorizado' },
      { status: 401 }
    );
  }

  try {
    console.log('🚀 Iniciando ETL Pipeline em background...');

    const resultados = await executarPipelineCompleto();

    const status = resultados.every((r) => r.status === 'sucesso') ? 'sucesso' : 'parcial';

    return NextResponse.json({
      sucesso: status === 'sucesso',
      status,
      pipeline_execucoes: resultados.length,
      resultados: resultados.map((r) => ({
        nome: r.nome_pipeline,
        status: r.status,
        registros_carregados: r.registros_carregados,
        tempo_ms: r.tempo_execucao_ms,
        erro: r.erro,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (erro) {
    console.error('Erro ao executar ETL:', erro);

    return NextResponse.json(
      {
        sucesso: false,
        erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // POST também suportado (alguns serviços de cron preferem POST)
  return GET(request);
}
