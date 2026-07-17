/**
 * Gerenciador de armazenamento offline para PWA
 * Task #49 - Sincronização offline de apontamentos
 */

export interface OfflineApontamento {
  id: string;
  contratoId: string;
  data: string;
  horasTrabalhadas: number;
  descricao?: string;
  residenciais?: string[];
  timestamp: number;
  synced: boolean;
}

export interface SyncStatus {
  pendentes: number;
  sincronizados: number;
  erros: number;
  ultimaSincronizacao?: Date;
}

class StorageManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Inicializar banco de dados IndexedDB
   */
  async openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('lucide-crmt-offline', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('apontamentos')) {
          const store = db.createObjectStore('apontamentos', { keyPath: 'id' });
          store.createIndex('synced', 'synced', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('sync_log')) {
          db.createObjectStore('sync_log', { keyPath: 'id', autoIncrement: true });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Salvar apontamento offline
   */
  async salvarApontamento(apontamento: OfflineApontamento): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['apontamentos'], 'readwrite');
      const store = tx.objectStore('apontamentos');
      const request = store.put(apontamento);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Obter apontamentos não sincronizados
   */
  async obterApontamentosNaoSincronizados(): Promise<OfflineApontamento[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['apontamentos'], 'readonly');
      const store = tx.objectStore('apontamentos');
      const index = store.index('synced');
      const request = index.getAll(false);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as OfflineApontamento[]);
    });
  }

  /**
   * Marcar apontamento como sincronizado
   */
  async marcarSincronizado(id: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['apontamentos'], 'readwrite');
      const store = tx.objectStore('apontamentos');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const apontamento = getRequest.result as OfflineApontamento;
        if (apontamento) {
          apontamento.synced = true;
          const updateRequest = store.put(apontamento);
          updateRequest.onerror = () => reject(updateRequest.error);
          updateRequest.onsuccess = () => resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Registrar tentativa de sincronização
   */
  async registrarSincronizacao(
    apontamento_id: string,
    sucesso: boolean,
    erro?: string
  ): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sync_log'], 'readwrite');
      const store = tx.objectStore('sync_log');
      const request = store.add({
        apontamento_id,
        sucesso,
        erro,
        timestamp: Date.now(),
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Obter status de sincronização
   */
  async obterStatusSincronizacao(): Promise<SyncStatus> {
    const db = await this.openDB();

    const apontamentos = await new Promise<OfflineApontamento[]>((resolve, reject) => {
      const tx = db.transaction(['apontamentos'], 'readonly');
      const store = tx.objectStore('apontamentos');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as OfflineApontamento[]);
    });

    const syncLog = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(['sync_log'], 'readonly');
      const store = tx.objectStore('sync_log');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const pendentes = apontamentos.filter((a) => !a.synced).length;
    const sincronizados = apontamentos.filter((a) => a.synced).length;
    const erros = syncLog.filter((log) => !log.sucesso).length;

    const ultimoSync = syncLog
      .filter((log) => log.sucesso)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    return {
      pendentes,
      sincronizados,
      erros,
      ultimaSincronizacao: ultimoSync ? new Date(ultimoSync.timestamp) : undefined,
    };
  }

  /**
   * Limpar dados sincronizados
   */
  async limparApontamentosSincronizados(): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['apontamentos'], 'readwrite');
      const store = tx.objectStore('apontamentos');
      const index = store.index('synced');
      const request = index.openCursor(IDBKeyRange.only(true));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }
}

export const storageManager = new StorageManager();

/**
 * Registrar Service Worker se disponível
 */
export async function registrarServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers não suportados');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('Service Worker registrado:', registration);

    // Verificar atualizações periodicamente
    setInterval(async () => {
      await registration.update();
    }, 60000);
  } catch (error) {
    console.error('Erro ao registrar Service Worker:', error);
  }
}

/**
 * Sincronizar apontamentos enfileirados
 */
export async function sincronizarApontamentos(
  syncFunction: (apontamentos: OfflineApontamento[]) => Promise<void>
): Promise<SyncStatus> {
  const apontamentos = await storageManager.obterApontamentosNaoSincronizados();

  for (const apontamento of apontamentos) {
    try {
      await syncFunction([apontamento]);
      await storageManager.marcarSincronizado(apontamento.id);
      await storageManager.registrarSincronizacao(apontamento.id, true);
    } catch (error) {
      await storageManager.registrarSincronizacao(
        apontamento.id,
        false,
        error instanceof Error ? error.message : 'Erro desconhecido'
      );
    }
  }

  return storageManager.obterStatusSincronizacao();
}
