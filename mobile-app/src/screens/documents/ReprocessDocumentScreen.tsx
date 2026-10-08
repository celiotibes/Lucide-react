/**
 * Reprocess Document Screen
 * Handle re-processing of OCR and parsing for existing documents
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  Animated,
} from 'react-native';
import {
  Text,
  Button,
  ActivityIndicator,
  ProgressBar,
  Card,
  Chip,
  Divider,
} from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useDatabaseInstance } from '@/providers/DatabaseProvider';
import { DocumentProcessorService } from '@/services/DocumentProcessorService';
import { Colors } from '@/theme/colors';
import { logger } from '@/utils/logger';

type NavigationProp = NativeStackNavigationProp<any, any>;

interface ReprocessState {
  stage: 'idle' | 'processing' | 'comparing' | 'success' | 'error';
  progress: number;
  errorMessage?: string;
  oldConfidence?: number;
  newConfidence?: number;
}

interface DocumentData {
  id: string;
  filePath: string;
  type: string;
  counterpartyName: string;
  confidence?: number;
  ocrText?: string;
  parsedData?: any;
  updatedAt: number;
}

export const ReprocessDocumentScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const database = useDatabaseInstance();

  const documentId = (route.params as any)?.documentId;

  const [reprocessState, setReprocessState] = useState<ReprocessState>({
    stage: 'idle',
    progress: 0,
  });

  const [document, setDocument] = useState<DocumentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const progressAnim = new Animated.Value(0);

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Reprocess Document',
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.headerButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <MaterialIcons name="arrow-back" size={24} color={Colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const loadDocument = async () => {
    if (!database || !documentId) return;

    try {
      setIsLoading(true);
      const documentsCollection = database.get('Document');
      const doc = await documentsCollection.find(documentId);

      setDocument({
        id: doc.id,
        filePath: doc.filePath,
        type: doc.type,
        counterpartyName: doc.counterpartyName,
        confidence: doc.confidence,
        ocrText: doc.ocrText,
        parsedData: doc.parsedData,
        updatedAt: doc.updatedAt,
      });
    } catch (error) {
      logger.error('Failed to load document', error);
      Alert.alert('Error', 'Failed to load document');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const handleReprocess = async () => {
    if (!document || !database) return;

    try {
      setReprocessState({
        stage: 'processing',
        progress: 0,
        oldConfidence: document.confidence,
      });

      // Animate progress
      Animated.timing(progressAnim, {
        toValue: 40,
        duration: 800,
        useNativeDriver: false,
      }).start();

      const processorService = new DocumentProcessorService(database);

      // Reprocess the document
      const result = await processorService.processDocument(document.filePath, {
        source: 'reprocess',
        forceReprocess: true,
      });

      Animated.timing(progressAnim, {
        toValue: 80,
        duration: 600,
        useNativeDriver: false,
      }).start();

      setReprocessState((prev) => ({
        ...prev,
        stage: 'comparing',
        progress: 80,
        newConfidence: result.confidence,
      }));

      // Simulate comparison delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Update document
      const documentsCollection = database.get('Document');
      const updatedDoc = await documentsCollection.update((doc: any) => {
        if (doc.id === documentId) {
          doc.type = result.type || document.type;
          doc.counterpartyName = result.counterpartyName || document.counterpartyName;
          doc.ocrText = result.ocrText;
          doc.parsedData = result.parsedData;
          doc.confidence = result.confidence;
          doc.updatedAt = Date.now();
          doc.syncStatus = 'pending';
        }
      });

      Animated.timing(progressAnim, {
        toValue: 100,
        duration: 400,
        useNativeDriver: false,
      }).start();

      setReprocessState({
        stage: 'success',
        progress: 100,
        newConfidence: result.confidence,
        oldConfidence: document.confidence,
      });

      // Show success and return
      setTimeout(() => {
        Alert.alert(
          'Success',
          'Document reprocessed successfully',
          [
            {
              text: 'View Details',
              onPress: () =>
                navigation.replace('DocumentDetail', {
                  documentId: documentId,
                }),
            },
            {
              text: 'Back to List',
              onPress: () => navigation.popToTop(),
            },
          ],
          { cancelable: false }
        );
      }, 500);
    } catch (error) {
      logger.error('Document reprocessing failed', error);
      setReprocessState({
        stage: 'error',
        progress: 0,
        errorMessage:
          error instanceof Error ? error.message : 'Reprocessing failed',
      });
    }
  };

  const renderLoadingState = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );

  const renderIdleState = () => (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerIcon}>
          <MaterialIcons name="refresh" size={60} color={Colors.primary} />
        </View>

        <Text style={styles.title}>Reprocess Document</Text>
        <Text style={styles.subtitle}>
          Analyze this document again to improve accuracy
        </Text>

        {document && (
          <Card style={styles.infoCard}>
            <Card.Content>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Type:</Text>
                <Chip mode="flat" style={styles.typeChip}>
                  {document.type}
                </Chip>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Counterparty:</Text>
                <Text style={styles.infoValue}>{document.counterpartyName}</Text>
              </View>

              <Divider style={styles.divider} />

              <View style={styles.confidenceRow}>
                <View style={styles.confidenceItem}>
                  <Text style={styles.confidenceLabel}>Current Confidence</Text>
                  <Chip
                    mode="flat"
                    style={[
                      styles.confidenceChip,
                      {
                        backgroundColor:
                          (document.confidence || 0) > 0.8
                            ? Colors.success + '20'
                            : (document.confidence || 0) > 0.6
                              ? Colors.warning + '20'
                              : Colors.error + '20',
                      },
                    ]}
                  >
                    {Math.round((document.confidence || 0) * 100)}%
                  </Chip>
                </View>
              </View>

              <Text style={styles.processDescription}>
                The system will re-analyze the OCR text and parsed data to
                improve accuracy and detect any missed information.
              </Text>
            </Card.Content>
          </Card>
        )}

        <View style={styles.buttonsContainer}>
          <Button
            mode="contained"
            onPress={handleReprocess}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
            icon="play"
          >
            Start Reprocessing
          </Button>

          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            style={styles.secondaryButton}
            contentStyle={styles.buttonContent}
          >
            Cancel
          </Button>
        </View>
      </View>
    </ScrollView>
  );

  const renderProcessingState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.processingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.processingTitle}>
          {reprocessState.stage === 'processing'
            ? 'Reprocessing Document'
            : 'Comparing Results'}
        </Text>
        <Text style={styles.processingSubtitle}>
          {reprocessState.stage === 'processing'
            ? 'Analyzing OCR and parsing data...'
            : 'Comparing old and new results...'}
        </Text>

        <ProgressBar
          progress={reprocessState.progress / 100}
          color={Colors.primary}
          style={styles.progressBar}
        />

        <Text style={styles.progressText}>{Math.round(reprocessState.progress)}%</Text>
      </View>
    </View>
  );

  const renderSuccessState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.successContainer}>
        <View style={styles.successIconContainer}>
          <MaterialIcons name="check-circle" size={80} color={Colors.success} />
        </View>

        <Text style={styles.successTitle}>Reprocessing Complete!</Text>

        <Card style={styles.resultCard}>
          <Card.Content>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Old Confidence:</Text>
              <Chip mode="flat" style={styles.resultChip}>
                {Math.round((reprocessState.oldConfidence || 0) * 100)}%
              </Chip>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>New Confidence:</Text>
              <Chip
                mode="flat"
                style={[
                  styles.resultChip,
                  {
                    backgroundColor:
                      (reprocessState.newConfidence || 0) >
                      (reprocessState.oldConfidence || 0)
                        ? Colors.success + '20'
                        : Colors.warning + '20',
                  },
                ]}
              >
                {Math.round((reprocessState.newConfidence || 0) * 100)}%
              </Chip>
            </View>

            {(reprocessState.newConfidence || 0) >
              (reprocessState.oldConfidence || 0) && (
              <Text style={styles.improvementText}>
                ✓ Confidence improved by{' '}
                {Math.round(
                  ((reprocessState.newConfidence || 0) -
                    (reprocessState.oldConfidence || 0)) *
                    100
                )}%
              </Text>
            )}
          </Card.Content>
        </Card>
      </View>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.errorIconContainer}>
        <MaterialIcons name="error-outline" size={80} color={Colors.error} />
      </View>

      <Text style={styles.errorTitle}>Reprocessing Failed</Text>
      <Text style={styles.errorMessage}>{reprocessState.errorMessage}</Text>

      <View style={styles.buttonsContainer}>
        <Button
          mode="contained"
          onPress={handleReprocess}
          style={styles.primaryButton}
        >
          Try Again
        </Button>

        <Button
          mode="outlined"
          onPress={() => navigation.goBack()}
          style={styles.secondaryButton}
        >
          Back
        </Button>
      </View>
    </View>
  );

  if (isLoading) {
    return renderLoadingState();
  }

  return (
    <>
      {reprocessState.stage === 'idle' && renderIdleState()}
      {(reprocessState.stage === 'processing' ||
        reprocessState.stage === 'comparing') &&
        renderProcessingState()}
      {reprocessState.stage === 'success' && renderSuccessState()}
      {reprocessState.stage === 'error' && renderErrorState()}
    </>
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
    paddingHorizontal: 24,
    paddingVertical: 32,
    minHeight: 600,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  headerButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  infoCard: {
    width: '100%',
    marginBottom: 24,
    backgroundColor: Colors.surface,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  typeChip: {
    backgroundColor: Colors.primary + '20',
  },
  divider: {
    marginVertical: 12,
  },
  confidenceRow: {
    width: '100%',
    marginBottom: 12,
  },
  confidenceItem: {
    alignItems: 'center',
  },
  confidenceLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 8,
  },
  confidenceChip: {
    backgroundColor: Colors.warning + '20',
  },
  processDescription: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 12,
    fontStyle: 'italic',
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    width: '100%',
  },
  secondaryButton: {
    width: '100%',
  },
  buttonContent: {
    paddingVertical: 8,
  },
  processingContainer: {
    alignItems: 'center',
    gap: 16,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  processingSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  progressBar: {
    width: 200,
    height: 6,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  successContainer: {
    alignItems: 'center',
    width: '100%',
  },
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.success + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.success,
    marginBottom: 16,
  },
  resultCard: {
    width: '100%',
    backgroundColor: Colors.surface,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  resultChip: {
    backgroundColor: Colors.warning + '20',
  },
  improvementText: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  errorIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.error + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.error,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
});
