import { useEffect, useState } from 'react'
import { useAIProvider } from '../../hooks/useAIProvider'
import { aiProviderCache } from '../../services/aiProviderCache'
import { aiProviderMonitoring } from '../../services/aiProviderMonitoring'
import './AIProviderStats.css'

export function AIProviderStats() {
  const { getStats, getHealth } = useAIProvider()
  const [stats, setStats] = useState<any>(null)
  const [cacheMetrics, setCacheMetrics] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [recentAlerts, setRecentAlerts] = useState<string[]>([])

  useEffect(() => {
    const updateAll = () => {
      setStats(getStats())
      setCacheMetrics(aiProviderCache.getMetrics())
      setHealth(getHealth())
      setRecentAlerts(aiProviderMonitoring.getRecentAlerts(5))
    }

    updateAll()
    const interval = setInterval(updateAll, 5000)
    return () => clearInterval(interval)
  }, [getStats, getHealth])

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

      {/* Cache Statistics */}
      {cacheMetrics && (
        <div className="section">
          <h3>💾 Cache Intelligence</h3>
          <div className="cache-stats">
            <div className="stat-card">
              <span className="label">Taxa de Acerto</span>
              <span className="value">{cacheMetrics.hitRate.toFixed(1)}%</span>
            </div>
            <div className="stat-card">
              <span className="label">Economias em Cache</span>
              <span className="value">${cacheMetrics.totalSavings.toFixed(4)}</span>
            </div>
            <div className="stat-card">
              <span className="label">Entradas em Cache</span>
              <span className="value">{Object.keys(cacheMetrics.hitsByCase).reduce((sum, k) => sum + cacheMetrics.hitsByCase[k], 0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Provider Health */}
      {health && (
        <div className="section">
          <h3>🏥 Saúde dos Providers</h3>
          <div className="health-grid">
            {health.map((h: any) => (
              <div key={h.provider} className={`health-card status-${h.status}`}>
                <h4>{h.provider.toUpperCase()}</h4>
                <p>Status: <strong>{h.status}</strong></p>
                <p>Taxa de Sucesso: <strong>{(h.successRate * 100).toFixed(0)}%</strong></p>
                <p>Qualidade Média: <strong>{h.avgQuality.toFixed(0)}/100</strong></p>
                <p>Latência Média: <strong>{h.avgLatency.toFixed(0)}ms</strong></p>
                {h.recentErrors > 0 && <p className="errors">⚠️ Erros Recentes: {h.recentErrors}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Alerts */}
      {recentAlerts.length > 0 && (
        <div className="section">
          <h3>⚠️ Alertas Recentes</h3>
          <div className="alerts-list">
            {recentAlerts.map((alert, i) => (
              <div key={i} className="alert-item">
                {alert}
              </div>
            ))}
          </div>
        </div>
      )}

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
