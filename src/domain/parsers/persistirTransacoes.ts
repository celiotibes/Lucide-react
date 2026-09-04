import type { Database } from "sql.js";
import { executar } from "../../db/connection";
import type { TransacaoBruta } from "./ofx";

export interface ResultadoPersistencia {
  inseridas: number;
  duplicadas: number;
  malformadas: number;
}

/** valor NaN/Infinity (parser não conseguiu ler o número) vira NULL no binding do sql.js e
 * viola `valor REAL NOT NULL` — que o INSERT OR IGNORE engole em silêncio, indistinguível de
 * uma duplicata de verdade (mesma UNIQUE conta_id+fitid). Validar ANTES do INSERT permite
 * reportar "linha malformada, dado perdido" separado de "duplicidade" — a UI que atribuía
 * toda linha não inserida a "duplicidade" escondia dado corrompido descartado (achado de
 * auditoria adversarial). */
function transacaoValida(t: TransacaoBruta): boolean {
  return Number.isFinite(t.valor) && /^\d{4}-\d{2}-\d{2}$/.test(t.data);
}

/** Insere transações brutas na conta indicada, de forma idempotente
 * (conta_id + fitid é UNIQUE — reimportar o mesmo arquivo não duplica). */
export function persistirTransacoes(db: Database, contaId: number, transacoes: TransacaoBruta[], documentoFonte?: string): ResultadoPersistencia {
  let inseridas = 0;
  let malformadas = 0;
  for (const transacao of transacoes) {
    if (!transacaoValida(transacao)) {
      malformadas++;
      continue;
    }
    executar(
      db,
      `INSERT OR IGNORE INTO transacoes (conta_id, data, valor, descricao_original, fitid, documento_fonte)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [contaId, transacao.data, transacao.valor, transacao.descricaoOriginal, transacao.fitid, transacao.documentoFonte ?? documentoFonte ?? null],
    );
    inseridas += db.getRowsModified();
  }
  const duplicadas = transacoes.length - malformadas - inseridas;
  return { inseridas, duplicadas, malformadas };
}
