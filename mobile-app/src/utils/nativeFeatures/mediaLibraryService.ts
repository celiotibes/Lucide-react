/**
 * Media Library Service
 * Access device photo/video library with pagination and album support
 * Phase 22.15 Mobile-First Features
 */

import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';
import { permissionService, PermissionRequest } from './permissionService';

export type MediaType = 'photo' | 'video' | 'audio' | 'unknown';

export interface MediaAsset {
  id: string;
  filename: string;
  uri: string;
  mediaType: MediaType;
  width?: number;
  height?: number;
  duration?: number;
  creationTime: number;
  modificationTime: number;
  albumId?: string;
}

export interface MediaAlbum {
  id: string;
  title: string;
  assetCount: number;
  type: 'album' | 'moment' | 'smartAlbum';
  approximateLocation?: {
    latitude: number;
    longitude: number;
  };
}

export interface MediaLibraryPage {
  assets: MediaAsset[];
  hasNextPage: boolean;
  endCursor?: string;
  totalCount: number;
}

interface PaginationOptions {
  first: number;
  after?: string;
}

class MediaLibraryService {
  private mediaLibraryPermission: PermissionRequest = {
    type: 'mediaLibrary',
    title: 'Photo & Video Access',
    message: 'This app needs access to your photo and video library to browse and select media.',
    deniedMessage:
      'Photo library access is required. Please enable it in Settings > Apps > This App > Permissions',
  };

  /**
   * Request media library permission
   */
  async requestMediaLibraryPermission(): Promise<boolean> {
    try {
      const result = await permissionService.requestPermission(this.mediaLibraryPermission);
      return result.status === 'granted';
    } catch (error) {
      logger.error('[MediaLibraryService] Error requesting media library permission:', error);
      return false;
    }
  }

  /**
   * Check if media library access is available
   */
  async isMediaLibraryAvailable(): Promise<boolean> {
    try {
      const permission = await permissionService.checkPermission('mediaLibrary');
      return permission.status === 'granted';
    } catch (error) {
      logger.error('[MediaLibraryService] Error checking media library availability:', error);
      return false;
    }
  }

  /**
   * Get all albums
   */
  async getAlbums(): Promise<MediaAlbum[]> {
    try {
      // Check permission
      const hasPermission = await this.requestMediaLibraryPermission();
      if (!hasPermission) {
        throw new Error('Media library permission not granted');
      }

      logger.info('[MediaLibraryService] Fetching albums');

      const albums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });

      return albums.map((album) => ({
        id: album.id,
        title: album.title,
        assetCount: album.assetCount,
        type: (album.type as any) || 'album',
        approximateLocation: album.approximateLocation,
      }));
    } catch (error) {
      logger.error('[MediaLibraryService] Error getting albums:', error);
      return [];
    }
  }

  /**
   * Get album by ID
   */
  async getAlbumById(albumId: string): Promise<MediaAlbum | null> {
    try {
      const album = await MediaLibrary.getAlbumAsync(albumId);
      if (!album) return null;

      return {
        id: album.id,
        title: album.title,
        assetCount: album.assetCount,
        type: (album.type as any) || 'album',
        approximateLocation: album.approximateLocation,
      };
    } catch (error) {
      logger.error('[MediaLibraryService] Error getting album:', error);
      return null;
    }
  }

  /**
   * Get assets from album with pagination
   */
  async getAssetsByAlbum(
    albumId: string,
    pageSize: number = 30,
    cursor?: string
  ): Promise<MediaLibraryPage> {
    try {
      // Check permission
      const hasPermission = await this.requestMediaLibraryPermission();
      if (!hasPermission) {
        throw new Error('Media library permission not granted');
      }

      logger.info('[MediaLibraryService] Fetching assets from album:', albumId);

      const page = await MediaLibrary.getAssetsAsync({
        album: albumId,
        first: pageSize,
        after: cursor,
        sortBy: [['creationTime', false]], // Sort by creation time, newest first
      });

      const assets = page.assets.map((asset) => this.convertMediaAsset(asset, albumId));

      return {
        assets,
        hasNextPage: page.hasNextPage,
        endCursor: page.endCursor,
        totalCount: page.totalCount,
      };
    } catch (error) {
      logger.error('[MediaLibraryService] Error getting assets from album:', error);
      return {
        assets: [],
        hasNextPage: false,
        totalCount: 0,
      };
    }
  }

  /**
   * Get all assets with pagination
   */
  async getAssets(pageSize: number = 30, cursor?: string): Promise<MediaLibraryPage> {
    try {
      // Check permission
      const hasPermission = await this.requestMediaLibraryPermission();
      if (!hasPermission) {
        throw new Error('Media library permission not granted');
      }

      logger.info('[MediaLibraryService] Fetching assets');

      const page = await MediaLibrary.getAssetsAsync({
        first: pageSize,
        after: cursor,
        sortBy: [['creationTime', false]], // Sort by creation time, newest first
      });

      const assets = page.assets.map((asset) => this.convertMediaAsset(asset));

      return {
        assets,
        hasNextPage: page.hasNextPage,
        endCursor: page.endCursor,
        totalCount: page.totalCount,
      };
    } catch (error) {
      logger.error('[MediaLibraryService] Error getting assets:', error);
      return {
        assets: [],
        hasNextPage: false,
        totalCount: 0,
      };
    }
  }

  /**
   * Get asset by ID
   */
  async getAssetById(assetId: string): Promise<MediaAsset | null> {
    try {
      const assets = await MediaLibrary.getAssetsAsync({
        first: 1,
      });

      const asset = assets.assets.find((a) => a.id === assetId);
      if (!asset) return null;

      return this.convertMediaAsset(asset);
    } catch (error) {
      logger.error('[MediaLibraryService] Error getting asset by ID:', error);
      return null;
    }
  }

  /**
   * Get asset URI for preview
   */
  async getAssetUri(assetId: string): Promise<string | null> {
    try {
      const asset = await this.getAssetById(assetId);
      return asset ? asset.uri : null;
    } catch (error) {
      logger.error('[MediaLibraryService] Error getting asset URI:', error);
      return null;
    }
  }

  /**
   * Search assets by name
   */
  async searchAssets(query: string, pageSize: number = 30): Promise<MediaAsset[]> {
    try {
      // Check permission
      const hasPermission = await this.requestMediaLibraryPermission();
      if (!hasPermission) {
        throw new Error('Media library permission not granted');
      }

      logger.info('[MediaLibraryService] Searching assets:', query);

      // Get all assets and filter (media library doesn't support search directly)
      const page = await MediaLibrary.getAssetsAsync({
        first: 1000, // Get large batch to search through
        sortBy: [['creationTime', false]],
      });

      const filtered = page.assets.filter((asset) =>
        asset.filename?.toLowerCase().includes(query.toLowerCase())
      );

      return filtered.slice(0, pageSize).map((asset) => this.convertMediaAsset(asset));
    } catch (error) {
      logger.error('[MediaLibraryService] Error searching assets:', error);
      return [];
    }
  }

  /**
   * Copy asset to app storage
   */
  async copyAssetToAppStorage(assetId: string, destinationDir: string): Promise<string | null> {
    try {
      const asset = await this.getAssetById(assetId);
      if (!asset) {
        throw new Error('Asset not found');
      }

      logger.info('[MediaLibraryService] Copying asset to app storage:', assetId);

      // Create destination directory if needed
      await FileSystem.makeDirectoryAsync(destinationDir, { intermediates: true });

      // Copy asset
      const timestamp = Date.now();
      const extension = asset.filename.split('.').pop() || 'jpg';
      const newFilename = `${assetId}-${timestamp}.${extension}`;
      const destinationUri = `${destinationDir}${newFilename}`;

      await FileSystem.copyAsync({
        from: asset.uri,
        to: destinationUri,
      });

      logger.info('[MediaLibraryService] Asset copied successfully');

      return destinationUri;
    } catch (error) {
      logger.error('[MediaLibraryService] Error copying asset:', error);
      return null;
    }
  }

  /**
   * Get high-resolution image data
   */
  async getAssetHighResolution(assetId: string): Promise<{ uri: string; width: number; height: number } | null> {
    try {
      const asset = await this.getAssetById(assetId);
      if (!asset) return null;

      logger.info('[MediaLibraryService] Getting high-resolution asset:', assetId);

      // The asset URI is already high-resolution
      return {
        uri: asset.uri,
        width: asset.width || 1920,
        height: asset.height || 1080,
      };
    } catch (error) {
      logger.error('[MediaLibraryService] Error getting high-resolution asset:', error);
      return null;
    }
  }

  /**
   * Get recent photos
   */
  async getRecentPhotos(limit: number = 30): Promise<MediaAsset[]> {
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: limit,
        mediaType: 'photo',
        sortBy: [['creationTime', false]],
      });

      return page.assets.map((asset) => this.convertMediaAsset(asset));
    } catch (error) {
      logger.error('[MediaLibraryService] Error getting recent photos:', error);
      return [];
    }
  }

  /**
   * Get recent videos
   */
  async getRecentVideos(limit: number = 30): Promise<MediaAsset[]> {
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: limit,
        mediaType: 'video',
        sortBy: [['creationTime', false]],
      });

      return page.assets.map((asset) => this.convertMediaAsset(asset));
    } catch (error) {
      logger.error('[MediaLibraryService] Error getting recent videos:', error);
      return [];
    }
  }

  /**
   * Private: Convert MediaLibrary asset to our MediaAsset type
   */
  private convertMediaAsset(asset: MediaLibrary.Asset, albumId?: string): MediaAsset {
    return {
      id: asset.id,
      filename: asset.filename,
      uri: asset.uri,
      mediaType: (asset.mediaType as MediaType) || 'unknown',
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
      creationTime: asset.creationTime,
      modificationTime: asset.modificationTime,
      albumId,
    };
  }

  /**
   * Create album (iOS only - returns null on Android)
   */
  async createAlbum(title: string): Promise<MediaAlbum | null> {
    try {
      if (Platform.OS !== 'ios') {
        logger.warn('[MediaLibraryService] Create album only supported on iOS');
        return null;
      }

      logger.info('[MediaLibraryService] Creating album:', title);

      const album = await MediaLibrary.createAlbumAsync(title, undefined, false);

      return {
        id: album.id,
        title: album.title,
        assetCount: album.assetCount,
        type: 'album',
      };
    } catch (error) {
      logger.error('[MediaLibraryService] Error creating album:', error);
      return null;
    }
  }

  /**
   * Add asset to album (iOS only)
   */
  async addAssetToAlbum(assetId: string, albumId: string): Promise<boolean> {
    try {
      if (Platform.OS !== 'ios') {
        logger.warn('[MediaLibraryService] Add to album only supported on iOS');
        return false;
      }

      logger.info('[MediaLibraryService] Adding asset to album');

      await MediaLibrary.addAssetsToAlbumAsync([assetId], albumId, false);

      return true;
    } catch (error) {
      logger.error('[MediaLibraryService] Error adding asset to album:', error);
      return false;
    }
  }
}

export const mediaLibraryService = new MediaLibraryService();
