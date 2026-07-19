import { useMemo } from 'react'
import { AnalyticsEngine, type TrendData } from '../../services/bi/analyticsEngine'
import './AnomalyDetectionPanel.css'

interface AnomalyDetectionPanelProps {
  data: TrendData[]
  title?: string
  threshold?: number
}

export function AnomalyDetectionPanel({
  data,
  title = 'Anomaly Detection',
  threshold = 2,
}: AnomalyDetectionPanelProps) {
  const anomalies = useMemo(() => AnalyticsEngine.detectAnomalies(data, threshold), [data, threshold])

  const patterns = useMemo(() => AnalyticsEngine.detectPatterns(data), [data])

  return (
    <div className="anomaly-detection-panel">
      <h3>{title}</h3>

      {anomalies.length > 0 && (
        <div className="anomalies-section">
          <h4>Detected Anomalies ({anomalies.length})</h4>
          <div className="anomalies-list">
            {anomalies.map((anomaly, idx) => (
              <div key={idx} className={`anomaly-card anomaly-${anomaly.severity}`}>
                <div className="anomaly-header">
                  <span className="anomaly-date">{anomaly.date}</span>
                  <span className={`anomaly-badge severity-${anomaly.severity}`}>
                    {anomaly.severity.toUpperCase()}
                  </span>
                </div>
                <div className="anomaly-content">
                  <p className="anomaly-value">
                    Value: <strong>{anomaly.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>
                  </p>
                  <p className="anomaly-range">
                    Expected Range:{' '}
                    <strong>
                      {anomaly.expectedRange[0].toLocaleString('pt-BR', { maximumFractionDigits: 0 })} to{' '}
                      {anomaly.expectedRange[1].toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </strong>
                  </p>
                  <p className="anomaly-message">{anomaly.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {patterns.length > 0 && (
        <div className="patterns-section">
          <h4>Detected Patterns</h4>
          <div className="patterns-list">
            {patterns.map((pattern, idx) => (
              <div key={idx} className="pattern-item">
                <span className="pattern-icon">📊</span>
                <span className="pattern-text">{pattern}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {anomalies.length === 0 && patterns.length === 0 && (
        <div className="no-findings">
          <p>No anomalies or patterns detected. Data appears normal.</p>
        </div>
      )}
    </div>
  )
}
