// API endpoint para registrar resposta ao direito de preferência

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { registrarRespostaDireitoPreferencia } from '@/server/integracao/registrarDireitoPreferencia';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Validar autenticação
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { notificacaoId, resposta } = body;

    if (!notificacaoId || !resposta) {
      return NextResponse.json(
        { erro: 'Dados obrigatórios faltando' },
        { status: 400 }
      );
    }

    if (!['exerceu_preferencia', 'recusou', 'sem_resposta'].includes(resposta)) {
      return NextResponse.json(
        { erro: 'Resposta inválida' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    // Validar que a notificação existe
    const { rows: notificacoes } = await pool.query(
      'select id from notificacoes_preferencia_venda where id = $1',
      [notificacaoId]
    );

    if (notificacoes.length === 0) {
      return NextResponse.json({ erro: 'Notificação não encontrada' }, { status: 404 });
    }

    // Registrar resposta
    await registrarRespostaDireitoPreferencia(pool, {
      notificacaoId,
      resposta: resposta as 'exerceu_preferencia' | 'recusou' | 'sem_resposta',
    });

    // Atualizar data de resposta
    await pool.query(
      `update notificacoes_preferencia_venda
       set data_resposta = current_timestamp
       where id = $1`,
      [notificacaoId]
    );

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Resposta registrada com sucesso',
    });
  } catch (erro) {
    console.error('Erro ao registrar resposta:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
