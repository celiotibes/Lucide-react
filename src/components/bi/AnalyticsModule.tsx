import { useEffect, useState } from 'react'
import { StarSchemaManager } from '../../services/bi/starSchemaManager'
import { AnalyticsEngine } from '../../services/bi/analyticsEngine'
import { TrendAnalysisChart } from './TrendAnalysisChart'
import { AnomalyDetectionPanel } from './AnomalyDetectionPanel'
import { PeriodComparisonChart } from './PeriodComparisonChart'
import type { TrendData, PeriodComparison } from '../../services/bi/analyticsEngine'
import './AnalyticsModule.css'

interface AnalyticsModuleProps {
  showIntro?: boolean
}

export function AnalyticsModule({ showIntro = true }: AnalyticsModuleProps) {
  const [debitTrends, setDebitTrends] = useState<TrendData[]>([])
  const [creditTrends, setCreditTrends] = useState<TrendData[]>([])
  const [balanceTrends, setBalanceTrends] = useState<TrendData[]>([])
  const [comparisons, setComparisons] = useState<PeriodComparison[]>([])
  const [ratios, setRatios] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadAnalytics = () => {
      try {
        const schema = StarSchemaManager.loadSchema()

        if (schema.factBalancete.length > 0) {
          // Calculate trends
          setDebitTrends(AnalyticsEngine.calculateTrends(schema.factBalancete, 'debit'))
          setCreditTrends(AnalyticsEngine.calculateTrends(schema.factBalancete, 'credit'))
          setBalanceTrends(AnalyticsEngine.calculateTrends(schema.factBalancete, 'balance'))

          // Calculate ratios
          const calculatedRatios = AnalyticsEngine.calculateRatios(schema)
          setRatios(calculatedRatios)

          // For comparisons, if we have enough data, compare first half vs second half
          const facts = schema.factBalancete
          const mid = Math.floor(facts.length / 2)
          if (mid > 0) {
            const firstHalf = facts.slice(0, mid)
            const secondHalf = facts.slice(mid)

            const debitComp = AnalyticsEngine.comparePeriods(firstHalf, secondHalf, 'debit')
            const creditComp = AnalyticsEngine.comparePeriods(firstHalf, secondHalf, 'credit')
            const balanceComp = AnalyticsEngine.comparePeriods(firstHalf, secondHalf, 'balance')

            setComparisons([debitComp, creditComp, balanceComp])
          }
        }
      } catch (err) {
        console.error('Error loading analytics:', err)
      } finally {
        setLoading(false)
      }
    }

    loadAnalytics()
  }, [])

  if (loading) {
    return <div className="analytics-module loading">Carregando análises...</div>
  }

  if (balanceTrends.length === 0) {
    return (
      <div className="analytics-module empty-state">
        <div className="empty-content">
          <h3>📊 Nenhum dado para análise</h3>
          <p>Importe dados contábeis para ver análises de trends, anomalias e comparações de períodos.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="analytics-module">
      {showIntro && (
        <div className="analytics-intro">
          <h2>📈 Análise de Trends & Anomalias</h2>
          <p>
            Visualize tendências de 12 meses, detecte anomalias automáticas em seus dados contábeis e
            compare períodos para análise comparativa.
          </p>
        </div>
      )}

      <div className="analytics-grid">
        {/* Trend Analysis */}
        <div className="analytics-section span-2">
          <TrendAnalysisChart
            data={balanceTrends}
            title="Saldo Contábil - 12 Meses"
            unit="R$"
            showForecast={true}
          />
        </div>

        {/* Anomaly Detection */}
        <div className="analytics-section">
          <AnomalyDetectionPanel data={balanceTrends} title="Detecção de Anomalias" threshold={2} />
        </div>

        {/* Financial Ratios */}
        <div className="analytics-section ratios-panel">
          <h3>Índices Financeiros</h3>
          <div className="ratios-grid">
            <div className="ratio-card">
              <span className="ratio-label">Débito Total</span>
              <span className="ratio-value">
                {(ratios.totalDebit || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="ratio-card">
              <span className="ratio-label">Crédito Total</span>
              <span className="ratio-value">
                {(ratios.totalCredit || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="ratio-card">
              <span className="ratio-label">Saldo</span>
              <span
                className="ratio-value"
                style={{
                  color: (ratios.balance || 0) > 0 ? '#4caf50' : '#f44336',
                }}
              >
                {(ratios.balance || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="ratio-card">
              <span className="ratio-label">Volatilidade</span>
              <span className="ratio-value">
                {(ratios.volatility || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>

        {/* Period Comparison */}
        {comparisons.length > 0 && (
          <div className="analytics-section span-2">
            <h3>Comparação de Períodos</h3>
            <PeriodComparisonChart comparisons={comparisons} unit="R$" />
          </div>
        )}

        {/* Additional Trends */}
        <div className="analytics-section">
          <TrendAnalysisChart
            data={debitTrends}
            title="Débitos - Trend"
            unit="R$"
            showForecast={false}
          />
        </div>

        <div className="analytics-section">
          <TrendAnalysisChart
            data={creditTrends}
            title="Créditos - Trend"
            unit="R$"
            showForecast={false}
          />
        </div>
      </div>

      {/* Insights */}
      <div className="analytics-insights">
        <h3>💡 Insights Detectados</h3>
        <div className="insights-list">
          {ratios.volatility && ratios.volatility > ratios.totalDebit! * 0.1 && (
            <div className="insight-item warning">
              <span className="icon">⚠️</span>
              <span className="text">Alta volatilidade detectada. Analise as transações outliers.</span>
            </div>
          )}
          {balanceTrends.length > 3 && balanceTrends[balanceTrends.length - 1].percentChange! > 20 && (
            <div className="insight-item success">
              <span className="icon">✅</span>
              <span className="text">Crescimento mês-a-mês acima de 20%. Tendência positiva!</span>
            </div>
          )}
          {balanceTrends.length > 3 && balanceTrends[balanceTrends.length - 1].percentChange! < -20 && (
            <div className="insight-item critical">
              <span className="icon">🔴</span>
              <span className="text">Queda mês-a-mês acima de 20%. Investigar imediatamente.</span>
            </div>
          )}
          {comparisons.length > 0 && comparisons.every((c) => c.trend === 'increase') && (
            <div className="insight-item success">
              <span className="icon">📈</span>
              <span className="text">Todas as métricas cresceram no período. Desempenho sólido.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
