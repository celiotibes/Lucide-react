/** Último dia (DD) de um mês no formato YYYY-MM, retornado como YYYY-MM-DD — usado para
 * fechar o intervalo de uma competência mensal em filtros de data (ex: drill-down por mês). */
export function ultimoDiaDoMes(mesIso: string): string {
  const [ano, mes] = mesIso.split("-").map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return `${mesIso}-${String(ultimoDia).padStart(2, "0")}`;
}
