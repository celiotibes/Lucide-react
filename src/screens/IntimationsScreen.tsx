import React, { useEffect, useState } from 'react'
import { useIntimationsStore } from '../stores/intimationsStore'
import { BottomNavigation } from '../components/BottomNavigation'

export const IntimationsScreen: React.FC = () => {
  const {
    intimations,
    selectedIntimation,
    isLoading,
    error,
    fetchIntimations,
    selectIntimation,
    processIntimation,
    clearError,
  } = useIntimationsStore()

  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    fetchIntimations()
  }, [])

  const filteredIntimations = intimations.filter(
    (i) => statusFilter === 'all' || i.status === statusFilter,
  )

  const stats = {
    total: intimations.length,
    pending: intimations.filter((i) => i.status === 'pending').length,
    processed: intimations.filter((i) => i.status === 'processed').length,
    archived: intimations.filter((i) => i.status === 'archived').length,
  }

  const statusOptions = [
    { value: 'all', label: 'Todas', color: 'bg-gray-500/20 text-gray-300' },
    { value: 'pending', label: 'Pendentes', color: 'bg-red-500/20 text-red-400' },
    { value: 'processed', label: 'Processadas', color: 'bg-green-500/20 text-green-400' },
    { value: 'archived', label: 'Arquivadas', color: 'bg-blue-500/20 text-blue-400' },
  ]

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-gray-500/20 text-gray-400'
    if (confidence >= 0.8) return 'bg-green-500/20 text-green-400'
    if (confidence >= 0.6) return 'bg-yellow-500/20 text-yellow-400'
    return 'bg-red-500/20 text-red-400'
  }

  const handleProcess = async (intimationId: string) => {
    try {
      await processIntimation(intimationId)
    } catch (err) {
      console.error('Error processing intimation:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pb-24">
      {/* Header */}
      <header className="bg-slate-900/80 border-b border-slate-700/50 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-3xl font-bold text-white mb-2">Processamento de Intimações</h1>
          <p className="text-gray-400">
            Gerencie e processe intimações com automação inteligente
          </p>
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

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 hover:border-purple-500/50 transition">
            <div className="text-gray-400 text-sm font-medium mb-2">Total</div>
            <div className="text-3xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-2">Intimações cadastradas</div>
          </div>

          <div className="backdrop-blur-lg bg-slate-900/80 border border-red-500/30 rounded-2xl p-6 hover:border-red-500/50 transition">
            <div className="text-red-400 text-sm font-medium mb-2">Pendentes</div>
            <div className="text-3xl font-bold text-red-400">{stats.pending}</div>
            <div className="text-xs text-gray-500 mt-2">Aguardando processamento</div>
          </div>

          <div className="backdrop-blur-lg bg-slate-900/80 border border-green-500/30 rounded-2xl p-6 hover:border-green-500/50 transition">
            <div className="text-green-400 text-sm font-medium mb-2">Processadas</div>
            <div className="text-3xl font-bold text-green-400">{stats.processed}</div>
            <div className="text-xs text-gray-500 mt-2">Completadas com sucesso</div>
          </div>

          <div className="backdrop-blur-lg bg-slate-900/80 border border-blue-500/30 rounded-2xl p-6 hover:border-blue-500/50 transition">
            <div className="text-blue-400 text-sm font-medium mb-2">Arquivadas</div>
            <div className="text-3xl font-bold text-blue-400">{stats.archived}</div>
            <div className="text-xs text-gray-500 mt-2">Finalizadas e arquivadas</div>
          </div>
        </div>

        {/* Status Filters */}
        <div className="mb-8 flex flex-wrap gap-3">
          {statusOptions.map((status) => (
            <button
              key={status.value}
              onClick={() => setStatusFilter(status.value)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                statusFilter === status.value
                  ? `${status.color} ring-2 ring-purple-500`
                  : `${status.color} hover:ring-2 hover:ring-purple-500/50`
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>

        {/* Intimations List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center space-x-2 text-gray-400">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span>Carregando intimações...</span>
            </div>
          </div>
        ) : filteredIntimations.length > 0 ? (
          <div className="space-y-4">
            {filteredIntimations.map((intimation) => (
              <div
                key={intimation.id}
                onClick={() => selectIntimation(intimation)}
                className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 transition cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition">
                        {intimation.title}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                          intimation.status === 'pending'
                            ? 'bg-red-500/20 text-red-400'
                            : intimation.status === 'processed'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {intimation.status}
                      </span>
                    </div>

                    <p className="text-sm text-gray-400 mb-4">{intimation.description}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Número</p>
                        <p className="text-white font-semibold text-sm">{intimation.number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Prazo</p>
                        <p className="text-white font-semibold text-sm">
                          {new Date(intimation.deadline).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      {intimation.confidence !== undefined && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Confiança</p>
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getConfidenceColor(
                              intimation.confidence,
                            )}`}
                          >
                            {(intimation.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                      {intimation.source && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Origem</p>
                          <p className="text-white font-semibold text-sm capitalize">
                            {intimation.source}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {intimation.status === 'pending' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleProcess(intimation.id)
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition whitespace-nowrap"
                    >
                      Processar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl">
            <p className="text-gray-400 mb-2">Nenhuma intimação encontrada</p>
            <p className="text-sm text-gray-500">
              {statusFilter !== 'all'
                ? 'Tente ajustar seus filtros'
                : 'Nenhuma intimação cadastrada no sistema'}
            </p>
          </div>
        )}

        {/* Detail Modal */}
        {selectedIntimation && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end z-50"
            onClick={() => selectIntimation(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-gradient-to-t from-slate-900 via-slate-800 to-slate-900 border-t border-slate-700/50 rounded-t-3xl p-6 md:p-8 max-h-[80vh] overflow-y-auto"
            >
              <div className="max-w-2xl mx-auto">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                      {selectedIntimation.title}
                    </h2>
                    <p className="text-gray-400">Nº {selectedIntimation.number}</p>
                  </div>
                  <button
                    onClick={() => selectIntimation(null)}
                    className="text-gray-400 hover:text-white transition"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-6">
                  {selectedIntimation.description && (
                    <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-2">Descrição</p>
                      <p className="text-gray-300 text-sm">{selectedIntimation.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Status</p>
                      <p className="text-white font-semibold capitalize">
                        {selectedIntimation.status}
                      </p>
                    </div>
                    <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Prazo</p>
                      <p className="text-white font-semibold">
                        {new Date(selectedIntimation.deadline).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {selectedIntimation.confidence !== undefined && (
                      <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 mb-1">Confiança</p>
                        <p className="text-white font-semibold">
                          {(selectedIntimation.confidence * 100).toFixed(2)}%
                        </p>
                      </div>
                    )}
                    {selectedIntimation.source && (
                      <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 mb-1">Origem</p>
                        <p className="text-white font-semibold capitalize">
                          {selectedIntimation.source}
                        </p>
                      </div>
                    )}
                  </div>

                  {selectedIntimation.lastUpdate && (
                    <div className="backdrop-blur-lg bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Última atualização</p>
                      <p className="text-white font-semibold">
                        {new Date(selectedIntimation.lastUpdate).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    {selectedIntimation.status === 'pending' && (
                      <button
                        onClick={() => {
                          handleProcess(selectedIntimation.id)
                          selectIntimation(null)
                        }}
                        className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition"
                      >
                        Processar
                      </button>
                    )}
                    <button
                      onClick={() => selectIntimation(null)}
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
