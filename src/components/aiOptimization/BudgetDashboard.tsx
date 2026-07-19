import { useEffect, useState } from 'react'
import { budgetTracking } from '../../services/budgetTracking'
import './BudgetDashboard.css'

export function BudgetDashboard() {
  const [status, setStatus] = useState<any>(null)
  const [byProvider, setByProvider] = useState<Record<string, number>>({})
  const [trend, setTrend] = useState<any[]>([])

  useEffect(() => {
    const updateAll = () => {
      setStatus(budgetTracking.getStatus())
      setByProvider(budgetTracking.getCostByProvider())
      setTrend(budgetTracking.getTrendLast7Days())
    }

    updateAll()
    const interval = setInterval(updateAll, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  if (!status) return <div>Carregando...</div>

  const getStatusColor = () => {
    switch (status.status) {
      case 'normal':
        return '#4caf50'
      case 'warning':
        return '#ff9800'
      case 'critical':
        return '#f44336'
      case 'over_budget':
        return '#d32f2f'
      default:
        return '#2196f3'
    }
  }

  const getStatusText = () => {
    switch (status.status) {
      case 'normal':
        return '✅ Normal'
      case 'warning':
        return '🟡 Aviso'
      case 'critical':
        return '🔴 Crítico'
      case 'over_budget':
        return '💔 Orçamento Ultrapassado'
      default:
        return '❓ Desconhecido'
    }
  }

  return (
    <div className="budget-dashboard">
      <h2>💰 Budget Tracking & Cost Control</h2>

      {/* Main Status Card */}
      <div className="budget-main-card" style={{ borderLeftColor: getStatusColor() }}>
        <div className="status-header">
          <h3>Orçamento do Mês</h3>
          <span className="status-badge" style={{ backgroundColor: getStatusColor() }}>
            {getStatusText()}
          </span>
        </div>

        <div className="budget-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, status.percentageUsed)}%`,
                backgroundColor: getStatusColor(),
              }}
            />
          </div>
          <span className="progress-text">{status.percentageUsed}% utilizado</span>
        </div>

        <div className="budget-metrics">
          <div className="metric">
            <span className="label">Gasto</span>
            <span className="value">${status.spent.toFixed(2)}</span>
          </div>
          <div className="metric">
            <span className="label">Orçamento</span>
            <span className="value">${status.budget.toFixed(2)}</span>
          </div>
          <div className="metric">
            <span className="label">Restante</span>
            <span className="value" style={{ color: status.isOverBudget ? '#f44336' : '#4caf50' }}>
              ${status.remaining.toFixed(2)}
            </span>
          </div>
          <div className="metric">
            <span className="label">Projeção Final</span>
            <span className="value" style={{ color: status.projectedEnd > status.budget ? '#f44336' : '#2196f3' }}>
              ${status.projectedEnd.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* By Provider */}
      <div className="section">
        <h3>📊 Custo por Provider</h3>
        <div className="provider-breakdown">
          {Object.entries(byProvider).length > 0 ? (
            Object.entries(byProvider)
              .sort(([, a], [, b]) => b - a)
              .map(([provider, cost]) => (
                <div key={provider} className="breakdown-item">
                  <span className="provider-name">{provider}</span>
                  <div className="cost-bar">
                    <div
                      className="cost-fill"
                      style={{ width: `${(cost / status.spent) * 100}%` }}
                    />
                  </div>
                  <span className="cost-value">${cost.toFixed(2)}</span>
                  <span className="cost-percent">
                    ({((cost / status.spent) * 100).toFixed(0)}%)
                  </span>
                </div>
              ))
          ) : (
            <div className="empty-state">Sem dados ainda</div>
          )}
        </div>
      </div>

      {/* Trend Last 7 Days */}
      <div className="section">
        <h3>📈 Tendência (Últimos 7 Dias)</h3>
        <div className="trend-container">
          {trend.length > 0 ? (
            <div className="trend-chart">
              {trend.map(({ date, cost }) => {
                const maxCost = Math.max(...trend.map((t: any) => t.cost), 1)
                const heightPercent = (cost / maxCost) * 100
                return (
                  <div key={date} className="trend-bar-wrapper">
                    <div
                      className="trend-bar"
                      style={{ height: `${heightPercent}%` }}
                      title={`${date}: $${cost.toFixed(2)}`}
                    />
                    <span className="trend-date">{date.split('-').slice(1).join('/')}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">Sem dados de tendência ainda</div>
          )}
        </div>
      </div>

      {/* Daily Average */}
      {trend.length > 0 && (
        <div className="section stats-row">
          <div className="stat-box">
            <span className="stat-label">Média Diária</span>
            <span className="stat-value">
              ${(trend.reduce((sum: number, t: any) => sum + t.cost, 0) / trend.length).toFixed(2)}
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Dia com Maior Gasto</span>
            <span className="stat-value">
              ${Math.max(...trend.map((t: any) => t.cost)).toFixed(2)}
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Total 7 Dias</span>
            <span className="stat-value">
              ${trend.reduce((sum: number, t: any) => sum + t.cost, 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Warning Box */}
      {status.isOverBudget && (
        <div className="alert-box alert-error">
          <strong>⚠️ Orçamento ultrapassado!</strong>
          <p>Você já gastou ${(status.spent - status.budget).toFixed(2)} acima do orçamento.</p>
          <p>Considere limitar novas chamadas de IA ou aumentar o orçamento para próximo mês.</p>
        </div>
      )}

      {status.status === 'critical' && !status.isOverBudget && (
        <div className="alert-box alert-warning">
          <strong>🟡 Nível crítico do orçamento!</strong>
          <p>Você está usando {status.percentageUsed}% do seu orçamento mensal.</p>
          <p>Você tem apenas ${status.remaining.toFixed(2)} restante.</p>
        </div>
      )}

      {status.projectedEnd > status.budget && status.status !== 'over_budget' && (
        <div className="alert-box alert-info">
          <strong>📊 Alerta de Projeção</strong>
          <p>Com o padrão atual de gastos, você deverá chegar a ${status.projectedEnd.toFixed(2)} até o final do mês.</p>
          <p>Isso é ${(status.projectedEnd - status.budget).toFixed(2)} acima do orçamento.</p>
        </div>
      )}
    </div>
  )
}
