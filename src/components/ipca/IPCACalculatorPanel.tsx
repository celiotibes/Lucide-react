/**
 * FASE 13: IPCA Calculator Panel
 * Calcula e exibe reajustes de aluguel baseados no IPCA
 */

import { useState } from 'react'
import { IPCACalculator, type IPCACalculation } from '../../services/ipcaCalculator'
import './IPCACalculatorPanel.css'

export function IPCACalculatorPanel() {
  const [startDate, setStartDate] = useState('2024-01-01')
  const [endDate, setEndDate] = useState('2025-07-19')
  const [rentValue, setRentValue] = useState(3000)
  const [calculation, setCalculation] = useState<IPCACalculation | null>(null)
  const [error, setError] = useState<string>('')

  const handleCalculate = () => {
    try {
      setError('')
      const result = IPCACalculator.calculate(startDate, endDate, rentValue)
      setCalculation(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao calcular IPCA')
    }
  }

  const handleSimulateScenarios = () => {
    const percentages = [5, 8, 10, 12, 15]
    try {
      setError('')
      const scenarios = percentages.map((pct) => ({
        percentage: pct,
        value: rentValue * (1 + pct / 100),
      }))
      const ipcaRate = IPCACalculator.getIPCAForPeriod(startDate, endDate)
      console.log(`IPCA para período: ${ipcaRate.toFixed(2)}%`, scenarios)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao simular cenários')
    }
  }

  return (
    <div className="ipca-calculator-panel">
      <div className="calculator-container">
        <div className="calculator-header">
          <h2>📈 Calculador IPCA - Reajuste de Aluguéis</h2>
          <p>Calcule o impacto da inflação IPCA em contratos imobiliários</p>
        </div>

        <div className="calculator-form">
          <div className="form-group">
            <label htmlFor="startDate">Data de Início</label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="endDate">Data de Término</label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="rentValue">Valor do Aluguel (R$)</label>
            <input
              id="rentValue"
              type="number"
              value={rentValue}
              onChange={(e) => setRentValue(Number(e.target.value))}
              className="form-input"
              step="100"
              min="0"
            />
          </div>

          <div className="form-actions">
            <button onClick={handleCalculate} className="btn-primary">
              🧮 Calcular IPCA
            </button>
            <button onClick={handleSimulateScenarios} className="btn-secondary">
              📊 Simular Cenários
            </button>
          </div>
        </div>

        {error && <div className="error-message">⚠️ {error}</div>}

        {calculation && (
          <div className="calculation-results">
            <div className="result-header">
              <h3>Resultado do Cálculo IPCA</h3>
              <p className="result-period">
                {new Date(calculation.periodStart).toLocaleDateString('pt-BR')} a{' '}
                {new Date(calculation.periodEnd).toLocaleDateString('pt-BR')}
              </p>
            </div>

            <div className="result-grid">
              <div className="result-card">
                <div className="result-label">Valor Original</div>
                <div className="result-value">
                  R$ {calculation.originalValue.toFixed(2)}
                </div>
              </div>

              <div className="result-card highlight">
                <div className="result-label">Taxa Acumulada IPCA</div>
                <div className="result-value">
                  {calculation.accumulatedRate.toFixed(2)}%
                </div>
              </div>

              <div className="result-card highlight">
                <div className="result-label">Valor Ajustado</div>
                <div className="result-value">
                  R$ {calculation.calculatedValue.toFixed(2)}
                </div>
              </div>

              <div className="result-card">
                <div className="result-label">Aumento Absoluto</div>
                <div className="result-value">
                  R$ {(calculation.calculatedValue - calculation.originalValue).toFixed(2)}
                </div>
              </div>
            </div>

            {calculation.monthlyBreakdown.length > 0 && (
              <div className="monthly-breakdown">
                <h4>📅 Evolução Mensal</h4>
                <div className="breakdown-table">
                  <div className="table-header">
                    <div className="col-month">Mês</div>
                    <div className="col-rate">Taxa (%)</div>
                    <div className="col-accumulated">Acumulado (%)</div>
                    <div className="col-value">Valor (R$)</div>
                  </div>
                  {calculation.monthlyBreakdown.slice(0, 12).map((month, idx) => (
                    <div key={idx} className="table-row">
                      <div className="col-month">{month.month}</div>
                      <div className="col-rate">{month.monthlyRate.toFixed(3)}%</div>
                      <div className="col-accumulated">{month.accumulatedToDate.toFixed(2)}%</div>
                      <div className="col-value">R$ {month.valueToDate.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="result-analysis">
              <h4>📊 Análise Comparativa</h4>
              <div className="analysis-cards">
                <div className="analysis-card">
                  <div className="analysis-label">Cenário: Sem Reajuste</div>
                  <div className="analysis-value">R$ {calculation.originalValue.toFixed(2)}</div>
                  <div className="analysis-impact">0% de aumento</div>
                </div>

                <div className="analysis-card active">
                  <div className="analysis-label">Cenário: IPCA</div>
                  <div className="analysis-value">
                    R$ {calculation.calculatedValue.toFixed(2)}
                  </div>
                  <div className="analysis-impact">
                    +{calculation.accumulatedRate.toFixed(2)}%
                  </div>
                </div>

                <div className="analysis-card">
                  <div className="analysis-label">Cenário: Acréscimo de 10%</div>
                  <div className="analysis-value">
                    R$ {(calculation.originalValue * 1.1).toFixed(2)}
                  </div>
                  <div className="analysis-impact">
                    {(10 - calculation.accumulatedRate).toFixed(2)}% acima do IPCA
                  </div>
                </div>
              </div>
            </div>

            <div className="info-box">
              <h5>💡 Informações Importantes</h5>
              <ul>
                <li>
                  Este cálculo usa dados reais do IPCA de {new Date().getFullYear()} até julho/2025
                </li>
                <li>Para períodos sem dados oficiais, usa-se taxa média de 0,3% ao mês</li>
                <li>O reajuste por IPCA é a forma mais equitativa de preservar o poder de compra</li>
                <li>Consulte especialista contábil para validação em contratos reais</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
