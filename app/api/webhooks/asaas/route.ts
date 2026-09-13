/**
 * Webhook: Asaas
 * Recebe eventos de pagamento do Asaas e atualiza o banco de dados.
 * Usa handler centralizado em server/webhooks/asaasHandler.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import {
  validarWebhookAsaas,
  processarWebhookAsaas,
} from '@/server/webhooks/asaasHandler';
import { logError } from '@/server/api/middleware';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validar formato JSON
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { erro: 'Corpo da requisição não é JSON válido.' },
      { status: 400 }
    );
  }

  // Validar token e timestamp
  const tokenRecebido = request.headers.get('asaas-access-token');
  const validacao = validarWebhookAsaas(tokenRecebido, payload);
  if (!validacao.valid) {
    return NextResponse.json(
      { erro: validacao.error || 'Validação falhou' },
      { status: validacao.error?.includes('Token') ? 401 : 400 }
    );
  }

  // Processar webhook
  try {
    const pool = obterPool();
    const resultado = await processarWebhookAsaas(pool, payload);
    return NextResponse.json(resultado);
  } catch (erro) {
    logError('Erro ao processar webhook do Asaas', erro);
    return NextResponse.json(
      { erro: 'Erro ao processar webhook' },
      { status: 500 }
    );
  }
}
