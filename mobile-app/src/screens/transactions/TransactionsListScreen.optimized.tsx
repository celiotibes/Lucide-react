/**
 * Optimized Transactions List Screen
 * Phase 22.10: Performance Optimization
 *
 * Template for optimizing transaction list similar to DocumentsListScreen
 * Apply same patterns: memoization, FlatList optimization, debouncing
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import {
  Text,
  FAB,
  Searchbar,
  SegmentedButtons,
} from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useDatabaseInstance } from '@/providers/DatabaseProvider';
import { useAuth } from '@/hooks';
import { Colors } from '@/theme/colors';
import { logger } from '@/utils/logger';
import {
  useDebouncedCallback,
  performanceMonitor,
  useRenderCount,
} from '@/utils/performance';

type NavigationProp = NativeStackNavigationProp<any, any>;

interface TransactionListItem {
  id: string;
  description: string;
  amount: number;
  date: number;
  type: 'income' | 'expense' | 'transfer';
  status: 'pending' | 'completed' | 'failed';
  category?: string;
}

/**
 * Memoized Transaction Item Component
 */
const TransactionItem = React.memo(
  ({ item, onPress }: { item: TransactionListItem; onPress: (id: string) => void }) => {
    const isIncome = item.type === 'income';
    const amountColor = isIncome ? Colors.success : Colors.error;

    const formatAmount = useMemo(
      () => `${isIncome ? '+' : '-'}R$ ${Math.abs(item.amount).toFixed(2)}`,
      [item.amount, isIncome]
    );

    const formatDate = useMemo(() => {
      const date = new Date(item.date);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    }, [item.date]);

    const getStatusIcon = useMemo(() => {
      switch (item.status) {
        case 'completed':
          return { icon: 'check-circle', color: Colors.success };
        case 'pending':
          return { icon: 'clock', color: Colors.warning };
        case 'failed':
          return { icon: 'alert-circle', color: Colors.error };
        default:
          return { icon: 'help-circle', color: Colors.textTertiary };
      }
    }, [item.status]);

    const handlePress = useCallback(() => {
      onPress(item.id);
    }, [onPress, item.id]);

    return (
      <Pressable style={styles.transactionItem} onPress={handlePress}>
        <View style={styles.transactionIcon}>
          <MaterialIcons
            name={item.type === 'income' ? 'arrow-downward' : 'arrow-upward'}
            size={20}
            color={amountColor}
          />
        </View>

        <View style={styles.transactionInfo}>
          <Text style={styles.description} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={styles.category}>{item.category || 'Uncategorized'}</Text>
        </View>

        <View style={styles.transactionRight}>
          <Text style={[styles.amount, { color: amountColor }]}>
            {formatAmount}
          </Text>
          <View style={styles.statusContainer}>
            <Text style={styles.date}>{formatDate}</Text>
            <MaterialIcons
              name={getStatusIcon.icon}
              size={12}
              color={getStatusIcon.color}
            />
          </View>
        </View>
      </Pressable>
    );
  }
);

TransactionItem.displayName = 'TransactionItem';

/**
 * Optimized Transactions List Screen
 */
const TransactionsListScreenComponent: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const database = useDatabaseInstance();
  const renderCount = useRenderCount('TransactionsListScreen');

  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [filteredTransactions, setFilteredTransactions] =
    useState<TransactionListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Load transactions with performance monitoring
   */
  const loadTransactions = useCallback(async () => {
    if (!database) return;

    try {
      setIsLoading(true);
      performanceMonitor.startMeasure('load-transactions');

      // TODO: Replace with actual transaction collection
      const transactionsCollection = database.get('Transaction');
      const allTransactions = await transactionsCollection.query().fetch();

      const items: TransactionListItem[] = allTransactions.map((tx: any) => ({
        id: tx.id,
        description: tx.description || 'Transaction',
        amount: tx.amount || 0,
        date: tx.date || Date.now(),
        type: tx.type || 'transfer',
        status: tx.status || 'pending',
        category: tx.category,
      }));

      // Sort by date, newest first
      items.sort((a, b) => b.date - a.date);

      setTransactions(items);
      applyFilters(items, searchQuery, selectedType);

      performanceMonitor.endMeasure('load-transactions');
      logger.info(`Loaded ${items.length} transactions`);
    } catch (error) {
      logger.error('Failed to load transactions', error);
    } finally {
      setIsLoading(false);
    }
  }, [database, searchQuery, selectedType]);

  /**
   * Apply filters with memoization
   */
  const applyFilters = useCallback(
    (items: TransactionListItem[], query: string, type: string | null) => {
      let filtered = items;

      if (type && type !== 'all') {
        filtered = filtered.filter((tx) => tx.type === type);
      }

      if (query.trim()) {
        const lowerQuery = query.toLowerCase();
        filtered = filtered.filter(
          (tx) =>
            tx.description.toLowerCase().includes(lowerQuery) ||
            (tx.category?.toLowerCase().includes(lowerQuery) ?? false)
        );
      }

      setFilteredTransactions(filtered);
    },
    []
  );

  /**
   * Debounced search
   */
  const handleSearch = useDebouncedCallback(
    (query: string) => {
      setSearchQuery(query);
      applyFilters(transactions, query, selectedType);
    },
    300,
    [transactions, selectedType, applyFilters]
  );

  /**
   * Handle type filter change
   */
  const handleTypeChange = useCallback(
    (type: string) => {
      const newType = type === 'all' ? null : type;
      setSelectedType(newType);
      applyFilters(transactions, searchQuery, newType);
    },
    [transactions, searchQuery, applyFilters]
  );

  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadTransactions();
    } catch (error) {
      logger.error('Refresh failed', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadTransactions]);

  /**
   * Load on mount
   */
  useEffect(() => {
    loadTransactions();

    // Periodic refresh every 60 seconds
    const refreshInterval = setInterval(loadTransactions, 60000);

    return () => clearInterval(refreshInterval);
  }, [loadTransactions]);

  /**
   * Render transaction item
   */
  const renderTransactionItem = useCallback(
    ({ item }: { item: TransactionListItem }) => (
      <TransactionItem
        item={item}
        onPress={() => {
          // TODO: Navigate to transaction detail
          navigation.navigate('TransactionDetail', { transactionId: item.id });
        }}
      />
    ),
    [navigation]
  );

  /**
   * Key extractor
   */
  const keyExtractor = useCallback((item: TransactionListItem) => item.id, []);

  /**
   * Empty state
   */
  const emptyComponent = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <MaterialIcons
          name="receipt"
          size={64}
          color={Colors.gray300}
        />
        <Text style={styles.emptyTitle}>No transactions yet</Text>
        <Text style={styles.emptySubtitle}>
          Your transactions will appear here
        </Text>
      </View>
    ),
    []
  );

  if (isLoading && transactions.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search transactions..."
          onChangeText={handleSearch}
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
            { label: 'Income', value: 'income' },
            { label: 'Expense', value: 'expense' },
            { label: 'Transfer', value: 'transfer' },
          ]}
          style={styles.segmentedButtons}
        />
      </View>

      <FlatList
        data={filteredTransactions}
        renderItem={renderTransactionItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={emptyComponent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        // Performance optimizations (same as DocumentsListScreen)
        windowSize={21}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={true}
        scrollEventThrottle={16}
      />
    </View>
  );
};

export const TransactionsListScreen = React.memo(TransactionsListScreenComponent);
TransactionsListScreen.displayName = 'TransactionsListScreen';

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
  transactionItem: {
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
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariant,
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  description: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  category: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  transactionRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  amount: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  date: {
    fontSize: 12,
    color: Colors.textTertiary,
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
});
