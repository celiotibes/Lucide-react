import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface LinhaRendaTributavel {
  mes: string;
  totalRecebido: number;
  rendaTributavel: number; // base do Carnê-Leão (IRPF)
  reembolsoNaoTributavel: number; // rateio de custeio coletivo — mero trânsito contábil
}

/** Separa, de cada recebimento de aluguel, o que é de fato receita tributável (Aluguel
 * Efetivo) do que é reembolso de rateio de custeio coletivo — a mesma distinção que
 * contratos de locação compartilhada fazem explicitamente (ex.: "valor único mensal"
 * decomposto em 55% aluguel / 45% rateio). Sem contrato vinculado ou fora do código de
 * aluguel, assume-se 100% tributável (ex.: Airbnb, multas recebidas). Esta é a métrica
 * mais relevante para demonstrar capacidade contributiva real: o total recebido nas
 * contas quase sempre é maior do que a renda de fato. */
export function gerarRendaTributavel(db: Database, dataInicio: string, dataFim: string): LinhaRendaTributavel[] {
  const linhas = consultar<{ mes: string; valor: number; codigo: string; percentual: number | null }>(
    db,
    `SELECT substr(t.data, 1, 7) AS mes, t.valor AS valor, t.plano_conta_codigo AS codigo,
            c.percentual_aluguel_efetivo AS percentual
     FROM transacoes t
     JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
     LEFT JOIN contratos_locacao c ON c.id = t.contrato_id
     WHERE p.grupo = 'receita' AND t.data BETWEEN ? AND ?`,
    [dataInicio, dataFim],
  );

  const porMes = new Map<string, LinhaRendaTributavel>();
  for (const linha of linhas) {
    const atual = porMes.get(linha.mes) ?? { mes: linha.mes, totalRecebido: 0, rendaTributavel: 0, reembolsoNaoTributavel: 0 };

    const percentual = linha.codigo === "1.1.01" && linha.percentual !== null ? linha.percentual : 100;
    const tributavel = linha.valor * (percentual / 100);
    const reembolso = linha.valor - tributavel;

    atual.totalRecebido += linha.valor;
    atual.rendaTributavel += tributavel;
    atual.reembolsoNaoTributavel += reembolso;
    porMes.set(linha.mes, atual);
  }

  return Array.from(porMes.values()).sort((a, b) => a.mes.localeCompare(b.mes));
}

export function totalizarRendaTributavel(linhas: LinhaRendaTributavel[]) {
  return linhas.reduce(
    (acc, l) => ({
      totalRecebido: acc.totalRecebido + l.totalRecebido,
      rendaTributavel: acc.rendaTributavel + l.rendaTributavel,
      reembolsoNaoTributavel: acc.reembolsoNaoTributavel + l.reembolsoNaoTributavel,
    }),
    { totalRecebido: 0, rendaTributavel: 0, reembolsoNaoTributavel: 0 },
  );
}
