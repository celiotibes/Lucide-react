import { useState, useEffect, useCallback, useRef } from 'react';
import { FinancialKPIs } from '../types/bi';
import { api } from '../config/api';

interface UseFilteredKPIsProps {
  startDate: Date;
  endDate: Date;
  categories?: string[];
  propertyIds?: string[];
}

interface UseFilteredKPIsReturn {
  kpis: FinancialKPIs | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook para fetchar KPIs com filtros aplicados
 * Implementa debouncing automático para não sobrecarregar o backend
 */
export const useFilteredKPIs = ({
  startDate,
  endDate,
  categories = [],
  propertyIds = [],
}: UseFilteredKPIsProps): UseFilteredKPIsReturn => {
  const [kpis, setKpis] = useState<FinancialKPIs | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();

  const fetchKPIs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await api.post('/bi/kpis', {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        categories: categories.length > 0 ? categories : undefined,
        propertyIds: propertyIds.length > 0 ? propertyIds : undefined,
      });

      setKpis(response.data.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar KPIs';
      setError(message);
      console.error('Erro ao fetchar KPIs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, categories, propertyIds]);

  // Debounce de 300ms para não fazer muitas requests
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchKPIs();
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [fetchKPIs]);

  return {
    kpis,
    isLoading,
    error,
    refresh: fetchKPIs,
  };
};

export default useFilteredKPIs;
