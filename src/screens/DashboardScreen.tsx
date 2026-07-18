import React, { useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useCasesStore } from '../stores/casesStore'
import { useComplianceStore } from '../stores/complianceStore'
import { useNavigate } from 'react-router-dom'

export const DashboardScreen: React.FC = () => {
  const { user, logout } = useAuthStore()
  const { cases, isLoading: casesLoading, fetchCases } = useCasesStore()
  const { metrics, isLoading: complianceLoading, fetchMetrics } = useComplianceStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchCases()
    fetchMetrics()
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const activeCases = cases.filter((c) => c.status === 'active').length
  const completedCases = cases.filter((c) => c.status === 'concluded').length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 border-b border-slate-700/50 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 text-sm">Bem-vindo, {user?.name || user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-lg transition text-sm font-medium"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 hover:border-purple-500/50 transition">
            <div className="text-gray-400 text-sm font-medium mb-2">Total de Casos</div>
            <div className="text-3xl font-bold text-white mb-2">{cases.length}</div>
            <div className="text-xs text-gray-500">Casos cadastrados no sistema</div>
          </div>

          <div className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 hover:border-green-500/50 transition">
            <div className="text-gray-400 text-sm font-medium mb-2">Casos Ativos</div>
            <div className="text-3xl font-bold text-green-400 mb-2">{activeCases}</div>
            <div className="text-xs text-gray-500">Em andamento</div>
          </div>

          <div className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 hover:border-blue-500/50 transition">
            <div className="text-gray-400 text-sm font-medium mb-2">Concluídos</div>
            <div className="text-3xl font-bold text-blue-400 mb-2">{completedCases}</div>
            <div className="text-xs text-gray-500">Casos finalizados</div>
          </div>

          <div className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 hover:border-amber-500/50 transition">
            <div className="text-gray-400 text-sm font-medium mb-2">Taxa de Sucesso</div>
            <div className="text-3xl font-bold text-amber-400 mb-2">
              {cases.length > 0 ? Math.round((completedCases / cases.length) * 100) : 0}%
            </div>
            <div className="text-xs text-gray-500">Baseado em conclusões</div>
          </div>
        </div>

        {/* Cases Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Casos Recentes</h2>
            <button className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm font-medium">
              Novo Caso
            </button>
          </div>

          {casesLoading ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center space-x-2 text-gray-400">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span>Carregando casos...</span>
              </div>
            </div>
          ) : cases.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cases.slice(0, 6).map((caseItem) => (
                <div
                  key={caseItem.id}
                  className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition">
                        {caseItem.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">Nº {caseItem.number}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        caseItem.status === 'active'
                          ? 'bg-green-500/20 text-green-400'
                          : caseItem.status === 'paused'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {caseItem.status}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">Progresso</span>
                      <span className="text-xs font-semibold text-gray-300">{caseItem.progress}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                        style={{ width: `${caseItem.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-700/50 text-sm text-gray-400">
                    Prazo: {new Date(caseItem.deadline).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl">
              <p className="text-gray-400">Nenhum caso encontrado</p>
            </div>
          )}
        </div>

        {/* Compliance Section */}
        <div>
          <h2 className="text-xl font-bold text-white mb-6">Conformidade LGPD</h2>

          {complianceLoading ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center space-x-2 text-gray-400">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span>Carregando métricas...</span>
              </div>
            </div>
          ) : metrics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {metrics.slice(0, 6).map((metric) => (
                <div
                  key={metric.id}
                  className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 hover:border-purple-500/50 transition"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-300">{metric.name}</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        metric.status === 'compliant'
                          ? 'bg-green-500/20 text-green-400'
                          : metric.status === 'warning'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {metric.status}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl font-bold text-white">{metric.value}%</span>
                      <span className="text-xs text-gray-500">Meta: {metric.target}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          metric.status === 'compliant'
                            ? 'bg-green-500'
                            : metric.status === 'warning'
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${(metric.value / metric.target) * 100}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">{metric.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl">
              <p className="text-gray-400">Nenhuma métrica disponível</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
