/**
 * Custom Hook: useFetch
 * 
 * Gerencia estado de fetch/loading/error com caching automático
 * Integrado com BackendClient para autenticação
 * 
 * Uso:
 * const { data, loading, error, fetch } = useFetch<Tipo>()
 * await fetch('/endpoint')
 */

import { useState, useCallback, useRef } from 'react'
import BackendClient, { ApiError } from '@/services/backendClient'

export interface FetchState<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
  timestamp: number | null
}

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos

export function useFetch<T = unknown>(cacheKey?: string) {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: false,
    error: null,
    timestamp: null,
  })

  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * Verificar cache
   */
  const getFromCache = useCallback((key: string): T | null => {
    const cached = cacheRef.current.get(key)
    if (!cached) return null

    const isExpired = Date.now() - cached.timestamp > CACHE_DURATION
    if (isExpired) {
      cacheRef.current.delete(key)
      return null
    }

    return cached.data
  }, [])

  /**
   * Guardar no cache
   */
  const saveToCache = useCallback((key: string, data: T) => {
    cacheRef.current.set(key, {
      data,
      timestamp: Date.now(),
    })
  }, [])

  /**
   * Fazer fetch
   */
  const fetch = useCallback(
    async (
      url: string,
      options?: {
        method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
        body?: any
        cache?: boolean
      }
    ) => {
      const cacheId = cacheKey || url
      const method = options?.method || 'GET'
      const useCache = options?.cache !== false && method === 'GET'

      // Verificar cache
      if (useCache) {
        const cached = getFromCache(cacheId)
        if (cached) {
          setState({
            data: cached,
            loading: false,
            error: null,
            timestamp: Date.now(),
          })
          return cached
        }
      }

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }))

      // Cancelar request anterior se houver
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()

      try {
        const config: any = {
          signal: abortControllerRef.current.signal,
        }

        if (options?.body) {
          config.data = options.body
        }

        const response = await BackendClient.getInstance()({
          method,
          url,
          ...config,
        })

        const data = response.data

        // Guardar no cache se GET
        if (useCache) {
          saveToCache(cacheId, data)
        }

        setState({
          data,
          loading: false,
          error: null,
          timestamp: Date.now(),
        })

        return data
      } catch (err) {
        if (axios.isCancel(err)) {
          // Request foi cancelado, não atualizar estado
          return
        }

        const error = err as ApiError
        setState({
          data: null,
          loading: false,
          error,
          timestamp: Date.now(),
        })

        throw error
      }
    },
    [cacheKey, getFromCache, saveToCache]
  )

  /**
   * Limpar cache
   */
  const clearCache = useCallback(() => {
    if (cacheKey) {
      cacheRef.current.delete(cacheKey)
    } else {
      cacheRef.current.clear()
    }
  }, [cacheKey])

  /**
   * Cleanup: cancelar requests ao desmontar
   */
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  return {
    ...state,
    fetch,
    clearCache,
    cleanup,
  }
}

// Importar axios para type checking
import axios from 'axios'

export default useFetch
