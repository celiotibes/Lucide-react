import React from 'react';
import { MetricAnalysis } from '../../hooks/useMultiMetricAnalytics';

interface MultiMetricAnalyticsProps {
  metrics: MetricAnalysis[];
  averageTrendStrength: number;
  averageVolatility: number;
  dominantMetric: string | null;
}

export const MultiMetricAnalytics: React.FC<MultiMetricAnalyticsProps> = ({
  metrics,
  averageTrendStrength,
  averageVolatility,
  dominantMetric,
}) => {
  if (metrics.length === 0) {
    return (
      <div className="p-4 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md rounded-xl border border-white/20">
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          Nenhuma métrica selecionada para análise comparativa
        </p>
      </div>
    );
  }

  const trendLabel = (strength: number): string => {
    if (strength >= 0.8) return 'Muito Forte';
    if (strength >= 0.6) return 'Forte';
    if (strength >= 0.4) return 'Moderado';
    if (strength >= 0.2) return 'Fraco';
    return 'Nenhum';
  };

  const volatilityLabel = (vol: number): string => {
    if (vol >= 0.6) return 'Muito Alta';
    if (vol >= 0.4) return 'Alta';
    if (vol >= 0.2) return 'Moderada';
    if (vol >= 0.1) return 'Baixa';
    return 'Muito Baixa';
  };

  return (
    <div className="w-full p-4 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md rounded-xl border border-white/20 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
          📊 Análise Comparativa Multi-Métrica
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {metrics.length} métrica{metrics.length !== 1 ? 's' : ''} em análise
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/5 p-2 rounded-lg">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
            Força Média de Tendência
          </div>
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {(averageTrendStrength * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {trendLabel(averageTrendStrength)}
          </div>
        </div>
        <div className="bg-white/5 p-2 rounded-lg">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
            Volatilidade Média
          </div>
          <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
            {(averageVolatility * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {volatilityLabel(averageVolatility)}
          </div>
        </div>
      </div>

      {/* Metrics Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-2 font-semibold text-gray-600 dark:text-gray-400">
                Métrica
              </th>
              <th className="text-center py-2 px-2 font-semibold text-gray-600 dark:text-gray-400">
                Anomalias
              </th>
              <th className="text-center py-2 px-2 font-semibold text-gray-600 dark:text-gray-400">
                Tendência
              </th>
              <th className="text-center py-2 px-2 font-semibold text-gray-600 dark:text-gray-400">
                Volatilidade
              </th>
              <th className="text-center py-2 px-2 font-semibold text-gray-600 dark:text-gray-400">
                Confiança
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {metrics.map((metric) => (
              <tr
                key={metric.metricId}
                className={`${
                  dominantMetric === metric.metricId
                    ? 'bg-blue-50/10 dark:bg-blue-950/20'
                    : ''
                }`}
              >
                {/* Metric Name */}
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: metric.color }}
                    />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {metric.metricName}
                    </span>
                    {dominantMetric === metric.metricId && (
                      <span className="text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">
                        Dominante
                      </span>
                    )}
                  </div>
                </td>

                {/* Anomalies */}
                <td className="text-center py-2 px-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded ${
                      metric.anomalies === 0
                        ? 'bg-green-50/20 dark:bg-green-950/20 text-green-700 dark:text-green-400'
                        : metric.anomalies <= 2
                          ? 'bg-yellow-50/20 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400'
                          : 'bg-red-50/20 dark:bg-red-950/20 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {metric.anomalies}
                  </span>
                </td>

                {/* Trend Strength */}
                <td className="text-center py-2 px-2">
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{
                          width: `${metric.trendStrength * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-gray-600 dark:text-gray-400 w-8">
                      {(metric.trendStrength * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>

                {/* Volatility */}
                <td className="text-center py-2 px-2">
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
                        style={{
                          width: `${metric.volatility * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-gray-600 dark:text-gray-400 w-8">
                      {(metric.volatility * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>

                {/* Reliability */}
                <td className="text-center py-2 px-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      metric.forecastReliability
                        ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                        : 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                    }`}
                  >
                    {metric.forecastReliability ? '✓ Alta' : '⚠ Baixa'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="pt-2 border-t border-white/10">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          💡 <strong>Métrica Dominante:</strong> A métrica com maior força de tendência entre as selecionadas
        </p>
      </div>
    </div>
  );
};

export default MultiMetricAnalytics;
