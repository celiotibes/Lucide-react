/**
 * Budget Tracking Service - FASE 8
 * Rastreamento de spend vs orçamento e alertas de custo
 */

export interface BudgetConfig {
  monthlyBudgetUSD: number
  warningThreshold: number // Percentual (0-100)
  criticalThreshold: number // Percentual (0-100)
}

interface CostRecord {
  timestamp: Date
  provider: string
  caseOfUse: string
  costUSD: number
}

interface BudgetStatus {
  spent: number
  budget: number
  percentageUsed: number
  remaining: number
  isOverBudget: boolean
  status: 'normal' | 'warning' | 'critical' | 'over_budget'
  projectedEnd: number // Custo projetado para fim do mês
}

class BudgetTrackingService {
  private config: BudgetConfig
  private costRecords: CostRecord[] = []
  private storageKey = 'lucide_budget_tracking'
  private resetDayKey = 'lucide_budget_reset_day'
  private currentMonthKey = 'lucide_budget_current_month'

  constructor(budgetConfig: BudgetConfig = { monthlyBudgetUSD: 55, warningThreshold: 80, criticalThreshold: 95 }) {
    this.config = budgetConfig
    this.loadFromStorage()
    this.ensureMonthReset()
  }

  /**
   * Registrar um custo
   */
  recordCost(provider: string, caseOfUse: string, costUSD: number): void {
    const record: CostRecord = {
      timestamp: new Date(),
      provider,
      caseOfUse,
      costUSD,
    }

    this.costRecords.push(record)

    // Manter últimos 10000 records
    if (this.costRecords.length > 10000) {
      this.costRecords = this.costRecords.slice(-10000)
    }

    this.saveToStorage()
  }

  /**
   * Verificar reset mensal
   */
  private ensureMonthReset(): void {
    const today = new Date()
    const currentMonth = today.getFullYear() * 100 + today.getMonth()
    const storedMonth = localStorage.getItem(this.currentMonthKey)

    if (storedMonth !== currentMonth.toString()) {
      this.costRecords = []
      localStorage.setItem(this.currentMonthKey, currentMonth.toString())
      this.saveToStorage()
    }
  }

  /**
   * Obter status do orçamento
   */
  getStatus(): BudgetStatus {
    const spent = this.getTotalSpent()
    const budget = this.config.monthlyBudgetUSD
    const percentageUsed = (spent / budget) * 100
    const remaining = Math.max(0, budget - spent)
    const isOverBudget = spent > budget

    // Calcular projeção para fim do mês
    const today = new Date()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const dayOfMonth = today.getDate()
    const projectedEnd = (spent / dayOfMonth) * daysInMonth

    // Determinar status
    let status: 'normal' | 'warning' | 'critical' | 'over_budget' = 'normal'
    if (isOverBudget) {
      status = 'over_budget'
    } else if (percentageUsed >= this.config.criticalThreshold) {
      status = 'critical'
    } else if (percentageUsed >= this.config.warningThreshold) {
      status = 'warning'
    }

    return {
      spent: Math.round(spent * 100) / 100,
      budget,
      percentageUsed: Math.round(percentageUsed),
      remaining: Math.round(remaining * 100) / 100,
      isOverBudget,
      status,
      projectedEnd: Math.round(projectedEnd * 100) / 100,
    }
  }

  /**
   * Obter custo total do mês
   */
  private getTotalSpent(): number {
    return this.costRecords.reduce((total, record) => total + record.costUSD, 0)
  }

  /**
   * Obter custo por provider
   */
  getCostByProvider(): Record<string, number> {
    const costs: Record<string, number> = {}

    this.costRecords.forEach(record => {
      if (!costs[record.provider]) {
        costs[record.provider] = 0
      }
      costs[record.provider] += record.costUSD
    })

    return costs
  }

  /**
   * Obter custo por caso de uso
   */
  getCostByCaseOfUse(): Record<string, number> {
    const costs: Record<string, number> = {}

    this.costRecords.forEach(record => {
      if (!costs[record.caseOfUse]) {
        costs[record.caseOfUse] = 0
      }
      costs[record.caseOfUse] += record.costUSD
    })

    return costs
  }

  /**
   * Obter tendência de custo (últimos 7 dias)
   */
  getTrendLast7Days(): { date: string; cost: number }[] {
    const trend: Record<string, number> = {}
    const today = new Date()

    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      trend[dateStr] = 0
    }

    this.costRecords.forEach(record => {
      const dateStr = record.timestamp.toISOString().split('T')[0]
      if (dateStr in trend) {
        trend[dateStr] += record.costUSD
      }
    })

    return Object.entries(trend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({
        date,
        cost: Math.round(cost * 100) / 100,
      }))
  }

  /**
   * Atualizar configuração
   */
  updateConfig(newConfig: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...newConfig }
    localStorage.setItem(this.storageKey, JSON.stringify(this.config))
  }

  /**
   * Reset manual do mês
   */
  resetMonth(): void {
    this.costRecords = []
    const today = new Date()
    const currentMonth = today.getFullYear() * 100 + today.getMonth()
    localStorage.setItem(this.currentMonthKey, currentMonth.toString())
    this.saveToStorage()
  }

  /**
   * Gerar relatório
   */
  generateReport(): string {
    const status = this.getStatus()
    const byProvider = this.getCostByProvider()
    const byCaseOfUse = this.getCostByCaseOfUse()
    const trend = this.getTrendLast7Days()

    const lines = [
      '💰 BUDGET TRACKING REPORT',
      '═'.repeat(60),
      '',
      `Current Month: ${status.spent}/${status.budget} USD (${status.percentageUsed}%)`,
      `Status: ${status.status.toUpperCase()}`,
      `Remaining: $${status.remaining} USD`,
      `Projected End of Month: $${status.projectedEnd} USD`,
      '',
      'Cost by Provider:',
    ]

    for (const [provider, cost] of Object.entries(byProvider)) {
      lines.push(`  ${provider}: $${cost.toFixed(2)} USD`)
    }

    lines.push('', 'Cost by Case of Use:')
    for (const [caseOfUse, cost] of Object.entries(byCaseOfUse)) {
      lines.push(`  ${caseOfUse}: $${cost.toFixed(2)} USD`)
    }

    lines.push('', 'Trend (Last 7 Days):')
    trend.forEach(({ date, cost }) => {
      lines.push(`  ${date}: $${cost.toFixed(2)} USD`)
    })

    return lines.join('\n')
  }

  /**
   * Salvar para localStorage
   */
  private saveToStorage(): void {
    try {
      const data = {
        costRecords: this.costRecords,
        config: this.config,
      }
      localStorage.setItem(this.storageKey, JSON.stringify(data))
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('⚠️ Budget tracking storage quota exceeded')
        this.costRecords = this.costRecords.slice(-5000)
        this.saveToStorage()
      }
    }
  }

  /**
   * Carregar do localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        const data = JSON.parse(stored)
        this.costRecords = data.costRecords || []
        this.config = data.config || this.config
      }
    } catch (error) {
      console.warn('⚠️ Failed to load budget tracking data')
    }
  }
}

export const budgetTracking = new BudgetTrackingService()
