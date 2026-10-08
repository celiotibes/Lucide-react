/**
 * Camera Service
 * Handle camera access, photo/video capture with permission management
 * Phase 22.15 Mobile-First Features
 */

import { CameraCapturedPicture } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import { permissionService, PermissionRequest } from './permissionService';
import { fileSystemService } from './fileSystemService';

export type CameraType = 'front' | 'back';

export interface CameraOptions {
  type?: CameraType;
  quality?: number;
  ratio?: string;
  skipProcessing?: boolean;
}

export interface CapturedMedia {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  timestamp: number;
  base64?: string;
  metadata?: {
    orientation?: number;
    cameraType?: CameraType;
    timestamp?: string;
  };
}

class CameraService {
  private permissionRequest: PermissionRequest = {
    type: 'camera',
    title: 'Camera Access',
    message: 'This app needs access to your camera to capture documents and photos.',
    deniedMessage:
      'Camera access is required. Please enable it in Settings > Apps > This App > Permissions',
  };

  /**
   * Request camera permission
   */
  async requestCameraPermission(): Promise<boolean> {
    try {
      const result = await permissionService.requestPermission(this.permissionRequest);
      logger.info('[CameraService] Camera permission result:', result.status);
      return result.status === 'granted';
    } catch (error) {
      logger.error('[CameraService] Error requesting camera permission:', error);
      return false;
    }
  }

  /**
   * Check if camera permission is granted
   */
  async isCameraAvailable(): Promise<boolean> {
    try {
      const permission = await permissionService.checkPermission('camera');
      return permission.status === 'granted';
    } catch (error) {
      logger.error('[CameraService] Error checking camera availability:', error);
      return false;
    }
  }

  /**
   * Capture photo from camera
   */
  async capturePhoto(options: CameraOptions = {}): Promise<CapturedMedia> {
    try {
      // Check permissions
      const hasPermission = await this.requestCameraPermission();
      if (!hasPermission) {
        throw new Error('Camera permission not granted');
      }

      logger.info('[CameraService] Capturing photo with options:', options);

      // For now, we'll return a mock implementation since we can't use
      // expo-camera hooks in a service. In a real app, this would be called
      // from a screen component using the CameraView component.
      throw new Error('Use CameraView component in screen to capture photos');
    } catch (error) {
      logger.error('[CameraService] Error capturing photo:', error);
      throw error;
    }
  }

  /**
   * Process captured image
   */
  async processImage(
    imageUri: string,
    options: { compress?: number; width?: number; height?: number } = {}
  ): Promise<CapturedMedia> {
    try {
      const { compress = 0.8, width, height } = options;

      logger.info('[CameraService] Processing image:', imageUri);

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (!fileInfo.exists) {
        throw new Error('Image file not found');
      }

      const size = (fileInfo as any).size || 0;

      // Compress and resize if needed
      let processedUri = imageUri;
      if (compress < 1 || width || height) {
        const manipResult = await ImageManipulator.manipulateAsync(
          imageUri,
          width || height
            ? [
                {
                  resize: {
                    width: width || 1000,
                    height: height || 1000,
                  },
                },
              ]
            : [],
          {
            compress: Math.max(0, Math.min(1, compress)),
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );
        processedUri = manipResult.uri;
      }

      // Get processed file info
      const processedInfo = await FileSystem.getInfoAsync(processedUri);
      const processedSize = (processedInfo as any).size || size;

      // Save to app documents
      const savedMedia = await this.saveMediaToDocuments(processedUri, 'photo');

      logger.info('[CameraService] Image processed successfully:', savedMedia.id);

      return savedMedia;
    } catch (error) {
      logger.error('[CameraService] Error processing image:', error);
      throw error;
    }
  }

  /**
   * Save captured media to app documents
   */
  private async saveMediaToDocuments(sourceUri: string, type: 'photo' | 'video'): Promise<CapturedMedia> {
    try {
      const mediaId = uuidv4();
      const extension = type === 'photo' ? 'jpg' : 'mp4';
      const filename = `${type}-${mediaId}.${extension}`;

      // Create media directory if it doesn't exist
      const mediaDir = await fileSystemService.getOrCreateMediaDirectory();

      // Copy file to app documents
      const destinationUri = `${mediaDir}${filename}`;
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destinationUri,
      });

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(destinationUri);
      const size = (fileInfo as any).size || 0;

      logger.info('[CameraService] Media saved to documents:', destinationUri);

      return {
        id: mediaId,
        uri: destinationUri,
        type,
        mimeType: type === 'photo' ? 'image/jpeg' : 'video/mp4',
        size,
        timestamp: Date.now(),
        metadata: {
          timestamp: new Date().toISOString(),
          cameraType: 'back',
        },
      };
    } catch (error) {
      logger.error('[CameraService] Error saving media to documents:', error);
      throw error;
    }
  }

  /**
   * Delete captured media
   */
  async deleteMedia(mediaId: string, uri: string): Promise<void> {
    try {
      logger.info('[CameraService] Deleting media:', mediaId);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      logger.info('[CameraService] Media deleted:', mediaId);
    } catch (error) {
      logger.error('[CameraService] Error deleting media:', error);
      throw error;
    }
  }

  /**
   * Get cached media list from documents
   */
  async getLocalMedia(): Promise<CapturedMedia[]> {
    try {
      const mediaDir = await fileSystemService.getOrCreateMediaDirectory();
      const files = await FileSystem.readDirectoryAsync(mediaDir);

      const mediaList: CapturedMedia[] = [];

      for (const file of files) {
        const uri = `${mediaDir}${file}`;
        const fileInfo = await FileSystem.getInfoAsync(uri);
        const size = (fileInfo as any).size || 0;
        const isPhoto = file.startsWith('photo-');
        const isVideo = file.startsWith('video-');

        if (isPhoto || isVideo) {
          const id = file.split('-')[1]?.split('.')[0] || file;
          mediaList.push({
            id,
            uri,
            type: isPhoto ? 'photo' : 'video',
            mimeType: isPhoto ? 'image/jpeg' : 'video/mp4',
            size,
            timestamp: (fileInfo as any).modificationTime || Date.now(),
          });
        }
      }

      return mediaList.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('[CameraService] Error getting local media:', error);
      return [];
    }
  }

  /**
   * Export media with base64 encoding
   */
  async exportMediaWithBase64(uri: string): Promise<string> {
    try {
      logger.info('[CameraService] Exporting media as base64');
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (error) {
      logger.error('[CameraService] Error exporting media as base64:', error);
      throw error;
    }
  }

  /**
   * Clear all cached media
   */
  async clearLocalMedia(): Promise<void> {
    try {
      logger.info('[CameraService] Clearing local media');
      const mediaDir = await fileSystemService.getOrCreateMediaDirectory();
      const files = await FileSystem.readDirectoryAsync(mediaDir);

      for (const file of files) {
        const uri = `${mediaDir}${file}`;
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }

      logger.info('[CameraService] Local media cleared');
    } catch (error) {
      logger.error('[CameraService] Error clearing local media:', error);
      throw error;
    }
  }
}

export const cameraService = new CameraService();
