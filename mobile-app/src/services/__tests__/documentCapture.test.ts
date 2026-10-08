import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { DocumentCaptureService } from '../DocumentCaptureService';

vi.mock('expo-file-system');
vi.mock('expo-image-picker');

describe('DocumentCaptureService', () => {
  let service: DocumentCaptureService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentCaptureService();
  });

  describe('captureFromCamera', () => {
    it('should capture image from camera', async () => {
      const mockImage = {
        uri: 'file:///path/to/image.jpg',
        base64: 'base64data',
        width: 1080,
        height: 1920,
        type: 'image',
      };

      vi.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });

      vi.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({
        canceled: false,
        assets: [mockImage],
      });

      vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
        exists: true,
        isDirectory: false,
        size: 1024000,
        modificationTime: Date.now() / 1000,
      });

      vi.mocked(FileSystem.copyAsync).mockResolvedValue(undefined as any);

      const result = await service.captureFromCamera();

      expect(result).toBeDefined();
      expect(result.uri).toContain('documents');
      expect(result.fileName).toMatch(/^document_\d+\.jpg$/);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.fileSize).toBe(1024000);
    });

    it('should throw error when camera permission denied', async () => {
      vi.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      await expect(service.captureFromCamera()).rejects.toThrow(
        'Camera permission denied',
      );
    });

    it('should throw error when capture canceled', async () => {
      vi.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });

      vi.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({
        canceled: true,
        assets: [],
      });

      await expect(service.captureFromCamera()).rejects.toThrow(
        'Camera capture canceled',
      );
    });
  });

  describe('captureFromLibrary', () => {
    it('should capture image from library', async () => {
      const mockImage = {
        uri: 'file:///path/to/image.jpg',
        base64: 'base64data',
        width: 1080,
        height: 1920,
        type: 'image',
      };

      vi.mocked(
        ImagePicker.requestMediaLibraryPermissionsAsync,
      ).mockResolvedValue({
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });

      vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
        canceled: false,
        assets: [mockImage],
      });

      vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
        exists: true,
        isDirectory: false,
        size: 2048000,
        modificationTime: Date.now() / 1000,
      });

      vi.mocked(FileSystem.copyAsync).mockResolvedValue(undefined as any);

      const result = await service.captureFromLibrary();

      expect(result).toBeDefined();
      expect(result.fileSize).toBe(2048000);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should throw error when library permission denied', async () => {
      vi.mocked(
        ImagePicker.requestMediaLibraryPermissionsAsync,
      ).mockResolvedValue({
        granted: false,
        canAskAgain: true,
        expires: 'never',
      });

      await expect(service.captureFromLibrary()).rejects.toThrow(
        'Media library permission denied',
      );
    });
  });

  describe('getFileSize', () => {
    it('should return file size', async () => {
      vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
        exists: true,
        isDirectory: false,
        size: 5000000,
        modificationTime: Date.now() / 1000,
      });

      const size = await service.getFileSize('file:///path/to/file.jpg');

      expect(size).toBe(5000000);
    });

    it('should return 0 for non-existent file', async () => {
      vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
        exists: false,
        isDirectory: false,
        modificationTime: Date.now() / 1000,
      });

      const size = await service.getFileSize('file:///nonexistent.jpg');

      expect(size).toBe(0);
    });
  });

  describe('deleteFile', () => {
    it('should delete file', async () => {
      vi.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined as any);

      await expect(service.deleteFile('file:///path/to/file.jpg')).resolves.not.toThrow();
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///path/to/file.jpg',
      );
    });

    it('should throw error when deletion fails', async () => {
      vi.mocked(FileSystem.deleteAsync).mockRejectedValue(
        new Error('File not found'),
      );

      await expect(service.deleteFile('file:///path/to/file.jpg')).rejects.toThrow();
    });
  });

  describe('getDocumentList', () => {
    it('should return list of document files', async () => {
      vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue([
        'document_1.jpg',
        'document_2.png',
        'document_3.gif',
        'notes.txt',
      ]);

      const files = await service.getDocumentList();

      expect(files).toEqual(['document_1.jpg', 'document_2.png', 'document_3.gif']);
      expect(files).not.toContain('notes.txt');
    });

    it('should return empty array on error', async () => {
      vi.mocked(FileSystem.readDirectoryAsync).mockRejectedValue(
        new Error('Permission denied'),
      );

      const files = await service.getDocumentList();

      expect(files).toEqual([]);
    });
  });

  describe('readFileAsBase64', () => {
    it('should read file as base64', async () => {
      const base64Data = 'aGVsbG8gd29ybGQ=';
      vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue(base64Data);

      const result = await service.readFileAsBase64('file:///path/to/file.jpg');

      expect(result).toBe(base64Data);
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
        'file:///path/to/file.jpg',
        expect.objectContaining({
          encoding: FileSystem.EncodingType.Base64,
        }),
      );
    });

    it('should throw error on read failure', async () => {
      vi.mocked(FileSystem.readAsStringAsync).mockRejectedValue(
        new Error('Read failed'),
      );

      await expect(
        service.readFileAsBase64('file:///nonexistent.jpg'),
      ).rejects.toThrow();
    });
  });

  describe('clearOldDocuments', () => {
    it('should delete documents older than specified days', async () => {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue([
        'document_1.jpg',
        'document_2.jpg',
      ]);

      vi.mocked(FileSystem.getInfoAsync)
        .mockResolvedValueOnce({
          exists: true,
          isDirectory: false,
          size: 1000,
          modificationTime: (thirtyDaysAgo + 1000) / 1000, // Almost 30 days
        })
        .mockResolvedValueOnce({
          exists: true,
          isDirectory: false,
          size: 1000,
          modificationTime: (thirtyDaysAgo - 86400000) / 1000, // 31 days ago
        });

      vi.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined as any);

      const deleted = await service.clearOldDocuments(30);

      expect(deleted).toBe(1);
      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
    });

    it('should return 0 when no old documents', async () => {
      const now = Date.now();

      vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue([
        'document_1.jpg',
      ]);

      vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
        exists: true,
        isDirectory: false,
        size: 1000,
        modificationTime: now / 1000,
      });

      const deleted = await service.clearOldDocuments(30);

      expect(deleted).toBe(0);
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });
  });
});
