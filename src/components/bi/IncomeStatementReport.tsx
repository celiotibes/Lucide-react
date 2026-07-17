import type { FinancialData } from '../../types/financial'
import { ReportGenerator } from '../../services/bi/reportGenerator'
import './FinancialReports.css'

interface IncomeStatementReportProps {
  data: FinancialData
}

export function IncomeStatementReport({ data }: IncomeStatementReportProps) {
  const dre = ReportGenerator.generateIncomeStatement(data, data.period)

  const handleExport = () => {
    const csv = ReportGenerator.exportAsCSV('income_statement', data, data.period)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `DRE_${data.period}.csv`)
    link.click()
  }

  const getRowClass = (level: string): string => {
    if (level === 'header') return 'header-row'
    if (level === 'subtotal') return 'subtotal-row'
    return 'detail-row'
  }

  return (
    <div className="financial-report">
      <div className="report-header">
        <h3>📊 Demonstração de Resultado (DRE)</h3>
        <button onClick={handleExport} className="export-btn">
          📥 Exportar CSV
        </button>
      </div>

      <div className="report-container">
        <table className="report-table dre-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th className="number">Valor (R$)</th>
              <th className="number">% Receita</th>
            </tr>
          </thead>
          <tbody>
            {dre.map((item, idx) => (
              <tr key={idx} className={getRowClass(item.level)}>
                <td className={`description ${item.level}`}>{item.line}</td>
                <td className="number">
                  {item.amount.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="number">{item.percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="dre-summary">
          <div className="summary-box">
            <span className="summary-label">Receita Bruta</span>
            <span className="summary-value positive">R$ {data.revenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="summary-box">
            <span className="summary-label">Margem Bruta</span>
            <span className="summary-value">{((data.grossProfit / data.revenue) * 100).toFixed(1)}%</span>
          </div>
          <div className="summary-box">
            <span className="summary-label">EBITDA</span>
            <span className="summary-value">{((data.ebitda / data.revenue) * 100).toFixed(1)}%</span>
          </div>
          <div className="summary-box">
            <span className="summary-label">Margem Líquida</span>
            <span className={`summary-value ${data.netIncome > 0 ? 'positive' : 'negative'}`}>
              {((data.netIncome / data.revenue) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
