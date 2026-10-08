/**
 * Capture Document Screen
 * Handle document capture from camera or gallery with real-time preview
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
  Chip,
  Card,
} from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useDatabaseInstance } from '@/providers/DatabaseProvider';
import { useAuth } from '@/hooks';
import { DocumentCaptureService } from '@/services/DocumentCaptureService';
import { DocumentProcessorService } from '@/services/DocumentProcessorService';
import { Colors } from '@/theme/colors';
import { logger } from '@/utils/logger';

type NavigationProp = NativeStackNavigationProp<any, any>;

interface CaptureState {
  mode: 'idle' | 'camera' | 'gallery' | 'processing' | 'success' | 'error';
  documentPath?: string;
  documentType?: string;
  processingProgress: number;
  errorMessage?: string;
}

export const CaptureDocumentScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const database = useDatabaseInstance();
  const { apiEndpoint, deviceId } = useAuth();

  const [captureState, setCaptureState] = useState<CaptureState>({
    mode: 'idle',
    processingProgress: 0,
  });

  const progressAnim = new Animated.Value(0);

  useEffect(() => {
    navigation.setOptions({
      title: 'Capture Document',
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

  const handleCaptureFromCamera = async () => {
    try {
      setCaptureState({ mode: 'camera', processingProgress: 0 });

      const captureService = new DocumentCaptureService();
      const result = await captureService.captureFromCamera();

      if (result) {
        await processDocument(result.filePath, 'camera');
      } else {
        setCaptureState({
          mode: 'idle',
          processingProgress: 0,
        });
      }
    } catch (error) {
      logger.error('Camera capture failed', error);
      setCaptureState({
        mode: 'error',
        processingProgress: 0,
        errorMessage: 'Failed to capture from camera',
      });
    }
  };

  const handleCaptureFromGallery = async () => {
    try {
      setCaptureState({ mode: 'gallery', processingProgress: 0 });

      const captureService = new DocumentCaptureService();
      const result = await captureService.captureFromGallery();

      if (result) {
        await processDocument(result.filePath, 'gallery');
      } else {
        setCaptureState({
          mode: 'idle',
          processingProgress: 0,
        });
      }
    } catch (error) {
      logger.error('Gallery capture failed', error);
      setCaptureState({
        mode: 'error',
        processingProgress: 0,
        errorMessage: 'Failed to select from gallery',
      });
    }
  };

  const processDocument = async (filePath: string, source: string) => {
    try {
      if (!database) {
        throw new Error('Database not initialized');
      }

      setCaptureState({
        mode: 'processing',
        documentPath: filePath,
        processingProgress: 0,
      });

      // Animate progress bar
      Animated.timing(progressAnim, {
        toValue: 30,
        duration: 500,
        useNativeDriver: false,
      }).start();

      const processorService = new DocumentProcessorService(database);

      // Process the document (OCR, parsing, etc.)
      const result = await processorService.processDocument(filePath, {
        source,
        autoDetectType: true,
      });

      Animated.timing(progressAnim, {
        toValue: 100,
        duration: 500,
        useNativeDriver: false,
      }).start();

      // Save to database
      const documentsCollection = database.get('Document');
      const document = await documentsCollection.create((doc: any) => {
        doc.filePath = filePath;
        doc.type = result.type || 'unknown';
        doc.counterpartyName = result.counterpartyName || 'Unnamed';
        doc.fileSize = result.fileSize || 0;
        doc.ocrText = result.ocrText;
        doc.parsedData = result.parsedData;
        doc.confidence = result.confidence;
        doc.createdAt = Date.now();
        doc.updatedAt = Date.now();
        doc.syncStatus = 'pending';
      });

      setCaptureState({
        mode: 'success',
        documentPath: filePath,
        documentType: result.type,
        processingProgress: 100,
      });

      // Show success message
      setTimeout(() => {
        Alert.alert('Success', 'Document captured and processed successfully', [
          {
            text: 'View',
            onPress: () =>
              navigation.navigate('DocumentDetail', {
                documentId: document.id,
              }),
          },
          {
            text: 'Done',
            onPress: () => navigation.goBack(),
          },
        ]);
      }, 1000);
    } catch (error) {
      logger.error('Document processing failed', error);
      setCaptureState({
        mode: 'error',
        processingProgress: 0,
        errorMessage:
          error instanceof Error ? error.message : 'Processing failed',
      });
    }
  };

  const renderIdleState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.iconBigContainer}>
        <MaterialIcons name="document-scanner" size={80} color={Colors.primary} />
      </View>

      <Text style={styles.title}>Capture Document</Text>
      <Text style={styles.subtitle}>
        Take a photo or select an image from your gallery
      </Text>

      <View style={styles.buttonsContainer}>
        <Button
          mode="contained"
          onPress={handleCaptureFromCamera}
          style={styles.primaryButton}
          contentStyle={styles.buttonContent}
          icon="camera"
        >
          Camera
        </Button>

        <Button
          mode="outlined"
          onPress={handleCaptureFromGallery}
          style={styles.secondaryButton}
          contentStyle={styles.buttonContent}
          icon="image"
        >
          Gallery
        </Button>
      </View>

      <Card style={styles.infoCard}>
        <Card.Content>
          <View style={styles.infoItem}>
            <MaterialIcons name="info" size={20} color={Colors.info} />
            <Text style={styles.infoText}>
              Supported formats: JPEG, PNG, PDF
            </Text>
          </View>
          <View style={styles.infoItem}>
            <MaterialIcons name="info" size={20} color={Colors.info} />
            <Text style={styles.infoText}>
              Automatic document type detection
            </Text>
          </View>
        </Card.Content>
      </Card>
    </View>
  );

  const renderProcessingState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.processingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.processingTitle}>Processing Document</Text>
        <Text style={styles.processingSubtitle}>
          {captureState.mode === 'camera'
            ? 'Analyzing captured image...'
            : 'Processing gallery image...'}
        </Text>

        <ProgressBar
          progress={captureState.processingProgress / 100}
          color={Colors.primary}
          style={styles.progressBar}
        />

        <Text style={styles.progressText}>
          {Math.round(captureState.processingProgress)}%
        </Text>
      </View>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.errorIconContainer}>
        <MaterialIcons name="error-outline" size={80} color={Colors.error} />
      </View>

      <Text style={styles.errorTitle}>Processing Failed</Text>
      <Text style={styles.errorMessage}>{captureState.errorMessage}</Text>

      <Button
        mode="contained"
        onPress={() =>
          setCaptureState({ mode: 'idle', processingProgress: 0 })
        }
        style={styles.retryButton}
      >
        Try Again
      </Button>
    </View>
  );

  const renderSuccessState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.successIconContainer}>
        <MaterialIcons name="check-circle" size={80} color={Colors.success} />
      </View>

      <Text style={styles.successTitle}>Document Captured!</Text>

      <View style={styles.successDetails}>
        <Chip
          icon="label"
          mode="flat"
          style={styles.detailChip}
        >
          {captureState.documentType || 'Unknown'}
        </Chip>

        <Text style={styles.successMessage}>
          Your document has been successfully captured and is ready for review.
        </Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {captureState.mode === 'idle' && renderIdleState()}
      {(captureState.mode === 'camera' ||
        captureState.mode === 'gallery' ||
        captureState.mode === 'processing') &&
        renderProcessingState()}
      {captureState.mode === 'error' && renderErrorState()}
      {captureState.mode === 'success' && renderSuccessState()}
    </ScrollView>
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
  headerButton: {
    padding: 8,
    marginLeft: -8,
  },
  iconBigContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
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
    marginBottom: 32,
    textAlign: 'center',
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
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
  infoCard: {
    width: '100%',
    backgroundColor: Colors.info + '10',
    borderWidth: 1,
    borderColor: Colors.info + '30',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
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
  retryButton: {
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
  successDetails: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  detailChip: {
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
