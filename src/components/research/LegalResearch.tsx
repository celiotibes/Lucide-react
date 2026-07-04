/**
 * LegalResearch Component
 * Pesquisa jurídica com roteamento inteligente 4-Tier
 */

import { useState, useCallback } from 'react'
import useMultiTierLlm from '../../hooks/useMultiTierLlm'
import './ResearchStyles.css'

interface LegalResearchProps {
  onResultSelect?: (result: string) => void
}

export function LegalResearch({ onResultSelect }: LegalResearchProps) {
  const { result, loading, error, analyzeHermenautica, classifyCase, searchJurisprudence, clearError } =
    useMultiTierLlm()
  const [searchQuery, setSearchQuery] = useState('')
  const [analysisType, setAnalysisType] = useState<'hermenautica' | 'classificacao' | 'jurisprudencia'>(
    'hermenautica'
  )
  const [isUrgent, setIsUrgent] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    try {
      switch (analysisType) {
        case 'hermenautica':
          await analyzeHermenautica(searchQuery, isUrgent)
          break
        case 'classificacao':
          await classifyCase(searchQuery)
          break
        case 'jurisprudencia':
          await searchJurisprudence(searchQuery)
          break
      }
    } catch (err) {
      console.error('Erro ao processar análise:', err)
    }
  }, [searchQuery, analysisType, isUrgent, analyzeHermenautica, classifyCase, searchJurisprudence])

  const handleResultSelect = useCallback(() => {
    if (result && onResultSelect) {
      onResultSelect(result.content)
    }
  }, [result, onResultSelect])

  return (
    <div className="legal-research">
      <div className="research-header">
        <h2>📋 Pesquisa Jurídica Inteligente</h2>
        <p>Análise com roteamento automático 4-Tier (Claude, Groq, Gemini, Ollama)</p>
      </div>

      <div className="research-controls">
        <div className="control-group">
          <label htmlFor="analysis-type">Tipo de Análise:</label>
          <select
            id="analysis-type"
            value={analysisType}
            onChange={e =>
              setAnalysisType(e.target.value as 'hermenautica' | 'classificacao' | 'jurisprudencia')
            }
            className="select-input"
          >
            <option value="hermenautica">📖 Hermenêutica Jurídica (TIER1 - Claude)</option>
            <option value="classificacao">🏷️ Classificação de Caso (TIER2 - Groq)</option>
            <option value="jurisprudencia">⚖️ Busca Jurisprudência (TIER3 - Gemini)</option>
          </select>
        </div>

        {analysisType === 'hermenautica' && (
          <div className="control-group">
            <label>
              <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)} />
              Análise Urgente? (prioriza velocidade)
            </label>
          </div>
        )}
      </div>

      <div className="search-box">
        <textarea
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={
            analysisType === 'hermenautica'
              ? 'Cole o texto jurídico para análise profunda...'
              : analysisType === 'classificacao'
                ? 'Descreva o caso para classificação...'
                : 'Insira sua pergunta sobre jurisprudência...'
          }
          className="search-textarea"
          rows={6}
          disabled={loading}
        />

        <button
          onClick={handleSearch}
          disabled={loading || !searchQuery.trim()}
          className="search-button"
        >
          {loading ? '⏳ Processando...' : '🔍 Analisar'}
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

      {result && (
        <div className="result-container">
          <div className="result-header">
            <h3>📊 Resultado da Análise</h3>
            <div className="result-metadata">
              <span className="provider-badge" title={`Fornecedor: ${result.provider}`}>
                {result.provider.toUpperCase()}
              </span>
              <span className="tier-badge" title={`Tier: ${result.tier}`}>{result.tier}</span>
              <span className="cost-badge" title="Custo em USD">${result.costUSD.toFixed(4)}</span>
              <span className="latency-badge" title="Latência em ms">{result.latencyMs}ms</span>
              <span className="confidence-badge" title="Confiança">
                {(result.confidence * 100).toFixed(0)}%
              </span>
              {result.isFromFallback && <span className="fallback-badge">⚠️ Fallback</span>}
            </div>
          </div>

          <div className="result-content">
            <p>{result.content}</p>
          </div>

          <div className="result-footer">
            <div className="tokens-info">
              <span>Tokens: {result.tokensUsed}</span>
            </div>
            {onResultSelect && (
              <button onClick={handleResultSelect} className="use-button">
                ✓ Usar este resultado
              </button>
            )}
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="empty-state">
          <p>👉 Insira um texto ou pergunta para começar a análise</p>
          <div className="tier-info">
            <h4>Como funciona o roteamento inteligente:</h4>
            <ul>
              <li>
                <strong>Hermenêutica:</strong> Usa Claude (TIER1) para máxima qualidade (5-10s)
              </li>
              <li>
                <strong>Classificação:</strong> Usa Groq (TIER2) para análise rápida e grátis (1-2s)
              </li>
              <li>
                <strong>Jurisprudência:</strong> Usa Gemini (TIER3) para buscas simples e baratas
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default LegalResearch
