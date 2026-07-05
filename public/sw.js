/**
 * Service Worker para Progressive Web App
 * Suporta offline-first com cache strategies
 */

const CACHE_VERSION = 'lucide-v1'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`
const API_CACHE = `${CACHE_VERSION}-api`

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Alguns assets podem não estar disponíveis durante o build
        return Promise.resolve()
      })
    }).then(() => self.skipWaiting())
  )
})

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('lucide-') && cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE && cacheName !== API_CACHE) {
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch event - implement caching strategy
self.addEventListener('fetch', event => {
  const { request } = event
  const { url, method } = request

  // Skip non-GET requests
  if (method !== 'GET') {
    return event.respondWith(fetch(request))
  }

  // Skip chrome extensions
  if (url.startsWith('chrome-extension://')) {
    return
  }

  // HTML pages - Network first, fallback to cache
  if (request.destination === 'document' || request.mode === 'navigate') {
    return event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const responseToCache = response.clone()
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseToCache)
            })
          }
          return response
        })
        .catch(() => {
          return caches.match(request).then(response => {
            return response || new Response('Offline - página não disponível', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' }),
            })
          })
        })
    )
  }

  // API calls - Network first, fallback to cache
  if (url.includes('/api/') || url.includes('legaldatahunter') || url.includes('pubmed')) {
    return event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const responseToCache = response.clone()
            caches.open(API_CACHE).then(cache => {
              cache.put(request, responseToCache)
            })
          }
          return response
        })
        .catch(() => {
          return caches.match(request).then(response => {
            return response || new Response(JSON.stringify({ offline: true }), {
              status: 503,
              headers: new Headers({ 'Content-Type': 'application/json' }),
            })
          })
        })
    )
  }

  // Static assets - Cache first, fallback to network
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'image') {
    return event.respondWith(
      caches.match(request).then(response => {
        return response || fetch(request).then(fetchResponse => {
          if (fetchResponse.ok) {
            const responseToCache = fetchResponse.clone()
            caches.open(STATIC_CACHE).then(cache => {
              cache.put(request, responseToCache)
            })
          }
          return fetchResponse
        }).catch(() => {
          // Return placeholder for missing assets
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#eee" width="100" height="100"/></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            )
          }
          return new Response('', { status: 404 })
        })
      })
    )
  }

  // Default - network first
  return event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request)
    })
  )
})

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      )
    })
  }
})
