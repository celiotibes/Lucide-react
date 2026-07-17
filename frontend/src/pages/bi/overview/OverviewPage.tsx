/**
 * BI Overview Page
 * Dashboard principal com visão geral dos KPIs financeiros
 */

import React, { useState, useEffect } from 'react';
import { KPIDashboard } from '../../../components/bi/dashboard/KPIDashboard';
import { FinancialKPIs, BiFilterState } from '../../../types/bi';
import './OverviewPage.css';

export const OverviewPage: React.FC = () => {
  const [kpis, setKpis] = useState<FinancialKPIs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BiFilterState>({
    propertyIds: [],
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    endDate: new Date(),
    categories: [],
    accounts: [],
  });

  useEffect(() => {
    const loadKPIs = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Buscar KPIs da API
        const response = await fetch('/api/bi/kpis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: filters.startDate.toISOString().split('T')[0],
            endDate: filters.endDate.toISOString().split('T')[0],
            propertyIds: filters.propertyIds,
          }),
        });

        if (!response.ok) {
          throw new Error(`Erro ao carregar KPIs: ${response.statusText}`);
        }

        const data = await response.json();
        setKpis(data.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setError(message);
        console.error('Erro ao carregar KPIs:', err);

        // Dados mockados para demonstração
        setKpis(createMockKPIs());
      } finally {
        setIsLoading(false);
      }
    };

    loadKPIs();
  }, [filters]);

  const handleFilterChange = (newFilters: BiFilterState) => {
    setFilters(newFilters);
  };

  return (
    <div className="overview-page">
      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
          <p className="error-note">Exibindo dados mockados para demonstração</p>
        </div>
      )}

      <KPIDashboard
        kpis={kpis}
        isLoading={isLoading}
        filters={filters}
        onFilterChange={handleFilterChange}
      />
    </div>
  );
};

/**
 * Dados mockados para demonstração
 */
function createMockKPIs(): FinancialKPIs {
  const now = new Date();

  return {
    grossRevenue: {
      id: 'gross_revenue',
      name: 'Faturamento Bruto',
      value: 250000,
      previousValue: 220000,
      unit: 'currency',
      trend: 'up',
      trendPercentage: 13.6,
      status: 'success',
      lastUpdated: now,
    },
    netRevenue: {
      id: 'net_revenue',
      name: 'Faturamento Líquido',
      value: 235000,
      previousValue: 210000,
      unit: 'currency',
      trend: 'up',
      trendPercentage: 11.9,
      status: 'success',
      lastUpdated: now,
    },
    operationalCosts: {
      id: 'operational_costs',
      name: 'Custos Operacionais',
      value: 85000,
      previousValue: 90000,
      unit: 'currency',
      trend: 'down',
      trendPercentage: -5.6,
      status: 'success',
      lastUpdated: now,
    },
    ebitda: {
      id: 'ebitda',
      name: 'EBITDA',
      value: 150000,
      previousValue: 120000,
      unit: 'currency',
      trend: 'up',
      trendPercentage: 25,
      status: 'success',
      lastUpdated: now,
    },
    profitMargin: {
      id: 'profit_margin',
      name: 'Margem de Lucro',
      value: 63.8,
      previousValue: 57.1,
      unit: 'percentage',
      trend: 'up',
      trendPercentage: 11.7,
      status: 'success',
      lastUpdated: now,
    },
    liquidityCurrent: {
      id: 'liquidity_current',
      name: 'Liquidez Corrente',
      value: 1.8,
      previousValue: 1.5,
      unit: 'percentage',
      trend: 'up',
      trendPercentage: 20,
      status: 'success',
      lastUpdated: now,
    },
    cashFlow: {
      id: 'cash_flow',
      name: 'Fluxo de Caixa',
      value: 140000,
      previousValue: 110000,
      unit: 'currency',
      trend: 'up',
      trendPercentage: 27.3,
      status: 'success',
      lastUpdated: now,
    },
  };
}

export default OverviewPage;
