/**
 * Optimized Document Item Component
 * Memoized component for rendering individual document list items
 * Prevents unnecessary re-renders when parent list updates
 */

import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { DocumentListItem } from '@/utils/performance';
import { Colors } from '@/theme/colors';

interface OptimizedDocumentItemProps {
  item: DocumentListItem;
  onPress: (documentId: string) => void;
}

/**
 * Get icon for document type - memoized
 */
const getDocumentIcon = (type: string): string => {
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

/**
 * Get color for document type - memoized
 */
const getDocumentColor = (type: string): string => {
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

/**
 * Format file size - memoized pure function
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Format date - memoized pure function
 */
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
};

/**
 * Document Item Component - Memoized to prevent unnecessary re-renders
 */
const OptimizedDocumentItemComponent: React.FC<OptimizedDocumentItemProps> = ({
  item,
  onPress,
}) => {
  // Memoize the color and icon to avoid recalculation
  const iconName = useMemo(() => getDocumentIcon(item.type), [item.type]);
  const iconColor = useMemo(() => getDocumentColor(item.type), [item.type]);

  // Memoize formatted values
  const formattedSize = useMemo(() => formatFileSize(item.fileSize), [item.fileSize]);
  const formattedDate = useMemo(() => formatDate(item.createdAt), [item.createdAt]);

  // Memoize callback to prevent child component re-renders
  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [onPress, item.id]);

  return (
    <Pressable style={styles.documentItem} onPress={handlePress}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: iconColor + '20' },
        ]}
      >
        <MaterialIcons
          name={iconName}
          size={24}
          color={iconColor}
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
          <Text style={styles.documentDate}>{formattedDate}</Text>
          <Text style={styles.documentSize}>{formattedSize}</Text>
        </View>
      </View>

      <View style={styles.syncStatus}>
        {!item.serverId && (
          <MaterialIcons name="cloud-upload" size={16} color={Colors.warning} />
        )}
      </View>
    </Pressable>
  );
};

// Memoize the component to prevent re-renders when props haven't changed
export const OptimizedDocumentItem = React.memo(OptimizedDocumentItemComponent, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  // Return true if props are equal (don't re-render)
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.type === nextProps.item.type &&
    prevProps.item.counterpartyName === nextProps.item.counterpartyName &&
    prevProps.item.fileSize === nextProps.item.fileSize &&
    prevProps.item.createdAt === nextProps.item.createdAt &&
    prevProps.item.serverId === nextProps.item.serverId &&
    prevProps.onPress === nextProps.onPress
  );
});

OptimizedDocumentItem.displayName = 'OptimizedDocumentItem';

const styles = StyleSheet.create({
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
});
