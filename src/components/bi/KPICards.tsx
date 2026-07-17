import type { KPIMetric } from '../../types/financial'
import './KPICards.css'

interface KPICardsProps {
  kpis: KPIMetric[]
}

export function KPICards({ kpis }: KPICardsProps) {
  const formatValue = (metric: KPIMetric): string => {
    if (metric.format === 'currency') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      }).format(metric.value)
    }

    if (metric.format === 'percentage') {
      return `${metric.value.toFixed(1)}%`
    }

    return metric.value.toFixed(0)
  }

  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral'): string => {
    switch (trend) {
      case 'up':
        return '📈'
      case 'down':
        return '📉'
      default:
        return '➡️'
    }
  }

  const getStatusColor = (status?: 'good' | 'warning' | 'critical'): string => {
    switch (status) {
      case 'good':
        return '#4caf50'
      case 'warning':
        return '#ff9800'
      case 'critical':
        return '#f44336'
      default:
        return '#2196f3'
    }
  }

  return (
    <div className="kpi-cards-container">
      {kpis.map((metric) => (
        <div
          key={metric.label}
          className={`kpi-card kpi-${metric.status || 'good'}`}
          style={{ borderLeftColor: getStatusColor(metric.status) }}
        >
          <div className="kpi-header">
            <span className="kpi-label">{metric.label}</span>
            {metric.trend && <span className="kpi-trend">{getTrendIcon(metric.trend)}</span>}
          </div>

          <div className="kpi-value">{formatValue(metric)}</div>

          {metric.previousValue !== undefined && (
            <div className="kpi-comparison">
              <span className="comparison-label">vs. período anterior:</span>
              <span className="comparison-value">
                {metric.previousValue > metric.value ? '-' : '+'}
                {Math.abs(
                  ((metric.value - metric.previousValue) / metric.previousValue) * 100
                ).toFixed(1)}
                %
              </span>
            </div>
          )}

          <div className={`kpi-status kpi-status-${metric.status || 'good'}`}>
            {metric.status === 'good' && '✅ Saudável'}
            {metric.status === 'warning' && '⚠️ Atenção'}
            {metric.status === 'critical' && '🔴 Crítico'}
          </div>
        </div>
      ))}
    </div>
  )
}
