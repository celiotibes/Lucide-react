// Calendário do reequilíbrio contratual trienal (Art. 19, Lei 8.245/91):
// decorridos 3 anos do início do contrato sem acordo entre as partes,
// qualquer uma pode pedir revisão judicial do aluguel para ajustar ao
// preço de mercado. Isso não é uma fórmula — o valor de mercado exige
// avaliação humana (comparáveis de mercado, avaliação profissional) que
// este sistema não calcula. O que é puramente calendário — e por isso cabe
// aqui como função pura — é QUANDO avisar: 90 dias antes do marco para
// planejamento, 30 dias antes para a notificação oficial.
//
// Datas em UTC, mesma convenção do resto do projeto (prorata.ts,
// prazoSla.ts, gerarFaturaMensal.ts).

const DIAS_PLANEJAMENTO_REEQUILIBRIO = 90;
const DIAS_OFICIAL_REEQUILIBRIO = 30;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Marco trienal: o próximo aniversário de 3 anos (a partir de `dataInicio`)
 * que ainda não passou em relação a `dataReferencia`. Art. 19 permite pedir
 * revisão de novo a cada 3 anos, então o marco avança indefinidamente
 * (3, 6, 9... anos) — nunca "some" depois do primeiro ciclo.
 */
export function calcularProximoMarcoTrienal(dataInicio: Date, dataReferencia: Date): Date {
  let marco = new Date(Date.UTC(dataInicio.getUTCFullYear() + 3, dataInicio.getUTCMonth(), dataInicio.getUTCDate()));
  while (marco <= dataReferencia) {
    marco = new Date(Date.UTC(marco.getUTCFullYear() + 3, marco.getUTCMonth(), marco.getUTCDate()));
  }
  return marco;
}

export function diasAteData(alvo: Date, dataReferencia: Date): number {
  return Math.round((alvo.getTime() - dataReferencia.getTime()) / MS_POR_DIA);
}

export interface JanelasReequilibrio {
  marco: Date;
  devidoPlanejamento: boolean;
  devidoOficial: boolean;
}

export function calcularJanelasReequilibrio(dataInicio: Date, dataReferencia: Date): JanelasReequilibrio {
  const marco = calcularProximoMarcoTrienal(dataInicio, dataReferencia);
  const dias = diasAteData(marco, dataReferencia);
  return {
    marco,
    devidoPlanejamento: dias <= DIAS_PLANEJAMENTO_REEQUILIBRIO,
    devidoOficial: dias <= DIAS_OFICIAL_REEQUILIBRIO,
  };
}
