import type { FactBalancete, StarSchemaDatabase } from '../../types/starSchema'

export interface TrendData {
  period: string
  value: number
  percentChange?: number
}

export interface Anomaly {
  date: string
  value: number
  expectedRange: [number, number]
  severity: 'low' | 'medium' | 'high'
  message: string
}

export interface PeriodComparison {
  period1: string
  period2: string
  metric: string
  value1: number
  value2: number
  change: number
  percentChange: number
  trend: 'increase' | 'decrease' | 'stable'
}

export interface TrendForecast {
  period: string
  predicted: number
  confidence: number
}

export class AnalyticsEngine {
  // Calculate 12-month trends for a metric
  static calculateTrends(
    facts: FactBalancete[],
    metric: 'debit' | 'credit' | 'balance' = 'balance'
  ): TrendData[] {
    const grouped = this.groupByMonth(facts)
    const months = Array.from(grouped.keys()).sort()

    return months.map((month, idx) => {
      const monthFacts = grouped.get(month) || []
      const value = monthFacts.reduce((sum, f) => {
        if (metric === 'debit') return sum + f.debitAmount
        if (metric === 'credit') return sum + f.creditAmount
        return sum + f.balanceAmount
      }, 0)

      let percentChange: number | undefined
      if (idx > 0) {
        const prevMonth = months[idx - 1]
        const prevFacts = grouped.get(prevMonth) || []
        const prevValue = prevFacts.reduce((sum, f) => {
          if (metric === 'debit') return sum + f.debitAmount
          if (metric === 'credit') return sum + f.creditAmount
          return sum + f.balanceAmount
        }, 0)
        percentChange = prevValue !== 0 ? ((value - prevValue) / Math.abs(prevValue)) * 100 : 0
      }

      return { period: month, value, percentChange }
    })
  }

  // Detect anomalies in data using statistical methods
  static detectAnomalies(data: TrendData[], threshold: number = 2): Anomaly[] {
    if (data.length < 3) return []

    const values = data.map((d) => d.value)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length)

    const anomalies: Anomaly[] = []

    data.forEach((point) => {
      const zScore = Math.abs((point.value - mean) / (std || 1))

      if (zScore > threshold) {
        const lowerBound = mean - threshold * (std || 1)
        const upperBound = mean + threshold * (std || 1)

        let severity: 'low' | 'medium' | 'high' = 'low'
        if (zScore > 3) severity = 'high'
        else if (zScore > 2.5) severity = 'medium'

        anomalies.push({
          date: point.period,
          value: point.value,
          expectedRange: [lowerBound, upperBound],
          severity,
          message: `Value ${point.value.toFixed(0)} is ${zScore.toFixed(1)} standard deviations from mean`,
        })
      }
    })

    return anomalies
  }

  // Compare two periods
  static comparePeriods(
    facts1: FactBalancete[],
    facts2: FactBalancete[],
    metric: 'debit' | 'credit' | 'balance' = 'balance'
  ): PeriodComparison {
    const value1 = this.sumByMetric(facts1, metric)
    const value2 = this.sumByMetric(facts2, metric)
    const change = value2 - value1
    const percentChange = value1 !== 0 ? (change / Math.abs(value1)) * 100 : 0

    const trend: 'increase' | 'decrease' | 'stable' =
      Math.abs(percentChange) < 1 ? 'stable' : percentChange > 0 ? 'increase' : 'decrease'

    return {
      period1: this.getDateRange(facts1),
      period2: this.getDateRange(facts2),
      metric,
      value1,
      value2,
      change,
      percentChange,
      trend,
    }
  }

  // Forecast future values using simple linear regression
  static forecastTrend(data: TrendData[], periodsAhead: number = 3): TrendForecast[] {
    if (data.length < 2) return []

    const values = data.map((d) => d.value)
    const n = values.length
    const xSum = (n * (n + 1)) / 2
    const xSquaredSum = (n * (n + 1) * (2 * n + 1)) / 6
    const ySum = values.reduce((a, b) => a + b, 0)
    const xySum = values.reduce((sum, v, i) => sum + (i + 1) * v, 0)

    const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum)
    const intercept = (ySum - slope * xSum) / n

    const forecasts: TrendForecast[] = []
    const lastIdx = n
    const stdError = this.calculateStdError(values, slope, intercept)

    for (let i = 1; i <= periodsAhead; i++) {
      const predicted = slope * (lastIdx + i) + intercept
      const confidence = Math.max(0, 1 - (stdError / Math.abs(predicted || 1)) * 0.1)

      forecasts.push({
        period: `+${i}`,
        predicted: Math.max(0, predicted),
        confidence,
      })
    }

    return forecasts
  }

  // Calculate financial ratios for analysis
  static calculateRatios(schema: StarSchemaDatabase): Record<string, number> {
    const facts = schema.factBalancete
    if (facts.length === 0) {
      return {
        totalDebit: 0,
        totalCredit: 0,
        balance: 0,
        avgDebit: 0,
        avgCredit: 0,
        volatility: 0,
      }
    }

    const totalDebit = facts.reduce((sum, f) => sum + f.debitAmount, 0)
    const totalCredit = facts.reduce((sum, f) => sum + f.creditAmount, 0)
    const balance = totalDebit - totalCredit
    const avgDebit = totalDebit / facts.length
    const avgCredit = totalCredit / facts.length

    // Volatility: standard deviation of balance changes
    const balances = facts.map((f) => f.balanceAmount)
    const meanBalance = balances.reduce((a, b) => a + b, 0) / balances.length
    const variance = balances.reduce((sq, b) => sq + Math.pow(b - meanBalance, 2), 0) / balances.length
    const volatility = Math.sqrt(variance)

    return {
      totalDebit,
      totalCredit,
      balance,
      avgDebit,
      avgCredit,
      volatility,
    }
  }

  // Find patterns in data
  static detectPatterns(data: TrendData[]): string[] {
    const patterns: string[] = []

    if (data.length < 3) return patterns

    // Check for seasonality
    if (data.length >= 12) {
      const firstQuarter = data.slice(0, 3).reduce((sum, d) => sum + d.value, 0) / 3
      const lastQuarter = data.slice(-3).reduce((sum, d) => sum + d.value, 0) / 3
      const quarterDiff = Math.abs(lastQuarter - firstQuarter) / firstQuarter

      if (quarterDiff > 0.3) {
        patterns.push(
          lastQuarter > firstQuarter
            ? 'Upward seasonal trend detected'
            : 'Downward seasonal trend detected'
        )
      }
    }

    // Check for sustained growth/decline
    let growthMonths = 0
    let declineMonths = 0

    for (let i = 1; i < data.length; i++) {
      if (data[i].value > data[i - 1].value) growthMonths++
      else if (data[i].value < data[i - 1].value) declineMonths++
    }

    const totalMonths = data.length - 1
    if (growthMonths / totalMonths > 0.7) {
      patterns.push('Sustained growth period detected')
    } else if (declineMonths / totalMonths > 0.7) {
      patterns.push('Sustained decline period detected')
    }

    // Check for volatility
    const values = data.map((d) => d.value)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length)
    const cv = (std / Math.abs(mean || 1)) * 100

    if (cv > 30) {
      patterns.push('High volatility detected')
    } else if (cv < 10) {
      patterns.push('Stable period detected')
    }

    return patterns
  }

  // Private helpers
  private static groupByMonth(facts: FactBalancete[]): Map<string, FactBalancete[]> {
    const grouped = new Map<string, FactBalancete[]>()

    facts.forEach((fact) => {
      const key = fact.dateKey.substring(0, 6) // YYYYMM format
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(fact)
    })

    return grouped
  }

  private static sumByMetric(facts: FactBalancete[], metric: 'debit' | 'credit' | 'balance'): number {
    return facts.reduce((sum, f) => {
      if (metric === 'debit') return sum + f.debitAmount
      if (metric === 'credit') return sum + f.creditAmount
      return sum + f.balanceAmount
    }, 0)
  }

  private static getDateRange(facts: FactBalancete[]): string {
    if (facts.length === 0) return 'N/A'
    const dates = facts.map((f) => f.dateKey).sort()
    return `${dates[0]} to ${dates[dates.length - 1]}`
  }

  private static calculateStdError(
    values: number[],
    slope: number,
    intercept: number
  ): number {
    const n = values.length
    const predicted = values.map((_, i) => slope * (i + 1) + intercept)
    const residuals = values.map((v, i) => v - predicted[i])
    const sumSquaredResiduals = residuals.reduce((sum, r) => sum + r * r, 0)
    return Math.sqrt(sumSquaredResiduals / (n - 2 || 1))
  }
}
