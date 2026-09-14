import type { Database } from "sql.js";
import { executar } from "../../db/connection";
import { gerarDss } from "../reports/dss";
import { valorVigente, diferencaEmMeses } from "../contratos/reajustes";
import type { ContratoLocacao } from "../types";

export interface SugestaoAjusteRateio {
  periodoInicio: string;
  periodoFim: string;
  percentualAluguelEfetivoAtual: number;
  percentualRateioAtual: number;
  despesaMediaMensal: number;
  saldoAcumulado: number; // saldo do DSS no período analisado: positivo = superávit (locatário pagou a mais)
  mesesAmortizacao: number;
  valorMensalVigente: number;
  percentualRateioSugerido: number;
  percentualAluguelEfetivoSugerido: number;
}

/** Sugere o percentual de rateio (embutido no "valor único mensal") para o próximo ciclo,
 * de forma que a arrecadação projetada cubra a despesa média do período anterior E absorva,
 * ao longo de `mesesAmortizacao` meses, o saldo (superávit/déficit) acumulado no ciclo que
 * está terminando — o mecanismo de "balanceamento anual" que alguns contratos de valor único
 * preveem e que hoje o app só mostra (DSS) sem sugerir o ajuste. Não altera nada sozinho:
 * quem decide aplicar é o usuário, via aplicarAjusteRateio. */
export function sugerirAjusteRateio(
  db: Database,
  contrato: ContratoLocacao,
  dataInicio: string,
  dataFim: string,
  mesesAmortizacao = 12,
): SugestaoAjusteRateio | null {
  const dss = gerarDss(db, contrato.id, dataInicio, dataFim);
  if (!dss) return null;

  const mesesPeriodo = Math.max(1, diferencaEmMeses(dataInicio, dataFim));
  const despesaMediaMensal = dss.totalDespendido / mesesPeriodo;
  const saldoPorMes = dss.saldoValor / mesesAmortizacao;
  // saldoValor > 0 (superávit) reduz a arrecadação necessária no próximo ciclo (devolve o excesso
  // cobrado); saldoValor < 0 (déficit) aumenta (recupera o que faltou), nunca abaixo de zero.
  const arrecadacaoMensalNecessaria = Math.max(0, despesaMediaMensal - saldoPorMes);

  const valorMensalVigente = valorVigente(db, contrato.id, dataFim);
  const percentualRateioSugerido =
    valorMensalVigente > 0 ? Math.min(100, Math.max(0, (arrecadacaoMensalNecessaria / valorMensalVigente) * 100)) : 0;

  return {
    periodoInicio: dataInicio,
    periodoFim: dataFim,
    percentualAluguelEfetivoAtual: contrato.percentual_aluguel_efetivo,
    percentualRateioAtual: 100 - contrato.percentual_aluguel_efetivo,
    despesaMediaMensal,
    saldoAcumulado: dss.saldoValor,
    mesesAmortizacao,
    valorMensalVigente,
    percentualRateioSugerido,
    percentualAluguelEfetivoSugerido: 100 - percentualRateioSugerido,
  };
}

/** Grava o novo percentual — decisão explícita do usuário, nunca automática. */
export function aplicarAjusteRateio(db: Database, contratoId: number, novoPercentualAluguelEfetivo: number): void {
  executar(db, "UPDATE contratos_locacao SET percentual_aluguel_efetivo = ? WHERE id = ?", [novoPercentualAluguelEfetivo, contratoId]);
}
