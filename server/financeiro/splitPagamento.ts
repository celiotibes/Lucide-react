// Divide um valor entre beneficiários por percentual, sem nunca perder ou
// criar centavos por arredondamento. Esse é um bug clássico de sistemas de
// split: dividir R$100 em 3 partes de 33,33% ingenuamente resulta em
// 33,33 + 33,33 + 33,33 = 99,99 — um centavo desaparece a cada fatura.
// Aqui a distribuição roda inteiramente em centavos (inteiros) usando o
// método dos maiores restos, com uma reconciliação final que garante a
// invariante mais importante: soma dos splits === valor total, sempre.

export interface ParticipacaoSplit {
  beneficiarioId: string;
  /** Fração de 0 a 1 (ex.: 0.12 = 12%). A soma de todas as participações deve ser 1. */
  percentual: number;
}

export interface ResultadoSplit {
  beneficiarioId: string;
  valor: number;
}

const TOLERANCIA_SOMA_PERCENTUAL = 1e-9;

export function calcularSplitPagamento(valorTotal: number, participacoes: ParticipacaoSplit[]): ResultadoSplit[] {
  if (participacoes.length === 0) {
    throw new Error('calcularSplitPagamento requer pelo menos uma participação');
  }
  if (participacoes.some((p) => p.percentual < 0)) {
    throw new Error('Nenhuma participação pode ter percentual negativo');
  }

  const somaPercentuais = participacoes.reduce((acc, p) => acc + p.percentual, 0);
  if (Math.abs(somaPercentuais - 1) > TOLERANCIA_SOMA_PERCENTUAL) {
    throw new Error(`A soma dos percentuais deve ser 1 (100%); recebido ${somaPercentuais}`);
  }

  const totalCentavos = Math.round(valorTotal * 100);

  const brutosCentavos = participacoes.map((p) => p.percentual * totalCentavos);
  const pisos = brutosCentavos.map((b) => Math.floor(b));
  const somaPisos = pisos.reduce((a, b) => a + b, 0);
  const sobra = totalCentavos - somaPisos;

  // Método dos maiores restos: quem perdeu a maior fração no arredondamento
  // para baixo recebe o centavo extra primeiro.
  const ordemPorResto = brutosCentavos
    .map((b, i) => ({ i, resto: b - pisos[i] }))
    .sort((a, b) => b.resto - a.resto);

  const centavosFinal = [...pisos];
  for (let k = 0; k < sobra; k++) {
    centavosFinal[ordemPorResto[k % ordemPorResto.length].i] += 1;
  }

  // Reconciliação final: protege contra qualquer desvio residual de ponto
  // flutuante na soma dos percentuais (a tolerância acima permite um
  // epsilon passar) — a soma dos splits nunca pode divergir do total.
  const somaFinal = centavosFinal.reduce((a, b) => a + b, 0);
  const diferencaResidual = totalCentavos - somaFinal;
  if (diferencaResidual !== 0) {
    centavosFinal[ordemPorResto[0].i] += diferencaResidual;
  }

  return participacoes.map((p, i) => ({
    beneficiarioId: p.beneficiarioId,
    valor: centavosFinal[i] / 100,
  }));
}
