import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { ContratoLocacao, RubricaCusteio } from "../types";

export interface ResultadoDss {
  contrato: ContratoLocacao;
  periodoInicio: string;
  periodoFim: string;
  totalArrecadadoRateio: number;
  totalDespendido: number;
  saldo: "superavit" | "deficit" | "equilibrado";
  saldoValor: number;
  linhasDespesa: { codigo: string; descricao: string; total: number }[];
  /** Composição CONTRATADA da Cota de Custeio (o instrumento assinado), quando cadastrada —
   * referência documental, não uma reclassificação do gasto real de linhasDespesa acima. */
  rubricasContratadas: RubricaCusteio[];
}

// Categorias que o rateio de custeio coletivo de fato financia (condomínio, manutenção
// de áreas comuns, prestadores) — exclui financiamento e obra/capex, que o próprio
// modelo de contrato "valor único" veda expressamente incluir no rateio dos locatários.
const CATEGORIAS_CUSTEIO_COLETIVO = ["2.1.01", "2.1.02", "2.1.04"];

/** Demonstrativo Semestral Simplificado: exatamente o relatório que contratos deste
 * tipo (valor único com rateio de custeio) obrigam o locador a enviar periodicamente
 * ao locatário — arrecadação do rateio x gasto real nas categorias de custeio
 * coletivo do imóvel, no período. */
export function gerarDss(db: Database, contratoId: number, dataInicio: string, dataFim: string): ResultadoDss | null {
  const [contrato] = consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao WHERE id = ?", [contratoId]);
  if (!contrato) return null;

  const [{ arrecadado }] = consultar<{ arrecadado: number }>(
    db,
    `SELECT COALESCE(SUM(valor * (1 - ? / 100.0)), 0) AS arrecadado
     FROM transacoes
     WHERE contrato_id = ? AND plano_conta_codigo = '1.1.01' AND data BETWEEN ? AND ?`,
    [contrato.percentual_aluguel_efetivo, contratoId, dataInicio, dataFim],
  );

  // ACHADO (gravidade ALTA, corrigido): esta consulta somava só as transações lançadas
  // DIRETO no imóvel (t.imovel_id = ?), ignorando por completo a tabela `rateios` — mas as
  // 3 categorias de CATEGORIAS_CUSTEIO_COLETIVO (condomínio, manutenção, prestadores) são
  // exatamente o tipo de despesa de prédio que costuma ser ratead*a* entre várias unidades
  // (ver `rateios`/motorRateio.ts, e o mesmo padrão já tratado em dre.ts::gerarDre e
  // irpfCarneLeao.ts::calcularCarneLeaoPorImovel). Uma transação rateada não aparece com
  // `t.imovel_id` igual ao deste imóvel — sua fatia mora numa linha em `rateios` com
  // `imovel_id` próprio — então todo condomínio/manutenção coletiva rateada entre kitnets do
  // mesmo prédio ficava de fora do `totalDespendido`, subestimando o gasto real e inflando
  // artificialmente o saldo do DSS para "superávit" (o relatório que o contrato obriga
  // enviar ao locatário reportaria menos gasto do que o de fato incorrido). Corrigido unindo
  // as transações diretas com a fatia rateada deste imóvel, mesmo padrão de gerarDre.
  const linhasDespesa = consultar<{ codigo: string; descricao: string; total: number }>(
    db,
    `SELECT codigo, descricao, SUM(total) AS total FROM (
       SELECT p.codigo AS codigo, p.descricao AS descricao, ABS(t.valor) AS total
       FROM transacoes t
       JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
       WHERE t.imovel_id = ? AND t.plano_conta_codigo IN (${CATEGORIAS_CUSTEIO_COLETIVO.map(() => "?").join(",")})
         AND t.data BETWEEN ? AND ?

       UNION ALL

       SELECT p.codigo AS codigo, p.descricao AS descricao, ABS(r.valor_rateado) AS total
       FROM rateios r
       JOIN transacoes t ON t.id = r.transacao_id
       JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
       WHERE r.imovel_id = ? AND t.plano_conta_codigo IN (${CATEGORIAS_CUSTEIO_COLETIVO.map(() => "?").join(",")})
         AND t.data BETWEEN ? AND ?
     )
     GROUP BY codigo, descricao
     ORDER BY codigo`,
    [
      contrato.imovel_id, ...CATEGORIAS_CUSTEIO_COLETIVO, dataInicio, dataFim,
      contrato.imovel_id, ...CATEGORIAS_CUSTEIO_COLETIVO, dataInicio, dataFim,
    ],
  );

  const totalDespendido = linhasDespesa.reduce((acc, l) => acc + l.total, 0);
  const saldoValor = arrecadado - totalDespendido;

  const rubricasContratadas = consultar<RubricaCusteio>(
    db,
    "SELECT * FROM contrato_custeio_rubricas WHERE contrato_id = ? ORDER BY referencia",
    [contratoId],
  );

  return {
    contrato,
    periodoInicio: dataInicio,
    periodoFim: dataFim,
    totalArrecadadoRateio: arrecadado,
    totalDespendido,
    saldo: Math.abs(saldoValor) < 0.01 ? "equilibrado" : saldoValor > 0 ? "superavit" : "deficit",
    saldoValor,
    linhasDespesa,
    rubricasContratadas,
  };
}
