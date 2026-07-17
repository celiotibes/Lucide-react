import React, { useState, useEffect } from 'react';
import { FinancialKPIs, BiFilterState } from '../../../types/bi';
import {
  BentoGrid,
  BentoItem,
  KPICardModern,
  GlassCard,
} from '../../../components/modern';
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
    return (
      <div className="kpi-dashboard-empty flex items-center justify-center min-h-[400px]">
        <GlassCard title="Carregando">
          <p className="text-[#cbd5e1]">Carregando dados financeiros...</p>
        </GlassCard>
      </div>
    );
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
    <div className="kpi-dashboard bg-[#0f172a] min-h-screen pb-[120px]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a2332] to-[#243549] border-b border-[#334155] py-8 mb-8">
        <div className="container px-4 max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-[#f1f5f9] mb-2">
            📊 Dashboard Financeiro
          </h1>
          <p className="text-[#cbd5e1] mb-6">
            Visão geral dos KPIs contábeis e financeiros
          </p>

          {/* Date Range Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <label className="text-[#cbd5e1] text-sm font-medium">Período:</label>
            <input
              type="date"
              defaultValue={filters?.startDate.toISOString().split('T')[0]}
              onChange={(e) => {
                const endDate = filters?.endDate.toISOString().split('T')[0] || '';
                handleDateRangeChange(e.target.value, endDate);
              }}
              className="px-3 py-2 bg-[#243549] border border-[#334155] text-[#f1f5f9] rounded-lg text-sm hover:border-[#3b82f6] transition-colors focus:outline-none focus:border-[#3b82f6]"
            />
            <span className="text-[#94a3b8] text-sm">até</span>
            <input
              type="date"
              defaultValue={filters?.endDate.toISOString().split('T')[0]}
              onChange={(e) => {
                const startDate = filters?.startDate.toISOString().split('T')[0] || '';
                handleDateRangeChange(startDate, e.target.value);
              }}
              className="px-3 py-2 bg-[#243549] border border-[#334155] text-[#f1f5f9] rounded-lg text-sm hover:border-[#3b82f6] transition-colors focus:outline-none focus:border-[#3b82f6]"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container px-4 max-w-7xl mx-auto">
        {/* Indicadores Principais */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            💰 Indicadores Principais
          </h2>

          <BentoGrid gap="md">
            {mainKPIs.map((kpi) => (
              <BentoItem key={kpi.id} size="sm">
                <div
                  className={`cursor-pointer transition-transform ${
                    selectedKPI === kpi.id ? 'scale-105' : 'hover:scale-102'
                  }`}
                  onClick={() => setSelectedKPI(kpi.id)}
                >
                  <KPICardModern
                    title={kpi.name}
                    value={kpi.value}
                    previousValue={kpi.previousValue}
                    unit={kpi.unit === 'currency' ? 'R$' : kpi.unit}
                    icon="📈"
                    trend={kpi.trend as 'up' | 'down' | 'stable'}
                    trendPercentage={kpi.trendPercentage}
                    status={kpi.status as 'success' | 'warning' | 'error' | 'neutral'}
                  />
                </div>
              </BentoItem>
            ))}
          </BentoGrid>
        </section>

        {/* Revenue Trend Card */}
        <section className="mb-12">
          <BentoGrid gap="md">
            <BentoItem size="lg">
              <GlassCard variant="premium" title="📈 Tendência de Receita">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-[#d4af37]">
                        ↗ +{mainKPIs[0].trendPercentage?.toFixed(1)}%
                      </div>
                      <p className="text-sm text-[#94a3b8] mt-2">
                        vs. período anterior
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-[#10b981]">
                        R$ {(mainKPIs[0].value / 1000).toFixed(0)}K
                      </div>
                      <p className="text-sm text-[#94a3b8] mt-2">
                        Faturamento Total
                      </p>
                    </div>
                  </div>
                  <div className="h-2 bg-[rgba(226,232,240,0.1)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#3b82f6] to-[#d4af37] rounded-full"
                      style={{
                        width: `${Math.min((mainKPIs[0].trendPercentage || 0) * 2, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </GlassCard>
            </BentoItem>
          </BentoGrid>
        </section>

        {/* Indicadores Complementares */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            📊 Indicadores Complementares
          </h2>

          <BentoGrid gap="md">
            {secondaryKPIs.map((kpi) => (
              <BentoItem key={kpi.id} size="sm">
                <div
                  className={`cursor-pointer transition-transform ${
                    selectedKPI === kpi.id ? 'scale-105' : 'hover:scale-102'
                  }`}
                  onClick={() => setSelectedKPI(kpi.id)}
                >
                  <KPICardModern
                    title={kpi.name}
                    value={kpi.value}
                    previousValue={kpi.previousValue}
                    unit={kpi.unit === 'currency' ? 'R$' : kpi.unit}
                    icon="📊"
                    trend={kpi.trend as 'up' | 'down' | 'stable'}
                    trendPercentage={kpi.trendPercentage}
                    status={kpi.status as 'success' | 'warning' | 'error' | 'neutral'}
                  />
                </div>
              </BentoItem>
            ))}
          </BentoGrid>
        </section>

        {/* Detalhes KPI Selecionado */}
        {selectedKPI && (
          <section className="mb-12">
            <GlassCard
              variant="interactive"
              title="🔍 Análise Detalhada"
              onClick={() => setSelectedKPI(null)}
            >
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-[#f1f5f9] mb-2">
                    Indicador Selecionado
                  </h3>
                  <p className="text-[#cbd5e1]">
                    KPI ID: {selectedKPI}
                  </p>
                </div>
                <div className="pt-4 border-t border-[rgba(226,232,240,0.1)]">
                  <button
                    onClick={() => setSelectedKPI(null)}
                    className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg text-sm hover:bg-[#1e40af] transition-all"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </div>
            </GlassCard>
          </section>
        )}
      </div>
    </div>
  );
};

export default KPIDashboard;
