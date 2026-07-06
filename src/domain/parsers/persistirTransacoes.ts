import type { Database } from "sql.js";
import { executar } from "../../db/connection";
import type { TransacaoBruta } from "./ofx";

/** Insere transações brutas na conta indicada, de forma idempotente
 * (conta_id + fitid é UNIQUE — reimportar o mesmo arquivo não duplica). */
export function persistirTransacoes(db: Database, contaId: number, transacoes: TransacaoBruta[], documentoFonte?: string): number {
  let inseridas = 0;
  for (const transacao of transacoes) {
    executar(
      db,
      `INSERT OR IGNORE INTO transacoes (conta_id, data, valor, descricao_original, fitid, documento_fonte)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [contaId, transacao.data, transacao.valor, transacao.descricaoOriginal, transacao.fitid, documentoFonte ?? null],
    );
    inseridas += db.getRowsModified();
  }
  return inseridas;
}
