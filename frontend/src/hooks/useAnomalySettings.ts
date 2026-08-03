import { useState, useEffect, useCallback } from 'react';

interface AnomalySettings {
  zscoreThreshold: number;
  method: 'zscore' | 'iqr' | 'both';
  showCriticalOnly: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
}

const DEFAULT_SETTINGS: AnomalySettings = {
  zscoreThreshold: 2.5,
  method: 'both',
  showCriticalOnly: false,
  autoRefresh: true,
  refreshInterval: 60000, // 1 minute
};

const STORAGE_KEY = 'lucide_anomaly_settings';

export const useAnomalySettings = () => {
  const [settings, setSettings] = useState<AnomalySettings>(DEFAULT_SETTINGS);
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
      console.error('Failed to load anomaly settings:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback((newSettings: Partial<AnomalySettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save anomaly settings:', error);
      }
      return updated;
    });
  }, []);

  // Update individual settings
  const updateThreshold = useCallback((threshold: number) => {
    saveSettings({ zscoreThreshold: Math.max(1.0, Math.min(4.0, threshold)) });
  }, [saveSettings]);

  const updateMethod = useCallback((method: 'zscore' | 'iqr' | 'both') => {
    saveSettings({ method });
  }, [saveSettings]);

  const updateShowCriticalOnly = useCallback((showCriticalOnly: boolean) => {
    saveSettings({ showCriticalOnly });
  }, [saveSettings]);

  const updateAutoRefresh = useCallback((autoRefresh: boolean) => {
    saveSettings({ autoRefresh });
  }, [saveSettings]);

  const updateRefreshInterval = useCallback((interval: number) => {
    saveSettings({ refreshInterval: Math.max(5000, interval) }); // Min 5 seconds
  }, [saveSettings]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
  }, [saveSettings]);

  return {
    settings,
    isLoaded,
    updateThreshold,
    updateMethod,
    updateShowCriticalOnly,
    updateAutoRefresh,
    updateRefreshInterval,
    resetToDefaults,
    saveSettings,
  };
};

export default useAnomalySettings;
