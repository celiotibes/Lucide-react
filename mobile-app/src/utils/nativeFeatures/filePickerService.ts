/**
 * File Picker Service
 * Handle file selection from device storage with filtering
 * Phase 22.15 Mobile-First Features
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';
import { permissionService, PermissionRequest } from './permissionService';
import { fileSystemService } from './fileSystemService';

export type FileFilterType = 'documents' | 'images' | 'videos' | 'audio' | 'all';

export interface FilePickerOptions {
  allowMultiple?: boolean;
  filterType?: FileFilterType;
  maxFileSize?: number; // in bytes
}

export interface PickedFile {
  id: string;
  name: string;
  uri: string;
  type: string;
  size: number;
  createdAt?: number;
  modifiedAt?: number;
  mimeType?: string;
  extension?: string;
}

interface FileTypeMapping {
  [key: string]: string[];
}

class FilePickerService {
  private fileTypeMapping: FileTypeMapping = {
    documents: ['com.adobe.pdf', 'org.openxmlformats.wordprocessingml.document', 'application/msword'],
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    videos: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/flac'],
  };

  private mediaLibraryPermission: PermissionRequest = {
    type: 'imageLibrary',
    title: 'File Access',
    message: 'This app needs access to your files to select documents and media.',
    deniedMessage: 'File access is required. Please enable it in Settings > Apps > This App > Permissions',
  };

  /**
   * Pick file(s) from device
   */
  async pickFile(options: FilePickerOptions = {}): Promise<PickedFile | PickedFile[] | null> {
    try {
      const { allowMultiple = false, filterType = 'all', maxFileSize } = options;

      // Request permission
      const hasPermission = await permissionService.requestPermission(this.mediaLibraryPermission);
      if (!hasPermission) {
        logger.warn('[FilePickerService] File library permission not granted');
        throw new Error('File library permission not granted');
      }

      logger.info('[FilePickerService] Opening file picker with options:', options);

      // Pick file(s)
      const result = await DocumentPicker.getDocumentAsync({
        multiple: allowMultiple,
        type: this.getMimeTypes(filterType),
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        logger.info('[FilePickerService] File picker cancelled by user');
        return null;
      }

      // Process picked files
      const pickedFiles = Array.isArray(result.assets) ? result.assets : [result.assets];
      const processedFiles: PickedFile[] = [];

      for (const file of pickedFiles) {
        // Validate file size if specified
        if (maxFileSize && file.size && file.size > maxFileSize) {
          logger.warn(`[FilePickerService] File exceeds max size: ${file.name}`);
          continue;
        }

        const processedFile = await this.processPickedFile(file);
        if (processedFile) {
          processedFiles.push(processedFile);
        }
      }

      logger.info(`[FilePickerService] Successfully picked ${processedFiles.length} file(s)`);

      return allowMultiple ? processedFiles : processedFiles[0] || null;
    } catch (error) {
      logger.error('[FilePickerService] Error picking file:', error);
      throw error;
    }
  }

  /**
   * Pick image(s) from library
   */
  async pickImage(allowMultiple: boolean = false): Promise<PickedFile | PickedFile[] | null> {
    return this.pickFile({
      allowMultiple,
      filterType: 'images',
    });
  }

  /**
   * Pick video(s) from library
   */
  async pickVideo(allowMultiple: boolean = false): Promise<PickedFile | PickedFile[] | null> {
    return this.pickFile({
      allowMultiple,
      filterType: 'videos',
    });
  }

  /**
   * Pick audio file(s) from library
   */
  async pickAudio(allowMultiple: boolean = false): Promise<PickedFile | PickedFile[] | null> {
    return this.pickFile({
      allowMultiple,
      filterType: 'audio',
    });
  }

  /**
   * Pick document(s) from library
   */
  async pickDocument(allowMultiple: boolean = false): Promise<PickedFile | PickedFile[] | null> {
    return this.pickFile({
      allowMultiple,
      filterType: 'documents',
    });
  }

  /**
   * Copy file to app storage
   */
  async copyFileToAppStorage(file: PickedFile, subdirectory?: string): Promise<PickedFile> {
    try {
      logger.info('[FilePickerService] Copying file to app storage:', file.name);

      // Create directory if needed
      let targetDir: string;
      if (subdirectory) {
        targetDir = await fileSystemService.getOrCreateDirectory(subdirectory);
      } else {
        targetDir = await fileSystemService.getOrCreateDirectory('imports');
      }

      // Generate unique filename
      const timestamp = Date.now();
      const extension = file.extension || file.name.split('.').pop() || '';
      const newFilename = `${file.id}-${timestamp}.${extension}`;
      const targetUri = `${targetDir}${newFilename}`;

      // Copy file
      await FileSystem.copyAsync({
        from: file.uri,
        to: targetUri,
      });

      // Get updated file info
      const fileInfo = await FileSystem.getInfoAsync(targetUri);
      const size = (fileInfo as any).size || file.size;

      const copiedFile: PickedFile = {
        ...file,
        uri: targetUri,
        size,
        modifiedAt: (fileInfo as any).modificationTime,
      };

      logger.info('[FilePickerService] File copied successfully:', newFilename);

      return copiedFile;
    } catch (error) {
      logger.error('[FilePickerService] Error copying file to app storage:', error);
      throw error;
    }
  }

  /**
   * Delete picked file from app storage
   */
  async deleteFile(uri: string): Promise<void> {
    try {
      logger.info('[FilePickerService] Deleting file:', uri);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      logger.info('[FilePickerService] File deleted');
    } catch (error) {
      logger.error('[FilePickerService] Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(uri: string): Promise<Partial<PickedFile>> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const filename = uri.split('/').pop() || '';
      const extension = filename.split('.').pop() || '';

      return {
        name: filename,
        size: (fileInfo as any).size || 0,
        modifiedAt: (fileInfo as any).modificationTime,
        extension,
      };
    } catch (error) {
      logger.error('[FilePickerService] Error getting file metadata:', error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(uri: string): Promise<boolean> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      return fileInfo.exists;
    } catch (error) {
      logger.error('[FilePickerService] Error checking file existence:', error);
      return false;
    }
  }

  /**
   * Read file as text
   */
  async readFileAsText(uri: string, encoding: string = 'utf8'): Promise<string> {
    try {
      logger.info('[FilePickerService] Reading file as text:', uri);
      const content = await FileSystem.readAsStringAsync(uri, { encoding: encoding as any });
      return content;
    } catch (error) {
      logger.error('[FilePickerService] Error reading file as text:', error);
      throw error;
    }
  }

  /**
   * Read file as base64
   */
  async readFileAsBase64(uri: string): Promise<string> {
    try {
      logger.info('[FilePickerService] Reading file as base64:', uri);
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return content;
    } catch (error) {
      logger.error('[FilePickerService] Error reading file as base64:', error);
      throw error;
    }
  }

  /**
   * Get stored files in directory
   */
  async getStoredFiles(directory: string): Promise<PickedFile[]> {
    try {
      const dirPath = await fileSystemService.getOrCreateDirectory(directory);
      const files = await FileSystem.readDirectoryAsync(dirPath);

      const fileList: PickedFile[] = [];
      for (const filename of files) {
        const uri = `${dirPath}${filename}`;
        const fileInfo = await FileSystem.getInfoAsync(uri);

        if ((fileInfo as any).isDirectory === false) {
          fileList.push({
            id: uuidv4(),
            name: filename,
            uri,
            type: this.getMimeTypeFromFilename(filename),
            mimeType: this.getMimeTypeFromFilename(filename),
            size: (fileInfo as any).size || 0,
            createdAt: (fileInfo as any).birthtime || Date.now(),
            modifiedAt: (fileInfo as any).modificationTime,
            extension: filename.split('.').pop() || '',
          });
        }
      }

      return fileList.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
    } catch (error) {
      logger.error('[FilePickerService] Error getting stored files:', error);
      return [];
    }
  }

  /**
   * Private: Process picked file from DocumentPicker
   */
  private async processPickedFile(asset: any): Promise<PickedFile | null> {
    try {
      const filename = asset.name || '';
      const extension = filename.split('.').pop() || '';
      const mimeType = asset.mimeType || this.getMimeTypeFromFilename(filename);

      const fileInfo = await FileSystem.getInfoAsync(asset.uri);

      return {
        id: uuidv4(),
        name: filename,
        uri: asset.uri,
        type: mimeType,
        mimeType,
        size: asset.size || (fileInfo as any).size || 0,
        createdAt: (fileInfo as any).birthtime,
        modifiedAt: (fileInfo as any).modificationTime,
        extension,
      };
    } catch (error) {
      logger.error('[FilePickerService] Error processing picked file:', error);
      return null;
    }
  }

  /**
   * Private: Get MIME types for filter
   */
  private getMimeTypes(filterType: FileFilterType): string | string[] {
    switch (filterType) {
      case 'documents':
        return [...this.fileTypeMapping.documents, '*/*'];
      case 'images':
        return this.fileTypeMapping.images;
      case 'videos':
        return this.fileTypeMapping.videos;
      case 'audio':
        return this.fileTypeMapping.audio;
      default:
        return '*/*';
    }
  }

  /**
   * Private: Get MIME type from filename
   */
  private getMimeTypeFromFilename(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    const mimeTypes: { [key: string]: string } = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt: 'text/plain',
      csv: 'text/csv',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac',
      flac: 'audio/flac',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}

export const filePickerService = new FilePickerService();
