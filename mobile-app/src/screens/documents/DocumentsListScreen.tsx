/**
 * Documents List Screen
 * Display list of documents with filtering, sorting, and sync integration
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Animated,
} from 'react-native';
import {
  Text,
  FAB,
  Searchbar,
  SegmentedButtons,
  ActivityIndicator,
} from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useDatabaseInstance } from '@/providers/DatabaseProvider';
import { useAuth } from '@/hooks';
import { useSyncManager } from '@/hooks/useSyncManager';
import { Document } from '@/database/models/Document';
import { Colors } from '@/theme/colors';
import { NetworkStatusIndicator } from '@/components/NetworkStatusIndicator';
import { logger } from '@/utils/logger';

type NavigationProp = NativeStackNavigationProp<any, any>;

interface DocumentListItem {
  id: string;
  serverId: string | null;
  type: string;
  counterpartyName: string;
  filePath: string;
  fileSize: number;
  updatedAt: number;
  createdAt: number;
}

export const DocumentsListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const database = useDatabaseInstance();
  const { apiEndpoint, deviceId } = useAuth();

  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [filteredDocuments, setFilteredDocuments] =
    useState<DocumentListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { isSyncing, performSync } = useSyncManager({
    apiBaseURL: apiEndpoint || 'https://api.example.com',
    deviceId: deviceId || 'unknown',
    autoSync: true,
  });

  // Load documents from database
  const loadDocuments = async () => {
    if (!database) return;

    try {
      setIsLoading(true);
      const documentsCollection = database.get('Document');
      const allDocuments = await documentsCollection.query().fetch();

      const documentItems: DocumentListItem[] = allDocuments.map((doc: any) => ({
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

      setDocuments(documentItems);
      filterDocuments(documentItems, searchQuery, selectedType);
    } catch (error) {
      logger.error('Failed to load documents', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter documents based on search and type
  const filterDocuments = (
    docs: DocumentListItem[],
    query: string,
    type: string | null
  ) => {
    let filtered = docs;

    // Filter by type
    if (type && type !== 'all') {
      filtered = filtered.filter((doc) => doc.type.toLowerCase() === type);
    }

    // Filter by search query
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(
        (doc) =>
          doc.counterpartyName.toLowerCase().includes(lowerQuery) ||
          doc.type.toLowerCase().includes(lowerQuery)
      );
    }

    setFilteredDocuments(filtered);
  };

  // Handle search change
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    filterDocuments(documents, query, selectedType);
  };

  // Handle type filter change
  const handleTypeChange = (type: string) => {
    const newType = type === 'all' ? null : type;
    setSelectedType(newType);
    filterDocuments(documents, searchQuery, newType);
  };

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await performSync();
      await loadDocuments();
    } catch (error) {
      logger.error('Refresh failed', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Load documents on mount
  useEffect(() => {
    loadDocuments();
    const refreshInterval = setInterval(loadDocuments, 30000); // Refresh every 30s

    return () => clearInterval(refreshInterval);
  }, [database]);

  const getDocumentIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'invoice':
        return 'description';
      case 'receipt':
        return 'receipt';
      case 'contract':
        return 'assignment';
      default:
        return 'insert-drive-file';
    }
  };

  const getDocumentColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'invoice':
        return Colors.invoiceColor;
      case 'receipt':
        return Colors.receiptColor;
      case 'contract':
        return Colors.contractColor;
      default:
        return Colors.gray400;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  const renderDocumentItem = ({ item }: { item: DocumentListItem }) => (
    <Pressable
      style={styles.documentItem}
      onPress={() =>
        navigation.navigate('DocumentDetail', { documentId: item.id })
      }
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: getDocumentColor(item.type) + '20' },
        ]}
      >
        <MaterialIcons
          name={getDocumentIcon(item.type)}
          size={24}
          color={getDocumentColor(item.type)}
        />
      </View>

      <View style={styles.documentInfo}>
        <Text style={styles.documentName} numberOfLines={1}>
          {item.counterpartyName}
        </Text>
        <View style={styles.documentMeta}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{item.type}</Text>
          </View>
          <Text style={styles.documentDate}>{formatDate(item.createdAt)}</Text>
          <Text style={styles.documentSize}>
            {formatFileSize(item.fileSize)}
          </Text>
        </View>
      </View>

      <View style={styles.syncStatus}>
        {!item.serverId && (
          <MaterialIcons name="cloud-upload" size={16} color={Colors.warning} />
        )}
      </View>
    </Pressable>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons
        name="insert-drive-file"
        size={64}
        color={Colors.gray300}
      />
      <Text style={styles.emptyTitle}>No documents yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to capture your first document
      </Text>
    </View>
  );

  if (isLoading && documents.length === 0) {
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
          value={searchQuery}
          style={styles.searchbar}
          iconColor={Colors.gray400}
          placeholderTextColor={Colors.textTertiary}
        />
      </View>

      <View style={styles.filterContainer}>
        <SegmentedButtons
          value={selectedType || 'all'}
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
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || isSyncing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
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
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginVertical: 6,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  documentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  documentDate: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  documentSize: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  syncStatus: {
    paddingLeft: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.primary,
  },
});
