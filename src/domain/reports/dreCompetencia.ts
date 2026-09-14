import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { gerarCompetencias } from "../reconcile/contratos";

export interface LinhaComparativoCaixaCompetencia {
  mes: string;
  receitaCompetencia: number; // valor devido pelo contrato naquele mês (regime de competência)
  receitaCaixa: number; // valor efetivamente recebido, com data naquele mês (regime de caixa)
  diferenca: number; // competência - caixa: positivo = parte do devido no mês ainda não entrou no caixa
}

/** Compara, mês a mês, a receita de aluguel devida pelos contratos (regime de
 * competência, usando o mesmo motor de competências esperadas do módulo de
 * inadimplência) contra a receita efetivamente recebida no caixa (regime de caixa,
 * data real da transação). Evidencia que em meses de atraso/inadimplência a renda
 * devida supera a renda recebida — "o que é devido" e "o que efetivamente entra no
 * caixa" são coisas diferentes, e é o caixa que determina capacidade de pagar de fato.
 * Cobre apenas contratos residenciais fixos: são os únicos com competência mensal
 * definida por cláusula contratual — Airbnb/temporada não tem "mês devido" fixo. */
export function compararReceitaCaixaXCompetencia(db: Database, dataInicio: string, dataFim: string): LinhaComparativoCaixaCompetencia[] {
  const mesInicio = dataInicio.slice(0, 7);
  const mesFim = dataFim.slice(0, 7);

  const competencias = gerarCompetencias(db, dataFim).filter(
    (c) => c.mes_referencia.slice(0, 7) >= mesInicio && c.mes_referencia.slice(0, 7) <= mesFim,
  );

  // Filtra por mês (não por data exata): a competência representa o mês inteiro, então
  // comparar contra o caixa cortado no dia exato de dataInicio/dataFim sub ou
  // superestimaria artificialmente a diferença nos meses de borda do período.
  const caixaPorMes = new Map(
    consultar<{ mes: string; total: number }>(
      db,
      `SELECT substr(t.data, 1, 7) AS mes, SUM(t.valor) AS total
       FROM transacoes t
       JOIN contratos_locacao c ON c.id = t.contrato_id
       WHERE c.tipo = 'residencial_fixo' AND t.plano_conta_codigo = '1.1.01' AND substr(t.data, 1, 7) BETWEEN ? AND ?
       GROUP BY mes`,
      [mesInicio, mesFim],
    ).map((l) => [l.mes, l.total]),
  );

  const porMes = new Map<string, number>();
  for (const c of competencias) {
    const mes = c.mes_referencia.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + c.valor_esperado);
  }

  const meses = new Set([...porMes.keys(), ...caixaPorMes.keys()]);
  return Array.from(meses)
    .sort()
    .map((mes) => {
      const receitaCompetencia = porMes.get(mes) ?? 0;
      const receitaCaixa = caixaPorMes.get(mes) ?? 0;
      return { mes, receitaCompetencia, receitaCaixa, diferenca: receitaCompetencia - receitaCaixa };
    });
}
