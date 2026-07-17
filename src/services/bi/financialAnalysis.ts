import type { FinancialData, KPIMetric, WaterfallStep } from '../../types/financial'

export class FinancialAnalysisService {
  // Calculate key financial metrics from income statement
  static calculateKPIs(data: FinancialData): KPIMetric[] {
    const grossMargin = (data.grossProfit / data.revenue) * 100
    const operatingMargin = (data.ebitda / data.revenue) * 100
    const netMargin = (data.netIncome / data.revenue) * 100

    return [
      {
        label: 'Faturamento',
        value: data.revenue,
        format: 'currency',
        status: 'good',
      },
      {
        label: 'Lucro Bruto',
        value: data.grossProfit,
        format: 'currency',
        status: grossMargin > 0.4 ? 'good' : 'warning',
      },
      {
        label: 'EBITDA',
        value: data.ebitda,
        format: 'currency',
        status: data.ebitda > 0 ? 'good' : 'critical',
      },
      {
        label: 'Margem Bruta',
        value: grossMargin,
        format: 'percentage',
        status: grossMargin > 40 ? 'good' : 'warning',
      },
      {
        label: 'Margem Operacional',
        value: operatingMargin,
        format: 'percentage',
        status: operatingMargin > 20 ? 'good' : 'warning',
      },
      {
        label: 'Margem Líquida',
        value: netMargin,
        format: 'percentage',
        status: netMargin > 10 ? 'good' : 'warning',
      },
      {
        label: 'Lucro Líquido',
        value: data.netIncome,
        format: 'currency',
        status: data.netIncome > 0 ? 'good' : 'critical',
      },
    ]
  }

  // Generate waterfall chart data for DRE visualization
  static generateWaterfallData(data: FinancialData): WaterfallStep[] {
    const cogsNegative = -data.cogs
    const opexNegative = -data.operatingExpenses
    const interestNegative = -data.interest
    const taxesNegative = -data.taxes

    return [
      { name: 'Receita Bruta', value: data.revenue, isTotal: false },
      { name: 'Custo de Vendas', value: cogsNegative, color: '#e53935' },
      { name: 'Receita Líquida', value: data.revenue + cogsNegative, isTotal: false },
      { name: 'Despesas Operacionais', value: opexNegative, color: '#e53935' },
      { name: 'EBITDA', value: data.ebitda, isTotal: false },
      { name: 'Juros', value: interestNegative, color: '#e53935' },
      { name: 'Impostos', value: taxesNegative, color: '#e53935' },
      { name: 'Lucro Líquido', value: data.netIncome, isTotal: true, color: '#43a047' },
    ]
  }

  // Generate Sankey diagram nodes and links for cash flow
  static generateSankeyData(
    _revenue: number,
    suppliers: number,
    employees: number,
    taxes: number,
    investments: number,
    reserves: number
  ) {
    const nodes = [
      { name: 'Receitas' },
      { name: 'Serviços' },
      { name: 'Fornecedores' },
      { name: 'Funcionários' },
      { name: 'Impostos' },
      { name: 'Investimentos' },
      { name: 'Reservas' },
    ]

    const links = [
      { source: 0, target: 2, value: suppliers },
      { source: 0, target: 3, value: employees },
      { source: 0, target: 4, value: taxes },
      { source: 0, target: 5, value: investments },
      { source: 0, target: 6, value: reserves },
      { source: 1, target: 2, value: suppliers * 0.3 },
      { source: 1, target: 3, value: employees * 0.2 },
    ]

    return { nodes, links }
  }

  // Calculate trend comparison with previous period
  static calculateTrend(current: number, previous: number): number {
    if (previous === 0) return 0
    return ((current - previous) / Math.abs(previous)) * 100
  }

  // Determine status based on margin or profitability
  static getStatusFromMetric(label: string, value: number): 'good' | 'warning' | 'critical' {
    if (label.includes('Margem')) {
      return value > 15 ? 'good' : value > 5 ? 'warning' : 'critical'
    }
    if (label.includes('Lucro') || label.includes('EBITDA')) {
      return value > 0 ? 'good' : value > -100 ? 'warning' : 'critical'
    }
    return 'good'
  }

  // Format currency for display
  static formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  // Format percentage for display
  static formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`
  }
}
