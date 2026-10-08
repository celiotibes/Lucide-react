import { useState, useCallback, useRef } from 'react';
import { useDatabaseInstance } from '../providers/DatabaseProvider';
import { DocumentProcessorService } from '../services/DocumentProcessorService';
import { ProcessingProgress, ProcessingResult } from '../services/DocumentProcessorService';
import { logger } from '../utils/logger';

export interface UseDocumentProcessorState {
  isProcessing: boolean;
  progress: ProcessingProgress | null;
  result: ProcessingResult | null;
  error: Error | null;
  supportedLanguages: string[];
  currentLanguage: string;
}

export const useDocumentProcessor = () => {
  const database = useDatabaseInstance();
  const serviceRef = useRef<DocumentProcessorService | null>(null);

  const [state, setState] = useState<UseDocumentProcessorState>({
    isProcessing: false,
    progress: null,
    result: null,
    error: null,
    supportedLanguages: [],
    currentLanguage: 'eng',
  });

  // Initialize service
  const initializeService = useCallback(async () => {
    if (!serviceRef.current) {
      serviceRef.current = new DocumentProcessorService(database);

      // Load supported languages
      try {
        const languages = await serviceRef.current.getSupportedLanguages();
        setState((prev) => ({
          ...prev,
          supportedLanguages: languages,
        }));
      } catch (error) {
        logger.error('Failed to load supported languages', error);
      }

      // Set progress callback
      serviceRef.current.setProgressCallback((progress) => {
        setState((prev) => ({
          ...prev,
          progress,
        }));
      });
    }
  }, [database]);

  const captureFromCamera = useCallback(
    async (counterpartyName?: string): Promise<ProcessingResult | null> => {
      try {
        await initializeService();
        if (!serviceRef.current) return null;

        setState((prev) => ({
          ...prev,
          isProcessing: true,
          error: null,
          result: null,
        }));

        const result = await serviceRef.current.processFromCamera(
          counterpartyName || 'Unknown',
        );

        setState((prev) => ({
          ...prev,
          isProcessing: false,
          result,
        }));

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Camera capture failed', err);
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: err,
        }));
        return null;
      }
    },
    [initializeService],
  );

  const captureFromLibrary = useCallback(
    async (counterpartyName?: string): Promise<ProcessingResult | null> => {
      try {
        await initializeService();
        if (!serviceRef.current) return null;

        setState((prev) => ({
          ...prev,
          isProcessing: true,
          error: null,
          result: null,
        }));

        const result = await serviceRef.current.processFromLibrary(
          counterpartyName || 'Unknown',
        );

        setState((prev) => ({
          ...prev,
          isProcessing: false,
          result,
        }));

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Library capture failed', err);
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: err,
        }));
        return null;
      }
    },
    [initializeService],
  );

  const reprocessDocument = useCallback(
    async (documentId: string): Promise<ProcessingResult | null> => {
      try {
        await initializeService();
        if (!serviceRef.current) return null;

        setState((prev) => ({
          ...prev,
          isProcessing: true,
          error: null,
        }));

        const result = await serviceRef.current.reprocessDocument(documentId);

        setState((prev) => ({
          ...prev,
          isProcessing: false,
          result,
        }));

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Reprocessing failed', err);
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: err,
        }));
        return null;
      }
    },
    [initializeService],
  );

  const setLanguage = useCallback(
    async (language: string): Promise<boolean> => {
      try {
        await initializeService();
        if (!serviceRef.current) return false;

        await serviceRef.current.setOCRLanguage(language);
        setState((prev) => ({
          ...prev,
          currentLanguage: language,
        }));

        return true;
      } catch (error) {
        logger.error('Failed to set language', error);
        return false;
      }
    },
    [initializeService],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  const clearResult = useCallback(() => {
    setState((prev) => ({
      ...prev,
      result: null,
    }));
  }, []);

  return {
    // State
    ...state,

    // Methods
    captureFromCamera,
    captureFromLibrary,
    reprocessDocument,
    setLanguage,
    clearError,
    clearResult,
  };
};

export default useDocumentProcessor;
