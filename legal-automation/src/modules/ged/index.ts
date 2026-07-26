// src/modules/ged/index.ts
export { GEDService } from './document.service';
export { setupGEDRoutes } from './routes';
export type {
  Document,
  DocumentVersion,
  DocumentType,
  DocumentStatus,
  DocumentUploadRequest,
  DocumentSearchResult,
  ExtractedData,
  OCRResult,
} from './types';
