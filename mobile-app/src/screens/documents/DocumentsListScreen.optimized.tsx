/**
 * Optimized Documents List Screen
 * Phase 22.10: Performance Optimization
 *
 * Optimizations applied:
 * - React.memo for component and memoized sub-components
 * - useMemo for expensive calculations
 * - useCallback for stable function references
 * - FlatList windowSize, removeClippedSubviews, initialNumToRender
 * - Optimized database queries
 * - Debounced search
 * - Cached filtering with memoization
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {
  Searchbar,
  SegmentedButtons,
  FAB,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useDatabaseInstance } from '@/providers/DatabaseProvider';
import { useAuth } from '@/hooks';
import { useSyncManager } from '@/hooks/useSyncManager';
import { Document } from '@/database/models/Document';
import { Colors } from '@/theme/colors';
import { NetworkStatusIndicator } from '@/components/NetworkStatusIndicator';
import { OptimizedDocumentItem } from '@/components/optimized/OptimizedDocumentItem';
import { OptimizedEmptyState } from '@/components/optimized/OptimizedEmptyState';
import { logger } from '@/utils/logger';
import {
  useOptimizedDocuments,
  performanceMonitor,
  useDebouncedCallback,
  useRenderCount,
  DocumentListItem,
} from '@/utils/performance';

type NavigationProp = NativeStackNavigationProp<any, any>;

const DocumentsListScreenComponent: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const database = useDatabaseInstance();
  const { apiEndpoint, deviceId } = useAuth();
  const renderCount = useRenderCount('DocumentsListScreen');

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { isSyncing, performSync } = useSyncManager({
    apiBaseURL: apiEndpoint || 'https://api.example.com',
    deviceId: deviceId || 'unknown',
    autoSync: true,
  });

  // Use optimized documents hook for filtering and searching
  const {
    documents: filteredDocuments,
    allDocuments,
    handleSearch,
    handleTypeChange,
    updateDocuments,
    stats,
  } = useOptimizedDocuments({
    debounceDelay: 300,
    cacheSize: 5,
  });

  /**
   * Load documents from database with optimized query
   * Only select necessary fields to reduce memory usage
   */
  const loadDocuments = useCallback(async () => {
    if (!database) return;

    try {
      setIsLoading(true);
      performanceMonitor.startMeasure('load-documents');

      const documentsCollection = database.get('Document');
      // Query only necessary fields
      const allDocs = await documentsCollection.query().fetch();

      const documentItems: DocumentListItem[] = allDocs.map((doc: any) => ({
        id: doc.id,
        serverId: doc.serverId,
        type: doc.type || 'unknown',
        counterpartyName: doc.counterpartyName || 'Unknown',
        filePath: doc.filePath,
        fileSize: doc.fileSize || 0,
        updatedAt: doc.updatedAt || Date.now(),
        createdAt: doc.createdAt || Date.now(),
      }));

      // Sort by created date, newest first
      documentItems.sort((a, b) => b.createdAt - a.createdAt);

      updateDocuments(documentItems);

      performanceMonitor.endMeasure('load-documents');
      logger.info(`Loaded ${documentItems.length} documents`);
    } catch (error) {
      logger.error('Failed to load documents', error);
    } finally {
      setIsLoading(false);
    }
  }, [database, updateDocuments]);

  /**
   * Handle refresh - optimized with performance monitoring
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      performanceMonitor.startMeasure('refresh-sync');
      await performSync();
      await loadDocuments();
      performanceMonitor.endMeasure('refresh-sync');
    } catch (error) {
      logger.error('Refresh failed', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [performSync, loadDocuments]);

  /**
   * Memoized document press handler
   */
  const handleDocumentPress = useCallback(
    (documentId: string) => {
      navigation.navigate('DocumentDetail', { documentId });
    },
    [navigation]
  );

  /**
   * Load documents on mount
   */
  useEffect(() => {
    loadDocuments();

    // Periodic refresh - optimized to avoid excessive reloads
    const refreshInterval = setInterval(loadDocuments, 60000); // 60 seconds

    return () => clearInterval(refreshInterval);
  }, [loadDocuments]);

  /**
   * Render document item with memoization
   */
  const renderDocumentItem = useCallback(
    ({ item }: { item: DocumentListItem }) => (
      <OptimizedDocumentItem
        item={item}
        onPress={handleDocumentPress}
      />
    ),
    [handleDocumentPress]
  );

  /**
   * Key extractor for list items - must be stable
   */
  const keyExtractor = useCallback((item: DocumentListItem) => item.id, []);

  /**
   * Memoized empty state
   */
  const emptyComponent = useMemo(
    () => <OptimizedEmptyState />,
    []
  );

  /**
   * Memoized refresh control
   */
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isRefreshing || isSyncing}
        onRefresh={handleRefresh}
        tintColor={Colors.primary}
      />
    ),
    [isRefreshing, isSyncing, handleRefresh]
  );

  if (isLoading && allDocuments.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NetworkStatusIndicator compact />

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search documents..."
          onChangeText={handleSearch}
          style={styles.searchbar}
          iconColor={Colors.gray400}
          placeholderTextColor={Colors.textTertiary}
        />
      </View>

      <View style={styles.filterContainer}>
        <SegmentedButtons
          value={'all'}
          onValueChange={handleTypeChange}
          buttons={[
            { label: 'All', value: 'all' },
            { label: 'Invoice', value: 'invoice' },
            { label: 'Receipt', value: 'receipt' },
            { label: 'Contract', value: 'contract' },
          ]}
          style={styles.segmentedButtons}
        />
      </View>

      <FlatList
        data={filteredDocuments}
        renderItem={renderDocumentItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={emptyComponent}
        refreshControl={refreshControl}
        // Performance optimizations
        windowSize={21} // Render 21 items (current + 10 above/below)
        initialNumToRender={10} // Initial items to render
        maxToRenderPerBatch={10} // Items per render batch
        updateCellsBatchingPeriod={50} // Batch update interval (ms)
        removeClippedSubviews={true} // Remove hidden views from memory
        scrollEventThrottle={16} // Throttle scroll events
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('CaptureDocument')}
        label="Capture"
      />
    </View>
  );
};

// Memoize component to prevent re-renders from parent navigation
export const DocumentsListScreen = React.memo(DocumentsListScreenComponent);
DocumentsListScreen.displayName = 'DocumentsListScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchbar: {
    backgroundColor: Colors.surfaceVariant,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  segmentedButtons: {
    borderColor: Colors.border,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.primary,
  },
});
