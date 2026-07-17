import type { FinancialData } from '../../types/financial'

export interface BalanceteItem {
  account: string
  code: string
  debit: number
  credit: number
  balance: number
}

export interface DREItem {
  line: string
  amount: number
  percentage: number
  level: 'header' | 'detail' | 'subtotal'
}

export interface CashFlowItem {
  category: string
  subcategory: string
  amount: number
}

export class ReportGenerator {
  // Generate Balancete (Trial Balance)
  static generateBalancete(data: FinancialData, _period: string): BalanceteItem[] {
    const accountsData = [
      {
        account: 'Caixa e Equivalentes',
        code: '1.1.1',
        debit: data.revenue * 0.1,
        credit: 0,
      },
      {
        account: 'Contas a Receber',
        code: '1.1.2',
        debit: data.revenue * 0.3,
        credit: 0,
      },
      {
        account: 'Estoque',
        code: '1.1.3',
        debit: data.cogs * 0.4,
        credit: 0,
      },
      {
        account: 'Imobilizado',
        code: '1.2.1',
        debit: data.revenue * 0.5,
        credit: 0,
      },
      {
        account: 'Contas a Pagar',
        code: '2.1.1',
        debit: 0,
        credit: data.cogs * 0.3,
      },
      {
        account: 'Empréstimos',
        code: '2.1.2',
        debit: 0,
        credit: data.revenue * 0.15,
      },
      {
        account: 'Capital Social',
        code: '3.1.1',
        debit: 0,
        credit: data.revenue * 0.3,
      },
      {
        account: 'Lucros Retidos',
        code: '3.2.1',
        debit: 0,
        credit: data.netIncome * 0.5,
      },
    ]

    return accountsData.map((acc) => ({
      account: acc.account,
      code: acc.code,
      debit: acc.debit,
      credit: acc.credit,
      balance: acc.debit - acc.credit,
    }))
  }

  // Generate Income Statement (DRE)
  static generateIncomeStatement(data: FinancialData, _period: string): DREItem[] {
    const revenue = data.revenue
    const cogs = data.cogs
    const grossProfit = data.grossProfit
    const opex = data.operatingExpenses
    const ebitda = data.ebitda
    const depreciation = data.revenue * 0.02
    const ebit = ebitda - depreciation
    const interest = data.interest
    const taxes = data.taxes
    const netIncome = data.netIncome

    return [
      {
        line: 'RECEITA BRUTA',
        amount: revenue,
        percentage: 100,
        level: 'header',
      },
      {
        line: 'Receita de Serviços',
        amount: revenue,
        percentage: 100,
        level: 'detail',
      },
      {
        line: 'DEDUÇÕES',
        amount: 0,
        percentage: 0,
        level: 'header',
      },
      {
        line: 'Impostos sobre Receita',
        amount: revenue * 0.05,
        percentage: 5,
        level: 'detail',
      },
      {
        line: 'RECEITA LÍQUIDA',
        amount: revenue * 0.95,
        percentage: 95,
        level: 'subtotal',
      },
      {
        line: 'CUSTO DE VENDAS',
        amount: cogs,
        percentage: (cogs / revenue) * 100,
        level: 'detail',
      },
      {
        line: 'LUCRO BRUTO',
        amount: grossProfit,
        percentage: (grossProfit / revenue) * 100,
        level: 'subtotal',
      },
      {
        line: 'DESPESAS OPERACIONAIS',
        amount: opex,
        percentage: (opex / revenue) * 100,
        level: 'header',
      },
      {
        line: 'Salários e Encargos',
        amount: opex * 0.5,
        percentage: (opex * 0.5) / revenue * 100,
        level: 'detail',
      },
      {
        line: 'Aluguel e Condomínio',
        amount: opex * 0.2,
        percentage: (opex * 0.2) / revenue * 100,
        level: 'detail',
      },
      {
        line: 'Outros',
        amount: opex * 0.3,
        percentage: (opex * 0.3) / revenue * 100,
        level: 'detail',
      },
      {
        line: 'EBITDA',
        amount: ebitda,
        percentage: (ebitda / revenue) * 100,
        level: 'subtotal',
      },
      {
        line: 'Depreciação e Amortização',
        amount: depreciation,
        percentage: (depreciation / revenue) * 100,
        level: 'detail',
      },
      {
        line: 'EBIT (Lucro Operacional)',
        amount: ebit,
        percentage: (ebit / revenue) * 100,
        level: 'subtotal',
      },
      {
        line: 'RESULTADO FINANCEIRO',
        amount: -interest,
        percentage: (-interest / revenue) * 100,
        level: 'header',
      },
      {
        line: 'Juros Passivos',
        amount: interest,
        percentage: (interest / revenue) * 100,
        level: 'detail',
      },
      {
        line: 'IMPOSTO DE RENDA',
        amount: taxes,
        percentage: (taxes / revenue) * 100,
        level: 'detail',
      },
      {
        line: 'LUCRO LÍQUIDO',
        amount: netIncome,
        percentage: (netIncome / revenue) * 100,
        level: 'subtotal',
      },
    ]
  }

  // Generate Cash Flow Statement
  static generateCashFlow(data: FinancialData, _period: string): CashFlowItem[] {
    const revenue = data.revenue
    const cogs = data.cogs

    return [
      {
        category: 'FLUXO DE CAIXA OPERACIONAL',
        subcategory: 'Lucro Líquido',
        amount: data.netIncome,
      },
      {
        category: 'FLUXO DE CAIXA OPERACIONAL',
        subcategory: 'Depreciação',
        amount: revenue * 0.02,
      },
      {
        category: 'FLUXO DE CAIXA OPERACIONAL',
        subcategory: 'Mudança em Contas a Receber',
        amount: -revenue * 0.05,
      },
      {
        category: 'FLUXO DE CAIXA OPERACIONAL',
        subcategory: 'Mudança em Estoques',
        amount: -cogs * 0.02,
      },
      {
        category: 'FLUXO DE CAIXA OPERACIONAL',
        subcategory: 'Mudança em Contas a Pagar',
        amount: cogs * 0.03,
      },
      {
        category: 'FLUXO DE CAIXA OPERACIONAL',
        subcategory: 'Subtotal',
        amount: data.netIncome + revenue * 0.02 - revenue * 0.05 - cogs * 0.02 + cogs * 0.03,
      },

      {
        category: 'FLUXO DE CAIXA DE INVESTIMENTO',
        subcategory: 'Aquisição de Imobilizado',
        amount: -revenue * 0.05,
      },
      {
        category: 'FLUXO DE CAIXA DE INVESTIMENTO',
        subcategory: 'Venda de Ativos',
        amount: revenue * 0.01,
      },
      {
        category: 'FLUXO DE CAIXA DE INVESTIMENTO',
        subcategory: 'Subtotal',
        amount: -revenue * 0.04,
      },

      {
        category: 'FLUXO DE CAIXA DE FINANCIAMENTO',
        subcategory: 'Pagamento de Empréstimos',
        amount: -revenue * 0.08,
      },
      {
        category: 'FLUXO DE CAIXA DE FINANCIAMENTO',
        subcategory: 'Dividendos Pagos',
        amount: -data.netIncome * 0.3,
      },
      {
        category: 'FLUXO DE CAIXA DE FINANCIAMENTO',
        subcategory: 'Subtotal',
        amount: -revenue * 0.08 - data.netIncome * 0.3,
      },
    ]
  }

  // Export report to structured object
  static exportReport(
    type: 'balancete' | 'income_statement' | 'cash_flow',
    data: FinancialData,
    period: string
  ): any {
    const reportData: Record<string, any> = {}

    if (type === 'balancete') {
      const balancete = this.generateBalancete(data, period)
      reportData.items = balancete
      reportData.totalDebit = balancete.reduce((sum, item) => sum + item.debit, 0)
      reportData.totalCredit = balancete.reduce((sum, item) => sum + item.credit, 0)
    } else if (type === 'income_statement') {
      const dre = this.generateIncomeStatement(data, period)
      reportData.items = dre
      reportData.revenue = data.revenue
      reportData.netIncome = data.netIncome
    } else if (type === 'cash_flow') {
      const cf = this.generateCashFlow(data, period)
      reportData.items = cf
      reportData.operatingFlow = cf
        .filter((item) => item.category === 'FLUXO DE CAIXA OPERACIONAL')
        .find((item) => item.subcategory === 'Subtotal')?.amount || 0
    }

    return {
      type,
      period,
      data: reportData,
    }
  }

  // Generate CSV export
  static exportAsCSV(
    type: 'balancete' | 'income_statement' | 'cash_flow',
    data: FinancialData,
    period: string
  ): string {
    let csv = ''

    if (type === 'balancete') {
      const balancete = this.generateBalancete(data, period)
      csv = 'Conta,Código,Débito,Crédito,Saldo\n'
      balancete.forEach((item) => {
        csv += `"${item.account}","${item.code}",${item.debit},${item.credit},${item.balance}\n`
      })
    } else if (type === 'income_statement') {
      const dre = this.generateIncomeStatement(data, period)
      csv = 'Linha,Valor,Percentual (%)\n'
      dre.forEach((item) => {
        csv += `"${item.line}",${item.amount},${item.percentage.toFixed(2)}\n`
      })
    } else if (type === 'cash_flow') {
      const cf = this.generateCashFlow(data, period)
      csv = 'Categoria,Subcategoria,Valor\n'
      cf.forEach((item) => {
        csv += `"${item.category}","${item.subcategory}",${item.amount}\n`
      })
    }

    return csv
  }
}
