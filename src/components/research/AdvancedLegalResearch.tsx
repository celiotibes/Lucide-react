/**
 * AdvancedLegalResearch Component
 * Pesquisa jurídica avançada com RAG, histórico e roteamento inteligente
 */

import { useState, useCallback, useEffect } from 'react'
import useAdvancedResearch from '../../hooks/useAdvancedResearch'
import type { ResearchMode } from '../../hooks/useAdvancedResearch'
import './ResearchStyles.css'
import './AdvancedLegalResearch.css'

interface AdvancedLegalResearchProps {
  onResultSelect?: (result: string) => void
}

export function AdvancedLegalResearch({ onResultSelect }: AdvancedLegalResearchProps) {
  const { result, loading, error, search, getConversation, statistics, getStatistics, clearError } =
    useAdvancedResearch()

  const [searchQuery, setSearchQuery] = useState('')
  const [mode, setMode] = useState<ResearchMode>('hybrid')
  const [isUrgent, setIsUrgent] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [conversation, setConversation] = useState<any>(null)

  useEffect(() => {
    getStatistics()
  }, [getStatistics])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    const cid = conversationId || `conv_${Date.now()}`
    setConversationId(cid)

    try {
      await search(searchQuery, mode, 'hermenautica_juridica', isUrgent, cid)
      setSearchQuery('')
    } catch (err) {
      console.error('Erro ao processar análise:', err)
    }
  }, [searchQuery, mode, isUrgent, conversationId, search])

  const handleViewHistory = useCallback(async () => {
    if (!conversationId) return
    setShowHistory(!showHistory)
    if (!showHistory) {
      await getConversation(conversationId)
    }
  }, [conversationId, showHistory, getConversation])

  const handleViewStats = useCallback(async () => {
    setShowStats(!showStats)
    if (!showStats) {
      await getStatistics()
    }
  }, [showStats, getStatistics])

  const handleResultSelect = useCallback(() => {
    if (result && onResultSelect) {
      onResultSelect(result.analysis)
    }
  }, [result, onResultSelect])

  return (
    <div className="advanced-legal-research">
      <div className="research-header">
        <h2>⚖️ Pesquisa Jurídica Avançada com RAG</h2>
        <p>Análise com jurisprudência do Pinecone + roteamento 4-Tier inteligente</p>
      </div>

      <div className="research-controls">
        <div className="control-group">
          <label htmlFor="research-mode">Modo de Pesquisa:</label>
          <select
            id="research-mode"
            value={mode}
            onChange={e => setMode(e.target.value as ResearchMode)}
            className="select-input"
          >
            <option value="hybrid">🔗 Hybrid (RAG + Roteamento Inteligente) - Recomendado</option>
            <option value="rag_enhanced">📚 RAG Enhanced (Jurisprudência + Análise)</option>
            <option value="quick_analysis">⚡ Quick Analysis (Rápido, sem RAG)</option>
          </select>
        </div>

        <div className="control-group">
          <label>
            <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)} />
            Pesquisa Urgente? (prioriza velocidade)
          </label>
        </div>

        <button onClick={handleViewHistory} className="secondary-button">
          📋 {conversationId ? 'Ver Histórico' : 'Nenhuma conversa'}
        </button>

        <button onClick={handleViewStats} className="secondary-button">
          📊 Estatísticas
        </button>
      </div>

      <div className="search-box">
        <textarea
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Cole sua pergunta jurídica para análise avançada com jurisprudência..."
          className="search-textarea"
          rows={6}
          disabled={loading}
        />

        <button
          onClick={handleSearch}
          disabled={loading || !searchQuery.trim()}
          className="search-button"
        >
          {loading ? '⏳ Processando...' : '🔍 Analisar com RAG'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
          <button onClick={clearError} className="dismiss-button">
            Descartar
          </button>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="result-container">
          <div className="result-header">
            <h3>📊 Análise com RAG</h3>
            <div className="result-metadata">
              <span className="provider-badge">{result.provider.toUpperCase()}</span>
              <span className="tier-badge">{result.tier}</span>
              <span className="cost-badge">${result.cost_usd.toFixed(4)}</span>
              <span className="latency-badge">{result.latency_ms}ms</span>
              <span className="confidence-badge">{(result.confidence * 100).toFixed(0)}%</span>
              {result.is_fallback && <span className="fallback-badge">⚠️ Fallback</span>}
            </div>
          </div>

          {/* Fontes RAG */}
          {result.sources && result.sources.length > 0 && (
            <div className="sources-section">
              <h4>📚 Jurisprudência Consultada:</h4>
              <div className="sources-list">
                {result.sources.map((source, idx) => (
                  <div key={idx} className="source-item">
                    <div className="source-header">
                      <span className="source-type">{source.type}</span>
                      <span className="relevance-badge">{(source.relevance * 100).toFixed(0)}%</span>
                    </div>
                    <p className="source-info">{source.tribunal_info}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="result-content">
            <p>{result.analysis}</p>
          </div>

          <div className="result-footer">
            <div className="tokens-info">
              <span>Tokens: {result.tokens_used}</span>
              <span>Fontes: {result.sources.length}</span>
            </div>
            {onResultSelect && (
              <button onClick={handleResultSelect} className="use-button">
                ✓ Usar este resultado
              </button>
            )}
          </div>
        </div>
      )}

      {/* Histórico */}
      {showHistory && conversation && (
        <div className="history-container">
          <h3>📋 Histórico da Conversa</h3>
          <p className="history-summary">
            {conversation.total_queries} questões | Custo total: ${conversation.total_cost_usd.toFixed(2)}
          </p>
          <div className="history-messages">
            {conversation.messages.map((msg: any, idx: number) => (
              <div key={idx} className="history-message">
                <div className="message-query">
                  <strong>Q{idx + 1}:</strong> {msg.query.substring(0, 100)}...
                </div>
                <div className="message-meta">
                  <span className="provider">{msg.provider}</span>
                  <span className="cost">${msg.cost_usd.toFixed(4)}</span>
                  <span className="date">{new Date(msg.created_at).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estatísticas */}
      {showStats && statistics && (
        <div className="stats-container">
          <h3>📊 Estatísticas de Pesquisa Avançada</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{statistics.total_searches}</div>
              <div className="stat-label">Total de Pesquisas</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">${statistics.total_cost_usd.toFixed(2)}</div>
              <div className="stat-label">Custo Total (USD)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{statistics.total_tokens.toLocaleString()}</div>
              <div className="stat-label">Tokens Utilizados</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{statistics.conversations}</div>
              <div className="stat-label">Conversas Ativas</div>
            </div>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="empty-state">
          <p>👉 Insira sua pergunta jurídica para análise com RAG</p>
          <div className="tier-info">
            <h4>Como funciona:</h4>
            <ul>
              <li>
                <strong>Hybrid (Recomendado):</strong> Combina jurisprudência do Pinecone com
                análise do 4-Tier
              </li>
              <li>
                <strong>RAG Enhanced:</strong> Jurisprudência similar + análise do melhor provider
              </li>
              <li>
                <strong>Quick Analysis:</strong> Análise rápida com Groq (sem RAG)
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdvancedLegalResearch
