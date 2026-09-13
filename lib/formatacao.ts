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

/** Data + hora — usado onde a hora importa de verdade (ex.: prazo de SLA de poucas horas, não só o dia). */
export function formatarDataHora(data: Date | string): string {
  const d = typeof data === 'string' ? new Date(data) : data;
  return d.toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
}
