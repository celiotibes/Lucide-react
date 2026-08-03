import { useMemo } from 'react';
import { useAnomalyDetection } from './useAnomalyDetection';
import { useForecastingEngine } from './useForecastingEngine';

export interface MetricAnalysis {
  metricId: string;
  metricName: string;
  anomalies: number;
  trendStrength: number;
  volatility: number;
  forecastReliability: boolean;
  color: string;
}

export interface MultiMetricResult {
  metrics: MetricAnalysis[];
  averageTrendStrength: number;
  averageVolatility: number;
  correlations: Map<string, number>;
  dominantMetric: string | null;
  isLoading: boolean;
  error: string | null;
}

interface TimeSeriesPoint {
  date: Date;
  value: number;
}

interface UseMultiMetricAnalyticsProps {
  metricsData: Map<string, TimeSeriesPoint[]>;
  metricNames: Map<string, string>;
  metricColors: Map<string, string>;
  enabled?: boolean;
}

export const useMultiMetricAnalytics = ({
  metricsData,
  metricNames,
  metricColors,
  enabled = true,
}: UseMultiMetricAnalyticsProps): MultiMetricResult => {
  const result = useMemo(() => {
    if (!enabled || metricsData.size === 0) {
      return {
        metrics: [],
        averageTrendStrength: 0,
        averageVolatility: 0,
        correlations: new Map(),
        dominantMetric: null,
        isLoading: false,
        error: null,
      };
    }

    try {
      const metrics: MetricAnalysis[] = [];
      const trendStrengths: number[] = [];
      const volatilities: number[] = [];

      // Analyze each metric
      for (const [metricId, data] of metricsData) {
        if (!data || data.length < 10) continue;

        // Get anomalies
        const { anomalies: anomalyList } = useAnomalyDetection(data, {
          method: 'both',
          enabled: true,
        });

        // Get forecast
        const { trendStrength, volatility, isReliable } = useForecastingEngine(
          data,
          {
            periods: 7,
            method: 'auto',
            enabled: true,
          }
        );

        trendStrengths.push(trendStrength);
        volatilities.push(volatility);

        metrics.push({
          metricId,
          metricName: metricNames.get(metricId) || metricId,
          anomalies: anomalyList.length,
          trendStrength,
          volatility,
          forecastReliability: isReliable,
          color: metricColors.get(metricId) || '#3b82f6',
        });
      }

      // Calculate averages
      const averageTrendStrength =
        trendStrengths.length > 0
          ? trendStrengths.reduce((a, b) => a + b, 0) / trendStrengths.length
          : 0;

      const averageVolatility =
        volatilities.length > 0
          ? volatilities.reduce((a, b) => a + b, 0) / volatilities.length
          : 0;

      // Calculate correlations between metrics
      const correlations = calculateCorrelations(metricsData);

      // Find dominant metric (highest trend strength)
      const dominantMetric =
        metrics.length > 0
          ? metrics.reduce((prev, curr) =>
              curr.trendStrength > prev.trendStrength ? curr : prev
            ).metricId
          : null;

      return {
        metrics,
        averageTrendStrength,
        averageVolatility,
        correlations,
        dominantMetric,
        isLoading: false,
        error: null,
      };
    } catch (error) {
      console.error('Error analyzing metrics:', error);
      return {
        metrics: [],
        averageTrendStrength: 0,
        averageVolatility: 0,
        correlations: new Map(),
        dominantMetric: null,
        isLoading: false,
        error: String(error),
      };
    }
  }, [metricsData, metricNames, metricColors, enabled]);

  return result;
};

function calculateCorrelations(
  metricsData: Map<string, TimeSeriesPoint[]>
): Map<string, number> {
  const correlations = new Map<string, number>();
  const metricIds = Array.from(metricsData.keys());

  for (let i = 0; i < metricIds.length; i++) {
    for (let j = i + 1; j < metricIds.length; j++) {
      const id1 = metricIds[i];
      const id2 = metricIds[j];

      const data1 = metricsData.get(id1) || [];
      const data2 = metricsData.get(id2) || [];

      if (data1.length > 2 && data2.length > 2) {
        const correlation = calculatePearsonCorrelation(
          data1.map((d) => d.value),
          data2.map((d) => d.value)
        );

        const key = `${id1}:${id2}`;
        correlations.set(key, correlation);
      }
    }
  }

  return correlations;
}

function calculatePearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;

  const n = x.length;
  const meanX = x.reduce((a, b) => a + b) / n;
  const meanY = y.reduce((a, b) => a + b) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 0;

  return Math.min(1, Math.max(-1, numerator / denominator));
}

export default useMultiMetricAnalytics;
