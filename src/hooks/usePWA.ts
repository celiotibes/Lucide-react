/**
 * Hook para Progressive Web App
 * Gerencia instalação, atualizações e recursos offline
 */

import { useState, useEffect, useCallback } from 'react'

interface PWAInstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePWA() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [deferredPrompt, setDeferredPrompt] = useState<PWAInstallPrompt | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [hasUpdate, setHasUpdate] = useState(false)
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null)

  // Handle online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Register service worker
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        setSwRegistration(registration)

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                setHasUpdate(true)
              }
            })
          }
        })

        // Check for updates periodically
        setInterval(() => {
          registration.update()
        }, 60000) // Check every minute
      } catch (error) {
        console.error('Service Worker registration failed:', error)
      }
    }

    // Delay registration slightly
    const timer = setTimeout(registerServiceWorker, 1000)
    return () => clearTimeout(timer)
  }, [])

  // Handle install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as PWAInstallPrompt)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Install PWA
  const installApp = useCallback(async () => {
    if (!deferredPrompt) {
      return false
    }

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice

      if (outcome === 'accepted') {
        setIsInstalled(true)
        setDeferredPrompt(null)
        return true
      }
      return false
    } catch (error) {
      console.error('Installation failed:', error)
      return false
    }
  }, [deferredPrompt])

  // Update app
  const updateApp = useCallback(() => {
    if (!swRegistration?.waiting) {
      return
    }

    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })

    // Reload page after update
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  }, [swRegistration])

  // Clear cache
  const clearCache = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      return false
    }

    try {
      const controller = navigator.serviceWorker.controller
      if (controller) {
        controller.postMessage({ type: 'CLEAR_CACHE' })
      }

      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map(name => caches.delete(name)))
      return true
    } catch (error) {
      console.error('Cache clear failed:', error)
      return false
    }
  }, [])

  // Get device info
  const getDeviceInfo = useCallback(() => {
    const width = window.innerWidth
    const height = window.innerHeight
    const dpi = window.devicePixelRatio || 1

    let tipo: 'mobile' | 'tablet' | 'desktop'
    if (width < 768) {
      tipo = 'mobile'
    } else if (width < 1024) {
      tipo = 'tablet'
    } else {
      tipo = 'desktop'
    }

    const diagonalPx = Math.sqrt(width * width + height * height)
    const diagonalPolegadas = diagonalPx / (96 * dpi) // 96 DPI standard

    return {
      tipo,
      largura: width,
      altura: height,
      diagonalPolegadas: Math.round(diagonalPolegadas * 10) / 10,
      dpi: Math.round(dpi * 10) / 10,
      touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      orientacao: height > width ? 'portrait' : 'landscape',
    }
  }, [])

  return {
    isOnline,
    isInstalled,
    hasUpdate,
    canInstall: !!deferredPrompt,
    installApp,
    updateApp,
    clearCache,
    getDeviceInfo,
    swRegistration,
  }
}
