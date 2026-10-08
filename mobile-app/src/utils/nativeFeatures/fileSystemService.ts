/**
 * File System Service
 * Manage app document directory, file operations, and sharing
 * Phase 22.15 Mobile-First Features
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Intent from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

export interface DirectoryInfo {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  size?: number;
  modificationTime?: number;
}

export interface FileInfo {
  name: string;
  uri: string;
  size: number;
  isDirectory: boolean;
  modificationTime?: number;
  creationTime?: number;
}

class FileSystemService {
  private appDocumentDir: string | null = null;
  private appCacheDir: string | null = null;
  private subdirectories: Map<string, string> = new Map();

  /**
   * Initialize file system service
   */
  async initialize(): Promise<void> {
    try {
      this.appDocumentDir = FileSystem.documentDirectory;
      this.appCacheDir = FileSystem.cacheDirectory;

      logger.info('[FileSystemService] Initialized', {
        documentDir: this.appDocumentDir,
        cacheDir: this.appCacheDir,
      });

      // Ensure app directories exist
      if (this.appDocumentDir) {
        await FileSystem.makeDirectoryAsync(this.appDocumentDir, { intermediates: true });
      }
    } catch (error) {
      logger.error('[FileSystemService] Error initializing:', error);
    }
  }

  /**
   * Get document directory path
   */
  getDocumentDirectory(): string {
    if (!this.appDocumentDir) {
      throw new Error('FileSystemService not initialized. Call initialize() first.');
    }
    return this.appDocumentDir;
  }

  /**
   * Get cache directory path
   */
  getCacheDirectory(): string {
    if (!this.appCacheDir) {
      throw new Error('FileSystemService not initialized. Call initialize() first.');
    }
    return this.appCacheDir;
  }

  /**
   * Get or create subdirectory in documents
   */
  async getOrCreateDirectory(subdirectory: string): Promise<string> {
    try {
      const docDir = this.getDocumentDirectory();
      const fullPath = `${docDir}${subdirectory}/`;

      // Check cache
      if (this.subdirectories.has(subdirectory)) {
        return this.subdirectories.get(subdirectory)!;
      }

      // Create directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(fullPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(fullPath, { intermediates: true });
        logger.info('[FileSystemService] Created directory:', subdirectory);
      }

      // Cache the path
      this.subdirectories.set(subdirectory, fullPath);

      return fullPath;
    } catch (error) {
      logger.error('[FileSystemService] Error creating directory:', error);
      throw error;
    }
  }

  /**
   * Get or create media directory
   */
  async getOrCreateMediaDirectory(): Promise<string> {
    return this.getOrCreateDirectory('media');
  }

  /**
   * Read directory contents
   */
  async readDirectory(dirPath: string): Promise<string[]> {
    try {
      logger.info('[FileSystemService] Reading directory:', dirPath);
      const files = await FileSystem.readDirectoryAsync(dirPath);
      return files;
    } catch (error) {
      logger.error('[FileSystemService] Error reading directory:', error);
      throw error;
    }
  }

  /**
   * Get directory contents with info
   */
  async getDirectoryContents(dirPath: string): Promise<FileInfo[]> {
    try {
      const files = await this.readDirectory(dirPath);
      const fileInfos: FileInfo[] = [];

      for (const filename of files) {
        const filePath = `${dirPath}${filename}`;
        const info = await FileSystem.getInfoAsync(filePath);

        fileInfos.push({
          name: filename,
          uri: filePath,
          size: (info as any).size || 0,
          isDirectory: (info as any).isDirectory || false,
          modificationTime: (info as any).modificationTime,
          creationTime: (info as any).birthtime,
        });
      }

      return fileInfos.sort((a, b) => {
        // Directories first, then sort by modification time
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return (b.modificationTime || 0) - (a.modificationTime || 0);
      });
    } catch (error) {
      logger.error('[FileSystemService] Error getting directory contents:', error);
      return [];
    }
  }

  /**
   * Write file
   */
  async writeFile(filePath: string, content: string, encoding: string = 'utf8'): Promise<void> {
    try {
      logger.info('[FileSystemService] Writing file:', filePath);
      await FileSystem.writeAsStringAsync(filePath, content, {
        encoding: encoding as any,
      });
      logger.info('[FileSystemService] File written successfully');
    } catch (error) {
      logger.error('[FileSystemService] Error writing file:', error);
      throw error;
    }
  }

  /**
   * Read file
   */
  async readFile(filePath: string, encoding: string = 'utf8'): Promise<string> {
    try {
      logger.info('[FileSystemService] Reading file:', filePath);
      const content = await FileSystem.readAsStringAsync(filePath, {
        encoding: encoding as any,
      });
      return content;
    } catch (error) {
      logger.error('[FileSystemService] Error reading file:', error);
      throw error;
    }
  }

  /**
   * Read file as base64
   */
  async readFileAsBase64(filePath: string): Promise<string> {
    try {
      logger.info('[FileSystemService] Reading file as base64:', filePath);
      const content = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return content;
    } catch (error) {
      logger.error('[FileSystemService] Error reading file as base64:', error);
      throw error;
    }
  }

  /**
   * Copy file
   */
  async copyFile(sourceUri: string, destinationUri: string): Promise<void> {
    try {
      logger.info('[FileSystemService] Copying file:', { from: sourceUri, to: destinationUri });
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destinationUri,
      });
      logger.info('[FileSystemService] File copied successfully');
    } catch (error) {
      logger.error('[FileSystemService] Error copying file:', error);
      throw error;
    }
  }

  /**
   * Move file
   */
  async moveFile(sourceUri: string, destinationUri: string): Promise<void> {
    try {
      logger.info('[FileSystemService] Moving file:', { from: sourceUri, to: destinationUri });
      await FileSystem.moveAsync({
        from: sourceUri,
        to: destinationUri,
      });
      logger.info('[FileSystemService] File moved successfully');
    } catch (error) {
      logger.error('[FileSystemService] Error moving file:', error);
      throw error;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string, idempotent: boolean = true): Promise<void> {
    try {
      logger.info('[FileSystemService] Deleting file:', filePath);
      await FileSystem.deleteAsync(filePath, { idempotent });
      logger.info('[FileSystemService] File deleted');
    } catch (error) {
      logger.error('[FileSystemService] Error deleting file:', error);
      if (!idempotent) throw error;
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(filePath: string): Promise<DirectoryInfo> {
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      return {
        path: filePath,
        exists: info.exists,
        isDirectory: (info as any).isDirectory || false,
        size: (info as any).size,
        modificationTime: (info as any).modificationTime,
      };
    } catch (error) {
      logger.error('[FileSystemService] Error getting file info:', error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      return info.exists;
    } catch (error) {
      logger.error('[FileSystemService] Error checking file existence:', error);
      return false;
    }
  }

  /**
   * Share file
   */
  async shareFile(filePath: string, options: { mimeType?: string; title?: string } = {}): Promise<boolean> {
    try {
      const { mimeType = '*/*', title = 'Share' } = options;

      logger.info('[FileSystemService] Sharing file:', filePath);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        logger.warn('[FileSystemService] Sharing not available on this platform');
        return false;
      }

      await Sharing.shareAsync(filePath, {
        mimeType,
        UTType: this.getMimeTypeToUTType(mimeType),
        dialogTitle: title,
      });

      logger.info('[FileSystemService] File shared successfully');
      return true;
    } catch (error) {
      logger.error('[FileSystemService] Error sharing file:', error);
      return false;
    }
  }

  /**
   * Export file with sharing
   */
  async exportFile(
    filePath: string,
    filename: string,
    options: { mimeType?: string } = {}
  ): Promise<boolean> {
    try {
      const { mimeType = '*/*' } = options;

      logger.info('[FileSystemService] Exporting file:', filename);

      // Copy to cache directory for sharing
      const exportPath = `${this.appCacheDir}${filename}`;
      await this.copyFile(filePath, exportPath);

      // Share the cached file
      return this.shareFile(exportPath, {
        mimeType,
        title: `Export ${filename}`,
      });
    } catch (error) {
      logger.error('[FileSystemService] Error exporting file:', error);
      return false;
    }
  }

  /**
   * Get directory size
   */
  async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;
      const files = await this.readDirectory(dirPath);

      for (const filename of files) {
        const filePath = `${dirPath}${filename}`;
        const info = await FileSystem.getInfoAsync(filePath);

        if ((info as any).isDirectory) {
          totalSize += await this.getDirectorySize(filePath + '/');
        } else {
          totalSize += (info as any).size || 0;
        }
      }

      return totalSize;
    } catch (error) {
      logger.error('[FileSystemService] Error getting directory size:', error);
      return 0;
    }
  }

  /**
   * Clear directory (delete all contents)
   */
  async clearDirectory(dirPath: string, keepDirectory: boolean = true): Promise<void> {
    try {
      logger.info('[FileSystemService] Clearing directory:', dirPath);

      const files = await this.readDirectory(dirPath);

      for (const filename of files) {
        const filePath = `${dirPath}${filename}`;
        await this.deleteFile(filePath, true);
      }

      if (!keepDirectory) {
        await this.deleteFile(dirPath, true);
      }

      logger.info('[FileSystemService] Directory cleared');
    } catch (error) {
      logger.error('[FileSystemService] Error clearing directory:', error);
      throw error;
    }
  }

  /**
   * Clean up cache directory
   */
  async cleanupCache(): Promise<number> {
    try {
      logger.info('[FileSystemService] Cleaning up cache');

      const cacheDir = this.getCacheDirectory();
      const sizeBeforeCleanup = await this.getDirectorySize(cacheDir);

      await this.clearDirectory(cacheDir, true);

      const sizeAfterCleanup = await this.getDirectorySize(cacheDir);
      const freedSpace = sizeBeforeCleanup - sizeAfterCleanup;

      logger.info('[FileSystemService] Cache cleanup complete', {
        freedSpace: `${(freedSpace / 1024 / 1024).toFixed(2)} MB`,
      });

      return freedSpace;
    } catch (error) {
      logger.error('[FileSystemService] Error cleaning up cache:', error);
      return 0;
    }
  }

  /**
   * Private: Convert MIME type to UTType for iOS sharing
   */
  private getMimeTypeToUTType(mimeType: string): string | undefined {
    const mimeToUT: { [key: string]: string } = {
      'application/pdf': 'com.adobe.pdf',
      'image/jpeg': 'public.jpeg',
      'image/png': 'public.png',
      'video/mp4': 'public.mpeg-4',
      'audio/mpeg': 'public.mp3',
      'text/plain': 'public.plain-text',
      'application/json': 'public.json',
    };

    return mimeToUT[mimeType];
  }
}

export const fileSystemService = new FileSystemService();
