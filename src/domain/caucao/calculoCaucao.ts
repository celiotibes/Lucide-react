import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { Caucao, IndiceCorrecao } from "../types";

export interface ResultadoCalculoCaucao {
  caucao: Caucao;
  saldoCorrigido: number;
  valorADevolver: number;
  mesesSemIndiceDisponivel: string[];
}

function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return data.toISOString().slice(0, 10);
}

/** Corrige o valor do depósito caução mês a mês pelo índice contratado (poupança/IGPM/IPCA),
 * usando a série cadastrada em `indices_economicos`. Meses sem taxa cadastrada não são
 * compostos — em vez de assumir um valor, o mês é listado em `mesesSemIndiceDisponivel`
 * para o usuário completar a série antes de fechar o cálculo. */
export function calcularCaucao(db: Database, caucaoId: number, dataReferencia: string): ResultadoCalculoCaucao {
  const [caucao] = consultar<Caucao>(db, "SELECT * FROM caucoes WHERE id = ?", [caucaoId]);
  if (!caucao) throw new Error(`Caução ${caucaoId} não encontrada.`);

  const dataFinal = caucao.data_devolucao ?? dataReferencia;

  if (caucao.indice_correcao === "nenhum") {
    const saldoCorrigido = caucao.valor_inicial;
    return {
      caucao,
      saldoCorrigido,
      valorADevolver: saldoCorrigido - caucao.deducoes_valor,
      mesesSemIndiceDisponivel: [],
    };
  }

  const taxas = new Map(
    consultar<{ mes_referencia: string; taxa_mensal: number }>(
      db,
      "SELECT mes_referencia, taxa_mensal FROM indices_economicos WHERE indice = ? ORDER BY mes_referencia",
      [caucao.indice_correcao as IndiceCorrecao],
    ).map((r) => [r.mes_referencia.slice(0, 7), r.taxa_mensal]),
  );

  let saldo = caucao.valor_inicial;
  const mesesSemIndice: string[] = [];
  let mes = caucao.data_deposito.slice(0, 8) + "01";

  while (mes < dataFinal) {
    const chaveMes = mes.slice(0, 7);
    const taxa = taxas.get(chaveMes);
    if (taxa === undefined) {
      mesesSemIndice.push(chaveMes);
    } else {
      saldo *= 1 + taxa / 100;
    }
    mes = somarMeses(mes, 1);
  }

  return {
    caucao,
    saldoCorrigido: saldo,
    valorADevolver: saldo - caucao.deducoes_valor,
    mesesSemIndiceDisponivel: mesesSemIndice,
  };
}
