/**
 * Service Worker para PWA offline-first
 * Task #49 - Sincronização offline de apontamentos
 */

const CACHE_NAME = 'lucide-crmt-v1';
const RUNTIME_CACHE = 'lucide-runtime-v1';
const API_CACHE = 'lucide-api-v1';

const urlsToCache = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install: cache essentials
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // HTML/Assets: cache-first with network fallback
  if (request.method === 'GET') {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // POST/PUT: cache request for sync
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    event.respondWith(handleOfflinePost(request));
    return;
  }
});

/**
 * Network-first strategy com cache fallback
 */
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // Fallback to cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // Return offline page
    return caches.match('/offline');
  }
}

/**
 * Cache-first strategy com network fallback
 */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return caches.match('/offline');
  }
}

/**
 * Tratar requisições POST/PUT quando offline
 * Armazenar para sincronização posterior
 */
async function handleOfflinePost(request) {
  try {
    // Tentar enviar normalmente
    return await fetch(request);
  } catch (error) {
    // Armazenar no IndexedDB para sincronização posterior
    const body = await request.clone().text();
    const syncRequest = {
      url: request.url,
      method: request.method,
      body: body,
      headers: Object.fromEntries(request.headers),
      timestamp: Date.now(),
      id: `${request.method}-${Date.now()}`,
    };

    // Salvar no IndexedDB
    const db = await openDB();
    const tx = db.transaction(['pending_requests'], 'readwrite');
    tx.objectStore('pending_requests').add(syncRequest);

    return new Response(
      JSON.stringify({
        queued: true,
        message: 'Requisição enfileirada para sincronização offline',
        requestId: syncRequest.id,
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Abrir banco IndexedDB
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lucide-crmt', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending_requests')) {
        db.createObjectStore('pending_requests', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_data')) {
        db.createObjectStore('offline_data', { keyPath: 'id' });
      }
    };
  });
}

/**
 * Background sync: sincronizar requisições enfileiradas
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-requests') {
    event.waitUntil(syncPendingRequests());
  }
});

async function syncPendingRequests() {
  const db = await openDB();
  const tx = db.transaction(['pending_requests'], 'readonly');
  const store = tx.objectStore('pending_requests');
  const requests = await getAllFromStore(store);

  for (const syncReq of requests) {
    try {
      const response = await fetch(syncReq.url, {
        method: syncReq.method,
        headers: syncReq.headers,
        body: syncReq.body,
      });

      if (response.ok) {
        // Remover da fila
        const delTx = db.transaction(['pending_requests'], 'readwrite');
        delTx.objectStore('pending_requests').delete(syncReq.id);
      }
    } catch (error) {
      console.error(`Erro ao sincronizar ${syncReq.id}:`, error);
    }
  }
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Message handler para comunicação com cliente
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_PENDING_REQUESTS') {
    openDB().then((db) => {
      const tx = db.transaction(['pending_requests'], 'readonly');
      const store = tx.objectStore('pending_requests');
      const request = store.getAll();

      request.onsuccess = () => {
        event.ports[0].postMessage({
          type: 'PENDING_REQUESTS',
          data: request.result,
        });
      };
    });
  }
});
