/** Normaliza um valor monetário em texto para number, aceitando tanto o formato BR
 * (1.234,56 — ponto de milhar, vírgula decimal) quanto o formato com ponto decimal puro
 * (1234.56, usado por OFX conforme a especificação e por alguns exports CSV). Nunca assume
 * que ponto é sempre separador de milhar: fazer isso incondicionalmente já corrompeu valores
 * de bancos que exportam só "-50.00" (sem vírgula) — ver csv.test.ts. A regra: só trata "."
 * como separador de milhar quando a string também tem vírgula (aí sim ponto não pode ser
 * decimal); sem vírgula, o ponto é sempre o separador decimal. */
export function normalizarValor(bruto: string): number {
  const semSimbolos = bruto.replace(/[^\d.,-]/g, "");
  if (semSimbolos.includes(",")) {
    return parseFloat(semSimbolos.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(semSimbolos);
}
