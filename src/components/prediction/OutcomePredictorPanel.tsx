/**
 * Outcome Predictor Panel
 * Predicts case success probability
 */

import { useState } from 'react'
import { useOutcomePredictor } from '../../hooks/useOutcomePredictor'
import './OutcomePredictorPanel.css'

export function OutcomePredictorPanel() {
  const predictor = useOutcomePredictor()
  const [petitionContent, setPetitionContent] = useState('')
  const [legalArea, setLegalArea] = useState('')

  const handlePredict = async () => {
    await predictor.predict(petitionContent, legalArea)
  }

  const getProbabilityColor = (probability: number) => {
    if (probability >= 65) return 'probability-high'
    if (probability >= 45) return 'probability-medium'
    return 'probability-low'
  }

  const getRiskClass = (risk: string) => {
    return `risk-${risk.toLowerCase()}`
  }

  const getRecommendationClass = (rec: string) => {
    if (rec === 'proceed') return 'recommendation-proceed'
    if (rec === 'proceed-cautiously') return 'recommendation-cautious'
    return 'recommendation-reconsider'
  }

  return (
    <div className="outcome-predictor-panel">
      <div className="predictor-header">
        <h2>🔮 Preditor de Resultado</h2>
        <p>Calcule a probabilidade de sucesso da sua petição</p>
      </div>

      {/* Input Area */}
      <div className="predictor-inputs">
        <textarea
          className="predictor-textarea"
          value={petitionContent}
          onChange={(e) => setPetitionContent(e.target.value)}
          placeholder="Cole o conteúdo da petição aqui para análise de resultado..."
        />

        <select
          value={legalArea}
          onChange={(e) => setLegalArea(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
        >
          <option value="">Selecione uma área jurídica...</option>
          <option value="civil">Direito Civil</option>
          <option value="penal">Direito Penal</option>
          <option value="trabalhista">Direito Trabalhista</option>
          <option value="tributario">Direito Tributário</option>
          <option value="comercial">Direito Comercial</option>
        </select>

        <button
          onClick={handlePredict}
          disabled={!petitionContent.trim() || predictor.loading}
          className="predictor-button"
        >
          {predictor.loading ? '⏳ Analisando...' : '🔮 Prever Resultado'}
        </button>
      </div>

      {/* Error Message */}
      {predictor.error && (
        <div style={{ padding: '15px', background: '#ffebee', borderRadius: '6px', color: '#c62828', marginBottom: '20px' }}>
          <strong>❌ Erro:</strong> {predictor.error}
        </div>
      )}

      {/* Results */}
      {predictor.prediction && (
        <div className="prediction-result">
          {/* Success Probability */}
          <div className="success-probability">
            <div className="probability-label">Probabilidade de Sucesso</div>
            <div className={`probability-circle ${getProbabilityColor(predictor.prediction.successProbability)}`}>
              {predictor.prediction.successProbability}%
            </div>
            <p className="probability-text">
              {predictor.prediction.successProbability >= 70
                ? '✓ Perspectivas favoráveis para esta petição'
                : predictor.prediction.successProbability >= 50
                  ? '⟳ Resultado incerto - reforçar argumentação'
                  : '⚠️ Risco significativo - considere revisão'}
            </p>
            <span className="confidence-badge">
              Confiança: {predictor.prediction.confidenceLevel}%
            </span>

            <div className="risk-recommendation">
              <div className={`risk-card ${getRiskClass(predictor.prediction.riskLevel)}`}>
                <div className="card-label">Nível de Risco</div>
                <div className="card-value">{predictor.prediction.riskLevel.toUpperCase()}</div>
              </div>
              <div className={`recommendation-card ${getRecommendationClass(predictor.prediction.recommendation)}`}>
                <div className="card-label">Recomendação</div>
                <div className="card-value">
                  {predictor.prediction.recommendation === 'proceed'
                    ? 'PROSSEGUIR'
                    : predictor.prediction.recommendation === 'proceed-cautiously'
                      ? 'PROSSEGUIR COM CUIDADO'
                      : 'RECONSIDERAR'}
                </div>
              </div>
            </div>
          </div>

          {/* Strength Scores */}
          <div className="strength-scores">
            <h3 className="scores-title">📊 Pontuações de Força</h3>
            <div className="scores-grid">
              <div className="score-item">
                <div className="score-name">Força Factual</div>
                <div className="score-bar">
                  <div className="score-fill" style={{ width: `${predictor.prediction.strengthScores.factualStrength}%` }} />
                </div>
                <div className="score-number">{Math.round(predictor.prediction.strengthScores.factualStrength)}%</div>
              </div>
              <div className="score-item">
                <div className="score-name">Fundação Legal</div>
                <div className="score-bar">
                  <div className="score-fill" style={{ width: `${predictor.prediction.strengthScores.legalFoundation}%` }} />
                </div>
                <div className="score-number">{Math.round(predictor.prediction.strengthScores.legalFoundation)}%</div>
              </div>
              <div className="score-item">
                <div className="score-name">Suporte Probatório</div>
                <div className="score-bar">
                  <div className="score-fill" style={{ width: `${predictor.prediction.strengthScores.evidentiarySupport}%` }} />
                </div>
                <div className="score-number">{Math.round(predictor.prediction.strengthScores.evidentiarySupport)}%</div>
              </div>
              <div className="score-item">
                <div className="score-name">Conformidade Proc.</div>
                <div className="score-bar">
                  <div className="score-fill" style={{ width: `${predictor.prediction.strengthScores.proceduralCompliance}%` }} />
                </div>
                <div className="score-number">{Math.round(predictor.prediction.strengthScores.proceduralCompliance)}%</div>
              </div>
              <div className="score-item">
                <div className="score-name">Posicionamento</div>
                <div className="score-bar">
                  <div className="score-fill" style={{ width: `${predictor.prediction.strengthScores.strategicPositioning}%` }} />
                </div>
                <div className="score-number">{Math.round(predictor.prediction.strengthScores.strategicPositioning)}%</div>
              </div>
              <div className="score-item">
                <div className="score-name">Qualidade Geral</div>
                <div className="score-bar">
                  <div className="score-fill" style={{ width: `${predictor.prediction.strengthScores.overallQuality}%` }} />
                </div>
                <div className="score-number">{Math.round(predictor.prediction.strengthScores.overallQuality)}%</div>
              </div>
            </div>
          </div>

          {/* Key Factors */}
          <div className="key-factors">
            <h3 className="factors-title">🎯 Fatores Críticos</h3>
            <div className="factors-list">
              {predictor.prediction.keyFactors.map((factor) => (
                <div key={factor.factor} className="factor-item">
                  <div className="factor-icon">
                    {factor.impact === 'positive' ? '✓' : factor.impact === 'negative' ? '✗' : '◆'}
                  </div>
                  <div className="factor-content">
                    <div className="factor-name">{factor.factor}</div>
                    <p className="factor-description">{factor.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Improvements */}
          {predictor.prediction.improvementOpportunities.length > 0 && (
            <div className="improvements-section">
              <h3 className="improvements-title">💡 Oportunidades de Melhoria</h3>
              <div className="improvements-list">
                {predictor.prediction.improvementOpportunities.map((improvement, idx) => (
                  <div key={idx} className="improvement-item">
                    {improvement}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {predictor.prediction.warningsAndRisks.length > 0 && (
            <div style={{ background: '#fff3cd', padding: '15px', borderRadius: '6px', borderLeft: '4px solid #ffc107', marginTop: '10px' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#856404', fontSize: '14px' }}>⚠️ Atenções</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#856404', fontSize: '13px' }}>
                {predictor.prediction.warningsAndRisks.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!predictor.prediction && !predictor.loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          <p>Preencha o formulário acima e clique em "Prever Resultado" para começar</p>
        </div>
      )}
    </div>
  )
}
