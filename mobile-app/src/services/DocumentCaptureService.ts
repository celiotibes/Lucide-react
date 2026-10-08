import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { logger } from '../utils/logger';

export interface CaptureResult {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  base64?: string;
}

export class DocumentCaptureService {
  private readonly documentsDir = `${FileSystem.documentDirectory}documents/`;

  constructor() {
    this.ensureDirectoryExists();
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(this.documentsDir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(this.documentsDir, {
          intermediates: true,
        });
      }
    } catch (error) {
      logger.error('Failed to create documents directory', error);
    }
  }

  async captureFromCamera(): Promise<CaptureResult> {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera permission denied');
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        base64: true,
      });

      if (result.canceled) {
        throw new Error('Camera capture canceled');
      }

      return await this.processImage(result.assets[0]);
    } catch (error) {
      logger.error('Failed to capture from camera', error);
      throw error;
    }
  }

  async captureFromLibrary(): Promise<CaptureResult> {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Media library permission denied');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        base64: true,
      });

      if (result.canceled) {
        throw new Error('Image selection canceled');
      }

      return await this.processImage(result.assets[0]);
    } catch (error) {
      logger.error('Failed to capture from library', error);
      throw error;
    }
  }

  private async processImage(
    image: ImagePicker.ImagePickerAsset,
  ): Promise<CaptureResult> {
    try {
      const fileName = `document_${Date.now()}.jpg`;
      const filePath = `${this.documentsDir}${fileName}`;

      const info = await FileSystem.getInfoAsync(image.uri);
      if (!info.exists) {
        throw new Error('Image file not found');
      }

      await FileSystem.copyAsync({
        from: image.uri,
        to: filePath,
      });

      logger.info(`Document captured: ${fileName}`);

      return {
        uri: filePath,
        fileName,
        mimeType: 'image/jpeg',
        fileSize: info.size || 0,
        base64: image.base64,
      };
    } catch (error) {
      logger.error('Failed to process captured image', error);
      throw error;
    }
  }

  async getFileSize(uri: string): Promise<number> {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return info.size || 0;
    } catch (error) {
      logger.error('Failed to get file size', error);
      return 0;
    }
  }

  async deleteFile(uri: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(uri);
      logger.info(`Document deleted: ${uri}`);
    } catch (error) {
      logger.error('Failed to delete document file', error);
      throw error;
    }
  }

  async getDocumentList(): Promise<string[]> {
    try {
      const files = await FileSystem.readDirectoryAsync(this.documentsDir);
      return files.filter((f) => /\.(jpg|jpeg|png|gif)$/i.test(f));
    } catch (error) {
      logger.error('Failed to list documents', error);
      return [];
    }
  }

  async readFileAsBase64(uri: string): Promise<string> {
    try {
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return content;
    } catch (error) {
      logger.error('Failed to read file as base64', error);
      throw error;
    }
  }

  async clearOldDocuments(olderThanDays: number = 30): Promise<number> {
    try {
      const files = await FileSystem.readDirectoryAsync(this.documentsDir);
      const now = Date.now();
      const maxAge = olderThanDays * 24 * 60 * 60 * 1000;
      let deleted = 0;

      for (const file of files) {
        const filePath = `${this.documentsDir}${file}`;
        const info = await FileSystem.getInfoAsync(filePath);

        if (info.modificationTime) {
          const age = now - info.modificationTime * 1000;
          if (age > maxAge) {
            await FileSystem.deleteAsync(filePath);
            deleted++;
          }
        }
      }

      if (deleted > 0) {
        logger.info(`Cleaned up ${deleted} old documents`);
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to clear old documents', error);
      return 0;
    }
  }
}
