import React, { useEffect, useState } from 'react'
import { useComplianceStore } from '../stores/complianceStore'
import { BottomNavigation } from '../components/BottomNavigation'

export const ComplianceScreen: React.FC = () => {
  const {
    metrics,
    summary,
    riskAssessment,
    auditTrail,
    isLoading,
    error,
    fetchMetrics,
    fetchRiskAssessment,
    fetchAuditTrail,
    clearError,
  } = useComplianceStore()

  const [selectedMetric, setSelectedMetric] = useState<any>(null)

  useEffect(() => {
    fetchMetrics()
    fetchRiskAssessment()
    fetchAuditTrail({ days: 30 })
  }, [])

  const overallScore =
    metrics.length > 0 ? Math.round(metrics.reduce((acc, m) => acc + m.value, 0) / metrics.length) : 0

  const complianceStatus =
    overallScore >= 90 ? 'Excelente' : overallScore >= 75 ? 'Bom' : overallScore >= 60 ? 'Alerta' : 'Crítico'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
        return 'bg-green-500/20 text-green-400'
      case 'warning':
        return 'bg-yellow-500/20 text-yellow-400'
      case 'critical':
        return 'bg-red-500/20 text-red-400'
      default:
        return 'bg-gray-500/20 text-gray-400'
    }
  }

  const getOverallColor = (score: number) => {
    if (score >= 90) return 'from-green-500 to-emerald-500'
    if (score >= 75) return 'from-blue-500 to-cyan-500'
    if (score >= 60) return 'from-yellow-500 to-amber-500'
    return 'from-red-500 to-pink-500'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      {/* Header */}
      <header className="bg-slate-900/80 border-b border-slate-700/50 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-3xl font-bold text-white mb-2">Conformidade LGPD</h1>
          <p className="text-gray-400">Monitore métricas de conformidade e riscos regulatórios</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-red-300 text-sm">{error}</p>
              <button
                onClick={clearError}
                className="text-red-400 hover:text-red-300 text-xs font-medium"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* Overall Score Card */}
        <div className="mb-8 backdrop-blur-lg bg-gradient-to-br from-slate-900/80 via-slate-800/80 to-slate-900/80 border border-slate-700/50 rounded-3xl p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Score Circle */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-40 h-40 mb-4">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    fill="none"
                    stroke="#2d3139"
                    strokeWidth="8"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    fill="none"
                    stroke="url(#scoreGradient)"
                    strokeWidth="8"
                    strokeDasharray={`${(overallScore / 100) * 440} 440`}
                    className="transition-all duration-500"
                  />
                  <defs>
                    <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-white">{overallScore}</div>
                  <div className="text-xs text-gray-400">de 100</div>
                </div>
              </div>
              <p className="text-lg font-semibold text-white">{complianceStatus}</p>
            </div>

            {/* Summary Info */}
            <div className="space-y-4">
              <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">Métricas Compliant</p>
                <p className="text-2xl font-bold text-green-400">
                  {metrics.filter((m) => m.status === 'compliant').length} / {metrics.length}
                </p>
              </div>
              <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">Alertas Ativos</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {metrics.filter((m) => m.status === 'warning').length}
                </p>
              </div>
              <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">Críticos</p>
                <p className="text-2xl font-bold text-red-400">
                  {metrics.filter((m) => m.status === 'critical').length}
                </p>
              </div>
            </div>

            {/* Risk Assessment */}
            <div>
              <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 h-full">
                <p className="text-xs text-gray-500 mb-4">Avaliação de Risco</p>
                {riskAssessment ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-white mb-1">Nível Geral</p>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          riskAssessment.level === 'low'
                            ? 'bg-green-500/20 text-green-400'
                            : riskAssessment.level === 'medium'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {riskAssessment.level?.toUpperCase() || 'N/A'}
                      </span>
                    </div>
                    {riskAssessment.score !== undefined && (
                      <div>
                        <p className="text-sm font-semibold text-white">Score: {riskAssessment.score}/10</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Carregando...</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-6">Métricas Detalhadas</h2>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center space-x-2 text-gray-400">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span>Carregando métricas...</span>
              </div>
            </div>
          ) : metrics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {metrics.map((metric) => (
                <div
                  key={metric.id}
                  onClick={() => setSelectedMetric(metric)}
                  className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition">
                      {metric.name}
                    </h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(metric.status)}`}>
                      {metric.status}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl font-bold text-white">{metric.value}%</span>
                      <span className="text-xs text-gray-500">Meta: {metric.target}%</span>
                    </div>
                    <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          metric.status === 'compliant'
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                            : metric.status === 'warning'
                              ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                              : 'bg-gradient-to-r from-red-500 to-pink-500'
                        }`}
                        style={{ width: `${(metric.value / metric.target) * 100}%` }}
                      />
                    </div>
                  </div>

                  {metric.description && (
                    <p className="text-xs text-gray-500">{metric.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl">
              <p className="text-gray-400">Nenhuma métrica disponível</p>
            </div>
          )}
        </div>

        {/* Audit Trail */}
        <div>
          <h2 className="text-xl font-bold text-white mb-6">Histórico de Auditoria (Últimos 30 dias)</h2>

          {auditTrail.length > 0 ? (
            <div className="space-y-3">
              {auditTrail.slice(0, 10).map((entry, idx) => (
                <div
                  key={idx}
                  className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600/50 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">{entry.action}</p>
                      <p className="text-sm text-gray-400">{entry.description}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {entry.user && <span>Por: {entry.user}</span>}
                        {entry.timestamp && (
                          <span className="ml-3">
                            {new Date(entry.timestamp).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </p>
                    </div>
                    {entry.severity && (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                          entry.severity === 'info'
                            ? 'bg-blue-500/20 text-blue-400'
                            : entry.severity === 'warning'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {entry.severity.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {auditTrail.length > 10 && (
                <div className="text-center pt-4">
                  <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition text-sm font-medium">
                    Ver mais histórico ({auditTrail.length - 10} entradas)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl">
              <p className="text-gray-400">Nenhuma entrada de auditoria</p>
            </div>
          )}
        </div>

        {/* Metric Detail Modal */}
        {selectedMetric && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end z-50"
            onClick={() => setSelectedMetric(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-gradient-to-t from-slate-900 via-slate-800 to-slate-900 border-t border-slate-700/50 rounded-t-3xl p-6 md:p-8 max-h-[80vh] overflow-y-auto"
            >
              <div className="max-w-2xl mx-auto">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">{selectedMetric.name}</h2>
                    <p className="text-gray-400">{selectedMetric.description}</p>
                  </div>
                  <button
                    onClick={() => setSelectedMetric(null)}
                    className="text-gray-400 hover:text-white transition"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Valor Atual</p>
                      <p className="text-3xl font-bold text-white">{selectedMetric.value}%</p>
                    </div>
                    <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Meta</p>
                      <p className="text-3xl font-bold text-purple-400">{selectedMetric.target}%</p>
                    </div>
                  </div>

                  <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-3">Progresso</p>
                    <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          selectedMetric.status === 'compliant'
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                            : selectedMetric.status === 'warning'
                              ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                              : 'bg-gradient-to-r from-red-500 to-pink-500'
                        }`}
                        style={{ width: `${(selectedMetric.value / selectedMetric.target) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {((selectedMetric.value / selectedMetric.target) * 100).toFixed(1)}% de conformidade
                    </p>
                  </div>

                  <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-2">Status</p>
                    <span
                      className={`inline-block px-4 py-2 rounded-lg text-sm font-semibold ${getStatusColor(
                        selectedMetric.status,
                      )}`}
                    >
                      {selectedMetric.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setSelectedMetric(null)}
                      className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg transition"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <BottomNavigation />
    </div>
  )
}
