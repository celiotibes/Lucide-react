import { useState, useEffect, useCallback } from 'react';

export interface WidgetConfig {
  id: string;
  name: string;
  enabled: boolean;
  size: 'small' | 'medium' | 'large';
  position: number;
  icon: string;
  color: string;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  {
    id: 'threshold-control',
    name: 'Controle de Limiar',
    enabled: true,
    size: 'medium',
    position: 0,
    icon: '🎚️',
    color: '#3b82f6',
  },
  {
    id: 'anomaly-indicator',
    name: 'Indicador de Anomalias',
    enabled: true,
    size: 'medium',
    position: 1,
    icon: '🚨',
    color: '#ef4444',
  },
  {
    id: 'forecast-chart',
    name: 'Gráfico de Previsão',
    enabled: true,
    size: 'large',
    position: 2,
    icon: '📊',
    color: '#10b981',
  },
  {
    id: 'metrics-panel',
    name: 'Painel de Métricas',
    enabled: true,
    size: 'medium',
    position: 3,
    icon: '📈',
    color: '#f59e0b',
  },
  {
    id: 'metric-selector',
    name: 'Seletor de Métricas',
    enabled: true,
    size: 'medium',
    position: 4,
    icon: '📊',
    color: '#8b5cf6',
  },
  {
    id: 'multi-metric-analytics',
    name: 'Análise Multi-Métrica',
    enabled: true,
    size: 'large',
    position: 5,
    icon: '📉',
    color: '#06b6d4',
  },
];

const STORAGE_KEY = 'lucide_widget_config';

export const useWidgetConfig = (initialWidgets?: WidgetConfig[]) => {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(
    initialWidgets || DEFAULT_WIDGETS
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Load config from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setWidgets(Array.isArray(parsed) ? parsed : DEFAULT_WIDGETS);
      }
    } catch (error) {
      console.error('Failed to load widget config:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save config to localStorage
  const saveConfig = useCallback((newWidgets: WidgetConfig[]) => {
    setWidgets(newWidgets);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newWidgets));
    } catch (error) {
      console.error('Failed to save widget config:', error);
    }
  }, []);

  // Toggle widget enabled state
  const toggleWidget = useCallback(
    (id: string) => {
      const updated = widgets.map((w) =>
        w.id === id ? { ...w, enabled: !w.enabled } : w
      );
      saveConfig(updated);
    },
    [widgets, saveConfig]
  );

  // Update widget size
  const updateWidgetSize = useCallback(
    (id: string, size: 'small' | 'medium' | 'large') => {
      const updated = widgets.map((w) =>
        w.id === id ? { ...w, size } : w
      );
      saveConfig(updated);
    },
    [widgets, saveConfig]
  );

  // Reorder widgets
  const reorderWidget = useCallback(
    (id: string, newPosition: number) => {
      if (newPosition < 0 || newPosition >= widgets.length) return;

      const currentIndex = widgets.findIndex((w) => w.id === id);
      if (currentIndex === -1) return;

      const updated = [...widgets];
      const [widget] = updated.splice(currentIndex, 1);
      updated.splice(newPosition, 0, widget);

      const reordered = updated.map((w, idx) => ({
        ...w,
        position: idx,
      }));

      saveConfig(reordered);
    },
    [widgets, saveConfig]
  );

  // Get only enabled widgets
  const enabledWidgets = widgets.filter((w) => w.enabled);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    saveConfig(DEFAULT_WIDGETS);
  }, [saveConfig]);

  // Get widget by id
  const getWidget = useCallback(
    (id: string) => widgets.find((w) => w.id === id),
    [widgets]
  );

  return {
    widgets,
    enabledWidgets,
    isLoaded,
    saveConfig,
    toggleWidget,
    updateWidgetSize,
    reorderWidget,
    resetToDefaults,
    getWidget,
  };
};

export default useWidgetConfig;
