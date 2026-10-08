/**
 * Optimized Empty State Component
 * Memoized component for displaying empty list state
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { Colors } from '@/theme/colors';

interface OptimizedEmptyStateProps {
  title?: string;
  subtitle?: string;
  icon?: string;
}

const OptimizedEmptyStateComponent: React.FC<OptimizedEmptyStateProps> = ({
  title = 'No documents yet',
  subtitle = 'Tap the + button to capture your first document',
  icon = 'insert-drive-file',
}) => (
  <View style={styles.emptyContainer}>
    <MaterialIcons
      name={icon}
      size={64}
      color={Colors.gray300}
    />
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptySubtitle}>{subtitle}</Text>
  </View>
);

export const OptimizedEmptyState = React.memo(OptimizedEmptyStateComponent);
OptimizedEmptyState.displayName = 'OptimizedEmptyState';

const styles = StyleSheet.create({
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
