import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface LinhaRendaTributavel {
  mes: string;
  totalRecebido: number;
  rendaTributavel: number; // base do Carnê-Leão (IRPF)
  reembolsoNaoTributavel: number; // rateio de custeio coletivo — mero trânsito contábil
}

/** % de um recebimento de receita que é de fato tributável, por código do plano de contas:
 * - 1.1.01 (Aluguéis): usa percentual_aluguel_efetivo do contrato vinculado — o resto é
 *   reembolso de rateio de custeio coletivo embutido no "valor único mensal".
 * - 1.1.02 (reembolso de consumo individualizado repassado sem margem — ex: energia por
 *   submedição, faturada em apartado do valor único): 0% — é reembolso puro de despesa de
 *   terceiro, nem sequer parte da Cota de Custeio, então nunca compõe renda tributável.
 * - Qualquer outro código (Airbnb, multas/juros recebidos, créditos jurídicos): 100% — sem
 *   decomposição contratual, assume-se tributável integralmente (mesmo que vinculado a um
 *   contrato com rateio embutido, já que o rateio só se aplica ao valor único do aluguel). */
export function percentualTributavel(codigo: string, percentualAluguelEfetivoContrato: number | null): number {
  if (codigo === "1.1.02") return 0;
  if (codigo === "1.1.01" && percentualAluguelEfetivoContrato !== null) return percentualAluguelEfetivoContrato;
  return 100;
}

/** Separa, de cada recebimento de aluguel, o que é de fato receita tributável (Aluguel
 * Efetivo) do que é reembolso de rateio de custeio coletivo — a mesma distinção que
 * contratos de locação compartilhada fazem explicitamente (ex.: "valor único mensal"
 * decomposto em 55% aluguel / 45% rateio). Sem contrato vinculado ou fora do código de
 * aluguel, assume-se 100% tributável (ex.: Airbnb, multas recebidas) — exceto reembolso de
 * consumo individualizado repassado sem margem (1.1.02), sempre 0%. Esta é a métrica mais
 * relevante para demonstrar capacidade contributiva real: o total recebido nas contas quase
 * sempre é maior do que a renda de fato. */
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

    const percentual = percentualTributavel(linha.codigo, linha.percentual);
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
