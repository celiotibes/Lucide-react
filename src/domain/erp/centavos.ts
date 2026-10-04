/** Divide `total` (em reais) proporcionalmente a `pesos` em centavos EXATOS, pelo método do maior resto:
 * a soma das partes é sempre igual ao total (sem sobra nem falta de centavo) e nenhuma parte tem
 * fração de centavo. Empate de resto é decidido pela ordem dos pesos, então o resultado é determinístico.
 * Dividir em ponto flutuante (valor * percentual / 100) gera 333,3333… e o razão recusa. */
export function ratearEmCentavos(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const totalCentavos = Math.round(total * 100);
  if (!Number.isFinite(totalCentavos) || totalCentavos < 0) {
    throw new Error(`Total inválido para rateio: ${total}`);
  }
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  if (!(somaPesos > 0) || pesos.some((p) => p < 0)) {
    throw new Error("Os pesos do rateio precisam ser não negativos e somar mais que zero.");
  }

  const cotas = pesos.map((p) => (totalCentavos * p) / somaPesos);
  const partes = cotas.map(Math.floor);
  let resto = totalCentavos - partes.reduce((a, b) => a + b, 0);

  const ordem = cotas
    .map((c, i) => ({ i, fracao: c - Math.floor(c) }))
    .sort((a, b) => b.fracao - a.fracao || a.i - b.i);
  for (let k = 0; resto > 0; k = (k + 1) % ordem.length, resto--) partes[ordem[k].i] += 1;

  return partes.map((c) => c / 100);
}

/** Arredonda a centavos (meio para cima). Para valores CALCULADOS (depreciação, correção por índice,
 * juros) antes de lançar no razão, que só aceita centavos exatos. Para DIVIDIR um total entre partes,
 * use ratearEmCentavos, que garante que a soma das partes fecha. */
export function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}
