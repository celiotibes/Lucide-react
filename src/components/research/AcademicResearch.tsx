/**
 * AcademicResearch Component
 * Pesquisa acadêmica com integração Multi-Tier LLM
 */

import { useState, useCallback } from 'react'
import useMultiTierLlm from '../../hooks/useMultiTierLlm'
import './ResearchStyles.css'

interface AcademicResearchProps {
  onResultSelect?: (result: string) => void
}

export function AcademicResearch({ onResultSelect }: AcademicResearchProps) {
  const { result, loading, error, analyzeQuick, summarizeDocument, extractEntities, clearError } =
    useMultiTierLlm()
  const [searchQuery, setSearchQuery] = useState('')
  const [analysisType, setAnalysisType] = useState<'analysis' | 'summary' | 'entities'>('analysis')

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    try {
      switch (analysisType) {
        case 'analysis':
          await analyzeQuick(`Analise academicamente: ${searchQuery}`)
          break
        case 'summary':
          await summarizeDocument(searchQuery, 300)
          break
        case 'entities':
          await extractEntities(searchQuery)
          break
      }
    } catch (err) {
      console.error('Erro ao processar análise:', err)
    }
  }, [searchQuery, analysisType, analyzeQuick, summarizeDocument, extractEntities])

  const handleResultSelect = useCallback(() => {
    if (result && onResultSelect) {
      onResultSelect(result.content)
    }
  }, [result, onResultSelect])

  return (
    <div className="academic-research">
      <div className="research-header">
        <h2>📚 Pesquisa Acadêmica</h2>
        <p>Análise de artigos, resumos e extração de entidades com IA</p>
      </div>

      <div className="research-controls">
        <div className="control-group">
          <label htmlFor="analysis-type">Tipo de Análise:</label>
          <select
            id="analysis-type"
            value={analysisType}
            onChange={e => setAnalysisType(e.target.value as 'analysis' | 'summary' | 'entities')}
            className="select-input"
          >
            <option value="analysis">🔍 Análise de Conteúdo (TIER2 - Groq)</option>
            <option value="summary">📄 Resumir Artigo (TIER2 - Groq)</option>
            <option value="entities">🏷️ Extrair Entidades (TIER3 - Gemini)</option>
          </select>
        </div>
      </div>

      <div className="search-box">
        <textarea
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={
            analysisType === 'analysis'
              ? 'Cole seu texto acadêmico ou pergunta...'
              : analysisType === 'summary'
                ? 'Cole o artigo que deseja resumir...'
                : 'Cole o texto para extração de entidades (nomes, datas, termos-chave)...'
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
            <h3>📊 Resultado</h3>
            <div className="result-metadata">
              <span className="provider-badge">{result.provider.toUpperCase()}</span>
              <span className="tier-badge">{result.tier}</span>
              <span className="cost-badge">${result.costUSD.toFixed(4)}</span>
              <span className="latency-badge">{result.latencyMs}ms</span>
              <span className="confidence-badge">{(result.confidence * 100).toFixed(0)}%</span>
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
          <p>👉 Cole seu conteúdo acadêmico para análise</p>
          <div className="tier-info">
            <h4>Recursos disponíveis:</h4>
            <ul>
              <li>
                <strong>Análise:</strong> Análise crítica rápida com Groq
              </li>
              <li>
                <strong>Resumo:</strong> Gera resumo automático de artigos
              </li>
              <li>
                <strong>Extração:</strong> Identifica nomes, datas e termos-chave
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default AcademicResearch
