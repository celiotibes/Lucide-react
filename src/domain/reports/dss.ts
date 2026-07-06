import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { ContratoLocacao } from "../types";

export interface ResultadoDss {
  contrato: ContratoLocacao;
  periodoInicio: string;
  periodoFim: string;
  totalArrecadadoRateio: number;
  totalDespendido: number;
  saldo: "superavit" | "deficit" | "equilibrado";
  saldoValor: number;
  linhasDespesa: { codigo: string; descricao: string; total: number }[];
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

  const linhasDespesa = consultar<{ codigo: string; descricao: string; total: number }>(
    db,
    `SELECT p.codigo AS codigo, p.descricao AS descricao, SUM(ABS(t.valor)) AS total
     FROM transacoes t
     JOIN plano_de_contas p ON p.codigo = t.plano_conta_codigo
     WHERE t.imovel_id = ? AND t.plano_conta_codigo IN (${CATEGORIAS_CUSTEIO_COLETIVO.map(() => "?").join(",")})
       AND t.data BETWEEN ? AND ?
     GROUP BY p.codigo, p.descricao
     ORDER BY p.codigo`,
    [contrato.imovel_id, ...CATEGORIAS_CUSTEIO_COLETIVO, dataInicio, dataFim],
  );

  const totalDespendido = linhasDespesa.reduce((acc, l) => acc + l.total, 0);
  const saldoValor = arrecadado - totalDespendido;

  return {
    contrato,
    periodoInicio: dataInicio,
    periodoFim: dataFim,
    totalArrecadadoRateio: arrecadado,
    totalDespendido,
    saldo: Math.abs(saldoValor) < 0.01 ? "equilibrado" : saldoValor > 0 ? "superavit" : "deficit",
    saldoValor,
    linhasDespesa,
  };
}
