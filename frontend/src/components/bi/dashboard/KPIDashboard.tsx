import React, { useState, useEffect } from 'react';
import { FinancialKPIs, BiFilterState } from '../../../types/bi';
import { KPICard } from '../cards/KPICard';
import './KPIDashboard.css';

interface KPIDashboardProps {
  kpis: FinancialKPIs | null;
  isLoading?: boolean;
  filters?: BiFilterState;
  onFilterChange?: (filters: BiFilterState) => void;
}

export const KPIDashboard: React.FC<KPIDashboardProps> = ({
  kpis,
  isLoading = false,
  filters,
  onFilterChange,
}) => {
  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);

  useEffect(() => {
    // Log quando os KPIs mudam
    console.log('KPIs atualizados:', kpis);
  }, [kpis]);

  const handleDateRangeChange = (startDate: string, endDate: string) => {
    if (onFilterChange && filters) {
      onFilterChange({
        ...filters,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    }
  };

  if (!kpis) {
    return <div className="kpi-dashboard-empty">Carregando dados financeiros...</div>;
  }

  const mainKPIs = [
    kpis.grossRevenue,
    kpis.ebitda,
    kpis.profitMargin,
  ];

  const secondaryKPIs = [
    kpis.netRevenue,
    kpis.operationalCosts,
    kpis.liquidityCurrent,
  ];

  return (
    <div className="kpi-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1 className="dashboard-title">Dashboard Financeiro</h1>
          <p className="dashboard-subtitle">Visão geral dos KPIs contábeis e financeiros</p>
        </div>
        <div className="header-filters">
          <input
            type="date"
            defaultValue={filters?.startDate.toISOString().split('T')[0]}
            onChange={(e) => {
              const endDate = filters?.endDate.toISOString().split('T')[0] || '';
              handleDateRangeChange(e.target.value, endDate);
            }}
            className="filter-input"
          />
          <span className="filter-separator">até</span>
          <input
            type="date"
            defaultValue={filters?.endDate.toISOString().split('T')[0]}
            onChange={(e) => {
              const startDate = filters?.startDate.toISOString().split('T')[0] || '';
              handleDateRangeChange(startDate, e.target.value);
            }}
            className="filter-input"
          />
        </div>
      </div>

      <section className="kpi-section">
        <h2 className="section-title">Indicadores Principais</h2>
        <div className="kpi-grid main-grid">
          {mainKPIs.map((kpi) => (
            <div
              key={kpi.id}
              className={`kpi-item ${selectedKPI === kpi.id ? 'selected' : ''}`}
              onClick={() => setSelectedKPI(kpi.id)}
            >
              <KPICard kpi={kpi} isLoading={isLoading} />
            </div>
          ))}
        </div>
      </section>

      <section className="kpi-section">
        <h2 className="section-title">Indicadores Complementares</h2>
        <div className="kpi-grid secondary-grid">
          {secondaryKPIs.map((kpi) => (
            <div
              key={kpi.id}
              className={`kpi-item ${selectedKPI === kpi.id ? 'selected' : ''}`}
              onClick={() => setSelectedKPI(kpi.id)}
            >
              <KPICard kpi={kpi} isLoading={isLoading} />
            </div>
          ))}
        </div>
      </section>

      {selectedKPI && (
        <section className="kpi-detail">
          <button
            className="close-detail"
            onClick={() => setSelectedKPI(null)}
            aria-label="Fechar detalhes"
          >
            ✕
          </button>
          <div className="detail-content">
            <h3>Análise Detalhada</h3>
            <p>Detalhes do KPI selecionado serão exibidos aqui.</p>
          </div>
        </section>
      )}
    </div>
  );
};

export default KPIDashboard;
