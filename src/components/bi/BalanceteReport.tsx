import { useState } from 'react'
import type { FinancialData } from '../../types/financial'
import { ReportGenerator } from '../../services/bi/reportGenerator'
import './FinancialReports.css'

interface BalanceteReportProps {
  data: FinancialData
}

export function BalanceteReport({ data }: BalanceteReportProps) {
  const [sortBy, setSortBy] = useState<'code' | 'balance'>('code')
  const balancete = ReportGenerator.generateBalancete(data, data.period)

  const sorted = [...balancete].sort((a, b) => {
    if (sortBy === 'code') return a.code.localeCompare(b.code)
    return Math.abs(b.balance) - Math.abs(a.balance)
  })

  const totalDebit = sorted.reduce((sum, item) => sum + item.debit, 0)
  const totalCredit = sorted.reduce((sum, item) => sum + item.credit, 0)
  const totalBalance = sorted.reduce((sum, item) => sum + item.balance, 0)

  const handleExport = () => {
    const csv = ReportGenerator.exportAsCSV('balancete', data, data.period)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `Balancete_${data.period}.csv`)
    link.click()
  }

  return (
    <div className="financial-report">
      <div className="report-header">
        <h3>📋 Balancete de Verificação</h3>
        <div className="report-controls">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="sort-select">
            <option value="code">Ordenar por Código</option>
            <option value="balance">Ordenar por Saldo</option>
          </select>
          <button onClick={handleExport} className="export-btn">
            📥 Exportar CSV
          </button>
        </div>
      </div>

      <div className="report-container">
        <table className="report-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Conta Contábil</th>
              <th className="number">Débito</th>
              <th className="number">Crédito</th>
              <th className="number">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.code} className="table-row">
                <td className="code">{item.code}</td>
                <td className="account">{item.account}</td>
                <td className="number debit">{item.debit.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                <td className="number credit">{item.credit.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                <td className={`number balance ${item.balance > 0 ? 'positive' : 'negative'}`}>
                  {item.balance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={2}>TOTAL</td>
              <td className="number debit total">{totalDebit.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
              <td className="number credit total">{totalCredit.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
              <td className="number balance total">{totalBalance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>

        {Math.abs(totalDebit - totalCredit) < 0.01 && (
          <div className="validation-success">✅ Balancete validado: Débito = Crédito</div>
        )}
        {Math.abs(totalDebit - totalCredit) >= 0.01 && (
          <div className="validation-error">🔴 Balancete desbalanceado: Diferença de {Math.abs(totalDebit - totalCredit).toFixed(2)}</div>
        )}
      </div>
    </div>
  )
}
