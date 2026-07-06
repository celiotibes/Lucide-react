import { useEffect, useState } from 'react'
import { useAIProvider } from '../../hooks/useAIProvider'
import './AIProviderStats.css'

export function AIProviderStats() {
  const { getStats } = useAIProvider()
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    setStats(getStats())
    const interval = setInterval(() => setStats(getStats()), 5000)
    return () => clearInterval(interval)
  }, [getStats])

  if (!stats) return <div>Carregando...</div>

  return (
    <div className="ai-provider-stats">
      <h2>💰 AI Provider Optimization Stats</h2>

      {/* Summary */}
      <div className="stats-summary">
        <div className="stat-card">
          <span className="label">Total de Chamadas</span>
          <span className="value">{stats.totalCalls}</span>
        </div>
        <div className="stat-card highlight">
          <span className="label">Custo Total (USD)</span>
          <span className="value">${stats.totalCostUSD.toFixed(4)}</span>
        </div>
        <div className="stat-card">
          <span className="label">Latência Média</span>
          <span className="value">{Math.round(stats.avgLatencyMs)}ms</span>
        </div>
      </div>

      {/* By Provider */}
      <div className="section">
        <h3>📊 Por Provider</h3>
        <div className="provider-grid">
          {Object.entries(stats.byProvider).map(([provider, data]: any) => (
            <div key={provider} className="provider-card">
              <h4>{provider.toUpperCase()}</h4>
              <p>Chamadas: <strong>{data.calls}</strong></p>
              <p>Custo: <strong>${data.cost.toFixed(4)}</strong></p>
            </div>
          ))}
        </div>
      </div>

      {/* By Case of Use */}
      <div className="section">
        <h3>🎯 Por Caso de Uso</h3>
        <div className="usecase-table">
          <table>
            <thead>
              <tr>
                <th>Caso de Uso</th>
                <th>Chamadas</th>
                <th>Custo USD</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.byCaseOfUse).map(([usecase, data]: any) => (
                <tr key={usecase}>
                  <td>{usecase}</td>
                  <td>{data.calls}</td>
                  <td>${data.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Savings Calculator */}
      <div className="section savings">
        <h3>💡 Economias vs Stack Anterior</h3>
        <div className="savings-calc">
          <p>Custo Anterior (Claude tudo): ~$190/mês</p>
          <p>Custo Novo Estimado: ${(stats.totalCostUSD * 30).toFixed(2)}/mês</p>
          <p className="savings-amount">
            💰 Economia: ${(190 - (stats.totalCostUSD * 30)).toFixed(2)}/mês
          </p>
        </div>
      </div>
    </div>
  )
}
