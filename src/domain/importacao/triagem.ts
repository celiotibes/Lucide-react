/** Triagem: decidir, linha a linha, o que do arquivo importado vira transação.
 *
 * Antes os parsers escreviam direto em `transacoes`. Havia uma etapa "Revisar antes de
 * importar" na tela, mas ela vivia em estado do React: sair da aba ou recarregar a página
 * perdia a revisão inteira, e nada ficava registrado sobre quem decidiu o quê. Um extrato
 * importado por engano entrava sem ninguém ver.
 *
 * Aqui a triagem é persistente e reversível até a aprovação: enquanto a linha está
 * pendente ela não existe na contabilidade. Aprovar é o único caminho de `transacoes`, e
 * deixa registrado quando e por quem.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import type { LoteImportacao } from "./cofre";

export type StatusLinha =
  | "pendente"
  | "aprovada"
  | "rejeitada"
  | "duplicata_provavel"
  | "malformada";

export interface LinhaTriagem {
  id: number;
  lote_id: number;
  linha_numero: number;
  data: string | null;
  valor: number | null;
  descricao_original: string;
  fitid: string | null;
  plano_conta_codigo: string | null;
  status: StatusLinha;
  motivo: string | null;
  transacao_id: number | null;
  duplicata_de_id: number | null;
  decidido_em: string | null;
  decidido_por: string | null;
}

export interface ResumoLote extends LoteImportacao {
  pendentes: number;
  aprovadas: number;
  rejeitadas: number;
  duplicatas: number;
  malformadas: number;
}

export function listarLotes(db: Database): ResumoLote[] {
  return consultar<ResumoLote>(
    db,
    `SELECT lo.*,
       SUM(CASE WHEN l.status = 'pendente' THEN 1 ELSE 0 END) AS pendentes,
       SUM(CASE WHEN l.status = 'aprovada' THEN 1 ELSE 0 END) AS aprovadas,
       SUM(CASE WHEN l.status = 'rejeitada' THEN 1 ELSE 0 END) AS rejeitadas,
       SUM(CASE WHEN l.status = 'duplicata_provavel' THEN 1 ELSE 0 END) AS duplicatas,
       SUM(CASE WHEN l.status = 'malformada' THEN 1 ELSE 0 END) AS malformadas
     FROM lotes_importacao lo
     LEFT JOIN importacao_linhas l ON l.lote_id = lo.id
     GROUP BY lo.id
     ORDER BY lo.importado_em DESC, lo.id DESC`,
  );
}

export function listarLinhas(
  db: Database,
  lote_id: number,
  status?: StatusLinha,
): LinhaTriagem[] {
  const filtro = status ? " AND status = ?" : "";
  const params: (string | number)[] = status ? [lote_id, status] : [lote_id];
  return consultar<LinhaTriagem>(
    db,
    `SELECT * FROM importacao_linhas WHERE lote_id = ?${filtro} ORDER BY linha_numero`,
    params,
  );
}

export interface ResultadoDecisao {
  aprovadas: number;
  rejeitadas: number;
  recusadas: Array<{ linha_id: number; motivo: string }>;
}

/** Aprova linhas: cada uma vira uma transação, ligada de volta à linha do arquivo.
 *
 * Linha malformada não pode ser aprovada — sem data ou valor legível não há o que
 * lançar, e forçar um INSERT produziria `valor REAL NOT NULL` violado ou, pior, um valor
 * NULL silenciosamente convertido. É recusada com motivo, não ignorada.
 *
 * Aprovar uma 'duplicata_provavel' é permitido de propósito: o critério data+valor tem
 * falso positivo legítimo (duas diárias iguais no mesmo dia), e quem decide é a pessoa. */
export function aprovarLinhas(
  db: Database,
  linha_ids: number[],
  decidido_por = "operador-local",
): ResultadoDecisao {
  const recusadas: Array<{ linha_id: number; motivo: string }> = [];
  let aprovadas = 0;

  for (const linha_id of linha_ids) {
    const linha = consultar<LinhaTriagem & { conta_id: number | null; arquivo_nome: string }>(
      db,
      `SELECT l.*, lo.conta_id, lo.arquivo_nome
       FROM importacao_linhas l JOIN lotes_importacao lo ON lo.id = l.lote_id
       WHERE l.id = ?`,
      [linha_id],
    )[0];

    if (!linha) {
      recusadas.push({ linha_id, motivo: "Linha não encontrada" });
      continue;
    }
    if (linha.status === "aprovada") {
      recusadas.push({ linha_id, motivo: "Já aprovada anteriormente" });
      continue;
    }
    if (linha.status === "malformada" || linha.data === null || linha.valor === null) {
      recusadas.push({
        linha_id,
        motivo: "Data ou valor ilegível no arquivo — corrija a linha antes de aprovar",
      });
      continue;
    }
    if (linha.conta_id === null) {
      recusadas.push({ linha_id, motivo: "O lote não tem conta bancária de destino definida" });
      continue;
    }

    executar(
      db,
      `INSERT INTO transacoes (conta_id, data, valor, descricao_original, fitid,
                               documento_fonte, plano_conta_codigo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        linha.conta_id,
        linha.data,
        linha.valor,
        linha.descricao_original,
        linha.fitid,
        linha.arquivo_nome,
        linha.plano_conta_codigo,
      ],
    );
    const transacao_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;

    executar(
      db,
      `UPDATE importacao_linhas
       SET status = 'aprovada', transacao_id = ?, decidido_em = datetime('now'), decidido_por = ?
       WHERE id = ?`,
      [transacao_id, decidido_por, linha_id],
    );
    aprovadas++;
  }

  return { aprovadas, rejeitadas: 0, recusadas };
}

/** Rejeita linhas com motivo obrigatório.
 *
 * O motivo é exigido porque "rejeitada sem motivo" é indistinguível de "esquecida", e a
 * pergunta que o sistema precisa responder é por que um valor do extrato NÃO está na
 * contabilidade. */
export function rejeitarLinhas(
  db: Database,
  linha_ids: number[],
  motivo: string,
  decidido_por = "operador-local",
): ResultadoDecisao {
  const recusadas: Array<{ linha_id: number; motivo: string }> = [];
  if (!motivo.trim()) {
    return {
      aprovadas: 0,
      rejeitadas: 0,
      recusadas: linha_ids.map((linha_id) => ({
        linha_id,
        motivo: "Rejeitar exige um motivo — é o que explica por que este valor do extrato não está na contabilidade",
      })),
    };
  }

  let rejeitadas = 0;
  for (const linha_id of linha_ids) {
    const linha = consultar<{ status: StatusLinha }>(
      db,
      "SELECT status FROM importacao_linhas WHERE id = ?",
      [linha_id],
    )[0];
    if (!linha) {
      recusadas.push({ linha_id, motivo: "Linha não encontrada" });
      continue;
    }
    if (linha.status === "aprovada") {
      // Desfazer aqui apagaria uma transação que já pode estar no razão, conciliada ou
      // num período fechado. O caminho certo é o estorno contábil (ledger.ts), não a
      // exclusão do registro de origem.
      recusadas.push({
        linha_id,
        motivo: "Já aprovada e transformada em transação — use estorno contábil, não rejeição",
      });
      continue;
    }
    executar(
      db,
      `UPDATE importacao_linhas
       SET status = 'rejeitada', motivo = ?, decidido_em = datetime('now'), decidido_por = ?
       WHERE id = ?`,
      [motivo.trim(), decidido_por, linha_id],
    );
    rejeitadas++;
  }
  return { aprovadas: 0, rejeitadas, recusadas };
}

/** Corrige data/valor/classificação de uma linha ainda não aprovada.
 *
 * Existe por causa das linhas malformadas: o dado está no documento, só o parser não o
 * leu. Antes elas eram descartadas e a informação se perdia. */
export function corrigirLinha(
  db: Database,
  linha_id: number,
  campos: { data?: string; valor?: number; plano_conta_codigo?: string | null },
): { sucesso: boolean; mensagem: string } {
  const linha = consultar<{ status: StatusLinha }>(
    db,
    "SELECT status FROM importacao_linhas WHERE id = ?",
    [linha_id],
  )[0];
  if (!linha) return { sucesso: false, mensagem: "Linha não encontrada" };
  if (linha.status === "aprovada") {
    return { sucesso: false, mensagem: "Linha já aprovada — corrija pela tela de transações" };
  }

  if (campos.data !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(campos.data)) {
    return { sucesso: false, mensagem: "Data precisa estar no formato AAAA-MM-DD" };
  }
  if (campos.valor !== undefined && !Number.isFinite(campos.valor)) {
    return { sucesso: false, mensagem: "Valor precisa ser um número" };
  }

  const atribuicoes: string[] = [];
  const params: (string | number | null)[] = [];
  if (campos.data !== undefined) {
    atribuicoes.push("data = ?");
    params.push(campos.data);
  }
  if (campos.valor !== undefined) {
    atribuicoes.push("valor = ?");
    params.push(campos.valor);
  }
  if (campos.plano_conta_codigo !== undefined) {
    atribuicoes.push("plano_conta_codigo = ?");
    params.push(campos.plano_conta_codigo);
  }
  if (atribuicoes.length === 0) return { sucesso: false, mensagem: "Nada a corrigir" };

  executar(db, `UPDATE importacao_linhas SET ${atribuicoes.join(", ")} WHERE id = ?`, [
    ...params,
    linha_id,
  ]);

  // Segundo UPDATE, e não um CASE no primeiro: dentro de um único UPDATE o SQLite avalia
  // as expressões do SET contra os valores ANTIGOS da linha, então `data IS NOT NULL`
  // ainda enxergaria o NULL que acabou de ser corrigido, e a linha continuaria presa em
  // 'malformada'. Só depois de gravada a correção é que dá para reavaliar o status.
  executar(
    db,
    `UPDATE importacao_linhas
     SET status = 'pendente', motivo = NULL
     WHERE id = ? AND status = 'malformada' AND data IS NOT NULL AND valor IS NOT NULL`,
    [linha_id],
  );
  return { sucesso: true, mensagem: "Linha corrigida" };
}

/** Fecha o lote. Só quando não resta linha indecisa — um lote "concluído" com pendência
 * dentro esconderia exatamente o que a triagem existe para expor. */
export function concluirLote(db: Database, lote_id: number): { sucesso: boolean; mensagem: string } {
  const indecisas = consultar<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM importacao_linhas
     WHERE lote_id = ? AND status IN ('pendente', 'duplicata_provavel', 'malformada')`,
    [lote_id],
  )[0].n;

  if (indecisas > 0) {
    return {
      sucesso: false,
      mensagem: `Ainda há ${indecisas} linha(s) sem decisão neste lote. Aprove, rejeite ou corrija antes de concluir.`,
    };
  }

  executar(
    db,
    "UPDATE lotes_importacao SET status = 'concluido', concluido_em = datetime('now') WHERE id = ?",
    [lote_id],
  );
  return { sucesso: true, mensagem: "Lote concluído" };
}

/** Descarta o lote inteiro — as linhas ainda não aprovadas viram 'rejeitada'.
 * As já aprovadas permanecem: são transações da contabilidade, não do lote. */
export function descartarLote(
  db: Database,
  lote_id: number,
  motivo: string,
  decidido_por = "operador-local",
): { sucesso: boolean; mensagem: string; aprovadas_mantidas: number } {
  if (!motivo.trim()) {
    return { sucesso: false, mensagem: "Descartar um lote exige um motivo", aprovadas_mantidas: 0 };
  }
  const aprovadas = consultar<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM importacao_linhas WHERE lote_id = ? AND status = 'aprovada'",
    [lote_id],
  )[0].n;

  executar(
    db,
    `UPDATE importacao_linhas
     SET status = 'rejeitada', motivo = ?, decidido_em = datetime('now'), decidido_por = ?
     WHERE lote_id = ? AND status <> 'aprovada'`,
    [`Lote descartado: ${motivo.trim()}`, decidido_por, lote_id],
  );
  executar(
    db,
    "UPDATE lotes_importacao SET status = 'descartado', concluido_em = datetime('now'), observacoes = ? WHERE id = ?",
    [motivo.trim(), lote_id],
  );

  return {
    sucesso: true,
    mensagem:
      aprovadas > 0
        ? `Lote descartado. ${aprovadas} linha(s) já aprovada(s) continuam como transações — para removê-las use estorno contábil.`
        : "Lote descartado.",
    aprovadas_mantidas: aprovadas,
  };
}
