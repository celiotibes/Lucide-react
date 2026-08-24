/**
 * Payment Calculation Service
 * Cálculos de multa e juros de mora conforme Lei 8.245/91
 * Requisito: Cláusula Quinta - "Multa de 1% (um por cento) ao mês"
 */

export class PaymentCalculationService {
  /**
   * Calcular multa por atraso conforme Lei 8.245/91
   * Multa: 1% ao mês sobre o ALUGUEL EFETIVO (não inclui taxa de administração)
   * Juros de mora: 0.05% ao dia
   */
  calculateLateFeeAndInterest(
    aluguelEfetivo: number,
    daysLate: number
  ): {
    fine: number; // Multa (1% ao mês)
    interest: number; // Juros de mora (0.05% ao dia)
    total: number; // Total (multa + juros)
  } {
    const FINE_PERCENTAGE_MONTHLY = 0.01; // 1% ao mês
    const INTEREST_PERCENTAGE_DAILY = 0.0005; // 0.05% ao dia

    // Calcular multa por mês de atraso
    // 1% ao mês = ~0.033% ao dia
    const monthsLate = daysLate / 30;
    const fine = aluguelEfetivo * FINE_PERCENTAGE_MONTHLY * monthsLate;

    // Calcular juros de mora (0.05% ao dia)
    const interest = aluguelEfetivo * INTEREST_PERCENTAGE_DAILY * daysLate;

    // Total é a soma (não é composto)
    const total = fine + interest;

    return {
      fine: Math.round(fine * 100) / 100, // Arredondar para 2 casas decimais
      interest: Math.round(interest * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  /**
   * Calcular multa máxima (não pode exceder 20% do aluguel)
   * Proteção ao inquilino conforme jurisprudência
   */
  calculateMaxFine(aluguelEfetivo: number): number {
    const MAX_FINE_PERCENTAGE = 0.2; // 20% é o máximo admitido
    return Math.round(aluguelEfetivo * MAX_FINE_PERCENTAGE * 100) / 100;
  }

  /**
   * Aplicar limite de multa (20% máximo)
   */
  applyFineLimit(totalFine: number, aluguelEfetivo: number): number {
    const maxFine = this.calculateMaxFine(aluguelEfetivo);
    return Math.min(totalFine, maxFine);
  }

  /**
   * Calcular débito total (principal + multa + juros)
   */
  calculateTotalDebt(
    aluguelEfetivo: number,
    cotaCusteio: number,
    daysLate: number
  ): {
    principal: number; // Aluguel + taxa de administração
    fine: number; // Multa (1% ao mês)
    interest: number; // Juros de mora (0.05% ao dia)
    total: number; // Total
  } {
    const principal = aluguelEfetivo + cotaCusteio;
    const { fine, interest, total: fineAndInterest } = this.calculateLateFeeAndInterest(
      aluguelEfetivo,
      daysLate
    );

    const appliedFine = this.applyFineLimit(fine, aluguelEfetivo);
    const totalDebt = principal + appliedFine + interest;

    return {
      principal: Math.round(principal * 100) / 100,
      fine: Math.round(appliedFine * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      total: Math.round(totalDebt * 100) / 100,
    };
  }

  /**
   * Validar se multa não excede limite legal
   */
  isFineWithinLimits(totalFine: number, aluguelEfetivo: number): boolean {
    const maxFine = this.calculateMaxFine(aluguelEfetivo);
    return totalFine <= maxFine;
  }

  /**
   * Calcular descontos / abatimentos
   * (aplicado quando parcial pago)
   */
  calculateDiscount(
    totalDebt: number,
    daysLateAtPayment: number,
    daysLateAtAgreement: number
  ): number {
    // Se pagar antes de completar 30 dias, abater proporcionalmente a multa
    if (daysLateAtPayment < 30) {
      const proportion = (30 - daysLateAtPayment) / 30;
      // Abater proporção da multa (não abater juros de mora já acumulados)
      return 0; // Por simplicidade, sem abatimento automático
    }

    return 0;
  }

  /**
   * Informação resumida de cálculo para recibos/notificações
   */
  generateCalculationSummary(
    aluguelEfetivo: number,
    cotaCusteio: number,
    daysLate: number
  ): string {
    const debt = this.calculateTotalDebt(aluguelEfetivo, cotaCusteio, daysLate);

    return `
RESUMO DO CÁLCULO (Lei 8.245/91 - Cláusula Quinta):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Principal (Aluguel + Taxa):      R$ ${debt.principal.toFixed(2)}
Multa (1% ao mês):                R$ ${debt.fine.toFixed(2)}
Juros de Mora (0.05% ao dia):     R$ ${debt.interest.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL DEVIDO:                      R$ ${debt.total.toFixed(2)}
(${daysLate} dias de atraso)
    `;
  }
}
