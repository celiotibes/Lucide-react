import { useEffect, useMemo, useState } from 'react';
import {
  detectAnomaliesZScore,
  detectAnomaliesIQR,
  calculateAnomalyStats,
  AnomalyPoint,
  AnomalyStats,
  TimeSeriesData,
} from '../utils/analyticsEngine';

export interface UseAnomalyDetectionOptions {
  method?: 'zscore' | 'iqr' | 'both';
  zScoreThreshold?: number;
  enabled?: boolean;
}

export interface AnomalyDetectionResult {
  anomalies: AnomalyPoint[];
  stats: AnomalyStats;
  hasAnomalies: boolean;
  criticalCount: number;
  highCount: number;
  alerts: AnomalyAlert[];
}

export interface AnomalyAlert {
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  anomalyPoint: AnomalyPoint;
}

export const useAnomalyDetection = (
  data: TimeSeriesData[],
  options: UseAnomalyDetectionOptions = {}
): AnomalyDetectionResult => {
  const {
    method = 'zscore',
    zScoreThreshold = 2.5,
    enabled = true,
  } = options;

  const [result, setResult] = useState<AnomalyDetectionResult>({
    anomalies: [],
    stats: {
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      outlierCount: 0,
      outlierPercentage: 0,
    },
    hasAnomalies: false,
    criticalCount: 0,
    highCount: 0,
    alerts: [],
  });

  useEffect(() => {
    if (!enabled || !data || data.length === 0) {
      setResult({
        anomalies: [],
        stats: {
          mean: 0,
          std: 0,
          min: 0,
          max: 0,
          q1: 0,
          q3: 0,
          iqr: 0,
          outlierCount: 0,
          outlierPercentage: 0,
        },
        hasAnomalies: false,
        criticalCount: 0,
        highCount: 0,
        alerts: [],
      });
      return;
    }

    // Detect anomalies based on selected method
    let anomalies: AnomalyPoint[] = [];

    if (method === 'zscore' || method === 'both') {
      const zScoreAnomalies = detectAnomaliesZScore(data, zScoreThreshold);
      anomalies = [...anomalies, ...zScoreAnomalies];
    }

    if (method === 'iqr' || method === 'both') {
      const iqrAnomalies = detectAnomaliesIQR(data);
      // Merge results, avoiding duplicates
      const iqrDates = new Set(iqrAnomalies.map((a) => a.date.getTime()));
      const uniqueAnomalies = anomalies.filter((a) => !iqrDates.has(a.date.getTime()));
      anomalies = [...uniqueAnomalies, ...iqrAnomalies];
    }

    // Sort by date
    anomalies.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate statistics
    const stats = calculateAnomalyStats(data);

    // Count critical and high severity anomalies
    const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
    const highCount = anomalies.filter((a) => a.severity === 'high').length;

    // Generate alerts
    const alerts: AnomalyAlert[] = anomalies.map((anomaly) => ({
      severity: anomaly.severity,
      message: generateAnomalyMessage(anomaly),
      anomalyPoint: anomaly,
    }));

    setResult({
      anomalies,
      stats,
      hasAnomalies: anomalies.length > 0,
      criticalCount,
      highCount,
      alerts,
    });
  }, [data, method, zScoreThreshold, enabled]);

  return result;
};

const generateAnomalyMessage = (anomaly: AnomalyPoint): string => {
  const date = anomaly.date.toLocaleDateString('pt-BR');
  const value = anomaly.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  switch (anomaly.type) {
    case 'sudden_spike':
      return `Aumento súbito em ${date}: ${value}`;
    case 'sudden_drop':
      return `Queda súbita em ${date}: ${value}`;
    case 'outlier':
      return `Valor atípico detectado em ${date}: ${value}`;
    case 'trend_break':
      return `Mudança de tendência em ${date}: ${value}`;
    default:
      return `Anomalia detectada em ${date}: ${value}`;
  }
};
