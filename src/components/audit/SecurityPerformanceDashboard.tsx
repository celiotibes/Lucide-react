/**
 * FASE 12: Security & Performance Dashboard
 * Exibe auditoria de segurança e performance em tempo real
 */

import { useState, useEffect } from 'react'
import { SecurityAudit, type SecurityFinding } from '../../services/securityAudit'
import { PerformanceAudit, type PerformanceMetric } from '../../services/performanceAudit'
import './SecurityPerformanceDashboard.css'

export function SecurityPerformanceDashboard() {
  const [securityFindings, setSecurityFindings] = useState<SecurityFinding[]>([])
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([])
  const [activeTab, setActiveTab] = useState<'security' | 'performance'>('security')
  const [recommendations, setRecommendations] = useState<string[]>([])

  useEffect(() => {
    runAudit()
    // Re-run audit every 30 seconds
    const interval = setInterval(runAudit, 30000)
    return () => clearInterval(interval)
  }, [])

  const runAudit = () => {
    // Security Audit
    const findings: SecurityFinding[] = []

    findings.push(...SecurityAudit.auditLocalStorage())
    findings.push(...SecurityAudit.validateSecurityHeaders({}))

    const memoryMetric = PerformanceAudit.auditMemoryUsage()
    const domMetric = PerformanceAudit.auditDomNodeCount()
    const storageMetric = PerformanceAudit.auditStorageUsage()

    const metrics = [domMetric, storageMetric]
    if (memoryMetric) metrics.push(memoryMetric)

    const perf = PerformanceAudit.auditWebVitals()
    if (perf.lcp) metrics.push(perf.lcp as PerformanceMetric)

    setSecurityFindings(findings)
    setPerformanceMetrics(metrics)
    setRecommendations(PerformanceAudit.getRecommendations())
  }

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return '#f44336'
      case 'high':
        return '#ff9800'
      case 'medium':
        return '#ffc107'
      case 'low':
        return '#4caf50'
      default:
        return '#999'
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'pass':
        return '#4caf50'
      case 'warning':
        return '#ffc107'
      case 'fail':
        return '#f44336'
      default:
        return '#999'
    }
  }

  const criticalCount = securityFindings.filter((f) => f.severity === 'critical').length
  const passCount = performanceMetrics.filter((m) => m.status === 'pass').length

  return (
    <div className="security-performance-dashboard">
      <div className="dashboard-header">
        <h2>🔒 Security & Performance Audit</h2>
        <p>Monitoramento contínuo de segurança e performance</p>

        <div className="summary-cards">
          <div className="summary-card critical">
            <div className="summary-value">{criticalCount}</div>
            <div className="summary-label">Critical Issues</div>
          </div>
          <div className="summary-card success">
            <div className="summary-value">{passCount}</div>
            <div className="summary-label">Metrics Passing</div>
          </div>
          <div className="summary-card info">
            <div className="summary-value">{securityFindings.length}</div>
            <div className="summary-label">Security Findings</div>
          </div>
          <div className="summary-card info">
            <div className="summary-value">{performanceMetrics.length}</div>
            <div className="summary-label">Performance Metrics</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          🔐 Security
        </button>
        <button
          className={`tab-button ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance')}
        >
          ⚡ Performance
        </button>
      </div>

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="tab-content">
          {securityFindings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✅</div>
              <p>Nenhum problema de segurança detectado!</p>
            </div>
          ) : (
            <>
              <div className="findings-list">
                {securityFindings.map((finding, idx) => (
                  <div key={idx} className="finding-item" data-severity={finding.severity}>
                    <div className="finding-header">
                      <div className="severity-badge" style={{ backgroundColor: getSeverityColor(finding.severity) }}>
                        {finding.severity.toUpperCase()}
                      </div>
                      <h4>{finding.category.toUpperCase().replace(/_/g, ' ')}</h4>
                    </div>
                    <p className="finding-description">{finding.description}</p>
                    {finding.location && <p className="finding-location">📍 {finding.location}</p>}
                    {finding.remediation && <p className="finding-remediation">💡 {finding.remediation}</p>}
                  </div>
                ))}
              </div>

              <div className="recommendations">
                <h3>🎯 Recomendações Imediatas</h3>
                <ol>
                  {recommendations.slice(0, 5).map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>
      )}

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <div className="tab-content">
          {performanceMetrics.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <p>Rodando auditoria de performance...</p>
            </div>
          ) : (
            <div className="metrics-grid">
              {performanceMetrics.map((metric, idx) => (
                <div key={idx} className="metric-card" data-status={metric.status}>
                  <div className="metric-header">
                    <h4>{metric.name}</h4>
                    <span
                      className="metric-status"
                      style={{
                        backgroundColor: getStatusColor(metric.status),
                        color: 'white',
                      }}
                    >
                      {metric.status === 'pass' ? '✓' : metric.status === 'warning' ? '⚠' : '✗'}
                    </span>
                  </div>

                  <div className="metric-value">
                    {metric.value.toFixed(2)} <span className="metric-unit">{metric.unit}</span>
                  </div>

                  <div className="metric-threshold">
                    Limite: {metric.threshold} {metric.unit}
                  </div>

                  <div className="metric-bar">
                    <div
                      className="metric-bar-fill"
                      style={{
                        width: `${Math.min((metric.value / metric.threshold) * 100, 100)}%`,
                        backgroundColor: getStatusColor(metric.status),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Refresh Button */}
      <div className="dashboard-footer">
        <button onClick={runAudit} className="btn-refresh">
          🔄 Auditar Agora
        </button>
        <small>Atualizado automaticamente a cada 30 segundos</small>
      </div>
    </div>
  )
}
