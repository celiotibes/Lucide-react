// src/modules/ged/types.ts
export type DocumentType =
  | 'petition'
  | 'ruling'
  | 'appeal'
  | 'sentence'
  | 'decision'
  | 'other'
  | 'contract'
  | 'legal_opinion';

export type DocumentStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED';

export interface Document {
  id: string;
  caseId: string;
  fileName: string;
  documentType: DocumentType;
  uploadedAt: Date;
  uploadedBy: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  status: DocumentStatus;
  tags: string[];
  extractedData?: ExtractedData;
  ocrContent?: string;
  searchableContent: string;
  versions: DocumentVersion[];
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  createdAt: Date;
  createdBy: string;
  changes?: string;
  storagePath: string;
}

export interface ExtractedData {
  dates: Date[];
  parties: string[];
  amount?: number;
  judges?: string[];
  processNumber?: string;
  keyPhrases: string[];
}

export interface OCRResult {
  documentId: string;
  content: string;
  confidence: number;
  language: string;
  processingTime: number; // milliseconds
}

export interface DocumentUploadRequest {
  caseId: string;
  fileName: string;
  file: Buffer;
  documentType: DocumentType;
  tags?: string[];
}

export interface DocumentSearchResult {
  id: string;
  fileName: string;
  documentType: DocumentType;
  uploadedAt: Date;
  relevanceScore: number;
  excerpt: string;
}
