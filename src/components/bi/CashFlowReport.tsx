import type { FinancialData } from '../../types/financial'
import { ReportGenerator } from '../../services/bi/reportGenerator'
import './FinancialReports.css'

interface CashFlowReportProps {
  data: FinancialData
}

export function CashFlowReport({ data }: CashFlowReportProps) {
  const cashFlow = ReportGenerator.generateCashFlow(data, data.period)

  const operatingFlow = cashFlow
    .filter((item) => item.category === 'FLUXO DE CAIXA OPERACIONAL')
    .find((item) => item.subcategory === 'Subtotal')?.amount || 0

  const investingFlow = cashFlow
    .filter((item) => item.category === 'FLUXO DE CAIXA DE INVESTIMENTO')
    .find((item) => item.subcategory === 'Subtotal')?.amount || 0

  const financingFlow = cashFlow
    .filter((item) => item.category === 'FLUXO DE CAIXA DE FINANCIAMENTO')
    .find((item) => item.subcategory === 'Subtotal')?.amount || 0

  const netCashFlow = operatingFlow + investingFlow + financingFlow

  const handleExport = () => {
    const csv = ReportGenerator.exportAsCSV('cash_flow', data, data.period)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `FluxoCaixa_${data.period}.csv`)
    link.click()
  }

  return (
    <div className="financial-report">
      <div className="report-header">
        <h3>💧 Fluxo de Caixa</h3>
        <button onClick={handleExport} className="export-btn">
          📥 Exportar CSV
        </button>
      </div>

      <div className="report-container">
        <table className="report-table cashflow-table">
          <thead>
            <tr>
              <th>Categoria</th>
              <th className="number">Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            {/* Operating Cash Flow */}
            <tr className="category-header">
              <td colSpan={2}>FLUXO DE CAIXA OPERACIONAL</td>
            </tr>
            {cashFlow
              .filter((item) => item.category === 'FLUXO DE CAIXA OPERACIONAL')
              .map((item, idx) => (
                <tr
                  key={idx}
                  className={item.subcategory === 'Subtotal' ? 'category-subtotal' : 'detail-row'}
                >
                  <td className="description">{item.subcategory}</td>
                  <td className={`number ${item.amount > 0 ? 'positive' : 'negative'}`}>
                    {item.amount.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}

            {/* Investing Cash Flow */}
            <tr className="category-header">
              <td colSpan={2}>FLUXO DE CAIXA DE INVESTIMENTO</td>
            </tr>
            {cashFlow
              .filter((item) => item.category === 'FLUXO DE CAIXA DE INVESTIMENTO')
              .map((item, idx) => (
                <tr
                  key={idx}
                  className={item.subcategory === 'Subtotal' ? 'category-subtotal' : 'detail-row'}
                >
                  <td className="description">{item.subcategory}</td>
                  <td className={`number ${item.amount > 0 ? 'positive' : 'negative'}`}>
                    {item.amount.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}

            {/* Financing Cash Flow */}
            <tr className="category-header">
              <td colSpan={2}>FLUXO DE CAIXA DE FINANCIAMENTO</td>
            </tr>
            {cashFlow
              .filter((item) => item.category === 'FLUXO DE CAIXA DE FINANCIAMENTO')
              .map((item, idx) => (
                <tr
                  key={idx}
                  className={item.subcategory === 'Subtotal' ? 'category-subtotal' : 'detail-row'}
                >
                  <td className="description">{item.subcategory}</td>
                  <td className={`number ${item.amount > 0 ? 'positive' : 'negative'}`}>
                    {item.amount.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}

            {/* Net Change */}
            <tr className="net-change">
              <td>VARIAÇÃO LÍQUIDA DE CAIXA</td>
              <td className={`number ${netCashFlow > 0 ? 'positive' : 'negative'}`}>
                {netCashFlow.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="cashflow-analysis">
          <div className="analysis-box operating">
            <h4>💰 Caixa Operacional</h4>
            <p className={operatingFlow > 0 ? 'positive' : 'negative'}>
              R$ {operatingFlow.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </p>
            <small>{operatingFlow > 0 ? 'Gerando caixa' : 'Consumindo caixa'}</small>
          </div>

          <div className="analysis-box investing">
            <h4>🏗️ Caixa de Investimento</h4>
            <p className={investingFlow > 0 ? 'positive' : 'negative'}>
              R$ {investingFlow.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </p>
            <small>{investingFlow < 0 ? 'Investindo em ativo' : 'Recuperando investimento'}</small>
          </div>

          <div className="analysis-box financing">
            <h4>📊 Caixa de Financiamento</h4>
            <p className={financingFlow > 0 ? 'positive' : 'negative'}>
              R$ {financingFlow.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </p>
            <small>{financingFlow > 0 ? 'Captando recursos' : 'Pagando obrigações'}</small>
          </div>

          <div className="analysis-box net">
            <h4>📈 Fluxo Líquido</h4>
            <p className={netCashFlow > 0 ? 'positive' : 'negative'}>
              R$ {netCashFlow.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </p>
            <small>{netCashFlow > 0 ? 'Caixa aumentou' : 'Caixa diminuiu'}</small>
          </div>
        </div>
      </div>
    </div>
  )
}
