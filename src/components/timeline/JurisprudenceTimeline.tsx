/**
 * Jurisprudence Timeline Component
 * Interactive visualization of how case law evolves over time
 */

import { useState } from 'react'
import { useJurisprudenceTimeline } from '../../hooks/useJurisprudenceTimeline'
import './JurisprudenceTimeline.css'

export function JurisprudenceTimeline() {
  const timeline = useJurisprudenceTimeline()
  const [searchTerm, setSearchTerm] = useState('')
  const [startYear, setStartYear] = useState(2010)
  const [endYear, setEndYear] = useState(2024)

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    await timeline.generateTimeline(searchTerm, startYear, endYear)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="jurisprudence-timeline">
      <div className="timeline-header">
        <h2>📈 Evolução da Jurisprudência</h2>
        <p>Visualize como a jurisprudência se desenvolveu sobre temas específicos ao longo do tempo</p>
      </div>

      {/* Search and Controls */}
      <div className="timeline-controls">
        <div className="search-input-group">
          <input
            type="text"
            className="timeline-search"
            placeholder="Ex: 'responsabilidade civil', 'direitos autorais', 'contratos eletrônicos'..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <div className="year-range">
            <input
              type="number"
              className="year-input"
              min="1990"
              max={endYear - 1}
              value={startYear}
              onChange={(e) => setStartYear(parseInt(e.target.value))}
              placeholder="Ano inicial"
            />
            <span>a</span>
            <input
              type="number"
              className="year-input"
              min={startYear + 1}
              max="2050"
              value={endYear}
              onChange={(e) => setEndYear(parseInt(e.target.value))}
              placeholder="Ano final"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!searchTerm.trim() || timeline.loading}
            className="search-button"
          >
            {timeline.loading ? '⏳ Buscando...' : '🔍 Buscar'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {timeline.error && (
        <div style={{ padding: '15px', background: '#ffebee', borderRadius: '6px', color: '#c62828', marginBottom: '20px' }}>
          <strong>❌ Erro:</strong> {timeline.error}
        </div>
      )}

      {/* Loading State */}
      {timeline.loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          <p>⏳ Analisando jurisprudência...</p>
        </div>
      )}

      {/* Timeline Visualization */}
      {timeline.analysis && !timeline.loading && (
        <>
          {/* Timeline Events */}
          <div className="timeline-container">
            <div className="timeline-line" />
            <div className="timeline-events">
              {timeline.analysis.clusters.map((cluster) =>
                cluster.events.map((event, eventIdx) => (
                  <div
                    key={event.id}
                    className="timeline-event"
                    style={{ animationDelay: `${eventIdx * 0.1}s` }}
                  >
                    <div className="timeline-marker">
                      <div className="timeline-year">{event.year}</div>
                      <div className="timeline-dot" />
                    </div>
                    <div className="timeline-event-content">
                      <div className="event-header">
                        <h3 className="event-title">{event.title}</h3>
                        <span className={`event-decision decision-${event.decision}`}>
                          {event.decision === 'favorable' && '✓ Favorável'}
                          {event.decision === 'unfavorable' && '✗ Desfavorável'}
                          {event.decision === 'mixed' && '~ Misto'}
                        </span>
                      </div>

                      <span className="event-tribunal">{event.tribunal}</span>
                      <div className="event-case-number">{event.caseNumber}</div>

                      <p className="event-description">{event.description}</p>

                      <div className="event-impact">
                        <strong>Impacto:</strong> {event.impact}
                      </div>

                      <div className="event-keywords">
                        {event.keywords.map((keyword, idx) => (
                          <span key={idx} className="keyword-tag">
                            #{keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Summary Section */}
          <div className="timeline-summary">
            <h3 className="summary-title">📊 Análise da Jurisprudência</h3>

            <p className="summary-text">{timeline.analysis.summary}</p>

            <div className="summary-stats">
              <div className="stat-item">
                <div className="stat-label">Total de Casos</div>
                <div className="stat-value">{timeline.analysis.totalEvents}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Tendência</div>
                <div className="stat-value">
                  {timeline.analysis.currentTrend === 'favorable' && '✓ Favorável'}
                  {timeline.analysis.currentTrend === 'unfavorable' && '✗ Desfavorável'}
                  {timeline.analysis.currentTrend === 'mixed' && '~ Misto'}
                  {timeline.analysis.currentTrend === 'evolving' && '⟳ Em Evolução'}
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Pontos de Virada</div>
                <div className="stat-value">{timeline.analysis.majorTurningPoints.length}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Casos Favoráveis</div>
                <div className="stat-value">
                  {timeline.analysis.clusters
                    .flatMap((c) => c.events)
                    .filter((e) => e.decision === 'favorable').length}
                </div>
                <div className="stat-percentage">
                  {(
                    (timeline.analysis.clusters
                      .flatMap((c) => c.events)
                      .filter((e) => e.decision === 'favorable').length /
                      timeline.analysis.totalEvents) *
                    100
                  ).toFixed(0)}
                  %
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="recommendations-section">
            <h3 className="recommendations-title">💡 Recomendações Estratégicas</h3>
            <div className="recommendation-list">
              {timeline.analysis.recommendations.map((rec, idx) => (
                <div key={idx} className="recommendation-item">
                  {rec}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* No Results */}
      {!timeline.analysis && !timeline.loading && searchTerm && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          <p>Clique em "Buscar" para analisar a evolução da jurisprudência</p>
        </div>
      )}

      {!timeline.analysis && !timeline.loading && !searchTerm && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          <p>Digite um tema jurídico para começar a análise da evolução jurisprudencial</p>
        </div>
      )}
    </div>
  )
}
