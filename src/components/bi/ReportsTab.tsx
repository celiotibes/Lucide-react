import { useState } from 'react'
import type { FinancialData } from '../../types/financial'
import { BalanceteReport } from './BalanceteReport'
import { IncomeStatementReport } from './IncomeStatementReport'
import { CashFlowReport } from './CashFlowReport'
import './ReportsTab.css'

interface ReportsTabProps {
  data: FinancialData
}

export function ReportsTab({ data }: ReportsTabProps) {
  const [activeReport, setActiveReport] = useState<'balancete' | 'dre' | 'cashflow'>('dre')

  return (
    <div className="reports-tab">
      <div className="reports-nav">
        <button
          className={`report-tab ${activeReport === 'balancete' ? 'active' : ''}`}
          onClick={() => setActiveReport('balancete')}
        >
          📋 Balancete
        </button>
        <button
          className={`report-tab ${activeReport === 'dre' ? 'active' : ''}`}
          onClick={() => setActiveReport('dre')}
        >
          📊 DRE
        </button>
        <button
          className={`report-tab ${activeReport === 'cashflow' ? 'active' : ''}`}
          onClick={() => setActiveReport('cashflow')}
        >
          💧 Fluxo de Caixa
        </button>
      </div>

      <div className="report-content">
        {activeReport === 'balancete' && <BalanceteReport data={data} />}
        {activeReport === 'dre' && <IncomeStatementReport data={data} />}
        {activeReport === 'cashflow' && <CashFlowReport data={data} />}
      </div>
    </div>
  )
}
