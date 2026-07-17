import { useEffect, useState } from 'react'
import { useFinancialData } from '../../hooks/useFinancialData'
import { FinancialAnalysisService } from '../../services/bi/financialAnalysis'
import { KPICards } from './KPICards'
import { WaterfallChart } from './WaterfallChart'
import { SankeyDiagram } from './SankeyDiagram'
import './FinancialDashboard.css'

export function FinancialDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    new Date().toISOString().slice(0, 7)
  )

  const { data, kpis, loading, error } = useFinancialData(selectedPeriod)

  const [waterfallData, setWaterfallData] = useState<any[]>([])
  const [sankeyData, setSankeyData] = useState<any>(null)

  // Generate visualization data when financial data changes
  useEffect(() => {
    if (data) {
      const waterfall = FinancialAnalysisService.generateWaterfallData(data)
      setWaterfallData(waterfall)

      const sankey = FinancialAnalysisService.generateSankeyData(
        data.revenue,
        data.cogs,
        data.operatingExpenses * 0.5,
        data.taxes,
        data.revenue * 0.05,
        data.netIncome * 0.2
      )
      setSankeyData(sankey)
    }
  }, [data])

  if (loading) {
    return (
      <div className="financial-dashboard">
        <div className="loading">Carregando dados financeiros...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="financial-dashboard">
        <div className="error">Erro ao carregar dados: {error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="financial-dashboard">
        <div className="empty-state">Nenhum dado disponível</div>
      </div>
    )
  }

  const handlePeriodChange = (direction: 'prev' | 'next') => {
    const date = new Date(selectedPeriod + '-01')
    if (direction === 'prev') {
      date.setMonth(date.getMonth() - 1)
    } else {
      date.setMonth(date.getMonth() + 1)
    }
    setSelectedPeriod(date.toISOString().slice(0, 7))
  }

  return (
    <div className="financial-dashboard">
      {/* Header with period selector */}
      <div className="dashboard-header">
        <h2>📊 Dashboard Financeiro</h2>
        <div className="period-selector">
          <button onClick={() => handlePeriodChange('prev')} className="period-btn">
            ← Anterior
          </button>
          <span className="period-display">{selectedPeriod}</span>
          <button onClick={() => handlePeriodChange('next')} className="period-btn">
            Próximo →
          </button>
        </div>
      </div>

      {/* Summary Box */}
      <div className="summary-box">
        <div className="summary-item">
          <span className="summary-label">Receita</span>
          <span className="summary-value">
            {new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 0,
            }).format(data.revenue)}
          </span>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <span className="summary-label">EBITDA</span>
          <span className="summary-value" style={{ color: data.ebitda > 0 ? '#4caf50' : '#f44336' }}>
            {new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 0,
            }).format(data.ebitda)}
          </span>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <span className="summary-label">Lucro Líquido</span>
          <span className="summary-value" style={{ color: data.netIncome > 0 ? '#4caf50' : '#f44336' }}>
            {new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 0,
            }).format(data.netIncome)}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis.length > 0 && <KPICards kpis={kpis} />}

      {/* Waterfall Chart */}
      {waterfallData.length > 0 && <WaterfallChart data={waterfallData} />}

      {/* Sankey Diagram */}
      {sankeyData && <SankeyDiagram nodes={sankeyData.nodes} links={sankeyData.links} />}

      {/* Insights Section */}
      <div className="insights-section">
        <h3>💡 Insights & Alertas</h3>
        <div className="insights-grid">
          {data.netIncome <= 0 && (
            <div className="insight-card insight-critical">
              <span className="insight-icon">🔴</span>
              <div className="insight-content">
                <h4>Lucro Negativo</h4>
                <p>Você obteve prejuízo neste período. Revise suas estruturas de custo.</p>
              </div>
            </div>
          )}

          {(data.operatingExpenses / data.revenue) * 100 > 40 && (
            <div className="insight-card insight-warning">
              <span className="insight-icon">⚠️</span>
              <div className="insight-content">
                <h4>Despesas Operacionais Elevadas</h4>
                <p>OpEx acima de 40% da receita. Considere otimizações operacionais.</p>
              </div>
            </div>
          )}

          {(data.cogs / data.revenue) * 100 > 50 && (
            <div className="insight-card insight-warning">
              <span className="insight-icon">⚠️</span>
              <div className="insight-content">
                <h4>COGS Elevado</h4>
                <p>Custo de vendas acima de 50% da receita. Negocie com fornecedores.</p>
              </div>
            </div>
          )}

          {data.netIncome > 0 && (data.netIncome / data.revenue) * 100 > 15 && (
            <div className="insight-card insight-success">
              <span className="insight-icon">✅</span>
              <div className="insight-content">
                <h4>Margem Saudável</h4>
                <p>Margem líquida acima de 15%. Seu negócio está em boa saúde financeira.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data Info */}
      <div className="data-info">
        <small>
          ℹ️ Dados de demonstração. Para análise real, importe seus dados contábeis. Última atualização:{' '}
          {new Date().toLocaleString('pt-BR')}
        </small>
      </div>
    </div>
  )
}
