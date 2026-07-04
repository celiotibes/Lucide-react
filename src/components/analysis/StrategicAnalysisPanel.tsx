/**
 * Strategic Analysis Panel
 * AI-powered legal weakness detection and strategic blindaging
 */

import { useState } from 'react'
import { useStrategicAnalysis } from '../../hooks/useStrategicAnalysis'
import './StrategicAnalysisPanel.css'

type TabType = 'summary' | 'weaknesses' | 'counterarguments' | 'recommendations' | 'blindages'

export function StrategicAnalysisPanel() {
  const analysis = useStrategicAnalysis()
  const [activeTab, setActiveTab] = useState<TabType>('summary')
  const [documentTitle, setDocumentTitle] = useState('')
  const [documentContent, setDocumentContent] = useState('')
  const [legalArea, setLegalArea] = useState('')

  const handleAnalyze = async () => {
    await analysis.analyze(documentTitle, documentContent, legalArea)
  }

  return (
    <div className="strategic-analysis-panel">
      <div className="analysis-header">
        <h2>🛡️ Análise Estratégica & Blindagem</h2>
        <p>Detecção de fraquezas jurídicas e blindagem contra contra-argumentos</p>
      </div>

      {/* Input Section */}
      <div className="analysis-inputs">
        <div className="input-group">
          <label className="input-label">Título do Documento</label>
          <input
            type="text"
            className="analysis-input-text"
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            placeholder="Ex: Ação de Cobrança - Empresa X vs. Empresa Y"
          />
        </div>

        <div className="input-group">
          <label className="input-label">Conteúdo da Petição</label>
          <textarea
            className="analysis-textarea"
            value={documentContent}
            onChange={(e) => setDocumentContent(e.target.value)}
            placeholder="Cole o conteúdo da petição aqui para análise..."
          />
        </div>

        <div className="input-group">
          <label className="input-label">Área Jurídica (Opcional)</label>
          <select className="analysis-select" value={legalArea} onChange={(e) => setLegalArea(e.target.value)}>
            <option value="">Selecione uma área...</option>
            <option value="civil">Direito Civil</option>
            <option value="penal">Direito Penal</option>
            <option value="trabalhista">Direito Trabalhista</option>
            <option value="tributario">Direito Tributário</option>
            <option value="comercial">Direito Comercial</option>
            <option value="administrativo">Direito Administrativo</option>
            <option value="processual">Direito Processual</option>
          </select>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={!documentTitle.trim() || !documentContent.trim() || analysis.loading}
          className="analyze-button"
        >
          {analysis.loading ? '⏳ Analisando...' : '🔍 Analisar Estratégia'}
        </button>
      </div>

      {/* Error Message */}
      {analysis.error && (
        <div style={{ padding: '15px', background: '#ffebee', borderRadius: '6px', color: '#c62828', marginBottom: '20px' }}>
          <strong>❌ Erro:</strong> {analysis.error}
        </div>
      )}

      {/* Results */}
      {analysis.result && (
        <div className="analysis-results">
          {/* Tabs */}
          <div className="analysis-tabs">
            <button className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>
              📊 Resumo
            </button>
            <button className={`tab-btn ${activeTab === 'weaknesses' ? 'active' : ''}`} onClick={() => setActiveTab('weaknesses')}>
              ⚠️ Fraquezas ({analysis.result.weaknesses.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'counterarguments' ? 'active' : ''}`}
              onClick={() => setActiveTab('counterarguments')}
            >
              ⚔️ Contra-argumentos ({analysis.result.counterArguments.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
              onClick={() => setActiveTab('recommendations')}
            >
              💡 Recomendações ({analysis.result.recommendations.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'blindages' ? 'active' : ''}`}
              onClick={() => setActiveTab('blindages')}
            >
              🔒 Blindagem ({analysis.result.argumentBlimdages.length})
            </button>
          </div>

          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="analysis-summary">
              <h3 className="summary-title">📈 Análise Geral</h3>

              <div className="executive-summary">
                <strong>Resumo Executivo:</strong> {analysis.result.executiveSummary}
              </div>

              <p className="summary-text">{analysis.result.summary}</p>

              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Força Geral</div>
                  <div className="metric-value">{Math.round(analysis.result.overallStrengthScore)}%</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Fraqueza Geral</div>
                  <div className="metric-value">{Math.round(analysis.result.overallWeaknessScore)}%</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Confiança da IA</div>
                  <div className="metric-value">{Math.round(analysis.result.confidenceScore)}%</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Total de Argumentos</div>
                  <div className="metric-value">{analysis.result.argumentBlimdages.length}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Fraquezas Críticas</div>
                  <div className="metric-value" style={{ color: analysis.result.weaknesses.filter((w) => w.severity === 'critical').length > 0 ? '#f44336' : '#4caf50' }}>
                    {analysis.result.weaknesses.filter((w) => w.severity === 'critical').length}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Ações Recomendadas</div>
                  <div className="metric-value">{analysis.result.recommendations.length}</div>
                </div>
              </div>
            </div>
          )}

          {/* Weaknesses Tab */}
          {activeTab === 'weaknesses' && (
            <div className="weaknesses-list">
              {analysis.result.weaknesses.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  ✓ Nenhuma fraqueza detectada
                </div>
              ) : (
                analysis.result.weaknesses.map((weakness) => (
                  <div key={weakness.id} className={`weakness-item ${weakness.severity}`}>
                    <div className="weakness-header">
                      <h4 className="weakness-title">{weakness.issue}</h4>
                      <span className={`severity-badge severity-${weakness.severity}`}>{weakness.severity}</span>
                    </div>
                    <p className="weakness-description">{weakness.description}</p>
                    <div className="weakness-impact">
                      <strong>Impacto:</strong> {weakness.potentialImpact}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Counter Arguments Tab */}
          {activeTab === 'counterarguments' && (
            <div className="counter-arguments-list">
              {analysis.result.counterArguments.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  Nenhum contra-argumento identificado
                </div>
              ) : (
                analysis.result.counterArguments.map((counter) => (
                  <div key={counter.id} className="counter-item">
                    <h4 className="counter-title">{counter.description}</h4>
                    <span className="counter-basis">Fundamento: {counter.legalBasis}</span>
                    <span className={`counter-likelihood`}>Probabilidade: {counter.likelihood}</span>

                    <p className="counter-description">{counter.description}</p>

                    <div className="refutation-box">
                      <div className={`refutation-strength`}>✓ Refutação ({counter.refutationStrength})</div>
                      {counter.refutation}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Recommendations Tab */}
          {activeTab === 'recommendations' && (
            <div className="recommendations-list">
              {analysis.result.recommendations.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  Nenhuma recomendação
                </div>
              ) : (
                analysis.result.recommendations.map((rec) => (
                  <div key={rec.id} className="recommendation-item">
                    <span className={`recommendation-priority priority-${rec.priority}`}>{rec.priority}</span>
                    <h4 className="rec-title">{rec.description}</h4>
                    <span className="rec-type">{rec.type}</span>

                    <p className="rec-description">{rec.description}</p>

                    <div className="rec-implementation">
                      <strong>Implementação:</strong> {rec.implementation}
                    </div>

                    <div className="rec-impact">
                      <strong>Impacto Esperado:</strong> {rec.expectedImpact} | Esforço: {rec.estimatedEffort}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Blindages Tab */}
          {activeTab === 'blindages' && (
            <div className="weaknesses-list">
              {analysis.result.argumentBlimdages.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  Nenhum argumento para blindagem
                </div>
              ) : (
                analysis.result.argumentBlimdages.map((blindage) => (
                  <div key={blindage.argumentId} className="weakness-item medium" style={{ borderLeftColor: '#2196f3', background: '#e3f2fd' }}>
                    <div className="weakness-header">
                      <h4 className="weakness-title">Argumento: {blindage.argumentId}</h4>
                      <span style={{ background: '#2196f3', color: 'white', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: '600' }}>
                        Vulnerabilidade: {Math.round(blindage.vulnerabilityScore)}%
                      </span>
                    </div>

                    <p className="weakness-description" style={{ color: '#1976d2' }}>
                      {blindage.argumentText}
                    </p>

                    <div style={{ marginTop: '12px' }}>
                      <strong style={{ color: '#1976d2' }}>Criticismos potenciais:</strong>
                      <ul style={{ margin: '5px 0 0 20px', paddingLeft: 0, color: '#555', fontSize: '12px' }}>
                        {blindage.criticisms.map((crit, idx) => (
                          <li key={idx}>{crit}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ marginTop: '12px', background: '#fff', padding: '10px', borderRadius: '4px', borderLeft: '3px solid #4caf50' }}>
                      <strong style={{ color: '#2e7d32' }}>Defesas recomendadas:</strong>
                      <ul style={{ margin: '5px 0 0 20px', paddingLeft: 0, color: '#2e7d32', fontSize: '12px' }}>
                        {blindage.defenses.map((def, idx) => (
                          <li key={idx}>{def}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ marginTop: '12px', background: '#fff9c4', padding: '10px', borderRadius: '4px', borderLeft: '3px solid #fbc02d' }}>
                      <strong style={{ color: '#f57f17' }}>Reframing alternativo:</strong>
                      <p style={{ margin: '5px 0 0 0', color: '#555', fontSize: '12px' }}>{blindage.alternativeFraming}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {!analysis.result && !analysis.loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          <p>Preencha o formulário acima e clique em "Analisar Estratégia" para começar a análise</p>
        </div>
      )}
    </div>
  )
}
