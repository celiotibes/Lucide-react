import { Database } from '@nozbe/watermelondb';
import { DocumentRepository } from '../database/repositories';
import { DocumentCaptureService, CaptureResult } from './DocumentCaptureService';
import { OCRService, OCRResult } from './OCRService';
import { DocumentParserService, ParsedDocument } from './DocumentParserService';
import { logger } from '../utils/logger';

export interface ProcessingProgress {
  step: 'capture' | 'ocr' | 'parsing' | 'storage';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  error?: string;
}

export interface ProcessingResult {
  documentId: string;
  status: 'completed' | 'failed' | 'partial';
  parsed: ParsedDocument;
  ocrConfidence: number;
  processingTime: number;
  error?: string;
}

export class DocumentProcessorService {
  private captureService: DocumentCaptureService;
  private ocrService: OCRService;
  private parserService: DocumentParserService;
  private documentRepo: DocumentRepository;
  private progressCallback?: (progress: ProcessingProgress) => void;

  constructor(database: Database) {
    this.captureService = new DocumentCaptureService();
    this.ocrService = new OCRService({ language: 'eng' });
    this.parserService = new DocumentParserService();
    this.documentRepo = new DocumentRepository(database);
  }

  setProgressCallback(
    callback: (progress: ProcessingProgress) => void,
  ): void {
    this.progressCallback = callback;
  }

  private reportProgress(progress: ProcessingProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  async processFromCamera(
    counterpartyName: string = 'Unknown',
  ): Promise<ProcessingResult> {
    try {
      const startTime = Date.now();

      this.reportProgress({
        step: 'capture',
        status: 'in_progress',
        progress: 10,
      });

      const capture = await this.captureService.captureFromCamera();

      this.reportProgress({
        step: 'capture',
        status: 'completed',
        progress: 20,
      });

      return await this.processCapture(capture, counterpartyName, startTime);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.reportProgress({
        step: 'capture',
        status: 'failed',
        progress: 0,
        error: errorMsg,
      });
      logger.error('Camera capture processing failed', error);
      throw error;
    }
  }

  async processFromLibrary(
    counterpartyName: string = 'Unknown',
  ): Promise<ProcessingResult> {
    try {
      const startTime = Date.now();

      this.reportProgress({
        step: 'capture',
        status: 'in_progress',
        progress: 10,
      });

      const capture = await this.captureService.captureFromLibrary();

      this.reportProgress({
        step: 'capture',
        status: 'completed',
        progress: 20,
      });

      return await this.processCapture(capture, counterpartyName, startTime);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.reportProgress({
        step: 'capture',
        status: 'failed',
        progress: 0,
        error: errorMsg,
      });
      logger.error('Library capture processing failed', error);
      throw error;
    }
  }

  async processCapture(
    capture: CaptureResult,
    counterpartyName: string = 'Unknown',
    startTime: number = Date.now(),
  ): Promise<ProcessingResult> {
    try {
      this.reportProgress({
        step: 'ocr',
        status: 'in_progress',
        progress: 25,
      });

      const ocrResult = await this.ocrService.extractText(
        capture.uri,
        capture.base64,
      );

      this.reportProgress({
        step: 'ocr',
        status: 'completed',
        progress: 50,
      });

      this.reportProgress({
        step: 'parsing',
        status: 'in_progress',
        progress: 60,
      });

      const parsed = await this.parserService.parseDocument(ocrResult.text);

      this.reportProgress({
        step: 'parsing',
        status: 'completed',
        progress: 75,
      });

      this.reportProgress({
        step: 'storage',
        status: 'in_progress',
        progress: 80,
      });

      const documentId = await this.storeDocument(
        capture,
        ocrResult,
        parsed,
        counterpartyName,
      );

      this.reportProgress({
        step: 'storage',
        status: 'completed',
        progress: 100,
      });

      const result: ProcessingResult = {
        documentId,
        status: 'completed',
        parsed,
        ocrConfidence: ocrResult.confidence,
        processingTime: Date.now() - startTime,
      };

      logger.info(`Document processing completed in ${result.processingTime}ms`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.reportProgress({
        step: 'storage',
        status: 'failed',
        progress: 0,
        error: errorMsg,
      });
      logger.error('Document processing failed', error);

      const result: ProcessingResult = {
        documentId: '',
        status: 'failed',
        parsed: {
          type: 'unknown',
          confidence: 0,
        },
        ocrConfidence: 0,
        processingTime: Date.now() - startTime,
        error: errorMsg,
      };

      return result;
    }
  }

  private async storeDocument(
    capture: CaptureResult,
    ocrResult: OCRResult,
    parsed: ParsedDocument,
    counterpartyName: string,
  ): Promise<string> {
    try {
      const document = await this.documentRepo.create({
        type: parsed.type === 'unknown' ? 'invoice' : parsed.type,
        counterpartyName: parsed.vendor || counterpartyName,
        filePath: capture.uri,
        fileSize: capture.fileSize,
      });

      // Update with extracted data
      await this.documentRepo.update(document.id, {
        status: 'completed',
        extractedData: JSON.stringify(parsed),
        confidence: ocrResult.confidence,
        uploadedAt: Date.now(),
        syncPending: true,
      });

      logger.info(`Document stored: ${document.id}`);
      return document.id;
    } catch (error) {
      logger.error('Failed to store document', error);
      throw error;
    }
  }

  async reprocessDocument(documentId: string): Promise<ProcessingResult> {
    try {
      const document = await this.documentRepo.getById(documentId);
      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      this.reportProgress({
        step: 'ocr',
        status: 'in_progress',
        progress: 25,
      });

      // Re-run OCR
      const ocrResult = await this.ocrService.extractText(document.filePath);

      this.reportProgress({
        step: 'parsing',
        status: 'in_progress',
        progress: 60,
      });

      // Re-parse
      const parsed = await this.parserService.parseDocument(ocrResult.text);

      this.reportProgress({
        step: 'storage',
        status: 'in_progress',
        progress: 80,
      });

      // Update document with new data
      await this.documentRepo.update(documentId, {
        extractedData: JSON.stringify(parsed),
        confidence: ocrResult.confidence,
        status: 'completed',
        syncPending: true,
      });

      this.reportProgress({
        step: 'storage',
        status: 'completed',
        progress: 100,
      });

      return {
        documentId,
        status: 'completed',
        parsed,
        ocrConfidence: ocrResult.confidence,
        processingTime: 0,
      };
    } catch (error) {
      logger.error('Failed to reprocess document', error);
      throw error;
    }
  }

  async setOCRLanguage(language: string): Promise<void> {
    try {
      await this.ocrService.setLanguage(language);
      logger.info(`OCR language set to ${language}`);
    } catch (error) {
      logger.error('Failed to set OCR language', error);
      throw error;
    }
  }

  async getSupportedLanguages(): Promise<string[]> {
    try {
      return await this.ocrService.getSupportedLanguages();
    } catch (error) {
      logger.error('Failed to get supported languages', error);
      return ['eng'];
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.captureService.clearOldDocuments(30);
      await this.ocrService.cleanup();
      logger.info('Document processor cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup document processor', error);
    }
  }
}
