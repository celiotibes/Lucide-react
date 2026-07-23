import { useState, useEffect, useCallback } from 'react';

interface FilterPreset {
  name: string;
  description: string;
  getDateRange: () => { startDate: Date; endDate: Date };
}

interface StoredFilters {
  startDate: string;
  endDate: string;
  categories: string[];
  timestamp: number;
}

/**
 * Hook para persistir e restaurar filtros do localStorage
 * Salva automaticamente filtros quando mudam
 * Restaura ao carregar página
 */
export const useFilterPersistence = (storageKey: string = 'bi_filters') => {
  const [filters, setFilters] = useState<{
    startDate: Date;
    endDate: Date;
    categories: string[];
  } | null>(null);

  const [presets] = useState<Record<string, FilterPreset>>({
    today: {
      name: 'Hoje',
      description: 'Apenas dados de hoje',
      getDateRange: () => {
        const date = new Date();
        return { startDate: date, endDate: date };
      },
    },
    last7days: {
      name: 'Últimos 7 dias',
      description: 'Semana passada + hoje',
      getDateRange: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 7);
        return { startDate: start, endDate: end };
      },
    },
    last30days: {
      name: 'Últimos 30 dias',
      description: 'Mês passado + hoje',
      getDateRange: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        return { startDate: start, endDate: end };
      },
    },
    thisMonth: {
      name: 'Este Mês',
      description: 'Desde o primeiro dia deste mês',
      getDateRange: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: start, endDate: now };
      },
    },
    lastMonth: {
      name: 'Mês Anterior',
      description: 'Mês completo anterior',
      getDateRange: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return { startDate: start, endDate: end };
      },
    },
    last90days: {
      name: 'Últimos 90 dias',
      description: 'Trimestre completo',
      getDateRange: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 90);
        return { startDate: start, endDate: end };
      },
    },
    thisYear: {
      name: 'Este Ano',
      description: 'Desde 1º de janeiro',
      getDateRange: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        return { startDate: start, endDate: now };
      },
    },
  });

  // Restaurar filtros ao montar
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed: StoredFilters = JSON.parse(stored);
        setFilters({
          startDate: new Date(parsed.startDate),
          endDate: new Date(parsed.endDate),
          categories: parsed.categories,
        });
      } catch (error) {
        console.error('Erro ao restaurar filtros:', error);
      }
    }
  }, [storageKey]);

  // Salvar filtros quando mudam
  const saveFilters = useCallback(
    (newFilters: { startDate: Date; endDate: Date; categories: string[] }) => {
      setFilters(newFilters);

      const toStore: StoredFilters = {
        startDate: newFilters.startDate.toISOString(),
        endDate: newFilters.endDate.toISOString(),
        categories: newFilters.categories,
        timestamp: Date.now(),
      };

      localStorage.setItem(storageKey, JSON.stringify(toStore));
    },
    [storageKey]
  );

  // Aplicar preset
  const applyPreset = useCallback(
    (presetKey: string) => {
      const preset = presets[presetKey];
      if (!preset) return;

      const { startDate, endDate } = preset.getDateRange();
      saveFilters({
        startDate,
        endDate,
        categories: [],
      });
    },
    [presets, saveFilters]
  );

  // Limpar filtros
  const clearFilters = useCallback(() => {
    localStorage.removeItem(storageKey);
    setFilters(null);
  }, [storageKey]);

  return {
    filters,
    saveFilters,
    presets,
    applyPreset,
    clearFilters,
  };
};

export default useFilterPersistence;
