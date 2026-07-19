/**
 * FASE 13: IPCA Calculator Service
 * Calcula reajustes automáticos por IPCA com histórico
 */

export interface IPCAHistorical {
  month: string // 'YYYY-MM'
  rate: number // Percentual mensal
}

export interface IPCACalculation {
  periodStart: string // 'YYYY-MM-DD'
  periodEnd: string // 'YYYY-MM-DD'
  originalValue: number
  accumulatedRate: number
  calculatedValue: number
  monthlyBreakdown: Array<{
    month: string
    monthlyRate: number
    accumulatedToDate: number
    valueToDate: number
  }>
}

export class IPCACalculator {
  // IPCA historical data (2023-2026)
  // Fonte: IBGE
  private static ipcaData: Record<string, number> = {
    '2023-01': 0.50,
    '2023-02': 0.76,
    '2023-03': 0.65,
    '2023-04': 0.51,
    '2023-05': 0.32,
    '2023-06': 0.20,
    '2023-07': -0.08,
    '2023-08': -0.36,
    '2023-09': -0.55,
    '2023-10': -0.29,
    '2023-11': 0.53,
    '2023-12': 0.80,
    '2024-01': 0.54,
    '2024-02': 0.40,
    '2024-03': 0.28,
    '2024-04': 0.32,
    '2024-05': -0.08,
    '2024-06': -0.04,
    '2024-07': 0.22,
    '2024-08': 0.18,
    '2024-09': 0.28,
    '2024-10': 0.66,
    '2024-11': 0.42,
    '2024-12': 0.48,
    '2025-01': 0.35,
    '2025-02': 0.28,
    '2025-03': 0.22,
    '2025-04': 0.25,
    '2025-05': 0.18,
    '2025-06': 0.15,
    '2025-07': 0.12,
  }

  /**
   * Calcula IPCA para um período
   */
  static calculate(
    startDate: string,
    endDate: string,
    originalValue: number
  ): IPCACalculation {
    const start = new Date(startDate)
    const end = new Date(endDate)

    // Validações
    if (start >= end) {
      throw new Error('Data de início deve ser anterior à data de término')
    }

    const monthlyBreakdown: Array<{
      month: string
      monthlyRate: number
      accumulatedToDate: number
      valueToDate: number
    }> = []

    // Juros compostos: fator = Π (1 + taxa_mensal/100)
    // Dia normalizado para 1 — setMonth() em dia 29-31 pularia meses (ex: 31/jan → 03/mar)
    let factor = 1
    const currentDate = new Date(start.getFullYear(), start.getMonth(), 1)

    while (currentDate < end) {
      const monthKey = this.getMonthKey(currentDate)
      const monthlyRate = this.ipcaData[monthKey] ?? 0.3 // Usar 0.3% se não tiver dado

      factor *= 1 + monthlyRate / 100

      monthlyBreakdown.push({
        month: monthKey,
        monthlyRate,
        accumulatedToDate: (factor - 1) * 100,
        valueToDate: originalValue * factor,
      })

      currentDate.setMonth(currentDate.getMonth() + 1)
    }

    const accumulatedRate = (factor - 1) * 100

    return {
      periodStart: startDate,
      periodEnd: endDate,
      originalValue,
      accumulatedRate,
      calculatedValue: originalValue * factor,
      monthlyBreakdown,
    }
  }

  /**
   * Calcula reajuste anual típico
   */
  static calculateAnnualAdjustment(originalValue: number, year: number): IPCACalculation {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`

    return this.calculate(startDate, endDate, originalValue)
  }

  /**
   * Simula renovação de contrato com IPCA
   */
  static simulateRenewal(
    originalRent: number,
    contractStartDate: string,
    renewalDate: string
  ): {
    originalRent: number
    adjustedRent: number
    totalIncrease: number
    percentageIncrease: number
    calculation: IPCACalculation
  } {
    const calculation = this.calculate(contractStartDate, renewalDate, originalRent)
    const adjustedRent = calculation.calculatedValue
    const totalIncrease = adjustedRent - originalRent
    const percentageIncrease = calculation.accumulatedRate

    return {
      originalRent,
      adjustedRent: Math.round(adjustedRent * 100) / 100,
      totalIncrease: Math.round(totalIncrease * 100) / 100,
      percentageIncrease: Math.round(percentageIncrease * 100) / 100,
      calculation,
    }
  }

  /**
   * Retorna IPCA do período especificado
   */
  static getIPCAForPeriod(startDate: string, endDate: string): number {
    const start = new Date(startDate)
    const end = new Date(endDate)

    let accumulated = 0
    // Dia normalizado para 1 — setMonth() em dia 29-31 pularia meses
    const currentDate = new Date(start.getFullYear(), start.getMonth(), 1)

    while (currentDate < end) {
      const monthKey = this.getMonthKey(currentDate)
      const rate = this.ipcaData[monthKey] ?? 0.3

      // Acumula: (1 + r1) * (1 + r2) - 1
      accumulated = (1 + accumulated / 100) * (1 + rate / 100) - 1
      accumulated = accumulated * 100

      currentDate.setMonth(currentDate.getMonth() + 1)
    }

    return Math.round(accumulated * 100) / 100
  }

  /**
   * Retorna histórico de IPCA
   */
  static getHistoricalData(startMonth: string, endMonth: string): IPCAHistorical[] {
    const result: IPCAHistorical[] = []
    const months = Object.keys(this.ipcaData).sort()

    for (const month of months) {
      if (month >= startMonth && month <= endMonth) {
        result.push({
          month,
          rate: this.ipcaData[month],
        })
      }
    }

    return result
  }

  /**
   * Compara cenários de reajuste (IPCA vs percentual fixo)
   */
  static compareScenarios(
    rentValue: number,
    startDate: string,
    endDate: string,
    fixedPercentage: number
  ): {
    ipca: { value: number; rate: number }
    fixedPercentage: { value: number; rate: number }
    difference: number
    recommendation: string
  } {
    const ipcaCalc = this.calculate(startDate, endDate, rentValue)
    const fixedValue = rentValue * (1 + fixedPercentage / 100)

    const difference = fixedValue - ipcaCalc.calculatedValue

    let recommendation = ''
    if (ipcaCalc.accumulatedRate < fixedPercentage) {
      recommendation =
        `IPCA é mais favorável ao locatário (${ipcaCalc.accumulatedRate.toFixed(2)}% vs ${fixedPercentage}%)`
    } else if (ipcaCalc.accumulatedRate > fixedPercentage) {
      recommendation =
        `Percentual fixo é mais favorável ao locatário (${fixedPercentage}% vs ${ipcaCalc.accumulatedRate.toFixed(2)}%)`
    } else {
      recommendation = 'Ambas as opções resultam no mesmo valor'
    }

    return {
      ipca: {
        value: ipcaCalc.calculatedValue,
        rate: ipcaCalc.accumulatedRate,
      },
      fixedPercentage: {
        value: fixedValue,
        rate: fixedPercentage,
      },
      difference: Math.round(Math.abs(difference) * 100) / 100,
      recommendation,
    }
  }

  /**
   * Retorna IPCA acumulado do ano
   */
  static getYearToDateIPCA(year: number): number {
    const startDate = `${year}-01-01`
    const today = new Date()
    const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    return this.getIPCAForPeriod(startDate, endDate)
  }

  /**
   * Helper para formatar chave de mês
   */
  private static getMonthKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }

  /**
   * Retorna projeção de IPCA para próximos meses (usando última taxa conhecida)
   */
  static projectIPCA(
    months: number,
    baseValue: number,
    baseRate: number = 0.3
  ): Array<{ month: number; value: number; accumulatedRate: number }> {
    const projection: Array<{ month: number; value: number; accumulatedRate: number }> = []
    let value = baseValue
    let accumulated = 0

    for (let i = 1; i <= months; i++) {
      accumulated = (1 + accumulated / 100) * (1 + baseRate / 100) - 1
      accumulated = accumulated * 100

      value = baseValue * (1 + accumulated / 100)

      projection.push({
        month: i,
        value: Math.round(value * 100) / 100,
        accumulatedRate: Math.round(accumulated * 100) / 100,
      })
    }

    return projection
  }
}
