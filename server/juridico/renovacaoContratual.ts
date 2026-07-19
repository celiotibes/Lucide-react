// Calendário de notificação antecipada de renovação: 60 dias antes de
// `data_fim` para planejamento, 30 dias antes para ajuste no sistema e
// confirmação de novos valores (server/financeiro/calcularReajuste.ts
// calcula a proposta; aqui só decide QUANDO avisar).

const DIAS_PLANEJAMENTO_RENOVACAO = 60;
const DIAS_AJUSTE_RENOVACAO = 30;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface JanelasRenovacao {
  devidoPlanejamento: boolean;
  devidoAjuste: boolean;
}

export function calcularJanelasRenovacao(dataFim: Date, dataReferencia: Date): JanelasRenovacao {
  const dias = Math.round((dataFim.getTime() - dataReferencia.getTime()) / MS_POR_DIA);
  return {
    devidoPlanejamento: dias <= DIAS_PLANEJAMENTO_RENOVACAO,
    devidoAjuste: dias <= DIAS_AJUSTE_RENOVACAO,
  };
}
