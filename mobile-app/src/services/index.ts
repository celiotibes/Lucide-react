// Document capture and processing services (Phase 22.4)
export { DocumentCaptureService } from './DocumentCaptureService';
export type { CaptureResult } from './DocumentCaptureService';

export { OCRService } from './OCRService';
export type { OCRResult, OCROptions, TextBlock } from './OCRService';

export { DocumentParserService } from './DocumentParserService';
export type {
  ParsedDocument,
  LineItem,
} from './DocumentParserService';

export { DocumentProcessorService } from './DocumentProcessorService';
export type {
  ProcessingProgress,
  ProcessingResult,
} from './DocumentProcessorService';

// API and sync services (Phase 22.5)
export { APIClient } from './APIClient';
export type { APIConfig, APIResponse } from './APIClient';

export { SyncManagerService } from './SyncManagerService';
export type {
  SyncConfig,
  SyncQueueItem,
  RemoteChanges,
} from './SyncManagerService';

export { NetworkMonitorService } from './NetworkMonitorService';
export type {
  NetworkStatus,
  NetworkStatusCallback,
} from './NetworkMonitorService';

// Hooks
export { useSyncManager } from '../hooks/useSyncManager';
export type {
  UseSyncManagerState,
  UseSyncManagerConfig,
} from '../hooks/useSyncManager';
