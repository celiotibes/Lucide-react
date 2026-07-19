/**
 * useLLM Hook
 * React hook for using LLM router in components
 */

import { useState, useCallback, useRef } from 'react'
import { llmRouter } from '../services/llmRouter'
import type { LLMRequest, LLMResponse, RoutingStrategy } from '../types/llm'

interface UseLLMState {
  response: LLMResponse | null
  loading: boolean
  error: string | null
}

export function useLLM() {
  const [state, setState] = useState<UseLLMState>({
    response: null,
    loading: false,
    error: null,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const request = useCallback(async (prompt: string, options?: {
    system?: string
    maxTokens?: number
    temperature?: number
    strategy?: RoutingStrategy
  }): Promise<LLMResponse | null> => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    setState({ response: null, loading: true, error: null })

    try {
      const response = await llmRouter.route({
        prompt,
        system: options?.system,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
        strategy: options?.strategy,
      } as LLMRequest)

      setState({ response, loading: false, error: null })
      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setState({ response: null, loading: false, error: errorMessage })
      return null
    }
  }, [])

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setState((prev) => ({ ...prev, loading: false }))
    }
  }, [])

  const reset = useCallback(() => {
    setState({ response: null, loading: false, error: null })
  }, [])

  return {
    ...state,
    request,
    cancel,
    reset,
  }
}

/**
 * useLLMStream Hook (for future streaming support)
 */
export function useLLMStream() {
  const [state, setState] = useState<UseLLMState & { partialContent: string }>({
    response: null,
    loading: false,
    error: null,
    partialContent: '',
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const streamRequest = useCallback(async (
    prompt: string,
    onChunk?: (chunk: string) => void,
    options?: {
      system?: string
      maxTokens?: number
      temperature?: number
      strategy?: RoutingStrategy
    }
  ): Promise<LLMResponse | null> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    setState((prev) => ({ ...prev, loading: true, error: null, partialContent: '' }))

    try {
      const response = await llmRouter.route({
        prompt,
        system: options?.system,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
        strategy: options?.strategy,
      } as LLMRequest)

      if (onChunk) {
        // Simulate streaming by breaking content into chunks
        const chunkSize = 20
        for (let i = 0; i < response.content.length; i += chunkSize) {
          const chunk = response.content.substring(i, i + chunkSize)
          onChunk(chunk)
          setState((prev) => ({
            ...prev,
            partialContent: prev.partialContent + chunk,
          }))
          // Small delay to simulate streaming
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }

      setState({ response, loading: false, error: null, partialContent: response.content })
      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
      return null
    }
  }, [])

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setState((prev) => ({ ...prev, loading: false }))
    }
  }, [])

  const reset = useCallback(() => {
    setState({ response: null, loading: false, error: null, partialContent: '' })
  }, [])

  return {
    ...state,
    streamRequest,
    cancel,
    reset,
  }
}
