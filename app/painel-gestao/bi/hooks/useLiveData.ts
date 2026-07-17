'use client';

import { useEffect, useState, useRef } from 'react';
import { useRealtime } from '../components/RealtimeProvider';

interface UseLiveDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // ms
  onDataUpdate?: () => void;
  dependsOnTables?: string[];
}

/**
 * Hook para dados que se atualizam em tempo real
 * Monitora mudanças nas tabelas especificadas e trigger refresh
 */
export function useLiveData<T>(
  fetchFunction: () => Promise<T>,
  options: UseLiveDataOptions = {}
): {
  data: T | null;
  loading: boolean;
  error?: Error;
  refresh: () => Promise<void>;
  lastUpdated?: Date;
  isStale: boolean;
} {
  const {
    autoRefresh = true,
    refreshInterval = 30000, // 30s default
    onDataUpdate,
    dependsOnTables = [],
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>();
  const [isStale, setIsStale] = useState(false);

  const { lastUpdate, hasNewData } = useRealtime();
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();

  const refresh = async () => {
    try {
      setLoading(true);
      setError(undefined);
      const newData = await fetchFunction();
      setData(newData);
      setLastUpdated(new Date());
      setIsStale(false);
      onDataUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Erro ao carregar dados'));
      setIsStale(true);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    refresh();
  }, []);

  // Auto-refresh quando há novos dados em tabelas monitoradas
  useEffect(() => {
    if (!autoRefresh) return;
    if (!hasNewData || !lastUpdate) return;

    // Check se é uma tabela que nos interessa
    if (dependsOnTables.length === 0 || dependsOnTables.includes(lastUpdate.table)) {
      // Debounce: aguarda 1s antes de atualizar
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        refresh();
      }, 1000);
    }

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [hasNewData, lastUpdate, autoRefresh, dependsOnTables]);

  // Periodic refresh se habilitado
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refresh();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  return {
    data,
    loading,
    error,
    refresh,
    lastUpdated,
    isStale,
  };
}
