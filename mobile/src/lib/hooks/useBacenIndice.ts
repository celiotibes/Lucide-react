import { useState, useCallback, useEffect } from 'react';
import { indiceCache, IndiceOfflineCache } from '../cache/indiceCache';

interface IndiceData {
  data: string;
  valor: number;
  taxa?: number;
}

interface CaucaoCalculada {
  valorOriginal: number;
  valorAtualizado: number;
  percentualVariacao: number;
  dataInicio: string;
  dataFim: string;
  diasDecorridos: number;
}

interface UseBacenIndiceReturn {
  ipca: IndiceData | null;
  poupanca: IndiceData | null;
  loading: boolean;
  error: string | null;
  calculando: boolean;
  calcularCaucao: (
    valorOriginal: number,
    dataInicio: string,
    dataFim?: string
  ) => Promise<CaucaoCalculada | null>;
  atualizarIndices: () => Promise<void>;
  useOfflineOnly: boolean;
  setUseOfflineOnly: (value: boolean) => void;
  cacheStats: { totalItems: number; ipca: number; poupanca: number };
}

export function useBacenIndice(): UseBacenIndiceReturn {
  const [ipca, setIpca] = useState<IndiceData | null>(null);
  const [poupanca, setPoupanca] = useState<IndiceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [useOfflineOnly, setUseOfflineOnly] = useState(true);
  const [cacheStats, setCacheStats] = useState({ totalItems: 0, ipca: 0, poupanca: 0 });

  // Initialize cache on mount
  useEffect(() => {
    const init = async () => {
      await indiceCache.initialize();
      const stats = await indiceCache.getCacheStats();
      setCacheStats(stats);
    };
    init();
  }, []);

  const atualizarIndices = useCallback(async () => {
    if (useOfflineOnly) {
      // Only load from cache
      const ipcaCache = await indiceCache.obterUltimoIndice('IPCA');
      const poupancaCache = await indiceCache.obterUltimoIndice('POUPANCA');

      if (ipcaCache) setIpca({ data: ipcaCache.data, valor: ipcaCache.valor });
      if (poupancaCache) setPoupanca({ data: poupancaCache.data, valor: poupancaCache.valor, taxa: poupancaCache.taxa });

      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Try to fetch from API
      const [ipcaResult, poupancaResult] = await Promise.all([
        fetchIndiceFromApi('IPCA'),
        fetchIndiceFromApi('POUPANCA'),
      ]);

      if (ipcaResult) {
        setIpca(ipcaResult);
        await indiceCache.salvarIndice('IPCA', ipcaResult.data, ipcaResult.valor);
      }

      if (poupancaResult) {
        setPoupanca(poupancaResult);
        await indiceCache.salvarIndice('POUPANCA', poupancaResult.data, poupancaResult.valor, poupancaResult.taxa);
      }

      // Update stats
      const stats = await indiceCache.getCacheStats();
      setCacheStats(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar índices');

      // Fallback to cached values
      const ipcaCache = await indiceCache.obterUltimoIndice('IPCA');
      const poupancaCache = await indiceCache.obterUltimoIndice('POUPANCA');

      if (ipcaCache) setIpca({ data: ipcaCache.data, valor: ipcaCache.valor });
      if (poupancaCache) setPoupanca({ data: poupancaCache.data, valor: poupancaCache.valor, taxa: poupancaCache.taxa });
    } finally {
      setLoading(false);
    }
  }, [useOfflineOnly]);

  const calcularCaucao = useCallback(
    async (valorOriginal: number, dataInicio: string, dataFim: string = new Date().toISOString().split('T')[0]): Promise<CaucaoCalculada | null> => {
      setCalculando(true);

      try {
        // Tentar cache primeiro
        const historicoCache = await indiceCache.obterHistoricoIndice('IPCA', dataInicio, dataFim);

        if (historicoCache) {
          const diasDecorridos = Math.floor(
            (new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / (1000 * 60 * 60 * 24)
          );

          const valorAtualizado = valorOriginal * (1 + historicoCache.percentualVariacao / 100);

          return {
            valorOriginal,
            valorAtualizado,
            percentualVariacao: historicoCache.percentualVariacao,
            dataInicio,
            dataFim,
            diasDecorridos,
          };
        }

        // Se não estiver em cache, chamar backend para calcular
        if (!useOfflineOnly) {
          const response = await fetch('/api/vistorias/calcular-caucao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              valorOriginal,
              dataInicio,
              dataFim,
            }),
          });

          if (!response.ok) {
            throw new Error('Falha ao calcular caução');
          }

          const resultado = await response.json();

          // Cache o resultado
          await indiceCache.salvarHistoricoIndice('IPCA', {
            dataInicio,
            dataFim,
            valorInicio: resultado.periodo.valorInicio,
            valorFim: resultado.periodo.valorFim,
            percentualVariacao: resultado.periodo.percentualVariacao,
            tipoIndice: 'IPCA',
            fetchedAt: Date.now(),
          });

          return {
            valorOriginal,
            valorAtualizado: resultado.valor,
            percentualVariacao: resultado.periodo.percentualVariacao,
            dataInicio,
            dataFim,
            diasDecorridos: Math.floor((new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / (1000 * 60 * 60 * 24)),
          };
        }

        setError('Sem dados em cache e modo offline ativado');
        return null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao calcular caução');
        return null;
      } finally {
        setCalculando(false);
      }
    },
    [useOfflineOnly]
  );

  return {
    ipca,
    poupanca,
    loading,
    error,
    calculando,
    calcularCaucao,
    atualizarIndices,
    useOfflineOnly,
    setUseOfflineOnly,
    cacheStats,
  };
}

async function fetchIndiceFromApi(tipo: 'IPCA' | 'POUPANCA'): Promise<IndiceData | null> {
  try {
    const endpoint = tipo === 'IPCA' ? '/api/vistorias/indice-ipca' : '/api/vistorias/indice-poupanca';

    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`Erro ao buscar índice ${tipo}:`, err);
    return null;
  }
}
