import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  FilterPresets,
  ExportMenu,
  ChartExportMenu,
  AnomalyIndicator,
  AlertBanner,
  ForecastChart,
  MetricsPanel,
} from '../../../components/modern';
import { useFilteredKPIs, useFilterPersistence, useAnomalyDetection, useForecastingEngine } from '../../../hooks';
import { TimeSeriesData, AlertBannerAlert } from '../../../types';
import './KPIDashboard.css';

interface KPIDashboardProps {
  kpis?: FinancialKPIs | null;
  isLoading?: boolean;
  filters?: BiFilterState;
  onFilterChange?: (filters: BiFilterState) => void;
}

export const KPIDashboard: React.FC<KPIDashboardProps> = ({
  kpis: initialKpis,
  isLoading: initialIsLoading = false,
  filters,
  onFilterChange,
}) => {
  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>();
  const [dismissedAnomalies, setDismissedAnomalies] = useState<Set<string>>(new Set());

  // Chart refs for export
  const trendChartRef = useRef<HTMLDivElement>(null);
  const breakdownChartRef = useRef<HTMLDivElement>(null);
  const comparisonChartRef = useRef<HTMLDivElement>(null);

  // Usar hook de persistência
  const { filters: persistedFilters, saveFilters, presets, applyPreset } = useFilterPersistence();

  const [startDate, setStartDate] = useState<Date>(() => {
    if (persistedFilters?.startDate) return persistedFilters.startDate;
    const date = new Date();
    date.setDate(1);
    return date;
  });

  const [endDate, setEndDate] = useState<Date>(() => {
    return persistedFilters?.endDate || new Date();
  });

  // Usar hook customizado para fetchar dados com filtros
  const { kpis: fetchedKpis, isLoading, error } = useFilteredKPIs({
    startDate,
    endDate,
    categories: selectedCategories,
  });

  // Usar dados fetchados ou dados iniciais (para backward compatibility)
  const kpis = fetchedKpis || initialKpis;

  // Prepare time series data for analytics
  const timeSeriesData = useMemo(() => {
    if (!kpis) return [];

    // Generate synthetic time series data based on KPI values
    const days = 30;
    const baseValue = kpis.grossRevenue?.value || 250000;
    const data: TimeSeriesData[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const variance = baseValue * 0.15; // 15% variance
      const trend = i * (baseValue * 0.001); // Slight trend
      const noise = (Math.random() - 0.5) * variance;
      const value = Math.max(baseValue - 50000, baseValue + trend + noise);

      data.push({ date, value });
    }

    return data;
  }, [kpis]);

  // Anomaly detection
  const anomalyResult = useAnomalyDetection(timeSeriesData, {
    method: 'both',
    enabled: timeSeriesData.length > 3,
  });

  const filteredAnomalies = anomalyResult.anomalies.filter(
    (a) => !dismissedAnomalies.has(a.date.toISOString())
  );

  // Forecasting
  const forecastResult = useForecastingEngine(timeSeriesData, {
    periods: 7,
    method: 'auto',
    enabled: timeSeriesData.length >= 10,
  });

  // Generate alerts from anomalies
  const alerts = useMemo<AlertBannerAlert[]>(() => {
    return filteredAnomalies.slice(0, 3).map((anomaly, idx) => ({
      id: `anomaly-${idx}`,
      severity: anomaly.severity === 'critical' ? 'critical' : anomaly.severity === 'high' ? 'high' : 'warning',
      title: `Anomalia Detectada: ${anomaly.type.replace(/_/g, ' ')}`,
      message: anomaly.explanation || `Valor anômalo em ${anomaly.date.toLocaleDateString('pt-BR')}: R$ ${anomaly.value.toLocaleString('pt-BR')}`,
      action: {
        label: 'Investigar',
        onClick: () => {
          // Could navigate to detail view
          console.log('Investigate anomaly:', anomaly);
        },
      },
    }));
  }, [filteredAnomalies]);

  const categories = [
    { id: 'operational', name: 'Operacional', icon: '⚙️', color: '#3b82f6' },
    { id: 'administrative', name: 'Administrativo', icon: '📋', color: '#d4af37' },
    { id: 'financial', name: 'Financeiro', icon: '💰', color: '#10b981' },
    { id: 'marketing', name: 'Marketing', icon: '📢', color: '#f59e0b' },
  ];

  useEffect(() => {
    console.log('KPIs atualizados:', kpis);
  }, [kpis]);

  const handleDateRangeChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
    setSelectedPreset(undefined); // Deselect preset when manually changing dates

    // Salvar em localStorage
    saveFilters({
      startDate: start,
      endDate: end,
      categories: selectedCategories,
    });

    if (onFilterChange && filters) {
      onFilterChange({
        ...filters,
        startDate: start,
        endDate: end,
      });
    }
  };

  const handleCategoryChange = (categoryIds: string[]) => {
    setSelectedCategories(categoryIds);

    // Salvar em localStorage
    saveFilters({
      startDate,
      endDate,
      categories: categoryIds,
    });

    if (onFilterChange && filters) {
      onFilterChange({
        ...filters,
        categories: categoryIds,
      });
    }
  };

  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    applyPreset(presetKey);

    const { startDate: newStart, endDate: newEnd } = presets[presetKey].getDateRange();
    setStartDate(newStart);
    setEndDate(newEnd);

    if (onFilterChange && filters) {
      onFilterChange({
        ...filters,
        startDate: newStart,
        endDate: newEnd,
      });
    }
  };

  if (error) {
    return (
      <div className="kpi-dashboard-empty flex items-center justify-center min-h-[400px]">
        <GlassCard title="Erro ao Carregar Dados" variant="interactive">
          <p className="text-[#ef4444] mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg text-sm hover:bg-[#1e40af] transition-all"
          >
            Tentar Novamente
          </button>
        </GlassCard>
      </div>
    );
  }

  if (isLoading || !kpis) {
    return (
      <div className="kpi-dashboard-empty flex items-center justify-center min-h-[400px]">
        <GlassCard title="Carregando">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#3b82f6] rounded-full animate-spin"></div>
            <p className="text-[#cbd5e1]">Carregando dados financeiros...</p>
          </div>
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-[#f1f5f9]">
                📊 Dashboard Financeiro
              </h1>
            </div>
            {kpis && (
              <ExportMenu
                kpis={kpis}
                filters={{
                  startDate,
                  endDate,
                  categories: selectedCategories,
                }}
              />
            )}
          </div>
          <p className="text-[#cbd5e1] mb-6">
            Visão geral dos KPIs contábeis e financeiros
          </p>

          {/* Advanced Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-4">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onDateChange={handleDateRangeChange}
            />
            <CategoryFilter
              categories={categories}
              selectedCategories={selectedCategories}
              onCategoryChange={handleCategoryChange}
            />
          </div>

          {/* Filter Presets */}
          <FilterPresets
            presets={presets}
            onPresetSelect={handlePresetSelect}
            selectedPreset={selectedPreset}
          />

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
                      const newCategories = selectedCategories.filter((id) => id !== catId);
                      setSelectedCategories(newCategories);
                      saveFilters({
                        startDate,
                        endDate,
                        categories: newCategories,
                      });
                    },
                  };
                }),
              ]}
              onClearAll={() => {
                setSelectedCategories([]);
                saveFilters({
                  startDate,
                  endDate,
                  categories: [],
                });
              }}
              showClearAll={true}
            />
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className={`container px-4 max-w-7xl mx-auto transition-opacity ${isLoading ? 'opacity-60' : 'opacity-100'}`}>
        {/* Alert Banner for Critical Anomalies */}
        {alerts.length > 0 && (
          <div className="mb-8">
            <AlertBanner
              alerts={alerts}
              onClose={(id) => {
                // Extract anomaly index from alert id
                const idx = parseInt(id.replace('anomaly-', ''));
                if (filteredAnomalies[idx]) {
                  setDismissedAnomalies((prev) => new Set([...prev, filteredAnomalies[idx].date.toISOString()]));
                }
              }}
              maxVisible={3}
            />
          </div>
        )}

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
              <GlassCard variant="premium">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[#f1f5f9]">💹 Tendência de Receita (Últimos 7 dias)</h3>
                  <ChartExportMenu
                    chartRef={trendChartRef.current}
                    title="Tendência de Receita"
                    dateRange={{ start: startDate, end: endDate }}
                    categories={selectedCategories}
                  />
                </div>
                <div ref={trendChartRef}>
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
                </div>
              </GlassCard>
            </BentoItem>

            {/* Cost Breakdown Pie Chart */}
            <BentoItem size="md">
              <GlassCard>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[#f1f5f9]">💰 Distribuição de Custos</h3>
                  <ChartExportMenu
                    chartRef={breakdownChartRef.current}
                    title="Distribuição de Custos"
                    dateRange={{ start: startDate, end: endDate }}
                    categories={selectedCategories}
                  />
                </div>
                <div ref={breakdownChartRef}>
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
                </div>
              </GlassCard>
            </BentoItem>

            {/* Period Comparison Bar Chart */}
            <BentoItem size="lg">
              <GlassCard>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[#f1f5f9]">📊 Comparação: Atual vs Anterior</h3>
                  <ChartExportMenu
                    chartRef={comparisonChartRef.current}
                    title="Comparação Atual vs Anterior"
                    dateRange={{ start: startDate, end: endDate }}
                    categories={selectedCategories}
                  />
                </div>
                <div ref={comparisonChartRef}>
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
                </div>
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

        {/* Advanced Analytics Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            🔬 Análise Avançada
          </h2>

          <BentoGrid gap="md">
            {/* Anomaly Indicator */}
            {filteredAnomalies.length > 0 && (
              <BentoItem size="md">
                <GlassCard>
                  <AnomalyIndicator
                    anomalies={filteredAnomalies}
                    onDismiss={() => setDismissedAnomalies(new Set())}
                    compact={false}
                  />
                </GlassCard>
              </BentoItem>
            )}

            {/* Forecast Chart */}
            {forecastResult.forecast.length > 0 && (
              <BentoItem size="lg">
                <GlassCard variant="premium" title="📊 Previsão de Tendência">
                  <ForecastChart
                    actualData={timeSeriesData.slice(-14)}
                    forecast={forecastResult.forecast}
                    title=""
                    height={300}
                    showConfidence={true}
                  />
                </GlassCard>
              </BentoItem>
            )}

            {/* Metrics Panel */}
            {timeSeriesData.length >= 10 && (
              <BentoItem size="md">
                <MetricsPanel
                  trendStrength={forecastResult.trendStrength}
                  volatility={forecastResult.volatility}
                  hasSeasonality={forecastResult.hasSeasonality}
                  seasonalityPeriod={forecastResult.seasonalityPeriod}
                  confidence={forecastResult.accuracy.confidence}
                  method={forecastResult.accuracy.method}
                  isReliable={forecastResult.isReliable}
                  rmse={forecastResult.accuracy.rmse}
                />
              </BentoItem>
            )}
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
