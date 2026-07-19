/**
 * FASE 13: Renewal Comparator Panel
 * Compara contratos originais com renovações e oferece análise de equidade
 */

import { useState } from 'react'
import { RenewalComparator, type ContractSnapshot } from '../../services/renewalComparator'
import './RenewalComparatorPanel.css'

export function RenewalComparatorPanel() {
  const [activeTab, setActiveTab] = useState<'input' | 'results'>('input')
  const [originalRent, setOriginalRent] = useState(3000)
  const [originalCaution, setOriginalCaution] = useState(6000)
  const [originalAdminFee, setOriginalAdminFee] = useState(300)
  const [originalStartDate, setOriginalStartDate] = useState('2022-01-01')
  const [originalEndDate, setOriginalEndDate] = useState('2024-12-31')

  const [renewalRent, setRenewalRent] = useState(3300)
  const [renewalCaution, setRenewalCaution] = useState(6000)
  const [renewalAdminFee, setRenewalAdminFee] = useState(330)
  const [renewalStartDate, setRenewalStartDate] = useState('2025-01-01')
  const [renewalEndDate, setRenewalEndDate] = useState('2027-12-31')

  const [comparison, setComparison] = useState<any>(null)
  const [error, setError] = useState<string>('')

  const handleCompare = () => {
    try {
      setError('')
      const original: ContractSnapshot = {
        id: 'original',
        version: 'original',
        date: originalStartDate,
        rent: originalRent,
        caution: originalCaution,
        adminFee: originalAdminFee,
        startDate: originalStartDate,
        endDate: originalEndDate,
      }

      const renewal: ContractSnapshot = {
        id: 'renewal',
        version: 'renewal',
        date: renewalStartDate,
        rent: renewalRent,
        caution: renewalCaution,
        adminFee: renewalAdminFee,
        startDate: renewalStartDate,
        endDate: renewalEndDate,
      }

      const result = RenewalComparator.compare(original, renewal)
      setComparison(result)
      setActiveTab('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao comparar contratos')
    }
  }

  const getFairnessColor = (score: number): string => {
    if (score >= 80) return '#4caf50'
    if (score >= 60) return '#ffc107'
    return '#f44336'
  }

  const handleCopyRecommendations = () => {
    if (!comparison) return
    const text = comparison.analysis.recommendations.join('\n')
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="renewal-comparator-panel">
      <div className="comparator-container">
        <div className="comparator-header">
          <h2>🏢 Comparador de Contratos Imobiliários</h2>
          <p>Análise detalhada de renovação de contratos de aluguel com validação de equidade</p>
        </div>

        <div className="comparator-tabs">
          <button
            className={`tab ${activeTab === 'input' ? 'active' : ''}`}
            onClick={() => setActiveTab('input')}
          >
            📝 Dados do Contrato
          </button>
          <button
            className={`tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
            disabled={!comparison}
          >
            📊 Análise
          </button>
        </div>

        {activeTab === 'input' && (
          <div className="input-section">
            <div className="contract-section">
              <h3>Contrato Original</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Data Inicial</label>
                  <input
                    type="date"
                    value={originalStartDate}
                    onChange={(e) => setOriginalStartDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Data Final</label>
                  <input
                    type="date"
                    value={originalEndDate}
                    onChange={(e) => setOriginalEndDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Aluguel Mensal (R$)</label>
                  <input
                    type="number"
                    value={originalRent}
                    onChange={(e) => setOriginalRent(Number(e.target.value))}
                    className="form-input"
                    step="100"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Caução (R$)</label>
                  <input
                    type="number"
                    value={originalCaution}
                    onChange={(e) => setOriginalCaution(Number(e.target.value))}
                    className="form-input"
                    step="100"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Taxa Admin. (R$)</label>
                  <input
                    type="number"
                    value={originalAdminFee}
                    onChange={(e) => setOriginalAdminFee(Number(e.target.value))}
                    className="form-input"
                    step="10"
                    min="0"
                  />
                </div>
              </div>
            </div>

            <div className="contract-section">
              <h3>Contrato Renovado</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Data Inicial</label>
                  <input
                    type="date"
                    value={renewalStartDate}
                    onChange={(e) => setRenewalStartDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Data Final</label>
                  <input
                    type="date"
                    value={renewalEndDate}
                    onChange={(e) => setRenewalEndDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Aluguel Mensal (R$)</label>
                  <input
                    type="number"
                    value={renewalRent}
                    onChange={(e) => setRenewalRent(Number(e.target.value))}
                    className="form-input"
                    step="100"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Caução (R$)</label>
                  <input
                    type="number"
                    value={renewalCaution}
                    onChange={(e) => setRenewalCaution(Number(e.target.value))}
                    className="form-input"
                    step="100"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Taxa Admin. (R$)</label>
                  <input
                    type="number"
                    value={renewalAdminFee}
                    onChange={(e) => setRenewalAdminFee(Number(e.target.value))}
                    className="form-input"
                    step="10"
                    min="0"
                  />
                </div>
              </div>
            </div>

            {error && <div className="error-message">⚠️ {error}</div>}

            <div className="action-buttons">
              <button onClick={handleCompare} className="btn-compare">
                🔍 Comparar Contratos
              </button>
            </div>
          </div>
        )}

        {activeTab === 'results' && comparison && (
          <div className="results-section">
            <div className="fairness-summary">
              <div
                className="fairness-score"
                style={{
                  borderColor: getFairnessColor(comparison.analysis.fairnessScore),
                }}
              >
                <div className="score-number" style={{ color: getFairnessColor(comparison.analysis.fairnessScore) }}>
                  {comparison.analysis.fairnessScore}
                </div>
                <div className="score-label">Score de Equidade</div>
                <div className="score-description">
                  {comparison.analysis.fairnessScore >= 80
                    ? 'Renovação Justa ✓'
                    : comparison.analysis.fairnessScore >= 60
                      ? 'Verificar Detalhes ⚠️'
                      : 'Rejunção Recomendada ✗'}
                </div>
              </div>

              <div className="adjustment-type" style={{ borderColor: comparison.analysis.adjustmentType === 'at-ipca' ? '#2196f3' : comparison.analysis.adjustmentType === 'below-ipca' ? '#4caf50' : '#ff9800' }}>
                <div className="type-label">Tipo de Reajuste</div>
                <div className="type-value">
                  {comparison.analysis.adjustmentType === 'at-ipca'
                    ? 'Alinhado ao IPCA'
                    : comparison.analysis.adjustmentType === 'below-ipca'
                      ? 'Abaixo do IPCA'
                      : 'Acima do IPCA'}
                </div>
                <div className="type-percentage">
                  {comparison.analysis.adjustmentVsIPCA >= 0 ? '+' : ''}
                  {comparison.analysis.adjustmentVsIPCA.toFixed(2)}% vs IPCA
                </div>
              </div>
            </div>

            <div className="changes-grid">
              <div className="change-card">
                <div className="change-label">Aluguel</div>
                <div className="change-old">
                  R$ {comparison.original.rent.toFixed(2)}
                </div>
                <div className="change-arrow">→</div>
                <div className="change-new">
                  R$ {comparison.renewal.rent.toFixed(2)}
                </div>
                <div
                  className={`change-percentage ${comparison.changes.rentChange.absolute >= 0 ? 'increase' : 'decrease'}`}
                >
                  {comparison.changes.rentChange.absolute >= 0 ? '+' : ''}
                  {comparison.changes.rentChange.percentage.toFixed(2)}%
                </div>
              </div>

              <div className="change-card">
                <div className="change-label">Caução</div>
                <div className="change-old">
                  R$ {comparison.original.caution.toFixed(2)}
                </div>
                <div className="change-arrow">→</div>
                <div className="change-new">
                  R$ {comparison.renewal.caution.toFixed(2)}
                </div>
                <div
                  className={`change-percentage ${comparison.changes.cautionChange.absolute >= 0 ? 'increase' : 'decrease'}`}
                >
                  {comparison.changes.cautionChange.absolute >= 0 ? '+' : ''}
                  {comparison.changes.cautionChange.percentage.toFixed(2)}%
                </div>
              </div>

              <div className="change-card">
                <div className="change-label">Taxa Admin.</div>
                <div className="change-old">
                  R$ {comparison.original.adminFee?.toFixed(2) || '0.00'}
                </div>
                <div className="change-arrow">→</div>
                <div className="change-new">
                  R$ {comparison.renewal.adminFee?.toFixed(2) || '0.00'}
                </div>
                <div
                  className={`change-percentage ${comparison.changes.adminFeeChange.absolute >= 0 ? 'increase' : 'decrease'}`}
                >
                  {comparison.changes.adminFeeChange.absolute >= 0 ? '+' : ''}
                  {comparison.changes.adminFeeChange.percentage.toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="analysis-section">
              <div className="analysis-card">
                <h4>📊 Análise de Reajuste</h4>
                <div className="analysis-item">
                  <span>IPCA Esperado:</span>
                  <strong>{comparison.analysis.ipcaAdjustmentExpected.toFixed(2)}%</strong>
                </div>
                <div className="analysis-item">
                  <span>Reajuste Realizado:</span>
                  <strong>{comparison.analysis.actualAdjustment.toFixed(2)}%</strong>
                </div>
                <div className="analysis-item">
                  <span>Diferença:</span>
                  <strong
                    style={{
                      color:
                        comparison.analysis.adjustmentVsIPCA > 0 ? '#f44336' : '#4caf50',
                    }}
                  >
                    {comparison.analysis.adjustmentVsIPCA >= 0 ? '+' : ''}
                    {comparison.analysis.adjustmentVsIPCA.toFixed(2)}%
                  </strong>
                </div>
              </div>

              {comparison.analysis.warnings.length > 0 && (
                <div className="warnings-card">
                  <h4>⚠️ Avisos</h4>
                  <ul>
                    {comparison.analysis.warnings.map((warning: string, idx: number) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {comparison.analysis.recommendations.length > 0 && (
                <div className="recommendations-card">
                  <div className="recommendations-header">
                    <h4>💡 Recomendações</h4>
                    <button
                      onClick={handleCopyRecommendations}
                      className="btn-copy"
                      title="Copiar recomendações"
                    >
                      📋 Copiar
                    </button>
                  </div>
                  <ol>
                    {comparison.analysis.recommendations.map((rec: string, idx: number) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="impact-summary">
              <h4>💰 Impacto Financeiro Anual</h4>
              <div className="impact-grid">
                <div className="impact-item">
                  <div className="impact-label">Diferença Mensal</div>
                  <div className="impact-value">
                    R$ {comparison.changes.rentChange.absolute.toFixed(2)}
                  </div>
                </div>
                <div className="impact-item">
                  <div className="impact-label">Impacto Anual</div>
                  <div className="impact-value">
                    R$ {(comparison.changes.rentChange.absolute * 12).toFixed(2)}
                  </div>
                </div>
                <div className="impact-item">
                  <div className="impact-label">Total 2 Anos</div>
                  <div className="impact-value">
                    R$ {(comparison.changes.rentChange.absolute * 24).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
