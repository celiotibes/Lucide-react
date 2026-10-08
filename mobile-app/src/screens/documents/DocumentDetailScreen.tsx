/**
 * Document Detail Screen
 * Display detailed information about a document including OCR results and parsed data
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Share,
  Alert,
} from 'react-native';
import {
  Text,
  Button,
  Divider,
  ActivityIndicator,
  Card,
} from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useDatabaseInstance } from '@/providers/DatabaseProvider';
import { Colors } from '@/theme/colors';
import { logger } from '@/utils/logger';

interface DocumentDetailParams {
  documentId: string;
}

interface ParsedData {
  vendor?: string;
  date?: string;
  amount?: number;
  currency?: string;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  [key: string]: any;
}

interface DocumentData {
  id: string;
  filePath: string;
  type: string;
  counterpartyName: string;
  fileSize: number;
  createdAt: number;
  updatedAt: number;
  ocrText?: string;
  parsedData?: ParsedData;
  confidence?: number;
}

type NavigationProp = NativeStackNavigationProp<any, any>;

export const DocumentDetailScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const database = useDatabaseInstance();

  const params = route.params as DocumentDetailParams;
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showOcrText, setShowOcrText] = useState(false);

  useEffect(() => {
    loadDocument();
  }, [params.documentId]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <Pressable onPress={handleShare} style={styles.headerButton}>
            <MaterialIcons name="share" size={24} color={Colors.primary} />
          </Pressable>
          <Pressable onPress={handleDelete} style={styles.headerButton}>
            <MaterialIcons name="delete" size={24} color={Colors.error} />
          </Pressable>
        </View>
      ),
    });
  }, [document]);

  const loadDocument = async () => {
    if (!database || !params.documentId) return;

    try {
      setIsLoading(true);
      const documentsCollection = database.get('Document');
      const doc = await documentsCollection.find(params.documentId);

      setDocument({
        id: doc.id,
        filePath: doc.filePath,
        type: doc.type || 'unknown',
        counterpartyName: doc.counterpartyName || 'Unknown',
        fileSize: doc.fileSize || 0,
        createdAt: doc.createdAt || Date.now(),
        updatedAt: doc.updatedAt || Date.now(),
        ocrText: doc.ocrText,
        parsedData: doc.parsedData,
        confidence: doc.confidence,
      });
    } catch (error) {
      logger.error('Failed to load document', error);
      Alert.alert('Error', 'Failed to load document');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = async () => {
    if (!document) return;

    try {
      await Share.share({
        message: `Document: ${document.counterpartyName}`,
        title: document.counterpartyName,
        url: `file://${document.filePath}`,
      });
    } catch (error) {
      logger.error('Share failed', error);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Document', 'Are you sure you want to delete this document?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          if (!database || !document) return;

          try {
            const documentsCollection = database.get('Document');
            await database.write(async () => {
              const doc = await documentsCollection.find(document.id);
              await doc.destroyPermanently();
            });

            navigation.goBack();
          } catch (error) {
            logger.error('Delete failed', error);
            Alert.alert('Error', 'Failed to delete document');
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!document) {
    return (
      <View style={styles.centerContainer}>
        <Text>Document not found</Text>
      </View>
    );
  }

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
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const parsedData = document.parsedData || {};

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Card */}
      <Card style={styles.headerCard}>
        <View style={styles.headerContent}>
          <View
            style={[
              styles.typeIconContainer,
              { backgroundColor: getDocumentColor(document.type) + '20' },
            ]}
          >
            <MaterialIcons
              name={document.type === 'invoice' ? 'description' : 'receipt'}
              size={40}
              color={getDocumentColor(document.type)}
            />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.documentTitle}>{document.counterpartyName}</Text>
            <View style={styles.headerMeta}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{document.type.toUpperCase()}</Text>
              </View>
              {document.confidence && (
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>
                    {Math.round(document.confidence)}% confidence
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Card>

      {/* Document Metadata */}
      <Card style={styles.card}>
        <Card.Title
          title="Document Information"
          titleStyle={styles.cardTitle}
        />
        <View style={styles.cardContent}>
          <View style={styles.metaRow}>
            <MaterialIcons name="calendar-today" size={16} color={Colors.primary} />
            <View style={styles.metaText}>
              <Text style={styles.metaLabel}>Created</Text>
              <Text style={styles.metaValue}>{formatDate(document.createdAt)}</Text>
            </View>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.metaRow}>
            <MaterialIcons name="storage" size={16} color={Colors.primary} />
            <View style={styles.metaText}>
              <Text style={styles.metaLabel}>File Size</Text>
              <Text style={styles.metaValue}>{formatFileSize(document.fileSize)}</Text>
            </View>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.metaRow}>
            <MaterialIcons name="info" size={16} color={Colors.primary} />
            <View style={styles.metaText}>
              <Text style={styles.metaLabel}>Last Updated</Text>
              <Text style={styles.metaValue}>{formatDate(document.updatedAt)}</Text>
            </View>
          </View>
        </View>
      </Card>

      {/* Parsed Data */}
      {Object.keys(parsedData).length > 0 && (
        <Card style={styles.card}>
          <Card.Title
            title="Extracted Information"
            titleStyle={styles.cardTitle}
          />
          <View style={styles.cardContent}>
            {parsedData.vendor && (
              <>
                <View style={styles.metaRow}>
                  <MaterialIcons name="business" size={16} color={Colors.primary} />
                  <View style={styles.metaText}>
                    <Text style={styles.metaLabel}>Vendor</Text>
                    <Text style={styles.metaValue}>{parsedData.vendor}</Text>
                  </View>
                </View>
                <Divider style={styles.divider} />
              </>
            )}
            {parsedData.date && (
              <>
                <View style={styles.metaRow}>
                  <MaterialIcons name="event" size={16} color={Colors.primary} />
                  <View style={styles.metaText}>
                    <Text style={styles.metaLabel}>Document Date</Text>
                    <Text style={styles.metaValue}>{parsedData.date}</Text>
                  </View>
                </View>
                <Divider style={styles.divider} />
              </>
            )}
            {parsedData.amount && (
              <>
                <View style={styles.metaRow}>
                  <MaterialIcons name="attach-money" size={16} color={Colors.primary} />
                  <View style={styles.metaText}>
                    <Text style={styles.metaLabel}>Amount</Text>
                    <Text style={styles.metaValue}>
                      {parsedData.currency} {parsedData.amount}
                    </Text>
                  </View>
                </View>
                <Divider style={styles.divider} />
              </>
            )}
            {Array.isArray(parsedData.items) && parsedData.items.length > 0 && (
              <View>
                <Text style={styles.metaLabel}>Line Items</Text>
                {parsedData.items.map((item, index) => (
                  <View key={index} style={styles.lineItem}>
                    <Text style={styles.lineItemDescription}>
                      {item.description}
                    </Text>
                    <View style={styles.lineItemDetails}>
                      <Text style={styles.lineItemText}>
                        {item.quantity}x @ {item.unitPrice}
                      </Text>
                      <Text style={styles.lineItemTotal}>${item.total}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Card>
      )}

      {/* OCR Text */}
      {document.ocrText && (
        <Card style={styles.card}>
          <Pressable
            onPress={() => setShowOcrText(!showOcrText)}
            style={styles.cardTitlePressable}
          >
            <Text style={styles.cardTitle}>OCR Text</Text>
            <MaterialIcons
              name={showOcrText ? 'expand-less' : 'expand-more'}
              size={20}
              color={Colors.primary}
            />
          </Pressable>
          {showOcrText && (
            <View style={styles.cardContent}>
              <Text style={styles.ocrText}>{document.ocrText}</Text>
            </View>
          )}
        </Card>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={() =>
            navigation.navigate('ReprocessDocument', {
              documentId: document.id,
            })
          }
          style={styles.actionButton}
        >
          Reprocess
        </Button>
        <Button
          mode="outlined"
          onPress={handleShare}
          style={styles.actionButton}
        >
          Share
        </Button>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  headerButton: {
    padding: 8,
  },
  headerCard: {
    marginBottom: 16,
    backgroundColor: Colors.surface,
  },
  headerContent: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  typeIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  headerMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    marginBottom: 16,
    backgroundColor: Colors.surface,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  cardTitlePressable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.syncSuccess + '20',
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.syncSuccess,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  metaText: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  divider: {
    marginVertical: 12,
  },
  lineItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lineItemDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  lineItemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineItemText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  lineItemTotal: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  ocrText: {
    fontSize: 12,
    color: Colors.text,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  actionButton: {
    flex: 1,
  },
});
