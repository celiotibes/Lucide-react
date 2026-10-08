/**
 * Native Features Module
 * Centralized exports for all native feature services
 * Phase 22.15 Mobile-First Features
 */

export { cameraService, type CameraType, type CameraOptions, type CapturedMedia } from './cameraService';

export {
  filePickerService,
  type FileFilterType,
  type FilePickerOptions,
  type PickedFile,
} from './filePickerService';

export {
  mediaLibraryService,
  type MediaType,
  type MediaAsset,
  type MediaAlbum,
  type MediaLibraryPage,
} from './mediaLibraryService';

export {
  permissionService,
  type PermissionType,
  type PermissionStatus,
  type PermissionInfo,
  type PermissionRequest,
} from './permissionService';

export {
  fileSystemService,
  type DirectoryInfo,
  type FileInfo,
} from './fileSystemService';
