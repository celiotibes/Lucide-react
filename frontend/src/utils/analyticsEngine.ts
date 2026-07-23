/**
 * Analytics Engine
 * Anomaly detection and trend forecasting utilities
 */

export interface AnomalyPoint {
  date: Date;
  value: number;
  zScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'outlier' | 'sudden_spike' | 'sudden_drop' | 'trend_break';
  explanation?: string;
}

export interface Forecast {
  date: Date;
  predicted: number;
  lower: number;
  upper: number;
  confidence: number;
  rmse?: number;
}

export interface AnomalyStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
  outlierCount: number;
  outlierPercentage: number;
}

export interface TimeSeriesData {
  date: Date;
  value: number;
}

// ===== STATISTICAL FUNCTIONS =====

const calculateMean = (values: number[]): number => {
  return values.reduce((a, b) => a + b, 0) / values.length;
};

const calculateStdDev = (values: number[]): number => {
  const mean = calculateMean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
};

const calculatePercentile = (values: number[], percentile: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

// ===== ANOMALY DETECTION =====

export const calculateZScore = (values: number[]): number[] => {
  const mean = calculateMean(values);
  const std = calculateStdDev(values);

  return values.map((value) => (std === 0 ? 0 : (value - mean) / std));
};

export const calculateIQR = (values: number[]): { Q1: number; Q3: number; IQR: number } => {
  const Q1 = calculatePercentile(values, 25);
  const Q3 = calculatePercentile(values, 75);
  const IQR = Q3 - Q1;

  return { Q1, Q3, IQR };
};

export const detectAnomaliesZScore = (
  data: TimeSeriesData[],
  threshold: number = 2.5
): AnomalyPoint[] => {
  if (data.length < 3) return [];

  const values = data.map((d) => d.value);
  const zScores = calculateZScore(values);
  const mean = calculateMean(values);
  const std = calculateStdDev(values);

  return data
    .map((d, i) => ({
      date: d.date,
      value: d.value,
      zScore: zScores[i],
      deviation: d.value - mean,
      percentChange: ((d.value - mean) / Math.abs(mean)) * 100,
    }))
    .filter((d) => Math.abs(d.zScore) > threshold)
    .map((d) => ({
      date: d.date,
      value: d.value,
      zScore: d.zScore,
      severity: getSeverity(Math.abs(d.zScore)),
      type: getAnomalyType(d.zScore, d.percentChange),
      explanation: `Z-score: ${d.zScore.toFixed(2)}, Change: ${d.percentChange.toFixed(1)}%`,
    }));
};

export const detectAnomaliesIQR = (data: TimeSeriesData[]): AnomalyPoint[] => {
  if (data.length < 4) return [];

  const values = data.map((d) => d.value);
  const { Q1, Q3, IQR } = calculateIQR(values);
  const lowerBound = Q1 - 1.5 * IQR;
  const upperBound = Q3 + 1.5 * IQR;

  return data
    .map((d, i) => ({
      date: d.date,
      value: d.value,
      index: i,
    }))
    .filter((d) => d.value < lowerBound || d.value > upperBound)
    .map((d) => ({
      date: d.date,
      value: d.value,
      zScore: d.value > upperBound ? (d.value - Q3) / IQR : (d.value - Q1) / IQR,
      severity: Math.abs(d.value - (d.value > upperBound ? Q3 : Q1)) / IQR > 3 ? 'critical' : 'high',
      type: d.value > upperBound ? 'sudden_spike' : 'sudden_drop',
      explanation: `Outside IQR bounds [${lowerBound.toFixed(0)}, ${upperBound.toFixed(0)}]`,
    }));
};

export const calculateAnomalyStats = (data: TimeSeriesData[]): AnomalyStats => {
  if (data.length === 0) {
    return {
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      outlierCount: 0,
      outlierPercentage: 0,
    };
  }

  const values = data.map((d) => d.value);
  const mean = calculateMean(values);
  const std = calculateStdDev(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const { Q1, Q3, IQR } = calculateIQR(values);

  const lowerBound = Q1 - 1.5 * IQR;
  const upperBound = Q3 + 1.5 * IQR;
  const outlierCount = values.filter((v) => v < lowerBound || v > upperBound).length;

  return {
    mean,
    std,
    min,
    max,
    q1: Q1,
    q3: Q3,
    iqr: IQR,
    outlierCount,
    outlierPercentage: (outlierCount / values.length) * 100,
  };
};

// ===== TREND FORECASTING =====

export const forecastLinear = (data: TimeSeriesData[], periods: number = 7): Forecast[] => {
  if (data.length < 2) return [];

  const values = data.map((d) => d.value);
  const xValues = Array.from({ length: values.length }, (_, i) => i);

  // Calculate linear regression
  const n = xValues.length;
  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Generate forecast
  const lastDate = data[data.length - 1].date;
  const forecastPoints: Forecast[] = [];

  for (let i = 1; i <= periods; i++) {
    const xForecast = n + i - 1;
    const predicted = slope * xForecast + intercept;

    // Calculate residuals for confidence intervals
    const residuals = values.map((v, idx) => v - (slope * xValues[idx] + intercept));
    const rmse = Math.sqrt(
      residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(residuals.length - 2, 1)
    );

    // 95% confidence interval
    const se = rmse * Math.sqrt(1 + 1 / n + Math.pow(xForecast - sumX / n, 2) / sumX2);
    const margin = 1.96 * se;

    const forecastDate = new Date(lastDate);
    forecastDate.setDate(forecastDate.getDate() + i);

    forecastPoints.push({
      date: forecastDate,
      predicted: Math.max(0, predicted),
      lower: Math.max(0, predicted - margin),
      upper: predicted + margin,
      confidence: 0.95,
      rmse,
    });
  }

  return forecastPoints;
};

export const forecastExponentialSmoothing = (
  data: TimeSeriesData[],
  periods: number = 7,
  alpha: number = 0.3
): Forecast[] => {
  if (data.length < 2) return [];

  const values = data.map((d) => d.value);

  // Calculate smoothed values
  const smoothed: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1]);
  }

  // Generate forecast
  const lastDate = data[data.length - 1].date;
  const lastSmoothed = smoothed[smoothed.length - 1];
  const forecastPoints: Forecast[] = [];

  // Calculate residuals for confidence intervals
  const residuals = values.map((v, i) => v - smoothed[i]);
  const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / values.length);

  for (let i = 1; i <= periods; i++) {
    const predicted = lastSmoothed;
    const se = rmse * Math.sqrt(1 + (alpha * alpha * (i - 1) * (i - 1)) / 2);
    const margin = 1.96 * se;

    const forecastDate = new Date(lastDate);
    forecastDate.setDate(forecastDate.getDate() + i);

    forecastPoints.push({
      date: forecastDate,
      predicted: Math.max(0, predicted),
      lower: Math.max(0, predicted - margin),
      upper: predicted + margin,
      confidence: 0.95,
      rmse,
    });
  }

  return forecastPoints;
};

export const calculateTrendStrength = (data: TimeSeriesData[]): number => {
  if (data.length < 3) return 0;

  const values = data.map((d) => d.value);
  const xValues = Array.from({ length: values.length }, (_, i) => i);

  // Calculate correlation between index and value
  const meanX = calculateMean(xValues);
  const meanY = calculateMean(values);

  const numerator = values.reduce((sum, y, i) => sum + (xValues[i] - meanX) * (y - meanY), 0);
  const denomX = Math.sqrt(
    xValues.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0)
  );
  const denomY = Math.sqrt(
    values.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0)
  );

  const correlation = denomX === 0 || denomY === 0 ? 0 : numerator / (denomX * denomY);

  return Math.abs(correlation);
};

export const calculateVolatility = (data: TimeSeriesData[]): number => {
  if (data.length < 2) return 0;

  const values = data.map((d) => d.value);
  const returns = values.slice(1).map((v, i) => (v - values[i]) / values[i]);
  const meanReturn = calculateMean(returns);
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;

  return Math.sqrt(variance);
};

export const detectSeasonality = (data: TimeSeriesData[]): { hasSeasonality: boolean; period: number } => {
  if (data.length < 14) return { hasSeasonality: false, period: 0 };

  const values = data.map((d) => d.value);

  // Check for common seasonal periods (7, 14, 30)
  const periods = [7, 14, 30];
  const correlations = periods.map((period) => {
    if (period >= values.length) return 0;

    const v1 = values.slice(0, -period);
    const v2 = values.slice(period);

    if (v1.length === 0 || v2.length === 0) return 0;

    const mean1 = calculateMean(v1);
    const mean2 = calculateMean(v2);

    const numerator = v1.reduce((sum, _, i) => sum + (v1[i] - mean1) * (v2[i] - mean2), 0);
    const denom1 = Math.sqrt(v1.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0));
    const denom2 = Math.sqrt(v2.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0));

    return denom1 === 0 || denom2 === 0 ? 0 : numerator / (denom1 * denom2);
  });

  const maxCorr = Math.max(...correlations);
  const periodIndex = correlations.indexOf(maxCorr);

  return {
    hasSeasonality: maxCorr > 0.6,
    period: periods[periodIndex],
  };
};

// ===== HELPER FUNCTIONS =====

const getSeverity = (zScore: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (zScore > 4) return 'critical';
  if (zScore > 3.5) return 'high';
  if (zScore > 3) return 'medium';
  return 'low';
};

const getAnomalyType = (
  zScore: number,
  percentChange: number
): 'outlier' | 'sudden_spike' | 'sudden_drop' | 'trend_break' => {
  if (percentChange > 30) return 'sudden_spike';
  if (percentChange < -30) return 'sudden_drop';
  if (zScore > 3 || zScore < -3) return 'outlier';
  return 'trend_break';
};

// ===== BATCH ANALYSIS =====

export const analyzeTimeSeries = (data: TimeSeriesData[]) => {
  return {
    stats: calculateAnomalyStats(data),
    anomalies: detectAnomaliesZScore(data),
    trendStrength: calculateTrendStrength(data),
    volatility: calculateVolatility(data),
    seasonality: detectSeasonality(data),
    forecast: forecastLinear(data, 7),
  };
};
