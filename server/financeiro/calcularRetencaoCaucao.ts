// Retenção do caução na vistoria de saída: o valor do caução cobre os
// danos apurados no checklist até seu próprio limite; o que sobra do
// caução volta ao inquilino, e o que faltar (danos além do caução) vira
// saldo devedor — que vira confissão de dívida
// (server/integracao/concluirVistoriaSaida.ts), não é perdoado nem
// inventado como "resolvido" automaticamente.

export interface ResultadoRetencaoCaucao {
  valorCaucao: number;
  totalDanos: number;
  valorRetido: number;
  valorDevolvido: number;
  saldoDevedor: number;
}

export function calcularRetencaoCaucao(valorCaucao: number, totalDanos: number): ResultadoRetencaoCaucao {
  if (valorCaucao < 0) {
    throw new Error('valorCaucao não pode ser negativo');
  }
  if (totalDanos < 0) {
    throw new Error('totalDanos não pode ser negativo');
  }

  const valorRetido = Math.min(valorCaucao, totalDanos);
  const valorDevolvido = arredondar(valorCaucao - valorRetido);
  const saldoDevedor = arredondar(totalDanos - valorRetido);

  return {
    valorCaucao,
    totalDanos,
    valorRetido: arredondar(valorRetido),
    valorDevolvido,
    saldoDevedor,
  };
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
