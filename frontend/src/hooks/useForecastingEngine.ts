import { useEffect, useState } from 'react';
import {
  forecastLinear,
  forecastExponentialSmoothing,
  calculateTrendStrength,
  calculateVolatility,
  detectSeasonality,
  Forecast,
  TimeSeriesData,
} from '../utils/analyticsEngine';

export interface UseForecastingEngineOptions {
  periods?: number;
  method?: 'linear' | 'exponential' | 'auto';
  alpha?: number;
  enabled?: boolean;
}

export interface ForecastingResult {
  forecast: Forecast[];
  trendStrength: number;
  volatility: number;
  hasSeasonality: boolean;
  seasonalityPeriod: number;
  accuracy: ForecastAccuracy;
  isReliable: boolean;
}

export interface ForecastAccuracy {
  rmse?: number;
  mape?: number;
  confidence: number;
  method: string;
}

export const useForecastingEngine = (
  data: TimeSeriesData[],
  options: UseForecastingEngineOptions = {}
): ForecastingResult => {
  const {
    periods = 7,
    method = 'auto',
    alpha = 0.3,
    enabled = true,
  } = options;

  const [result, setResult] = useState<ForecastingResult>({
    forecast: [],
    trendStrength: 0,
    volatility: 0,
    hasSeasonality: false,
    seasonalityPeriod: 0,
    accuracy: {
      confidence: 0,
      method: 'none',
    },
    isReliable: false,
  });

  useEffect(() => {
    if (!enabled || !data || data.length < 3) {
      setResult({
        forecast: [],
        trendStrength: 0,
        volatility: 0,
        hasSeasonality: false,
        seasonalityPeriod: 0,
        accuracy: {
          confidence: 0,
          method: 'none',
        },
        isReliable: false,
      });
      return;
    }

    // Calculate metrics
    const trendStrength = calculateTrendStrength(data);
    const volatility = calculateVolatility(data);
    const seasonality = detectSeasonality(data);

    // Select best forecasting method
    let forecast: Forecast[] = [];
    let selectedMethod = method;

    if (method === 'auto') {
      selectedMethod = selectBestMethod(trendStrength, volatility, seasonality.hasSeasonality);
    }

    // Generate forecast
    if (selectedMethod === 'linear') {
      forecast = forecastLinear(data, periods);
    } else {
      forecast = forecastExponentialSmoothing(data, periods, alpha);
    }

    // Calculate accuracy
    const accuracy = calculateAccuracy(forecast, selectedMethod, trendStrength);

    // Determine reliability
    const isReliable = determineReliability(data.length, trendStrength, volatility, accuracy);

    setResult({
      forecast,
      trendStrength,
      volatility,
      hasSeasonality: seasonality.hasSeasonality,
      seasonalityPeriod: seasonality.period,
      accuracy,
      isReliable,
    });
  }, [data, periods, method, alpha, enabled]);

  return result;
};

const selectBestMethod = (
  trendStrength: number,
  volatility: number,
  hasSeasonality: boolean
): 'linear' | 'exponential' => {
  // Use linear regression if trend is strong and consistent
  if (trendStrength > 0.7 && volatility < 0.2) {
    return 'linear';
  }

  // Use exponential smoothing for volatile or seasonal data
  return 'exponential';
};

const calculateAccuracy = (
  forecast: Forecast[],
  method: string,
  trendStrength: number
): ForecastAccuracy => {
  if (forecast.length === 0) {
    return {
      confidence: 0,
      method,
    };
  }

  // Calculate average RMSE from forecasts
  const avgRmse = forecast.reduce((sum, f) => sum + (f.rmse || 0), 0) / forecast.length;

  // Confidence is based on trend strength and RMSE
  let confidence = Math.max(0, Math.min(1, trendStrength * 0.8 + 0.2));

  // Reduce confidence based on RMSE magnitude
  if (avgRmse > 0) {
    confidence = Math.max(0, confidence - Math.min(0.3, avgRmse / 1000));
  }

  return {
    rmse: avgRmse,
    confidence: Math.round(confidence * 100) / 100,
    method,
  };
};

const determineReliability = (
  dataLength: number,
  trendStrength: number,
  volatility: number,
  accuracy: ForecastAccuracy
): boolean => {
  // Need at least 10 data points for reliable forecast
  if (dataLength < 10) {
    return false;
  }

  // Check if trend is relatively consistent
  if (trendStrength < 0.3 && volatility > 0.5) {
    return false;
  }

  // Check confidence level
  if (accuracy.confidence < 0.5) {
    return false;
  }

  return true;
};

export const getReliabilityMessage = (result: ForecastingResult): string => {
  if (!result.isReliable) {
    if (result.forecast.length === 0) {
      return 'Dados insuficientes para previsão';
    }

    if (result.volatility > 0.5) {
      return 'Dados muito voláteis - previsão com baixa confiança';
    }

    if (result.accuracy.confidence < 0.5) {
      return 'Confiança baixa na previsão';
    }

    return 'Previsão pode ser imprecisa';
  }

  if (result.accuracy.confidence > 0.8) {
    return 'Previsão com alta confiança';
  }

  if (result.accuracy.confidence > 0.6) {
    return 'Previsão com confiança moderada';
  }

  return 'Previsão com baixa confiança';
};
