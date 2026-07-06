import type { TransacaoBruta } from "./ofx";

// Casa linhas como "05/01/2024 PIX RECEBIDO JOAO SILVA 1.500,00" ou
// "05/01 UBER *TRIP 45,90 D" (fatura de cartão, sem ano, com marcador D/C opcional).
const REGEX_LINHA = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?R?\$?\s?-?[\d.]+,\d{2})\s*([DC])?$/i;

function normalizarValorMonetario(bruto: string): number {
  const limpo = bruto.replace(/R\$/i, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(limpo);
}

function normalizarAno(diaMes: string, anoReferencia: number): string {
  const partes = diaMes.split("/");
  if (partes.length === 3) {
    const ano = partes[2].length === 2 ? `20${partes[2]}` : partes[2];
    return `${ano}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`;
  }
  return `${anoReferencia}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`;
}

/** Extrai lançamentos de um extrato bancário em PDF (linhas com data completa). */
export function extrairLinhasExtrato(linhas: string[], anoReferencia: number): TransacaoBruta[] {
  const transacoes: TransacaoBruta[] = [];
  for (const linha of linhas) {
    const casado = linha.match(REGEX_LINHA);
    if (!casado) continue;
    const [, dataBruta, descricao, valorBruto, marcador] = casado;
    let valor = normalizarValorMonetario(valorBruto);
    if (marcador?.toUpperCase() === "D" && valor > 0) valor = -valor;

    const data = normalizarAno(dataBruta, anoReferencia);
    transacoes.push({ data, valor, descricaoOriginal: descricao.trim(), fitid: `${data}|${valor}|${descricao.trim()}` });
  }
  return transacoes;
}

/** Extrai lançamentos de uma fatura de cartão de crédito (linhas geralmente sem ano;
 * valores são despesas por padrão, exceto quando marcados como pagamento/estorno). */
export function extrairLinhasFatura(linhas: string[], mesReferencia: number, anoReferencia: number): TransacaoBruta[] {
  const transacoes: TransacaoBruta[] = [];
  for (const linha of linhas) {
    const casado = linha.match(REGEX_LINHA);
    if (!casado) continue;
    const [, dataBruta, descricao, valorBruto] = casado;

    const ehCredito = /pagamento|estorno|cr[eé]dito recebido/i.test(descricao);
    let valor = normalizarValorMonetario(valorBruto);
    valor = ehCredito ? Math.abs(valor) : -Math.abs(valor);

    const [diaTx, mesTx] = dataBruta.split("/").map(Number);
    // fatura frequentemente lista dias do mês anterior ao fechamento
    const ano = mesTx > mesReferencia ? anoReferencia - 1 : anoReferencia;
    const data = `${ano}-${String(mesTx).padStart(2, "0")}-${String(diaTx).padStart(2, "0")}`;

    transacoes.push({ data, valor, descricaoOriginal: descricao.trim(), fitid: `${data}|${valor}|${descricao.trim()}` });
  }
  return transacoes;
}
