import React, { useState } from 'react';

export interface MetricOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  category: 'revenue' | 'cost' | 'profitability' | 'liquidity';
}

interface MetricSelectorProps {
  availableMetrics: MetricOption[];
  selectedMetrics: string[];
  onMetricsChange: (metrics: string[]) => void;
  maxSelected?: number;
}

const CATEGORY_LABELS = {
  revenue: '💰 Receita',
  cost: '💸 Custos',
  profitability: '📈 Rentabilidade',
  liquidity: '💧 Liquidez',
};

export const MetricSelector: React.FC<MetricSelectorProps> = ({
  availableMetrics,
  selectedMetrics,
  onMetricsChange,
  maxSelected = 5,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['revenue', 'cost', 'profitability'])
  );

  const handleMetricToggle = (metricId: string) => {
    let updated: string[];
    if (selectedMetrics.includes(metricId)) {
      updated = selectedMetrics.filter((id) => id !== metricId);
    } else {
      if (selectedMetrics.length < maxSelected) {
        updated = [...selectedMetrics, metricId];
      } else {
        return; // Max reached
      }
    }
    onMetricsChange(updated);
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const categories = [
    'revenue',
    'cost',
    'profitability',
    'liquidity',
  ] as const;

  const metricsPerCategory = categories.reduce(
    (acc, cat) => {
      acc[cat] = availableMetrics.filter((m) => m.category === cat);
      return acc;
    },
    {} as Record<string, MetricOption[]>
  );

  return (
    <div className="w-full p-4 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md rounded-xl border border-white/20">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
          📊 Seletor de Métricas
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Selecione até {maxSelected} métricas para análise comparativa
        </p>
      </div>

      {/* Selection Count */}
      <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
        <div className="text-xs font-semibold text-blue-900 dark:text-blue-300">
          {selectedMetrics.length}/{maxSelected} métricas selecionadas
        </div>
        <div className="h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden mt-1">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${(selectedMetrics.length / maxSelected) * 100}%` }}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-3">
        {categories.map((category) => {
          const metrics = metricsPerCategory[category];
          const isExpanded = expandedCategories.has(category);

          return (
            <div key={category}>
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {isExpanded ? '▼' : '▶'} {metrics.filter((m) => selectedMetrics.includes(m.id)).length}/{metrics.length}
                </span>
              </button>

              {/* Metrics List */}
              {isExpanded && (
                <div className="mt-2 ml-2 space-y-1">
                  {metrics.map((metric) => {
                    const isSelected = selectedMetrics.includes(metric.id);
                    const isDisabled = !isSelected && selectedMetrics.length >= maxSelected;

                    return (
                      <button
                        key={metric.id}
                        onClick={() => handleMetricToggle(metric.id)}
                        disabled={isDisabled}
                        className={`w-full flex items-center gap-2 py-2 px-3 rounded-lg text-sm transition-all ${
                          isSelected
                            ? 'bg-blue-500/20 border border-blue-500/50 text-blue-900 dark:text-blue-300'
                            : isDisabled
                              ? 'bg-gray-200/20 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                              : 'bg-white/5 hover:bg-white/10 text-gray-900 dark:text-gray-300'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-blue-500 border-blue-500'
                              : 'border-gray-400 dark:border-gray-600'
                          }`}
                        >
                          {isSelected && (
                            <span className="text-white text-xs font-bold">✓</span>
                          )}
                        </div>

                        {/* Icon & Name */}
                        <span className="text-lg">{metric.icon}</span>
                        <span className="flex-1 text-left font-medium">
                          {metric.name}
                        </span>

                        {/* Color Indicator */}
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: metric.color }}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Select / Clear Buttons */}
      <div className="mt-4 pt-4 border-t border-white/10 flex gap-2">
        <button
          onClick={() =>
            onMetricsChange(
              availableMetrics
                .slice(0, maxSelected)
                .map((m) => m.id)
            )
          }
          className="flex-1 py-2 px-3 text-xs font-medium bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors"
        >
          Máximo
        </button>
        <button
          onClick={() => onMetricsChange([])}
          className="flex-1 py-2 px-3 text-xs font-medium bg-gray-500/20 text-gray-600 dark:text-gray-400 hover:bg-gray-500/30 rounded-lg transition-colors"
        >
          Limpar
        </button>
      </div>
    </div>
  );
};

export default MetricSelector;
