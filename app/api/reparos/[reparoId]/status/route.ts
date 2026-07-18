import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function PATCH(
  request: NextRequest,
  context: any
) {
  try {
    const { reparoId } = await context.params;
    const { status, descricao_trabalho_realizado } = await request.json();

    if (!status) {
      return NextResponse.json(
        { error: 'Status é obrigatório' },
        { status: 400 }
      );
    }

    const estadosValidos = [
      'pendente',
      'orcado',
      'aprovado',
      'rejeitado',
      'agendado',
      'em_execucao',
      'concluido',
      'desistido',
    ];

    if (!estadosValidos.includes(status)) {
      return NextResponse.json(
        { error: `Status inválido. Valores aceitos: ${estadosValidos.join(', ')}` },
        { status: 400 }
      );
    }

    const pool = obterPool();

    // Preparar updates
    const updates: string[] = ['status = $1', 'atualizado_em = now()'];
    const params: (string | Date)[] = [status];
    let paramIndex = 2;

    if (status === 'em_execucao') {
      updates.push(`data_inicio_execucao = coalesce(data_inicio_execucao, now())`);
    }

    if (status === 'concluido') {
      updates.push(`data_conclusao_execucao = now()`);
      if (descricao_trabalho_realizado) {
        updates.push(`descricao_trabalho_realizado = $${paramIndex}`);
        params.push(descricao_trabalho_realizado);
        paramIndex++;
      }
    }

    const query = `
      update reparos_vistoria
      set ${updates.join(', ')}
      where id = $${paramIndex}
      returning *
    `;
    params.push(reparoId);

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Reparo não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Status atualizado com sucesso',
      reparo: result.rows[0],
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao atualizar status do reparo:', mensagem);
    return NextResponse.json(
      { error: mensagem },
      { status: 500 }
    );
  }
}
