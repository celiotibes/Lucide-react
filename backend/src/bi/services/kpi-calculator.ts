/**
 * KPI Calculator Service
 * Calcula indicadores financeiros a partir de dados brutos
 */

import { Logger } from '../../shared/logger';
import { FinancialMovement, KPI, FinancialKPIs } from '../../types/bi';

export class KPICalculator {
  private logger = Logger.getLogger('KPICalculator');

  /**
   * Calcula todos os KPIs principais
   */
  async calculateAllKPIs(
    movements: FinancialMovement[],
    previousMovements: FinancialMovement[],
    propertyId: string
  ): Promise<FinancialKPIs> {
    this.logger.info('Iniciando cálculo de KPIs', { propertyId });

    const currentMetrics = this.aggregateMovements(movements);
    const previousMetrics = this.aggregateMovements(previousMovements);

    const kpis: FinancialKPIs = {
      grossRevenue: this.createKPI(
        'gross_revenue',
        'Faturamento Bruto',
        currentMetrics.grossRevenue,
        previousMetrics.grossRevenue,
        'currency'
      ),
      netRevenue: this.createKPI(
        'net_revenue',
        'Faturamento Líquido',
        currentMetrics.netRevenue,
        previousMetrics.netRevenue,
        'currency'
      ),
      operationalCosts: this.createKPI(
        'operational_costs',
        'Custos Operacionais',
        currentMetrics.operationalCosts,
        previousMetrics.operationalCosts,
        'currency'
      ),
      ebitda: this.createKPI(
        'ebitda',
        'EBITDA',
        currentMetrics.ebitda,
        previousMetrics.ebitda,
        'currency'
      ),
      profitMargin: this.createKPI(
        'profit_margin',
        'Margem de Lucro',
        currentMetrics.profitMargin,
        previousMetrics.profitMargin,
        'percentage'
      ),
      liquidityCurrent: this.createKPI(
        'liquidity_current',
        'Liquidez Corrente',
        currentMetrics.liquidityCurrent,
        previousMetrics.liquidityCurrent,
        'percentage'
      ),
      cashFlow: this.createKPI(
        'cash_flow',
        'Fluxo de Caixa',
        currentMetrics.cashFlow,
        previousMetrics.cashFlow,
        'currency'
      ),
    };

    this.logger.info('KPIs calculados com sucesso', {
      propertyId,
      ebitda: currentMetrics.ebitda,
      margin: currentMetrics.profitMargin,
    });

    return kpis;
  }

  /**
   * Agregação de movimentações
   */
  private aggregateMovements(movements: FinancialMovement[]) {
    let grossRevenue = 0;
    let deductions = 0;
    let cogs = 0;
    let operationalExpenses = 0;
    let investmentExpenses = 0;

    for (const movement of movements) {
      switch (movement.movementType) {
        case 'revenue':
          grossRevenue += movement.amount;
          break;
        case 'cost':
          cogs += Math.abs(movement.amount);
          break;
        case 'expense':
          if (movement.category === 'operational') {
            operationalExpenses += Math.abs(movement.amount);
          } else {
            investmentExpenses += Math.abs(movement.amount);
          }
          break;
      }
    }

    const netRevenue = grossRevenue - deductions;
    const operationalCosts = cogs + operationalExpenses;
    const ebitda = netRevenue - operationalCosts;
    const profitMargin = netRevenue > 0 ? (ebitda / netRevenue) * 100 : 0;

    // Simulação de indicadores (serão calculados do DB em produção)
    const liquidityCurrent = grossRevenue > 0 ? 1.5 + (Math.random() * 0.5) : 0;
    const cashFlow = ebitda - investmentExpenses;

    return {
      grossRevenue,
      netRevenue,
      cogs,
      operationalExpenses,
      operationalCosts,
      ebitda,
      profitMargin,
      liquidityCurrent,
      cashFlow,
    };
  }

  /**
   * Cria um objeto KPI com tendência
   */
  private createKPI(
    id: string,
    name: string,
    currentValue: number,
    previousValue: number,
    unit: 'currency' | 'percentage' | 'count'
  ): KPI {
    const trendPercentage =
      previousValue !== 0
        ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100
        : 0;

    const trend: 'up' | 'down' | 'stable' =
      trendPercentage > 2 ? 'up' : trendPercentage < -2 ? 'down' : 'stable';

    const status = this.getKPIStatus(name, currentValue, previousValue, trend);

    return {
      id,
      name,
      value: currentValue,
      previousValue,
      unit,
      trend,
      trendPercentage,
      status,
      lastUpdated: new Date(),
    };
  }

  /**
   * Determina o status do KPI (success/warning/danger)
   */
  private getKPIStatus(
    name: string,
    currentValue: number,
    previousValue: number,
    trend: 'up' | 'down' | 'stable'
  ): 'success' | 'warning' | 'danger' | 'neutral' {
    // Lógica de status baseada no tipo de KPI
    if (name.includes('EBITDA') || name.includes('Faturamento') || name.includes('Lucro')) {
      if (currentValue > previousValue * 1.1) return 'success';
      if (currentValue < previousValue * 0.9) return 'danger';
      return 'neutral';
    }

    if (name.includes('Custos') || name.includes('Despesas')) {
      if (currentValue < previousValue * 0.9) return 'success';
      if (currentValue > previousValue * 1.1) return 'danger';
      return 'neutral';
    }

    if (name.includes('Margem') || name.includes('Liquidez')) {
      if (currentValue > 70) return 'success';
      if (currentValue < 40) return 'danger';
      return 'warning';
    }

    return 'neutral';
  }

  /**
   * Calcula análise de cascata (Waterfall) para DRE
   */
  calculateWaterfallData(movements: FinancialMovement[]) {
    const metrics = this.aggregateMovements(movements);

    return {
      stages: [
        { name: 'Faturamento Bruto', value: metrics.grossRevenue, isTotal: true },
        { name: 'Deduções', value: -50000, color: '#ef4444' },
        { name: 'Faturamento Líquido', value: metrics.netRevenue, isTotal: true },
        { name: 'COGS', value: -metrics.cogs, color: '#ef4444' },
        { name: 'Despesas Operacionais', value: -metrics.operationalExpenses, color: '#ef4444' },
        { name: 'EBITDA', value: metrics.ebitda, isTotal: true, color: '#10b981' },
      ],
    };
  }

  /**
   * Calcula análise Sankey para fluxo de caixa
   */
  calculateSankeyData(movements: FinancialMovement[]) {
    const revenueTotal = movements
      .filter((m) => m.movementType === 'revenue')
      .reduce((sum, m) => sum + m.amount, 0);

    const expensesByCategory = movements
      .filter((m) => m.movementType === 'expense' || m.movementType === 'cost')
      .reduce(
        (acc, m) => {
          const key = m.category || 'other';
          acc[key] = (acc[key] || 0) + Math.abs(m.amount);
          return acc;
        },
        {} as Record<string, number>
      );

    const nodes = [
      { name: 'Receita Total', category: 'revenue' as const },
      ...Object.keys(expensesByCategory).map((cat) => ({
        name: cat,
        category: 'expense' as const,
      })),
    ];

    const links = Object.entries(expensesByCategory).map((entry, index) => ({
      source: 0,
      target: index + 1,
      value: entry[1],
    }));

    return { nodes, links };
  }
}

export function createKPICalculator(): KPICalculator {
  return new KPICalculator();
}
