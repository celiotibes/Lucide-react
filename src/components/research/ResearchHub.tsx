/**
 * ResearchHub Component
 * Hub central para pesquisa jurídica, acadêmica e contábil com 4-Tier LLM Stack
 */

import { useState, useCallback } from 'react'
import { LegalResearch } from './LegalResearch'
import { AcademicResearch } from './AcademicResearch'
import { AccountingResearch } from './AccountingResearch'
import { AdvancedLegalResearch } from './AdvancedLegalResearch'
import useMultiTierLlm from '../../hooks/useMultiTierLlm'
import './ResearchStyles.css'
import './ResearchHub.css'

type ActiveTab = 'legal' | 'advanced_legal' | 'academic' | 'accounting'

interface ResearchHubProps {
  onResultSelect?: (result: string, source: string) => void
}

export function ResearchHub({ onResultSelect }: ResearchHubProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('legal')
  const [showStats, setShowStats] = useState(false)
  const { stats, health, getStats, getConfig } = useMultiTierLlm()
  const [config, setConfig] = useState<any>(null)

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab)
  }, [])

  const handleResultSelect = useCallback(
    (result: string) => {
      if (onResultSelect) {
        onResultSelect(result, activeTab)
      }
    },
    [activeTab, onResultSelect]
  )

  const handleStatsClick = useCallback(async () => {
    setShowStats(!showStats)
    if (!showStats) {
      await getStats()
      const cfg = await getConfig()
      setConfig(cfg)
    }
  }, [showStats, getStats, getConfig])

  return (
    <div className="research-hub">
      {/* Header com navegação */}
      <div className="research-hub-header">
        <div className="hub-title">
          <h1>🔍 Centro de Pesquisa Jurídico-Acadêmico-Contábil</h1>
          <p>Plataforma integrada com 4-Tier LLM Stack (Claude, Groq, Gemini, Ollama)</p>
        </div>

        <div className="hub-controls">
          <button
            onClick={handleStatsClick}
            className={`stats-button ${showStats ? 'active' : ''}`}
            title="Ver estatísticas de uso"
          >
            📊 Estatísticas {health?.status === 'healthy' ? '✓' : '✗'}
          </button>
        </div>
      </div>

      {/* Health Status */}
      {health && (
        <div className={`health-banner ${health.status}`}>
          <span className="health-indicator">{health.status === 'healthy' ? '✓' : '✗'}</span>
          <span className="health-message">{health.message}</span>
        </div>
      )}

      {/* Stats Panel */}
      {showStats && stats && config && (
        <div className="stats-container">
          <div className="stats-summary">
            <h3>Uso e Custos do Multi-Tier Router</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-value">{stats.total_calls}</span>
                <span className="stat-label">Total de Análises</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">${stats.total_cost_usd.toFixed(2)}</span>
                <span className="stat-label">Custo Total (USD)</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">${stats.cost_per_call.toFixed(4)}</span>
                <span className="stat-label">Custo Médio por Análise</span>
              </div>
            </div>
          </div>

          <div className="providers-breakdown">
            <h4>Uso por Provider:</h4>
            <div className="providers-grid">
              {Object.entries(stats.by_provider).map(([provider, data]: [string, any]) => (
                <div key={provider} className="provider-card">
                  <h5>{provider.toUpperCase()}</h5>
                  <div className="provider-stats">
                    <p>
                      <strong>Análises:</strong> {data.calls}
                    </p>
                    <p>
                      <strong>Custo:</strong> ${data.cost.toFixed(4)}
                    </p>
                    <p>
                      <strong>Tokens:</strong> {data.tokens}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="tier-configuration">
            <h4>Configuração dos 4 Tiers:</h4>
            <div className="tiers-grid">
              {Object.entries(config.tiers || {}).map(([tierKey, tier]: [string, any]) => (
                <div key={tierKey} className="tier-card">
                  <h5>{tierKey}</h5>
                  <div className="tier-details">
                    <p>
                      <strong>Provider:</strong> {tier.provider}
                    </p>
                    <p>
                      <strong>Custo:</strong> {tier.cost}
                    </p>
                    <p>
                      <strong>Latência:</strong> {tier.latency}
                    </p>
                    <p>
                      <strong>Qualidade:</strong> {tier.quality}
                    </p>
                    <p className="use-case">{tier.use_case}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="research-tabs">
        <button
          className={`research-tab ${activeTab === 'legal' ? 'active' : ''}`}
          onClick={() => handleTabChange('legal')}
        >
          ⚖️ Pesquisa Jurídica
        </button>
        <button
          className={`research-tab ${activeTab === 'advanced_legal' ? 'active' : ''}`}
          onClick={() => handleTabChange('advanced_legal')}
        >
          🔬 Jurídica Avançada (RAG)
        </button>
        <button
          className={`research-tab ${activeTab === 'academic' ? 'active' : ''}`}
          onClick={() => handleTabChange('academic')}
        >
          📚 Pesquisa Acadêmica
        </button>
        <button
          className={`research-tab ${activeTab === 'accounting' ? 'active' : ''}`}
          onClick={() => handleTabChange('accounting')}
        >
          💼 Análise Contábil
        </button>
      </div>

      {/* Tab Content */}
      <div className="research-content">
        {activeTab === 'legal' && <LegalResearch onResultSelect={handleResultSelect} />}
        {activeTab === 'advanced_legal' && (
          <AdvancedLegalResearch onResultSelect={handleResultSelect} />
        )}
        {activeTab === 'academic' && <AcademicResearch onResultSelect={handleResultSelect} />}
        {activeTab === 'accounting' && <AccountingResearch onResultSelect={handleResultSelect} />}
      </div>

      {/* Footer com informações */}
      <div className="research-footer">
        <p>
          💡 <strong>4-Tier Stack:</strong> Roteamento inteligente seleciona automaticamente o melhor
          LLM (Claude, Groq, Gemini, Ollama) baseado em tipo de tarefa, urgência e custo
        </p>
        <p>
          💰 <strong>Economia:</strong> 70% de redução de custos comparado ao uso exclusivo de Claude
        </p>
      </div>
    </div>
  )
}

export default ResearchHub
