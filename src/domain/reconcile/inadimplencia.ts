import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { StatusInadimplencia } from "../types";
import type { Excecao } from "./contratos";

function diferencaEmDias(dataInicioIso: string, dataFimIso: string): number {
  const inicio = new Date(dataInicioIso + "T00:00:00").getTime();
  const fim = new Date(dataFimIso + "T00:00:00").getTime();
  return Math.round((fim - inicio) / (1000 * 60 * 60 * 24));
}

function somarMeses(dataIso: string, meses: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setMonth(data.getMonth() + meses);
  return data.toISOString().slice(0, 10);
}

interface ContratoEncargos {
  id: number;
  dia_vencimento: number | null;
  multa_percentual: number;
  multa_ate_dias: number;
  multa_percentual_substitutiva: number;
  juros_mensal_percentual: number;
  indice_correcao_mora: "igpm" | "ipca" | "nenhum";
  honorarios_percentual: number;
  dias_gatilho_judicial: number;
}

/** Correção monetária composta mês a mês pelo índice do contrato, do vencimento até
 * hoje — mesma mecânica usada em calculoCaucao.ts. Mês sem taxa cadastrada não
 * compõe (evita assumir um valor não documentado). */
function calcularCorrecao(
  taxasPorIndice: Map<string, Map<string, number>>,
  indice: "igpm" | "ipca" | "nenhum",
  dataVencimento: string,
  hoje: string,
  valorPrincipal: number,
): number {
  if (indice === "nenhum") return 0;
  const taxas = taxasPorIndice.get(indice);
  if (!taxas) return 0;

  let fator = 1;
  let mes = dataVencimento.slice(0, 8) + "01";
  while (mes < hoje) {
    const taxa = taxas.get(mes.slice(0, 7));
    if (taxa !== undefined) fator *= 1 + taxa / 100;
    mes = somarMeses(mes, 1);
  }
  return valorPrincipal * (fator - 1);
}

/** Calcula multa (em duas faixas, conforme cláusula contratual — inicial até
 * `multa_ate_dias`, substituída, não somada, a partir daí), juros de mora pro-rata
 * die, correção monetária pelo índice contratado e honorários advocatícios quando
 * o atraso ultrapassa o gatilho de execução judicial definido no contrato. */
export function calcularInadimplencia(db: Database, excecoes: Excecao[], hoje: string): StatusInadimplencia[] {
  const contratos = new Map(
    consultar<ContratoEncargos>(
      db,
      `SELECT id, dia_vencimento, multa_percentual, multa_ate_dias, multa_percentual_substitutiva,
              juros_mensal_percentual, indice_correcao_mora, honorarios_percentual, dias_gatilho_judicial
       FROM contratos_locacao`,
    ).map((c) => [c.id, c]),
  );

  const taxasPorIndice = new Map<string, Map<string, number>>();
  for (const linha of consultar<{ indice: string; mes_referencia: string; taxa_mensal: number }>(
    db,
    "SELECT indice, mes_referencia, taxa_mensal FROM indices_economicos WHERE indice IN ('igpm', 'ipca')",
  )) {
    const mapa = taxasPorIndice.get(linha.indice) ?? new Map<string, number>();
    mapa.set(linha.mes_referencia.slice(0, 7), linha.taxa_mensal);
    taxasPorIndice.set(linha.indice, mapa);
  }

  return excecoes.map(({ competencia }): StatusInadimplencia => {
    const contrato = contratos.get(competencia.contrato_id);
    const diaVencimento = contrato?.dia_vencimento ?? 5;
    const dataVencimento = `${competencia.mes_referencia.slice(0, 8)}${String(diaVencimento).padStart(2, "0")}`;
    const diasAtraso = Math.max(0, diferencaEmDias(dataVencimento, hoje));

    if (diasAtraso <= 0) {
      return { competencia, diasAtraso, multa: 0, juros: 0, correcaoMonetaria: 0, honorarios: 0, totalDevido: competencia.valor_esperado, situacao: "pago" };
    }

    const multaAteDias = contrato?.multa_ate_dias ?? 5;
    const multaInicialPercentual = contrato?.multa_percentual ?? 2.0;
    const multaSubstitutivaPercentual = contrato?.multa_percentual_substitutiva ?? 10.0;
    const jurosMensalPercentual = contrato?.juros_mensal_percentual ?? 1.0;
    const indiceCorrecao = contrato?.indice_correcao_mora ?? "nenhum";
    const honorariosPercentual = contrato?.honorarios_percentual ?? 0;
    const diasGatilhoJudicial = contrato?.dias_gatilho_judicial ?? 9999;

    const juros = competencia.valor_esperado * (jurosMensalPercentual / 100) * (diasAtraso / 30);
    const correcaoMonetaria = calcularCorrecao(taxasPorIndice, indiceCorrecao, dataVencimento, hoje, competencia.valor_esperado);

    // Faixa inicial soma sobre o principal; a faixa substitutiva (cláusula típica:
    // "revoga e substitui") incide sobre o débito já atualizado (principal + juros + correção).
    const multa =
      diasAtraso <= multaAteDias
        ? competencia.valor_esperado * (multaInicialPercentual / 100)
        : (competencia.valor_esperado + juros + correcaoMonetaria) * (multaSubstitutivaPercentual / 100);

    const honorarios =
      diasAtraso >= diasGatilhoJudicial
        ? (competencia.valor_esperado + juros + correcaoMonetaria + multa) * (honorariosPercentual / 100)
        : 0;

    const situacao: StatusInadimplencia["situacao"] = diasAtraso <= 30 ? "em_aberto" : "inadimplente";

    return {
      competencia,
      diasAtraso,
      multa,
      juros,
      correcaoMonetaria,
      honorarios,
      totalDevido: competencia.valor_esperado + multa + juros + correcaoMonetaria + honorarios,
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
