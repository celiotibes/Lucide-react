import AsyncStorage from '@react-native-async-storage/async-storage';

interface IndiceCache {
  data: string;
  valor: number;
  taxa?: number;
  tipoIndice: 'IPCA' | 'POUPANCA';
  fetchedAt: number;
}

interface HistoricoIndiceCache {
  dataInicio: string;
  dataFim: string;
  valorInicio: number;
  valorFim: number;
  percentualVariacao: number;
  tipoIndice: 'IPCA' | 'POUPANCA';
  fetchedAt: number;
}

const CACHE_KEY_PREFIX = '@indice_cache_';
const CACHE_HISTORICO_PREFIX = '@indice_historico_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

export class IndiceOfflineCache {
  private isInitialized = false;

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async salvarIndice(tipo: 'IPCA' | 'POUPANCA', data: string, valor: number, taxa?: number): Promise<void> {
    try {
      const cache: IndiceCache = {
        data,
        valor,
        taxa,
        tipoIndice: tipo,
        fetchedAt: Date.now(),
      };

      const key = `${CACHE_KEY_PREFIX}${tipo}_${data}`;
      await AsyncStorage.setItem(key, JSON.stringify(cache));
    } catch (err) {
      console.error('Erro ao salvar índice em cache:', err);
    }
  }

  async obterIndice(tipo: 'IPCA' | 'POUPANCA', data: string): Promise<IndiceCache | null> {
    try {
      const key = `${CACHE_KEY_PREFIX}${tipo}_${data}`;
      const cached = await AsyncStorage.getItem(key);

      if (!cached) {
        return null;
      }

      const indice: IndiceCache = JSON.parse(cached);

      // Verificar se cache ainda é válido
      if (Date.now() - indice.fetchedAt > CACHE_TTL) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return indice;
    } catch (err) {
      console.error('Erro ao obter índice do cache:', err);
      return null;
    }
  }

  async obterUltimoIndice(tipo: 'IPCA' | 'POUPANCA'): Promise<IndiceCache | null> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const relatedKeys = keys.filter((k) => k.startsWith(`${CACHE_KEY_PREFIX}${tipo}`));

      if (relatedKeys.length === 0) {
        return null;
      }

      // Buscar o mais recente
      let latest: IndiceCache | null = null;

      for (const key of relatedKeys) {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const indice: IndiceCache = JSON.parse(cached);

          // Skip expired
          if (Date.now() - indice.fetchedAt > CACHE_TTL) {
            await AsyncStorage.removeItem(key);
            continue;
          }

          if (!latest || new Date(indice.data) > new Date(latest.data)) {
            latest = indice;
          }
        }
      }

      return latest;
    } catch (err) {
      console.error('Erro ao obter último índice:', err);
      return null;
    }
  }

  async salvarHistoricoIndice(
    tipo: 'IPCA' | 'POUPANCA',
    periodo: HistoricoIndiceCache
  ): Promise<void> {
    try {
      const key = `${CACHE_HISTORICO_PREFIX}${tipo}_${periodo.dataInicio}_${periodo.dataFim}`;
      await AsyncStorage.setItem(key, JSON.stringify(periodo));
    } catch (err) {
      console.error('Erro ao salvar histórico de índice:', err);
    }
  }

  async obterHistoricoIndice(
    tipo: 'IPCA' | 'POUPANCA',
    dataInicio: string,
    dataFim: string
  ): Promise<HistoricoIndiceCache | null> {
    try {
      const key = `${CACHE_HISTORICO_PREFIX}${tipo}_${dataInicio}_${dataFim}`;
      const cached = await AsyncStorage.getItem(key);

      if (!cached) {
        return null;
      }

      const historico: HistoricoIndiceCache = JSON.parse(cached);

      // Verificar se cache ainda é válido
      if (Date.now() - historico.fetchedAt > CACHE_TTL) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return historico;
    } catch (err) {
      console.error('Erro ao obter histórico de índice:', err);
      return null;
    }
  }

  async listarTodosIndices(tipo: 'IPCA' | 'POUPANCA'): Promise<IndiceCache[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const relatedKeys = keys.filter((k) => k.startsWith(`${CACHE_KEY_PREFIX}${tipo}`));

      const indices: IndiceCache[] = [];

      for (const key of relatedKeys) {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const indice: IndiceCache = JSON.parse(cached);

          // Skip expired
          if (Date.now() - indice.fetchedAt > CACHE_TTL) {
            await AsyncStorage.removeItem(key);
            continue;
          }

          indices.push(indice);
        }
      }

      // Sort by date
      indices.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      return indices;
    } catch (err) {
      console.error('Erro ao listar índices:', err);
      return [];
    }
  }

  async limparCache(tipo?: 'IPCA' | 'POUPANCA'): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();

      if (tipo) {
        const relatedKeys = keys.filter((k) => k.startsWith(`${CACHE_KEY_PREFIX}${tipo}`));
        await AsyncStorage.multiRemove(relatedKeys);
      } else {
        // Clear all cache
        const cacheKeys = keys.filter((k) => k.startsWith(CACHE_KEY_PREFIX) || k.startsWith(CACHE_HISTORICO_PREFIX));
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (err) {
      console.error('Erro ao limpar cache:', err);
    }
  }

  async getCacheStats(): Promise<{ totalItems: number; ipca: number; poupanca: number }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_KEY_PREFIX));

      const ipcaKeys = cacheKeys.filter((k) => k.includes('IPCA')).length;
      const poupancaKeys = cacheKeys.filter((k) => k.includes('POUPANCA')).length;

      return {
        totalItems: cacheKeys.length,
        ipca: ipcaKeys,
        poupanca: poupancaKeys,
      };
    } catch (err) {
      console.error('Erro ao obter stats do cache:', err);
      return { totalItems: 0, ipca: 0, poupanca: 0 };
    }
  }
}

export const indiceCache = new IndiceOfflineCache();
