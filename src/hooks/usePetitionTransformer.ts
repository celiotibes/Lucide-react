/**
 * usePetitionTransformer Hook
 * React hook for using Petition Transformer in components
 */

import { useState, useCallback, useRef } from 'react'
import { petitionTransformer } from '../services/petitionTransformer'
import type {
  InputFormat,
  TransformationResult,
  TransformationProgress,
  ProcessingOptions,
} from '../types/petitionTransformer'

interface UsePetitionTransformerState {
  result: TransformationResult | null
  loading: boolean
  error: string | null
  progress: TransformationProgress | null
}

export function usePetitionTransformer() {
  const [state, setState] = useState<UsePetitionTransformerState>({
    result: null,
    loading: false,
    error: null,
    progress: null,
  })

  const unsubscribeRef = useRef<(() => void) | null>(null)
  const documentIdRef = useRef<string>('')

  const transform = useCallback(
    async (
      file: File | string,
      format: InputFormat,
      options?: Partial<ProcessingOptions>,
      onProgressUpdate?: (progress: TransformationProgress) => void
    ) => {
      setState({ result: null, loading: true, error: null, progress: null })

      try {
        // Generate document ID
        const documentId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        documentIdRef.current = documentId

        // Subscribe to progress
        unsubscribeRef.current = petitionTransformer.subscribeToProgress(
          documentId,
          (progress) => {
            setState((prev) => ({ ...prev, progress }))
            onProgressUpdate?.(progress)
          }
        )

        // Perform transformation
        const result = await petitionTransformer.transformPetition(
          file,
          format,
          options,
          documentId
        )

        setState((prev) => ({ ...prev, result, loading: false, progress: null }))
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Transformation failed'
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
        return null
      } finally {
        // Cleanup
        if (unsubscribeRef.current) {
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }
      }
    },
    []
  )

  const reset = useCallback(() => {
    setState({ result: null, loading: false, error: null, progress: null })
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
  }, [])

  const exportFormat = useCallback((format: string): Blob | null => {
    if (!state.result) return null
    return state.result.exportedFormats.get(format as any) || null
  }, [state.result])

  const downloadFormat = useCallback((format: string, fileName: string) => {
    const blob = exportFormat(format)
    if (!blob) return

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName || `petition-${format}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [exportFormat])

  return {
    ...state,
    transform,
    reset,
    exportFormat,
    downloadFormat,
  }
}
