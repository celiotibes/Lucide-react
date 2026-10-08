/**
 * Media Library Service Tests
 * Unit tests for media library operations
 */

import { mediaLibraryService } from '../mediaLibraryService';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { permissionService } from '../permissionService';
import { logger } from '@/utils/logger';

// Mock modules
jest.mock('expo-media-library');
jest.mock('expo-file-system');
jest.mock('../permissionService');
jest.mock('@/utils/logger');

describe('MediaLibraryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestMediaLibraryPermission', () => {
    it('should request media library permission', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await mediaLibraryService.requestMediaLibraryPermission();

      expect(result).toBe(true);
      expect(permissionService.requestPermission).toHaveBeenCalled();
    });

    it('should return false when permission denied', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      const result = await mediaLibraryService.requestMediaLibraryPermission();

      expect(result).toBe(false);
    });
  });

  describe('isMediaLibraryAvailable', () => {
    it('should return true when library is available', async () => {
      (permissionService.checkPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      const result = await mediaLibraryService.isMediaLibraryAvailable();

      expect(result).toBe(true);
    });

    it('should return false when permission not granted', async () => {
      (permissionService.checkPermission as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const result = await mediaLibraryService.isMediaLibraryAvailable();

      expect(result).toBe(false);
    });
  });

  describe('getAlbums', () => {
    it('should get albums successfully', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (MediaLibrary.getAlbumsAsync as jest.Mock).mockResolvedValue([
        { id: '1', title: 'Camera Roll', assetCount: 100, type: 'album' },
        { id: '2', title: 'Screenshots', assetCount: 50, type: 'album' },
      ]);

      const result = await mediaLibraryService.getAlbums();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].title).toBe('Camera Roll');
    });

    it('should return empty array on permission denied', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      const result = await mediaLibraryService.getAlbums();

      expect(result).toEqual([]);
    });

    it('should handle get albums error', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (MediaLibrary.getAlbumsAsync as jest.Mock).mockRejectedValue(new Error('Get albums failed'));

      const result = await mediaLibraryService.getAlbums();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getAssetsByAlbum', () => {
    it('should get assets from album with pagination', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (MediaLibrary.getAssetsAsync as jest.Mock).mockResolvedValue({
        assets: [
          {
            id: 'asset1',
            filename: 'photo.jpg',
            uri: 'file:///photo.jpg',
            mediaType: 'photo',
            width: 1920,
            height: 1080,
            creationTime: Date.now(),
            modificationTime: Date.now(),
          },
        ],
        hasNextPage: true,
        endCursor: 'cursor123',
        totalCount: 100,
      });

      const result = await mediaLibraryService.getAssetsByAlbum('album1', 30);

      expect(Array.isArray(result.assets)).toBe(true);
      expect(result.hasNextPage).toBe(true);
      expect(result.totalCount).toBe(100);
    });
  });

  describe('getAssets', () => {
    it('should get all assets with pagination', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (MediaLibrary.getAssetsAsync as jest.Mock).mockResolvedValue({
        assets: [
          {
            id: 'asset1',
            filename: 'photo.jpg',
            uri: 'file:///photo.jpg',
            mediaType: 'photo',
            width: 1920,
            height: 1080,
            creationTime: Date.now(),
            modificationTime: Date.now(),
          },
        ],
        hasNextPage: false,
        totalCount: 50,
      });

      const result = await mediaLibraryService.getAssets(30);

      expect(Array.isArray(result.assets)).toBe(true);
      expect(result.hasNextPage).toBe(false);
    });

    it('should return empty page on error', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (MediaLibrary.getAssetsAsync as jest.Mock).mockRejectedValue(new Error('Get assets failed'));

      const result = await mediaLibraryService.getAssets();

      expect(result.assets).toEqual([]);
      expect(result.hasNextPage).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getAssetById', () => {
    it('should get asset by ID', async () => {
      (MediaLibrary.getAssetsAsync as jest.Mock).mockResolvedValue({
        assets: [
          {
            id: 'asset1',
            filename: 'photo.jpg',
            uri: 'file:///photo.jpg',
            mediaType: 'photo',
            width: 1920,
            height: 1080,
            creationTime: Date.now(),
            modificationTime: Date.now(),
          },
        ],
      });

      const result = await mediaLibraryService.getAssetById('asset1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('asset1');
    });

    it('should return null when asset not found', async () => {
      (MediaLibrary.getAssetsAsync as jest.Mock).mockResolvedValue({
        assets: [],
      });

      const result = await mediaLibraryService.getAssetById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('searchAssets', () => {
    it('should search assets by filename', async () => {
      (permissionService.requestPermission as jest.Mock).mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      (MediaLibrary.getAssetsAsync as jest.Mock).mockResolvedValue({
        assets: [
          {
            id: 'asset1',
            filename: 'vacation.jpg',
            uri: 'file:///vacation.jpg',
            mediaType: 'photo',
            creationTime: Date.now(),
            modificationTime: Date.now(),
          },
        ],
      });

      const result = await mediaLibraryService.searchAssets('vacation');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getRecentPhotos', () => {
    it('should get recent photos', async () => {
      (MediaLibrary.getAssetsAsync as jest.Mock).mockResolvedValue({
        assets: [
          {
            id: 'photo1',
            filename: 'photo.jpg',
            uri: 'file:///photo.jpg',
            mediaType: 'photo',
            creationTime: Date.now(),
            modificationTime: Date.now(),
          },
        ],
      });

      const result = await mediaLibraryService.getRecentPhotos(30);

      expect(Array.isArray(result)).toBe(true);
      expect(MediaLibrary.getAssetsAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'photo',
        })
      );
    });
  });

  describe('getRecentVideos', () => {
    it('should get recent videos', async () => {
      (MediaLibrary.getAssetsAsync as jest.Mock).mockResolvedValue({
        assets: [
          {
            id: 'video1',
            filename: 'video.mp4',
            uri: 'file:///video.mp4',
            mediaType: 'video',
            duration: 60,
            creationTime: Date.now(),
            modificationTime: Date.now(),
          },
        ],
      });

      const result = await mediaLibraryService.getRecentVideos(30);

      expect(Array.isArray(result)).toBe(true);
      expect(MediaLibrary.getAssetsAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'video',
        })
      );
    });
  });

  describe('copyAssetToAppStorage', () => {
    it('should copy asset to app storage', async () => {
      (MediaLibrary.getAssetsAsync as jest.Mock).mockResolvedValue({
        assets: [
          {
            id: 'asset1',
            filename: 'photo.jpg',
            uri: 'file:///photo.jpg',
            mediaType: 'photo',
            creationTime: Date.now(),
            modificationTime: Date.now(),
          },
        ],
      });

      (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
      (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await mediaLibraryService.copyAssetToAppStorage('asset1', '/app/media/');

      expect(result).not.toBeNull();
      expect(FileSystem.copyAsync).toHaveBeenCalled();
    });

    it('should return null when asset not found', async () => {
      (MediaLibrary.getAssetsAsync as jest.Mock).mockResolvedValue({
        assets: [],
      });

      const result = await mediaLibraryService.copyAssetToAppStorage('nonexistent', '/app/media/');

      expect(result).toBeNull();
    });
  });
});
