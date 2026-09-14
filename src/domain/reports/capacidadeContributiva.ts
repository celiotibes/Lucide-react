import type { Database } from "sql.js";
import { gerarDre, gerarSerieMensal } from "./dre";
import { gerarRendaTributavel, totalizarRendaTributavel } from "./rendaTributavel";

export interface CapacidadeContributiva {
  periodoInicio: string;
  periodoFim: string;
  totalRecebidoBruto: number; // tudo que entrou como receita, incluindo reembolso de rateio
  rendaTributavel: number; // base do Carnê-Leão (exclui reembolso)
  reembolsoNaoTributavel: number;
  despesaOperacionalTotal: number; // despesas da atividade de locação (já exclui imóveis de uso pessoal)
  resultadoLiquidoReal: number; // renda tributável menos despesa operacional — a capacidade contributiva real
  percentualDisponivelSobreRecebido: number | null; // null se totalRecebidoBruto <= 0
}

/** Consolida num único número o argumento central para capacidade contributiva: o que
 * entrou bruto na conta quase sempre é maior do que a renda tributável (por causa do
 * reembolso de rateio embutido), e a renda tributável ainda é reduzida pelas despesas
 * operacionais da atividade — o resultado líquido real costuma ser uma fração pequena do
 * total recebido bruto, mesmo com receita bruta alta. */
export function calcularCapacidadeContributiva(db: Database, dataInicio: string, dataFim: string): CapacidadeContributiva {
  const linhasRenda = gerarRendaTributavel(db, dataInicio, dataFim);
  const totaisRenda = totalizarRendaTributavel(linhasRenda);

  const linhasDre = gerarDre(db, dataInicio, dataFim);
  const despesaOperacionalTotal = Math.abs(linhasDre.filter((l) => l.grupo === "despesa").reduce((acc, l) => acc + l.total, 0));

  const resultadoLiquidoReal = totaisRenda.rendaTributavel - despesaOperacionalTotal;

  return {
    periodoInicio: dataInicio,
    periodoFim: dataFim,
    totalRecebidoBruto: totaisRenda.totalRecebido,
    rendaTributavel: totaisRenda.rendaTributavel,
    reembolsoNaoTributavel: totaisRenda.reembolsoNaoTributavel,
    despesaOperacionalTotal,
    resultadoLiquidoReal,
    percentualDisponivelSobreRecebido: totaisRenda.totalRecebido > 0 ? (resultadoLiquidoReal / totaisRenda.totalRecebido) * 100 : null,
  };
}

export interface CapacidadeContributivaMensal {
  mes: string;
  totalRecebidoBruto: number;
  rendaTributavel: number;
  despesaOperacionalTotal: number;
  resultadoLiquidoReal: number;
}

/** Série mensal da mesma lógica — para o gráfico "receita subiu, mas o resultado real
 * ficou estável" (análise horizontal aplicada à capacidade contributiva). */
export function calcularCapacidadeContributivaMensal(db: Database, dataInicio: string, dataFim: string): CapacidadeContributivaMensal[] {
  const linhasRenda = gerarRendaTributavel(db, dataInicio, dataFim);
  const despesasPorMes = new Map(gerarSerieMensal(db, dataInicio, dataFim).map((l) => [l.mes, Math.abs(l.despesa)]));

  return linhasRenda.map((l) => {
    const despesaOperacionalTotal = despesasPorMes.get(l.mes) ?? 0;
    return {
      mes: l.mes,
      totalRecebidoBruto: l.totalRecebido,
      rendaTributavel: l.rendaTributavel,
      despesaOperacionalTotal,
      resultadoLiquidoReal: l.rendaTributavel - despesaOperacionalTotal,
    };
  });
}
