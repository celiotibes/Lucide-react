/**
 * File Picker Service Tests
 * Unit tests for file picking operations
 */

import { filePickerService } from '../filePickerService';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { permissionService } from '../permissionService';
import { fileSystemService } from '../fileSystemService';
import { logger } from '@/utils/logger';

// Mock modules
jest.mock('expo-document-picker');
jest.mock('expo-file-system');
jest.mock('../permissionService');
jest.mock('../fileSystemService');
jest.mock('@/utils/logger');
jest.mock('uuid');

describe('FilePickerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pickFile', () => {
    it('should pick file successfully', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [
          {
            name: 'test.pdf',
            uri: 'file:///test.pdf',
            mimeType: 'application/pdf',
            size: 1000,
          },
        ],
      });

      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: 1000,
      });

      const result = await filePickerService.pickFile({
        allowMultiple: false,
        filterType: 'documents',
      });

      expect(result).not.toBeNull();
      expect((result as any).name).toBe('test.pdf');
    });

    it('should handle file picker cancellation', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: true,
      });

      const result = await filePickerService.pickFile();

      expect(result).toBeNull();
    });

    it('should enforce maximum file size', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [
          {
            name: 'large.pdf',
            uri: 'file:///large.pdf',
            mimeType: 'application/pdf',
            size: 100000000, // 100MB
          },
        ],
      });

      const result = await filePickerService.pickFile({
        maxFileSize: 50000000, // 50MB
      });

      expect(result).toBeNull();
    });

    it('should handle permission denial', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      await expect(filePickerService.pickFile()).rejects.toThrow();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('pickImage', () => {
    it('should pick image file', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [
          {
            name: 'photo.jpg',
            uri: 'file:///photo.jpg',
            mimeType: 'image/jpeg',
            size: 1000,
          },
        ],
      });

      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: 1000,
      });

      const result = await filePickerService.pickImage();

      expect(result).not.toBeNull();
    });
  });

  describe('pickVideo', () => {
    it('should pick video file', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [
          {
            name: 'video.mp4',
            uri: 'file:///video.mp4',
            mimeType: 'video/mp4',
            size: 10000000,
          },
        ],
      });

      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: 10000000,
      });

      const result = await filePickerService.pickVideo();

      expect(result).not.toBeNull();
    });
  });

  describe('copyFileToAppStorage', () => {
    it('should copy file to app storage', async () => {
      const mockFile = {
        id: 'test-id',
        name: 'test.pdf',
        uri: 'file:///test.pdf',
        type: 'application/pdf',
        mimeType: 'application/pdf',
        size: 1000,
        extension: 'pdf',
      };

      (fileSystemService.getOrCreateDirectory as jest.Mock).mockResolvedValue(
        'file:///imports/'
      );

      (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: 1000,
      });

      const result = await filePickerService.copyFileToAppStorage(mockFile);

      expect(result.uri).toContain('imports');
      expect(FileSystem.copyAsync).toHaveBeenCalled();
    });

    it('should handle copy errors', async () => {
      const mockFile = {
        id: 'test-id',
        name: 'test.pdf',
        uri: 'file:///test.pdf',
        type: 'application/pdf',
        mimeType: 'application/pdf',
        size: 1000,
        extension: 'pdf',
      };

      (fileSystemService.getOrCreateDirectory as jest.Mock).mockResolvedValue(
        'file:///imports/'
      );

      (FileSystem.copyAsync as jest.Mock).mockRejectedValue(new Error('Copy failed'));

      await expect(filePickerService.copyFileToAppStorage(mockFile)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      await filePickerService.deleteFile('file:///test.pdf');

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///test.pdf', {
        idempotent: true,
      });
    });
  });

  describe('getFileMetadata', () => {
    it('should get file metadata', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: 1000,
        modificationTime: Date.now(),
      });

      const result = await filePickerService.getFileMetadata('file:///test.pdf');

      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('size');
      expect(result.size).toBe(1000);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      const result = await filePickerService.fileExists('file:///test.pdf');

      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      const result = await filePickerService.fileExists('file:///nonexistent.pdf');

      expect(result).toBe(false);
    });
  });

  describe('readFileAsText', () => {
    it('should read file as text', async () => {
      const mockContent = 'file content';
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockContent);

      const result = await filePickerService.readFileAsText('file:///test.txt');

      expect(result).toBe(mockContent);
    });
  });

  describe('readFileAsBase64', () => {
    it('should read file as base64', async () => {
      const mockBase64 = 'aGVsbG8gd29ybGQ=';
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockBase64);

      const result = await filePickerService.readFileAsBase64('file:///test.txt');

      expect(result).toBe(mockBase64);
    });
  });

  describe('getStoredFiles', () => {
    it('should get list of stored files', async () => {
      (fileSystemService.getOrCreateDirectory as jest.Mock).mockResolvedValue(
        'file:///imports/'
      );

      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'file1.pdf',
        'file2.txt',
      ]);

      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        isDirectory: false,
        size: 1000,
      });

      const result = await filePickerService.getStoredFiles('imports');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array on error', async () => {
      (fileSystemService.getOrCreateDirectory as jest.Mock).mockRejectedValue(
        new Error('Failed')
      );

      const result = await filePickerService.getStoredFiles('imports');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
