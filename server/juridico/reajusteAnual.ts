// Calendário do reajuste ANUAL por índice — distinto da renovação
// (server/juridico/renovacaoContratual.ts, ligada a data_fim) e do
// reequilíbrio trienal (Art. 19). Prática padrão de mercado: contratos
// longos (ex.: 30 meses) reajustam a cada 12 meses dentro do próprio prazo,
// não só no fim. Usa contratos.data_ultimo_reajuste como âncora (ou
// data_inicio se o contrato nunca foi reajustado).

const DIAS_AVISO_REAJUSTE_ANUAL = 30;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function calcularProximoReajusteAnual(dataInicio: Date, dataUltimoReajuste: Date | null): Date {
  const base = dataUltimoReajuste ?? dataInicio;
  return new Date(Date.UTC(base.getUTCFullYear() + 1, base.getUTCMonth(), base.getUTCDate()));
}

export interface JanelaReajusteAnual {
  proximoReajuste: Date;
  devidoAgora: boolean;
}

export function calcularJanelaReajusteAnual(
  dataInicio: Date,
  dataUltimoReajuste: Date | null,
  dataReferencia: Date,
): JanelaReajusteAnual {
  const proximoReajuste = calcularProximoReajusteAnual(dataInicio, dataUltimoReajuste);
  const dias = Math.round((proximoReajuste.getTime() - dataReferencia.getTime()) / MS_POR_DIA);
  return { proximoReajuste, devidoAgora: dias <= DIAS_AVISO_REAJUSTE_ANUAL };
}
