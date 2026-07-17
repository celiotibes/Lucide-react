/**
 * useBiData Hook
 * Hook customizado para carregar dados de BI de forma reativa
 */

import { useState, useEffect, useCallback } from 'react';
import { biApiClient } from '../services/bi/api-client';
import { FinancialKPIs, BiFilterState } from '../types/bi';
import { Logger } from '../utils/logger';

const logger = Logger.getLogger('useBiData');

interface UseBiDataOptions {
  autoLoad?: boolean;
  cacheTime?: number;
}

interface UseBiDataReturn {
  kpis: FinancialKPIs | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useBiData(
  filters: BiFilterState,
  options: UseBiDataOptions = {}
): UseBiDataReturn {
  const { autoLoad = true, cacheTime = 3600000 } = options;

  const [kpis, setKpis] = useState<FinancialKPIs | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  const fetchKpis = useCallback(async (forceRefresh = false) => {
    try {
      // Verificar cache
      if (!forceRefresh && Date.now() - lastFetchTime < cacheTime) {
        logger.debug('Usando dados do cache', { cacheAge: Date.now() - lastFetchTime });
        return;
      }

      setIsLoading(true);
      setError(null);

      logger.info('Buscando KPIs', {
        startDate: filters.startDate,
        endDate: filters.endDate,
        propertyCount: filters.propertyIds.length,
      });

      const data = await biApiClient.fetchKPIs(filters);
      setKpis(data);
      setLastFetchTime(Date.now());

      logger.info('KPIs carregados com sucesso');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      logger.error('Erro ao carregar KPIs', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters, cacheTime, lastFetchTime]);

  // Auto-load quando filters mudam
  useEffect(() => {
    if (autoLoad) {
      fetchKpis(true);
    }
  }, [filters, autoLoad, fetchKpis]);

  return {
    kpis,
    isLoading,
    error,
    refetch: () => fetchKpis(true),
  };
}

export default useBiData;
