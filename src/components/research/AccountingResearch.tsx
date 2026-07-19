/**
 * AccountingResearch Component
 * Análise contábil, fiscal e de conformidade com IA
 */

import { useState, useCallback } from 'react'
import useMultiTierLlm from '../../hooks/useMultiTierLlm'
import './ResearchStyles.css'

interface AccountingResearchProps {
  onResultSelect?: (result: string) => void
}

export function AccountingResearch({ onResultSelect }: AccountingResearchProps) {
  const { result, loading, error, analyzeQuick, summarizeDocument, clearError } = useMultiTierLlm()
  const [searchQuery, setSearchQuery] = useState('')
  const [analysisType, setAnalysisType] = useState<'compliance' | 'fiscal' | 'analysis'>('compliance')

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    try {
      switch (analysisType) {
        case 'compliance':
          await analyzeQuick(
            `Análise de conformidade contábil: ${searchQuery}. Identifique possíveis não-conformidades.`
          )
          break
        case 'fiscal':
          await analyzeQuick(
            `Análise fiscal e tributária: ${searchQuery}. Identifique oportunidades de otimização fiscal.`
          )
          break
        case 'analysis':
          await summarizeDocument(searchQuery, 400)
          break
      }
    } catch (err) {
      console.error('Erro ao processar análise:', err)
    }
  }, [searchQuery, analysisType, analyzeQuick, summarizeDocument])

  const handleResultSelect = useCallback(() => {
    if (result && onResultSelect) {
      onResultSelect(result.content)
    }
  }, [result, onResultSelect])

  return (
    <div className="accounting-research">
      <div className="research-header">
        <h2>💼 Análise Contábil & Fiscal</h2>
        <p>Pesquisa e análise especializada em contabilidade, impostos e conformidade</p>
      </div>

      <div className="research-controls">
        <div className="control-group">
          <label htmlFor="analysis-type">Tipo de Análise:</label>
          <select
            id="analysis-type"
            value={analysisType}
            onChange={e => setAnalysisType(e.target.value as 'compliance' | 'fiscal' | 'analysis')}
            className="select-input"
          >
            <option value="compliance">✓ Análise de Conformidade (TIER2 - Groq)</option>
            <option value="fiscal">💰 Otimização Fiscal (TIER2 - Groq)</option>
            <option value="analysis">📊 Análise Financeira (TIER2 - Groq)</option>
          </select>
        </div>
      </div>

      <div className="search-box">
        <textarea
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={
            analysisType === 'compliance'
              ? 'Descreva a situação contábil/fiscal para análise de conformidade...'
              : analysisType === 'fiscal'
                ? 'Descreva sua situação tributária para análise de oportunidades...'
                : 'Cole o documento financeiro para análise...'
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
          <p>👉 Insira informações contábeis ou fiscais para análise</p>
          <div className="tier-info">
            <h4>Análises disponíveis:</h4>
            <ul>
              <li>
                <strong>Conformidade:</strong> Valida conformidade com normas contábeis
              </li>
              <li>
                <strong>Fiscal:</strong> Identifica oportunidades de otimização tributária
              </li>
              <li>
                <strong>Financeira:</strong> Analisa documentos e dados financeiros
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default AccountingResearch
