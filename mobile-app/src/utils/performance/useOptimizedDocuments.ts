/**
 * Optimized Documents Hook
 * Handles efficient document loading, caching, filtering and searching
 * with debouncing and memoization
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useDebouncedCallback } from './usePerformanceOptimization';

export interface DocumentListItem {
  id: string;
  serverId: string | null;
  type: string;
  counterpartyName: string;
  filePath: string;
  fileSize: number;
  updatedAt: number;
  createdAt: number;
}

interface UseOptimizedDocumentsOptions {
  initialDocuments?: DocumentListItem[];
  debounceDelay?: number;
  cacheSize?: number;
}

/**
 * Custom hook for optimized document management
 * Provides memoized filtering, searching, and caching
 */
export function useOptimizedDocuments(options: UseOptimizedDocumentsOptions = {}) {
  const {
    initialDocuments = [],
    debounceDelay = 300,
    cacheSize = 10,
  } = options;

  const [documents, setDocuments] = useState<DocumentListItem[]>(initialDocuments);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Cache filtered results to avoid recalculation
  const filterCacheRef = useRef<Map<string, DocumentListItem[]>>(new Map());
  const cacheKeyRef = useRef<string>('');

  /**
   * Generate cache key from current filters
   */
  const getCacheKey = useCallback(
    (query: string, type: string | null): string => {
      return `${query}|${type || 'all'}`;
    },
    []
  );

  /**
   * Filter documents with optimized memoization
   */
  const filteredDocuments = useMemo(() => {
    const cacheKey = getCacheKey(searchQuery, selectedType);

    // Check cache first
    if (filterCacheRef.current.has(cacheKey)) {
      return filterCacheRef.current.get(cacheKey)!;
    }

    let filtered = documents;

    // Filter by type
    if (selectedType && selectedType !== 'all') {
      filtered = filtered.filter(
        (doc) => doc.type.toLowerCase() === selectedType.toLowerCase()
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (doc) =>
          doc.counterpartyName.toLowerCase().includes(lowerQuery) ||
          doc.type.toLowerCase().includes(lowerQuery)
      );
    }

    // Maintain cache size limit
    if (filterCacheRef.current.size >= cacheSize) {
      const firstKey = filterCacheRef.current.keys().next().value;
      filterCacheRef.current.delete(firstKey);
    }

    filterCacheRef.current.set(cacheKey, filtered);
    cacheKeyRef.current = cacheKey;

    return filtered;
  }, [documents, searchQuery, selectedType, cacheSize, getCacheKey]);

  /**
   * Debounced search handler
   */
  const handleSearch = useDebouncedCallback(
    (query: string) => {
      setSearchQuery(query);
    },
    debounceDelay,
    [debounceDelay]
  );

  /**
   * Handle type filter change (not debounced - immediate)
   */
  const handleTypeChange = useCallback((type: string) => {
    const newType = type === 'all' ? null : type;
    setSelectedType(newType);
  }, []);

  /**
   * Clear cache
   */
  const clearCache = useCallback(() => {
    filterCacheRef.current.clear();
    cacheKeyRef.current = '';
  }, []);

  /**
   * Update documents and clear cache
   */
  const updateDocuments = useCallback((newDocuments: DocumentListItem[]) => {
    setDocuments(newDocuments);
    clearCache();
  }, [clearCache]);

  /**
   * Add single document
   */
  const addDocument = useCallback((doc: DocumentListItem) => {
    setDocuments((prev) => [doc, ...prev]);
    clearCache();
  }, [clearCache]);

  /**
   * Remove document by ID
   */
  const removeDocument = useCallback((docId: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
    clearCache();
  }, [clearCache]);

  /**
   * Get document statistics
   */
  const stats = useMemo(() => {
    const totalCount = documents.length;
    const types = new Map<string, number>();

    documents.forEach((doc) => {
      const type = doc.type.toLowerCase();
      types.set(type, (types.get(type) || 0) + 1);
    });

    return {
      totalCount,
      filteredCount: filteredDocuments.length,
      typeDistribution: Object.fromEntries(types),
    };
  }, [documents, filteredDocuments]);

  return {
    // State
    documents: filteredDocuments,
    allDocuments: documents,
    searchQuery,
    selectedType,

    // Handlers
    handleSearch,
    handleTypeChange,

    // Mutations
    updateDocuments,
    addDocument,
    removeDocument,

    // Utilities
    clearCache,
    stats,
  };
}
