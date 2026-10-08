/**
 * Tests for useOptimizedDocuments Hook
 * Phase 22.10: Performance Optimization
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useOptimizedDocuments, DocumentListItem } from '../useOptimizedDocuments';

describe('useOptimizedDocuments', () => {
  const mockDocuments: DocumentListItem[] = [
    {
      id: '1',
      serverId: 'server-1',
      type: 'invoice',
      counterpartyName: 'Acme Inc',
      filePath: '/docs/invoice1.pdf',
      fileSize: 1024,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    {
      id: '2',
      serverId: 'server-2',
      type: 'receipt',
      counterpartyName: 'Acme Corp',
      filePath: '/docs/receipt1.pdf',
      fileSize: 512,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    {
      id: '3',
      serverId: null,
      type: 'contract',
      counterpartyName: 'Beta LLC',
      filePath: '/docs/contract1.pdf',
      fileSize: 2048,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
  ];

  it('should initialize with provided documents', () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({ initialDocuments: mockDocuments })
    );

    expect(result.current.allDocuments).toEqual(mockDocuments);
    expect(result.current.documents).toEqual(mockDocuments);
  });

  it('should filter documents by type', async () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({ initialDocuments: mockDocuments })
    );

    act(() => {
      result.current.handleTypeChange('invoice');
    });

    await waitFor(() => {
      expect(result.current.documents).toHaveLength(1);
      expect(result.current.documents[0].type).toBe('invoice');
    });
  });

  it('should search documents by counterparty name', async () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({ initialDocuments: mockDocuments })
    );

    act(() => {
      result.current.handleSearch('Acme');
    });

    // Search is debounced, wait for it
    await waitFor(() => {
      expect(result.current.documents).toHaveLength(2);
      expect(result.current.documents.every(doc =>
        doc.counterpartyName.includes('Acme')
      )).toBe(true);
    }, { timeout: 500 });
  });

  it('should combine type filter and search', async () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({ initialDocuments: mockDocuments })
    );

    act(() => {
      result.current.handleTypeChange('invoice');
      result.current.handleSearch('Acme');
    });

    await waitFor(() => {
      expect(result.current.documents).toHaveLength(1);
      expect(result.current.documents[0].type).toBe('invoice');
      expect(result.current.documents[0].counterpartyName).toContain('Acme');
    }, { timeout: 500 });
  });

  it('should cache filter results', async () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({
        initialDocuments: mockDocuments,
        cacheSize: 5,
      })
    );

    // First search
    act(() => {
      result.current.handleSearch('Acme');
    });

    await waitFor(() => {
      const firstResults = result.current.documents;
      expect(firstResults).toHaveLength(2);

      // Clear search
      result.current.handleSearch('');
    }, { timeout: 500 });

    // Search again - should use cache
    act(() => {
      result.current.handleSearch('Acme');
    });

    await waitFor(() => {
      const secondResults = result.current.documents;
      expect(secondResults).toHaveLength(2);
    }, { timeout: 500 });
  });

  it('should add document', () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({ initialDocuments: mockDocuments })
    );

    const newDoc: DocumentListItem = {
      id: '4',
      serverId: 'server-4',
      type: 'invoice',
      counterpartyName: 'New Client',
      filePath: '/docs/new.pdf',
      fileSize: 512,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };

    act(() => {
      result.current.addDocument(newDoc);
    });

    expect(result.current.allDocuments).toHaveLength(4);
    expect(result.current.allDocuments[0]).toEqual(newDoc);
  });

  it('should remove document', () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({ initialDocuments: mockDocuments })
    );

    act(() => {
      result.current.removeDocument('1');
    });

    expect(result.current.allDocuments).toHaveLength(2);
    expect(result.current.allDocuments.find(doc => doc.id === '1')).toBeUndefined();
  });

  it('should update documents', () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({ initialDocuments: mockDocuments })
    );

    const newDocs: DocumentListItem[] = [
      { ...mockDocuments[0], counterpartyName: 'Updated Name' },
    ];

    act(() => {
      result.current.updateDocuments(newDocs);
    });

    expect(result.current.allDocuments).toHaveLength(1);
    expect(result.current.allDocuments[0].counterpartyName).toBe('Updated Name');
  });

  it('should calculate stats', () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({ initialDocuments: mockDocuments })
    );

    expect(result.current.stats.totalCount).toBe(3);
    expect(result.current.stats.filteredCount).toBe(3);
    expect(result.current.stats.typeDistribution['invoice']).toBe(1);
    expect(result.current.stats.typeDistribution['receipt']).toBe(1);
    expect(result.current.stats.typeDistribution['contract']).toBe(1);
  });

  it('should filter stats after type change', async () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({ initialDocuments: mockDocuments })
    );

    act(() => {
      result.current.handleTypeChange('invoice');
    });

    await waitFor(() => {
      expect(result.current.stats.filteredCount).toBe(1);
    });
  });

  it('should debounce search', async () => {
    const { result } = renderHook(() =>
      useOptimizedDocuments({
        initialDocuments: mockDocuments,
        debounceDelay: 200,
      })
    );

    act(() => {
      result.current.handleSearch('A');
      result.current.handleSearch('Ac');
      result.current.handleSearch('Acm');
      result.current.handleSearch('Acme');
    });

    // Should not filter immediately
    expect(result.current.documents).toEqual(mockDocuments);

    // Wait for debounce
    await waitFor(() => {
      expect(result.current.documents).toHaveLength(2);
    }, { timeout: 400 });
  });
});
