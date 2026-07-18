// Importa um extrato OFX (upload manual do internet banking, ou uma futura
// integração Open Finance) para `transacoes_bancarias` — fecha o outro
// lado da conciliação bancária que `server/relatorios/ofx.ts` já cobria só
// na direção de exportação (docs/15). `transacoes_bancarias.origem` já
// previa `'ofx'` desde a fase de auditoria original; nada lia um arquivo
// OFX até agora.
//
// Regra que não é opcional (comentário original do schema, seção 9 —
// auditoria item 8): toda transação importada entra com `status =
// 'sugerido'`, NUNCA `'aprovado'` — só um humano confirmando na tela de
// conciliação pode mudar isso. Reimportar o mesmo arquivo (ou um arquivo
// com dias sobrepostos) não duplica lançamento: cada transação carrega o
// FITID do banco em `referencia_externa`, com índice único parcial por
// conta (schema, seção pós-24).

import type { Pool } from 'pg';
import { parsearOFX } from '../relatorios/ofx';

export interface ResultadoImportacaoOFX {
  importadas: number;
  /** Já existentes na conta (mesmo FITID) — não reprocessadas, não é erro. */
  jaExistentes: number;
}

export async function importarExtratoBancarioOFX(
  pool: Pool,
  contaId: string,
  conteudoOFX: string,
): Promise<ResultadoImportacaoOFX> {
  const transacoes = parsearOFX(conteudoOFX);

  let importadas = 0;
  let jaExistentes = 0;

  for (const transacao of transacoes) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into transacoes_bancarias (conta_id, data, valor, descricao, status, origem, referencia_externa)
       values ($1, $2, $3, $4, 'sugerido', 'ofx', $5)
       on conflict (conta_id, referencia_externa) where referencia_externa is not null do nothing
       returning id`,
      [contaId, formatarDataISO(transacao.data), transacao.valor, transacao.descricao, transacao.id],
    );

    if (rows.length > 0) {
      importadas += 1;
    } else {
      jaExistentes += 1;
    }
  }

  return { importadas, jaExistentes };
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
