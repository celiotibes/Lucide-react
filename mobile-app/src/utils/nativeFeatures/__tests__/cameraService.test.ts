/**
 * Camera Service Tests
 * Unit tests for camera operations
 */

import { cameraService } from '../cameraService';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { permissionService } from '../permissionService';
import { fileSystemService } from '../fileSystemService';
import { logger } from '@/utils/logger';

// Mock modules
jest.mock('expo-file-system');
jest.mock('expo-image-manipulator');
jest.mock('../permissionService');
jest.mock('../fileSystemService');
jest.mock('@/utils/logger');
jest.mock('uuid');

describe('CameraService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestCameraPermission', () => {
    it('should request camera permission', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await cameraService.requestCameraPermission();

      expect(result).toBe(true);
      expect(permissionService.requestPermission).toHaveBeenCalled();
    });

    it('should return false when permission denied', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      const result = await cameraService.requestCameraPermission();

      expect(result).toBe(false);
    });

    it('should handle permission request errors', async () => {
      (permissionService.requestPermission as jest.Mock).mockRejectedValue(new Error('Request failed'));

      const result = await cameraService.requestCameraPermission();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('isCameraAvailable', () => {
    it('should return true when camera is available', async () => {
      (permissionService.checkPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      const result = await cameraService.isCameraAvailable();

      expect(result).toBe(true);
    });

    it('should return false when permission not granted', async () => {
      (permissionService.checkPermission as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const result = await cameraService.isCameraAvailable();

      expect(result).toBe(false);
    });
  });

  describe('processImage', () => {
    it('should process image successfully', async () => {
      const mockUri = 'file:///test/image.jpg';
      const mockProcessedUri = 'file:///test/processed.jpg';

      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: 1000000,
      });

      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
        uri: mockProcessedUri,
      });

      (fileSystemService.getOrCreateMediaDirectory as jest.Mock).mockResolvedValue(
        'file:///media/'
      );

      (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await cameraService.processImage(mockUri, {
        compress: 0.8,
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('uri');
      expect(result.type).toBe('photo');
    });

    it('should handle non-existent image file', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await expect(cameraService.processImage('file:///nonexistent.jpg')).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('deleteMedia', () => {
    it('should delete media successfully', async () => {
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      await cameraService.deleteMedia('test-id', 'file:///test/media.jpg');

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///test/media.jpg', {
        idempotent: true,
      });
    });

    it('should handle delete errors', async () => {
      (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      await expect(cameraService.deleteMedia('test-id', 'file:///test/media.jpg')).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getLocalMedia', () => {
    it('should return list of local media', async () => {
      (fileSystemService.getOrCreateMediaDirectory as jest.Mock).mockResolvedValue(
        'file:///media/'
      );

      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'photo-123.jpg',
        'video-456.mp4',
      ]);

      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: 1000000,
        modificationTime: Date.now(),
      });

      const result = await cameraService.getLocalMedia();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array on error', async () => {
      (fileSystemService.getOrCreateMediaDirectory as jest.Mock).mockRejectedValue(
        new Error('Failed')
      );

      const result = await cameraService.getLocalMedia();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('exportMediaWithBase64', () => {
    it('should export media as base64', async () => {
      const mockBase64 = 'base64content';
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockBase64);

      const result = await cameraService.exportMediaWithBase64('file:///test/media.jpg');

      expect(result).toBe(mockBase64);
    });

    it('should handle read errors', async () => {
      (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(new Error('Read failed'));

      await expect(cameraService.exportMediaWithBase64('file:///test/media.jpg')).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('clearLocalMedia', () => {
    it('should clear all local media', async () => {
      (fileSystemService.getOrCreateMediaDirectory as jest.Mock).mockResolvedValue(
        'file:///media/'
      );

      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['photo-123.jpg']);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      await cameraService.clearLocalMedia();

      expect(FileSystem.deleteAsync).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Clearing local media'));
    });
  });
});
