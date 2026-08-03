import { useState, useEffect, useCallback } from 'react';

interface ForecastSettings {
  forecastPeriod: number;  // 7, 14, or 30 days
  method: 'linear' | 'exponential' | 'auto';
  showConfidenceIntervals: boolean;
  accuracyWarnings: boolean;
}

const DEFAULT_SETTINGS: ForecastSettings = {
  forecastPeriod: 7,
  method: 'auto',
  showConfidenceIntervals: true,
  accuracyWarnings: true,
};

const STORAGE_KEY = 'lucide_forecast_settings';

export const useForecastSettings = () => {
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load forecast settings:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback((newSettings: Partial<ForecastSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save forecast settings:', error);
      }
      return updated;
    });
  }, []);

  // Update individual settings
  const updatePeriod = useCallback((period: number) => {
    if ([7, 14, 30].includes(period)) {
      saveSettings({ forecastPeriod: period });
    }
  }, [saveSettings]);

  const updateMethod = useCallback(
    (method: 'linear' | 'exponential' | 'auto') => {
      saveSettings({ method });
    },
    [saveSettings]
  );

  const updateShowConfidenceIntervals = useCallback((show: boolean) => {
    saveSettings({ showConfidenceIntervals: show });
  }, [saveSettings]);

  const updateAccuracyWarnings = useCallback((show: boolean) => {
    saveSettings({ accuracyWarnings: show });
  }, [saveSettings]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
  }, [saveSettings]);

  return {
    settings,
    isLoaded,
    updatePeriod,
    updateMethod,
    updateShowConfidenceIntervals,
    updateAccuracyWarnings,
    resetToDefaults,
    saveSettings,
  };
};

export default useForecastSettings;
