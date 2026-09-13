/**
 * Cron para executar verificação de alertas diariamente
 */

import { NextRequest, NextResponse } from 'next/server';
import { executarVerificacaoAlertas } from '@/app/actions/bi/gerenciarAlertas';

export async function GET(request: NextRequest) {
  // Verificar token de autorização — CRON_SECRET é a variável que a Vercel
  // injeta automaticamente como "Authorization: Bearer" em todo cron
  // agendado via vercel.json (mesma variável usada pelos demais crons do
  // projeto, ver app/api/cron/regua-cobranca/route.ts). Corrigido de
  // CRON_SECRET_TOKEN, que nunca bateria com o header que a Vercel envia.
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      { erro: 'Não autorizado' },
      { status: 401 }
    );
  }

  try {
    console.log('🔔 Iniciando verificação de alertas diários...');

    // Buscar emails de destino (dos admins)
    // TODO: Implementar busca de emails configurados
    const emailsDestino = [process.env.ADMIN_EMAIL || 'admin@projeto.local'];

    const resultado = await executarVerificacaoAlertas(emailsDestino);

    return NextResponse.json({
      sucesso: resultado.sucesso,
      verificacao_alertas: {
        total_alertas: resultado.totalAlertas,
        alertas_criticos: resultado.alertasCriticos,
        alertas_alerta: resultado.alertasAlerta,
        mensagem: resultado.mensagem,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (erro) {
    console.error('Erro ao executar alertas:', erro);

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
  // POST também suportado
  return GET(request);
}
