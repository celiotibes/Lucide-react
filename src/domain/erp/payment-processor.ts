/**
 * Payment Processor - Service Provider Monthly Payment Calculation
 *
 * Processes work entries and calculates monthly payments for service providers,
 * including:
 * - Weekend and holiday surcharges (15% premium, not just 15% of base)
 * - Overtime compensation (1.1x multiplier per hour, not 0.1x)
 * - Monthly minimum enforcement (8 days required per contract)
 * - Fuel reimbursement (single calculation, no duplication)
 * - Date validation and duplicate detection
 *
 * FIXES APPLIED:
 * L-1: Weekend work now correctly pays base * 1.15 (not just 0.15)
 * L-2: Overtime now correctly pays base * 1.1 * hours (not base * 0.1)
 * L-3: Monthly minimum enforcement now active (8 days default)
 * L-4: Fuel reimbursement calculated once only
 * L-5: Full date validation and duplicate detection implemented
 */

export interface WorkEntry {
  id?: number;
  data: string; // YYYY-MM-DD format
  tipo: 'normal' | 'sabado' | 'domingo' | 'feriado' | 'horas_extras';
  diaria: number;
  horas?: number; // For overtime entries
}

export interface ContractTerms {
  prestador_id: number;
  diaria_base: number;
  minimo_dias_mes: number; // Default: 8
  consumo_combustivel_km?: number;
  valor_combustivel_litro?: number;
  valor_km?: number;
}

export interface MonthlyPaymentSummary {
  prestador_id: number;
  periodo: string; // YYYY-MM
  dias_trabalhados: number;
  valor_base_total: number;
  adicionais_sab_dom_feriado: number;
  valor_horas_extras: number;
  reembolso_combustivel: number;
  total_bruto: number;
  deficiencia_dias: number;
  deficiencia_valor: number;
  total_liquido: number;
  memoria_calculo: string;
}

export interface ValidationResult {
  valido: boolean;
  erros: string[];
  avisos: string[];
}

/**
 * Valida um conjunto de entries de trabalho
 */
export function validarEntradas(
  entries: WorkEntry[],
  periodo: string
): ValidationResult {
  const erros: string[] = [];
  const avisos: string[] = [];
  const datasVistas = new Set<string>();
  const [ano, mes] = periodo.split('-').map(Number);

  for (const entry of entries) {
    // Validar formato de data (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.data)) {
      erros.push(`Data inválida: ${entry.data} (esperado YYYY-MM-DD)`);
      continue;
    }

    const [entAno, entMes, dia] = entry.data.split('-').map(Number);

    // Validar se data está no mês correto
    if (entAno !== ano || entMes !== mes) {
      erros.push(
        `Data ${entry.data} fora do período ${periodo}`
      );
      continue;
    }

    // Validar se dia é válido para o mês
    const dataObj = new Date(entry.data);
    if (dataObj.getMonth() + 1 !== mes || dataObj.getFullYear() !== ano) {
      erros.push(`Data inválida: ${entry.data}`);
      continue;
    }

    // Detectar duplicatas
    if (datasVistas.has(entry.data)) {
      erros.push(`Data duplicada no mesmo período: ${entry.data}`);
    }
    datasVistas.add(entry.data);

    // Avisos sobre valores
    if (entry.diaria < 0) {
      erros.push(`Diária negativa: ${entry.data}`);
    }
    if (entry.tipo === 'horas_extras' && (!entry.horas || entry.horas <= 0)) {
      erros.push(`Horas extras deve ter horas > 0: ${entry.data}`);
    }
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
  };
}

/**
 * Processa o mês e calcula o pagamento total
 *
 * FIXED: All defects L-1 to L-5 now corrected
 * L-1: Weekend work now correctly calculates as base * 1.15
 * L-2: Overtime now correctly adds 1.1x surcharge (not multiplies by 0.1)
 * L-3: Minimum 8 days per month is now enforced
 * L-4: Fuel reimbursement is calculated once only
 * L-5: Full date validation and duplicate detection implemented
 */
export function processarMes(
  entries: WorkEntry[],
  terms: ContractTerms,
  periodo: string
): MonthlyPaymentSummary {
  // Validar entradas (FIX L-5: validation now required)
  const validacao = validarEntradas(entries, periodo);
  if (!validacao.valido) {
    throw new Error(`Validação falhou: ${validacao.erros.join('; ')}`);
  }

  let acumulado = 0;
  let dias_trabalhados = 0;
  let valor_horas_extras = 0;
  let reembolso_combustivel = 0;
  const memoriaDetalhes: string[] = [];

  for (const entry of entries) {
    const diaria = entry.diaria;

    if (entry.tipo === 'normal') {
      acumulado += diaria;
      dias_trabalhados += 1;
      memoriaDetalhes.push(
        `Normal ${entry.data}: R$${diaria.toFixed(2)}`
      );
    } else if (entry.tipo === 'sabado' || entry.tipo === 'domingo' || entry.tipo === 'feriado') {
      // FIX L-1: Changed from * 0.15 to * 1.15
      // Weekend/holiday work: full daily rate + 15% surcharge
      const valor_dia = diaria * 1.15;
      acumulado += valor_dia;
      dias_trabalhados += 1;
      memoriaDetalhes.push(
        `${entry.tipo} ${entry.data}: R$${valor_dia.toFixed(2)} (base + 15%)`
      );
    } else if (entry.tipo === 'horas_extras') {
      const horas = entry.horas || 0;
      // FIX L-2: Changed from * 0.1 to + (diaria * 1.1)
      // Overtime: daily rate multiplied by 1.1 per hour (added separately, not to base)
      const valor_hora_extra = diaria * 1.1 * horas;
      valor_horas_extras += valor_hora_extra;
      dias_trabalhados += 1; // Count overtime days
      memoriaDetalhes.push(
        `Extras ${entry.data} (${horas}h): R$${valor_hora_extra.toFixed(2)} (base * 1.1 * horas)`
      );
    }
  }

  // FIX L-4: Fuel reimbursement now calculated only once from km data
  // No double-counting with separate reembolso_combustivel
  if (terms.valor_km) {
    const km_total = entries
      .filter((e) => (e as any).km_percorrido)
      .reduce((sum, e) => {
        const km = (e as any).km_percorrido || 0;
        return sum + km;
      }, 0);
    reembolso_combustivel = km_total * terms.valor_km;
  }

  const adicionais_sab_dom_feriado = entries
    .filter((e) => ['sabado', 'domingo', 'feriado'].includes(e.tipo))
    .reduce((sum, e) => sum + (e.diaria * 0.15), 0);

  const valor_base_total = acumulado;

  // FIX L-3: Now enforces minimum 8 days per month
  let deficiencia_dias = 0;
  let deficiencia_valor = 0;
  const minimo_dias = terms.minimo_dias_mes || 8;

  if (dias_trabalhados < minimo_dias) {
    deficiencia_dias = minimo_dias - dias_trabalhados;
    deficiencia_valor = deficiencia_dias * terms.diaria_base;
  }

  const total_bruto = valor_base_total + valor_horas_extras + reembolso_combustivel;
  const total_liquido = total_bruto - deficiencia_valor;

  const memoria_calculo = `
Período: ${periodo}
Dias trabalhados: ${dias_trabalhados} (mínimo requerido: ${minimo_dias})
Valor base total: R$${valor_base_total.toFixed(2)}
Adicionais (sab/dom/feriado): R$${adicionais_sab_dom_feriado.toFixed(2)}
Horas extras: R$${valor_horas_extras.toFixed(2)}
Reembolso combustível: R$${reembolso_combustivel.toFixed(2)}
Deficiência (dias): ${deficiencia_dias} dias = R$${deficiencia_valor.toFixed(2)}
TOTAL LÍQUIDO: R$${total_liquido.toFixed(2)}

Detalhes:
${memoriaDetalhes.join('\n')}
  `.trim();

  return {
    prestador_id: terms.prestador_id,
    periodo,
    dias_trabalhados,
    valor_base_total,
    adicionais_sab_dom_feriado,
    valor_horas_extras,
    reembolso_combustivel,
    total_bruto,
    deficiencia_dias,
    deficiencia_valor,
    total_liquido,
    memoria_calculo,
  };
}

/**
 * Calcula pagamento para um trabalho individual
 */
export function calcularTrabalhoDia(
  entry: WorkEntry,
  terms: ContractTerms
): number {
  switch (entry.tipo) {
    case 'normal':
      return entry.diaria;
    case 'sabado':
    case 'domingo':
    case 'feriado':
      // Fixed: should be * 1.15 (15% surcharge), not * 0.15
      return entry.diaria * 1.15;
    case 'horas_extras':
      // Fixed: should add 1.1x, not multiply by 0.1
      const horas = entry.horas || 0;
      return entry.diaria * 1.1 * horas;
    default:
      return 0;
  }
}
