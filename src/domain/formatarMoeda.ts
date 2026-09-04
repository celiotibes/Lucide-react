/** Formata valor em Real (BRL) — usado tanto pelos componentes React quanto pelo gerador
 * de laudo em PDF (por isso mora em domain/, não em components/: não depende de React). */
export function formatarMoeda(valor: number, casasDecimais = 2): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: casasDecimais, minimumFractionDigits: casasDecimais });
}
