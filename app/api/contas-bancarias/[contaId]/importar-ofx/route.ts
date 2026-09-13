// Upload manual de extrato bancário (.ofx) para conciliação — ação de
// back-office disparada por um humano, não um cron. Sem autenticação
// própria: mesma situação de toda tela de back-office hoje (app/relatorios,
// app/ordens-servico) — nenhuma tem login real ainda (docs/14, docs/16).
// Corpo da requisição é o conteúdo bruto do arquivo .ofx (text/plain ou
// application/x-ofx), não multipart — mais simples de testar e de chamar
// programaticamente; a tela que fizer upload de arquivo lê o texto do
// arquivo no browser antes de enviar.

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { importarExtratoBancarioOFX } from '@/server/integracao/importarExtratoBancarioOFX';
import { OFXInvalidoError } from '@/server/relatorios/ofx';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ contaId: string }> }): Promise<NextResponse> {
  const { contaId } = await params;
  const conteudoOFX = await request.text();

  if (!conteudoOFX.trim()) {
    return NextResponse.json({ erro: 'Corpo da requisição vazio — envie o conteúdo do arquivo .ofx.' }, { status: 400 });
  }

  const pool = obterPool();

  const { rows: conta } = await pool.query(`select id from contas_bancarias where id = $1`, [contaId]);
  if (conta.length === 0) {
    return NextResponse.json({ erro: `Conta bancária ${contaId} não encontrada.` }, { status: 404 });
  }

  try {
    const resultado = await importarExtratoBancarioOFX(pool, contaId, conteudoOFX);
    return NextResponse.json(resultado);
  } catch (erro) {
    if (erro instanceof OFXInvalidoError) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    throw erro;
  }
}
