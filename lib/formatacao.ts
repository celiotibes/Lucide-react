// Helpers de apresentação para as telas do back-office. Cálculo de verdade
// (juros, split, energia) vive em server/financeiro e server/energia —
// aqui é só formatação para exibição, sem regra de negócio.

export function formatarMoeda(valor: number | string): string {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarData(data: Date | string): string {
  const d = typeof data === 'string' ? new Date(data) : data;
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
