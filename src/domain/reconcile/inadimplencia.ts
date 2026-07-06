import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { StatusInadimplencia } from "../types";
import type { Excecao } from "./contratos";

function diferencaEmDias(dataInicioIso: string, dataFimIso: string): number {
  const inicio = new Date(dataInicioIso + "T00:00:00").getTime();
  const fim = new Date(dataFimIso + "T00:00:00").getTime();
  return Math.round((fim - inicio) / (1000 * 60 * 60 * 24));
}

/** Calcula multa (percentual fixo sobre a parcela) e juros de mora (pro-rata die)
 * para cada competência em aberto, usando os parâmetros do próprio contrato —
 * nada de índice universal: cada contrato tem sua cláusula. */
export function calcularInadimplencia(db: Database, excecoes: Excecao[], hoje: string): StatusInadimplencia[] {
  const contratos = new Map(
    consultar<{ id: number; dia_vencimento: number | null; multa_percentual: number; juros_mensal_percentual: number }>(
      db,
      "SELECT id, dia_vencimento, multa_percentual, juros_mensal_percentual FROM contratos_locacao",
    ).map((c) => [c.id, c]),
  );

  return excecoes.map(({ competencia }): StatusInadimplencia => {
    const contrato = contratos.get(competencia.contrato_id);
    const diaVencimento = contrato?.dia_vencimento ?? 5;
    const dataVencimento = `${competencia.mes_referencia.slice(0, 8)}${String(diaVencimento).padStart(2, "0")}`;

    const diasAtraso = Math.max(0, diferencaEmDias(dataVencimento, hoje));
    const multaPercentual = contrato?.multa_percentual ?? 2.0;
    const jurosMensalPercentual = contrato?.juros_mensal_percentual ?? 1.0;

    const multa = diasAtraso > 0 ? competencia.valor_esperado * (multaPercentual / 100) : 0;
    const juros = diasAtraso > 0 ? competencia.valor_esperado * (jurosMensalPercentual / 100) * (diasAtraso / 30) : 0;

    const situacao: StatusInadimplencia["situacao"] =
      diasAtraso <= 0 ? "pago" : diasAtraso <= 30 ? "em_aberto" : "inadimplente";

    return {
      competencia,
      diasAtraso,
      multa,
      juros,
      totalDevido: competencia.valor_esperado + multa + juros,
      situacao,
    };
  });
}

/** Agrega o total inadimplente por faixa de atraso (aging) — a visão que interessa
 * para o relatório de capacidade contributiva: quanto está em aberto e há quanto tempo. */
export function agingPorFaixa(status: StatusInadimplencia[]) {
  const faixas = {
    "1-30 dias": { quantidade: 0, total: 0 },
    "31-90 dias": { quantidade: 0, total: 0 },
    "90+ dias": { quantidade: 0, total: 0 },
  };

  for (const s of status) {
    if (s.diasAtraso <= 0) continue;
    const chave = s.diasAtraso <= 30 ? "1-30 dias" : s.diasAtraso <= 90 ? "31-90 dias" : "90+ dias";
    faixas[chave].quantidade += 1;
    faixas[chave].total += s.totalDevido;
  }
  return faixas;
}
