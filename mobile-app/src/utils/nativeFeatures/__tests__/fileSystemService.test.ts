/**
 * File System Service Tests
 * Unit tests for file operations and directory management
 */

import { fileSystemService } from '../fileSystemService';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { logger } from '@/utils/logger';

// Mock Expo modules
jest.mock('expo-file-system');
jest.mock('expo-sharing');
jest.mock('@/utils/logger');

describe('FileSystemService', () => {
  const mockDocDir = '/data/documents/';
  const mockCacheDir = '/data/cache/';

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock file system constants
    (FileSystem.documentDirectory as any) = mockDocDir;
    (FileSystem.cacheDirectory as any) = mockCacheDir;
  });

  describe('initialize', () => {
    it('should initialize file system service', async () => {
      (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);

      await fileSystemService.initialize();

      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(mockDocDir, { intermediates: true });
    });

    it('should handle initialization errors', async () => {
      (FileSystem.makeDirectoryAsync as jest.Mock).mockRejectedValue(new Error('Init failed'));

      await fileSystemService.initialize();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getOrCreateDirectory', () => {
    it('should create directory if not exists', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
      await fileSystemService.initialize();

      const result = await fileSystemService.getOrCreateDirectory('test');

      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalled();
      expect(result).toContain('test');
    });

    it('should return existing directory path', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
      await fileSystemService.initialize();

      const result = await fileSystemService.getOrCreateDirectory('test');

      expect(result).toContain('test');
    });

    it('should cache directory paths', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
      await fileSystemService.initialize();

      const result1 = await fileSystemService.getOrCreateDirectory('test');
      const result2 = await fileSystemService.getOrCreateDirectory('test');

      expect(result1).toBe(result2);
    });
  });

  describe('readDirectory', () => {
    it('should read directory contents', async () => {
      const mockFiles = ['file1.txt', 'file2.txt'];
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(mockFiles);

      const result = await fileSystemService.readDirectory('/test/');

      expect(result).toEqual(mockFiles);
    });

    it('should handle read errors', async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockRejectedValue(new Error('Read failed'));

      await expect(fileSystemService.readDirectory('/test/')).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('writeFile', () => {
    it('should write file successfully', async () => {
      (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);

      await fileSystemService.writeFile('/test/file.txt', 'content');

      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith('/test/file.txt', 'content', {
        encoding: 'utf8',
      });
    });

    it('should handle write errors', async () => {
      (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValue(new Error('Write failed'));

      await expect(fileSystemService.writeFile('/test/file.txt', 'content')).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('readFile', () => {
    it('should read file successfully', async () => {
      const mockContent = 'file content';
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockContent);

      const result = await fileSystemService.readFile('/test/file.txt');

      expect(result).toBe(mockContent);
    });

    it('should handle read errors', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(new Error('Read failed'));

      await expect(fileSystemService.readFile('/test/file.txt')).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('readFileAsBase64', () => {
    it('should read file as base64', async () => {
      const mockBase64 = 'aGVsbG8gd29ybGQ=';
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockBase64);

      const result = await fileSystemService.readFileAsBase64('/test/file.txt');

      expect(result).toBe(mockBase64);
    });
  });

  describe('copyFile', () => {
    it('should copy file successfully', async () => {
      (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);

      await fileSystemService.copyFile('/source.txt', '/dest.txt');

      expect(FileSystem.copyAsync).toHaveBeenCalledWith({
        from: '/source.txt',
        to: '/dest.txt',
      });
    });
  });

  describe('moveFile', () => {
    it('should move file successfully', async () => {
      (FileSystem.moveAsync as jest.Mock).mockResolvedValue(undefined);

      await fileSystemService.moveFile('/source.txt', '/dest.txt');

      expect(FileSystem.moveAsync).toHaveBeenCalledWith({
        from: '/source.txt',
        to: '/dest.txt',
      });
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      await fileSystemService.deleteFile('/test.txt');

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('/test.txt', { idempotent: true });
    });

    it('should handle delete errors idempotently', async () => {
      (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      await fileSystemService.deleteFile('/test.txt', true);

      // Should not throw when idempotent is true
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      const result = await fileSystemService.fileExists('/test.txt');

      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      const result = await fileSystemService.fileExists('/test.txt');

      expect(result).toBe(false);
    });
  });

  describe('shareFile', () => {
    it('should share file successfully', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await fileSystemService.shareFile('/test.txt', { mimeType: 'text/plain' });

      expect(result).toBe(true);
      expect(Sharing.shareAsync).toHaveBeenCalled();
    });

    it('should return false when sharing not available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

      const result = await fileSystemService.shareFile('/test.txt');

      expect(result).toBe(false);
    });
  });

  describe('getDirectorySize', () => {
    it('should calculate directory size', async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['file1.txt', 'file2.txt']);
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        isDirectory: false,
        size: 1000,
      });

      const size = await fileSystemService.getDirectorySize('/test/');

      expect(size).toBe(2000);
    });
  });

  describe('clearDirectory', () => {
    it('should clear directory contents', async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['file1.txt', 'file2.txt']);
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        isDirectory: false,
      });
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      await fileSystemService.clearDirectory('/test/', true);

      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
    });
  });
});
