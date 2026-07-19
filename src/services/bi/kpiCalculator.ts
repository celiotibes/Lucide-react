import type { FinancialData } from '../../types/financial'

export class KPICalculator {
  static calculateFromIncomeStatement(data: FinancialData): Record<string, number> {
    return {
      // Profitability Ratios
      grossMargin: (data.grossProfit / data.revenue) * 100,
      operatingMargin: (data.ebitda / data.revenue) * 100,
      netMargin: (data.netIncome / data.revenue) * 100,

      // Absolute Values
      revenue: data.revenue,
      grossProfit: data.grossProfit,
      ebitda: data.ebitda,
      netIncome: data.netIncome,

      // Expense Ratios
      cogsPercentage: (data.cogs / data.revenue) * 100,
      opexPercentage: (data.operatingExpenses / data.revenue) * 100,
      taxRate: (data.taxes / (data.ebitda - data.interest)) * 100,
    }
  }

  // Dynamic thresholds based on industry patterns
  static getHealthStatus(metricName: string, value: number): 'good' | 'warning' | 'critical' {
    const thresholds: Record<string, { good: number; warning: number }> = {
      grossMargin: { good: 40, warning: 20 },
      operatingMargin: { good: 20, warning: 5 },
      netMargin: { good: 15, warning: 5 },
      cogsPercentage: { good: 50, warning: 70 }, // inverted
      opexPercentage: { good: 30, warning: 40 }, // inverted
    }

    const threshold = thresholds[metricName]
    if (!threshold) return 'good'

    if (metricName.includes('Percentage') && metricName.includes('cogs')) {
      // For COGS, lower is better
      return value <= threshold.good ? 'good' : value <= threshold.warning ? 'warning' : 'critical'
    }

    if (metricName.includes('Percentage') && metricName.includes('opex')) {
      // For OpEx, lower is better
      return value <= threshold.good ? 'good' : value <= threshold.warning ? 'warning' : 'critical'
    }

    // For margins, higher is better
    return value >= threshold.good ? 'good' : value >= threshold.warning ? 'warning' : 'critical'
  }

  // Calculate cash conversion cycle (simplified)
  static calculateCashCycle(daysReceivable: number, daysPayable: number): number {
    return daysReceivable - daysPayable
  }

  // Calculate working capital needs
  static calculateWorkingCapitalMetrics(
    currentAssets: number,
    currentLiabilities: number,
    inventory: number
  ): Record<string, number> {
    return {
      workingCapital: currentAssets - currentLiabilities,
      currentRatio: currentAssets / currentLiabilities,
      quickRatio: (currentAssets - inventory) / currentLiabilities,
      workingCapitalPercentage: ((currentAssets - currentLiabilities) / currentAssets) * 100,
    }
  }

  // Liquidity analysis
  static analyzeLiquidity(
    cash: number,
    _debt: number,
    monthlyExpenses: number
  ): {
    liquidityMonths: number
    status: 'healthy' | 'caution' | 'critical'
  } {
    const liquidityMonths = cash / monthlyExpenses
    let status: 'healthy' | 'caution' | 'critical' = 'healthy'

    if (liquidityMonths < 1) status = 'critical'
    else if (liquidityMonths < 3) status = 'caution'

    return { liquidityMonths, status }
  }

  // Benchmark against typical ratios
  static compareToBenchmark(
    actualRatio: number,
    benchmarkRatio: number
  ): {
    variance: number
    status: 'above' | 'aligned' | 'below'
  } {
    const variance = ((actualRatio - benchmarkRatio) / benchmarkRatio) * 100
    let status: 'above' | 'aligned' | 'below' = 'aligned'

    if (variance > 10) status = 'above'
    else if (variance < -10) status = 'below'

    return { variance, status }
  }
}
