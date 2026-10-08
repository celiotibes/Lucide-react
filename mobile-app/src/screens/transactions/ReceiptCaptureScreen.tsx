import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { CameraService } from '../../services/CameraService';
import { DocumentProcessorService } from '../../services/DocumentProcessorService';
import { useDatabase } from '../../database';
import styles from './ReceiptCaptureScreen.styles';

interface CapturedReceipt {
  id: string;
  uri: string;
  timestamp: string;
  data?: {
    vendor?: string;
    amount?: number;
    date?: string;
    category?: string;
  };
}

export const ReceiptCaptureScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const theme = useTheme();
  const { db } = useDatabase();
  const cameraRef = useRef<any>(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<CapturedReceipt | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCapturePhoto = useCallback(async () => {
    try {
      setIsCapturing(true);
      setErrorMessage(null);

      const photo = await CameraService.takePicture(cameraRef.current);
      setCapturedImage(photo.uri);
      setPreview({
        id: Date.now().toString(),
        uri: photo.uri,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      setErrorMessage(`Erro ao capturar foto: ${error instanceof Error ? error.message : 'Desconhecido'}`);
      console.error('Error capturing photo:', error);
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const handleProcessReceipt = useCallback(async () => {
    if (!capturedImage || !preview) return;

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setProcessingProgress(0);

      // Simular progresso
      const progressInterval = setInterval(() => {
        setProcessingProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Processar documento com OCR
      const extractedData = await DocumentProcessorService.processImage(capturedImage);
      clearInterval(progressInterval);
      setProcessingProgress(100);

      // Salvar localmente
      const receipt: CapturedReceipt = {
        ...preview,
        data: extractedData
      };

      // Armazenar no SQLite local
      if (db) {
        await db.saveReceiptLocal(receipt);
      }

      // Navegar para confirmação
      setTimeout(() => {
        navigation.navigate('ReceiptReviewScreen', { receipt });
      }, 500);
    } catch (error) {
      setErrorMessage(`Erro ao processar recibo: ${error instanceof Error ? error.message : 'Desconhecido'}`);
      console.error('Error processing receipt:', error);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
    }
  }, [capturedImage, preview, db, navigation]);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    setPreview(null);
    setErrorMessage(null);
  }, []);

  const themeStyle = theme.isDark ? styles.darkTheme : styles.lightTheme;

  return (
    <View style={[styles.container, themeStyle.container]}>
      {!capturedImage ? (
        <View style={styles.cameraContainer}>
          {/* Camera view would be implemented with react-native-camera or expo-camera */}
          <View style={[styles.cameraPlaceholder, themeStyle.cameraPlaceholder]}>
            <Text style={themeStyle.text}>📷 Câmera (requer configuração de câmera nativa)</Text>
          </View>

          <TouchableOpacity
            style={[styles.captureButton, { opacity: isCapturing ? 0.6 : 1 }]}
            onPress={handleCapturePhoto}
            disabled={isCapturing}
          >
            <Text style={styles.captureButtonText}>
              {isCapturing ? 'Capturando...' : 'Capturar Recibo'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.previewContainer}>
          {preview && (
            <>
              <View style={styles.imageWrapper}>
                <Image
                  source={{ uri: capturedImage }}
                  style={styles.capturedImage}
                  resizeMode="contain"
                />
              </View>

              {errorMessage && (
                <View style={[styles.errorContainer, themeStyle.errorContainer]}>
                  <Text style={[styles.errorText, themeStyle.errorText]}>
                    {errorMessage}
                  </Text>
                </View>
              )}

              {isProcessing && (
                <View style={[styles.processingContainer, themeStyle.processingContainer]}>
                  <ActivityIndicator size="large" color="#3b82f6" />
                  <Text style={[styles.processingText, themeStyle.processingText]}>
                    Processando recibo... {processingProgress}%
                  </Text>
                  <View style={[styles.progressBar, themeStyle.progressBar]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${processingProgress}%` }
                      ]}
                    />
                  </View>
                </View>
              )}

              {preview.data && !isProcessing && (
                <View style={[styles.dataContainer, themeStyle.dataContainer]}>
                  <Text style={[styles.dataTitle, themeStyle.text]}>Dados Extraídos:</Text>
                  {preview.data.vendor && (
                    <Text style={[styles.dataItem, themeStyle.text]}>
                      Vendedor: {preview.data.vendor}
                    </Text>
                  )}
                  {preview.data.amount && (
                    <Text style={[styles.dataItem, themeStyle.text]}>
                      Valor: R$ {preview.data.amount.toFixed(2)}
                    </Text>
                  )}
                  {preview.data.date && (
                    <Text style={[styles.dataItem, themeStyle.text]}>
                      Data: {preview.data.date}
                    </Text>
                  )}
                  {preview.data.category && (
                    <Text style={[styles.dataItem, themeStyle.text]}>
                      Categoria: {preview.data.category}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.retakeButton]}
                  onPress={handleRetake}
                  disabled={isProcessing}
                >
                  <Text style={styles.buttonText}>Refazer Foto</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.processButton, isProcessing && styles.buttonDisabled]}
                  onPress={handleProcessReceipt}
                  disabled={isProcessing}
                >
                  <Text style={styles.buttonText}>
                    {isProcessing ? 'Processando...' : 'Processar Recibo'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};
