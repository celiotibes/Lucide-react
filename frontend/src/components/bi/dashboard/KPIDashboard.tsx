import React, { useState, useEffect } from 'react';
import { FinancialKPIs, BiFilterState } from '../../../types/bi';
import {
  BentoGrid,
  BentoItem,
  KPICardModern,
  GlassCard,
  TrendLineChart,
  BreakdownPieChart,
  ComparisonBarChart,
  DateRangePicker,
  CategoryFilter,
  FilterPills,
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
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const categories = [
    { id: 'operational', name: 'Operacional', icon: '⚙️', color: '#3b82f6' },
    { id: 'administrative', name: 'Administrativo', icon: '📋', color: '#d4af37' },
    { id: 'financial', name: 'Financeiro', icon: '💰', color: '#10b981' },
    { id: 'marketing', name: 'Marketing', icon: '📢', color: '#f59e0b' },
  ];

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

          {/* Advanced Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-4">
            <DateRangePicker
              startDate={filters?.startDate || new Date()}
              endDate={filters?.endDate || new Date()}
              onDateChange={(start, end) => {
                if (onFilterChange && filters) {
                  onFilterChange({
                    ...filters,
                    startDate: start,
                    endDate: end,
                  });
                }
              }}
            />
            <CategoryFilter
              categories={categories}
              selectedCategories={selectedCategories}
              onCategoryChange={setSelectedCategories}
            />
          </div>

          {/* Active Filters Display */}
          {(selectedCategories.length > 0) && (
            <FilterPills
              filters={[
                ...selectedCategories.map((catId) => {
                  const category = categories.find((c) => c.id === catId);
                  return {
                    id: catId,
                    label: category?.name || '',
                    icon: category?.icon,
                    onClear: () => {
                      setSelectedCategories(selectedCategories.filter((id) => id !== catId));
                    },
                  };
                }),
              ]}
              onClearAll={() => setSelectedCategories([])}
              showClearAll={true}
            />
          )}
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

        {/* Charts & Analytics Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            📈 Análise & Gráficos
          </h2>

          <BentoGrid gap="md">
            {/* Revenue Trend Line Chart */}
            <BentoItem size="lg">
              <GlassCard variant="premium" title="💹 Tendência de Receita (Últimos 7 dias)">
                <TrendLineChart
                  data={[
                    { date: '17 jul', value: 250000, previousValue: 240000 },
                    { date: '16 jul', value: 245000, previousValue: 235000 },
                    { date: '15 jul', value: 255000, previousValue: 238000 },
                    { date: '14 jul', value: 248000, previousValue: 232000 },
                    { date: '13 jul', value: 242000, previousValue: 228000 },
                    { date: '12 jul', value: 240000, previousValue: 225000 },
                    { date: '11 jul', value: 238000, previousValue: 222000 },
                  ]}
                  valueLabel="Receita Atual"
                  height={250}
                />
              </GlassCard>
            </BentoItem>

            {/* Cost Breakdown Pie Chart */}
            <BentoItem size="md">
              <GlassCard title="💰 Distribuição de Custos">
                <BreakdownPieChart
                  data={[
                    { name: 'Operacional', value: 85000 },
                    { name: 'Administrativo', value: 32000 },
                    { name: 'Financeiro', value: 15000 },
                    { name: 'Marketing', value: 18000 },
                    { name: 'Outros', value: 5000 },
                  ]}
                  height={250}
                />
              </GlassCard>
            </BentoItem>

            {/* Period Comparison Bar Chart */}
            <BentoItem size="lg">
              <GlassCard title="📊 Comparação: Atual vs Anterior">
                <ComparisonBarChart
                  data={[
                    { category: 'Receita', current: 250000, previous: 220000 },
                    { category: 'EBITDA', current: 150000, previous: 120000 },
                    { category: 'Custos', current: 85000, previous: 90000 },
                    { category: 'Lucro', current: 115000, previous: 100000 },
                  ]}
                  currentLabel="Atual"
                  previousLabel="Anterior"
                  height={250}
                />
              </GlassCard>
            </BentoItem>

            {/* Performance Summary */}
            <BentoItem size="md">
              <GlassCard variant="interactive" title="⚡ Resumo de Performance">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#cbd5e1] text-sm">Crescimento Receita</span>
                    <span className="text-[#10b981] font-bold">+13.6%</span>
                  </div>
                  <div className="h-1 bg-[rgba(226,232,240,0.1)] rounded-full overflow-hidden">
                    <div className="h-full bg-[#10b981] w-1/3 rounded-full" />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[#cbd5e1] text-sm">Margem de Lucro</span>
                    <span className="text-[#d4af37] font-bold">63.8%</span>
                  </div>
                  <div className="h-1 bg-[rgba(226,232,240,0.1)] rounded-full overflow-hidden">
                    <div className="h-full bg-[#d4af37] w-2/3 rounded-full" />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[#cbd5e1] text-sm">Redução de Custos</span>
                    <span className="text-[#3b82f6] font-bold">-5.9%</span>
                  </div>
                  <div className="h-1 bg-[rgba(226,232,240,0.1)] rounded-full overflow-hidden">
                    <div className="h-full bg-[#3b82f6] w-1/6 rounded-full" />
                  </div>
                </div>
              </GlassCard>
            </BentoItem>
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
