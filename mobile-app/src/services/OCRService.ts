import { logger } from '../utils/logger';

export interface OCRResult {
  text: string;
  confidence: number;
  language: string;
  processingTime: number;
  blocks: TextBlock[];
}

export interface TextBlock {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCROptions {
  language?: string;
  psm?: number; // Page segmentation mode
  timeout?: number;
}

export class OCRService {
  private workerReady: boolean = false;
  private processingQueue: Promise<any> = Promise.resolve();

  constructor(private readonly options: OCROptions = {}) {
    this.options.language = this.options.language || 'eng';
    this.options.psm = this.options.psm || 3;
    this.options.timeout = this.options.timeout || 60000;
  }

  async initialize(): Promise<void> {
    try {
      if (this.workerReady) {
        return;
      }

      logger.info('Initializing OCR service');
      this.workerReady = true;
    } catch (error) {
      logger.error('Failed to initialize OCR', error);
      throw error;
    }
  }

  async extractText(
    imageUri: string,
    base64Data?: string,
  ): Promise<OCRResult> {
    return new Promise((resolve, reject) => {
      this.processingQueue = this.processingQueue.then(async () => {
        try {
          const startTime = Date.now();

          if (!this.workerReady) {
            await this.initialize();
          }

          const text = await this.performOCR(imageUri, base64Data);
          const confidence = this.calculateConfidence(text);
          const blocks = this.extractTextBlocks(text);

          const result: OCRResult = {
            text: text.trim(),
            confidence,
            language: this.options.language || 'eng',
            processingTime: Date.now() - startTime,
            blocks,
          };

          logger.info(
            `OCR completed: ${text.length} characters extracted in ${result.processingTime}ms`,
          );
          resolve(result);
        } catch (error) {
          logger.error('OCR processing failed', error);
          reject(error);
        }
      });

      const timeoutId = setTimeout(() => {
        reject(new Error('OCR processing timeout'));
      }, this.options.timeout);

      this.processingQueue
        .then(() => clearTimeout(timeoutId))
        .catch(() => clearTimeout(timeoutId));
    });
  }

  private async performOCR(
    imageUri: string,
    base64Data?: string,
  ): Promise<string> {
    try {
      // For now, return a mock implementation
      // In production, this would integrate with Tesseract.js or native OCR
      if (base64Data) {
        return this.mockOCRResult(imageUri);
      }

      return this.mockOCRResult(imageUri);
    } catch (error) {
      logger.error('OCR extraction failed', error);
      throw error;
    }
  }

  private mockOCRResult(imageUri: string): string {
    // This is a placeholder that would be replaced with actual OCR
    // In a real implementation, this would call Tesseract.js or native OCR
    return `Document processed from ${imageUri}. This is a mock OCR result that would contain extracted text from the image.`;
  }

  private calculateConfidence(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }

    // Simple heuristic: confidence based on text quality
    const hasNumbers = /\d/.test(text);
    const hasLetters = /[a-zA-Z]/.test(text);
    const avgWordLength = text.split(/\s+/).reduce((sum, word) => {
      return sum + word.length;
    }, 0) / Math.max(text.split(/\s+/).length, 1);

    let confidence = 0.5;

    if (hasNumbers && hasLetters) confidence += 0.25;
    if (avgWordLength >= 3 && avgWordLength <= 15) confidence += 0.15;
    if (text.length > 100) confidence += 0.1;

    return Math.min(confidence, 1);
  }

  private extractTextBlocks(text: string): TextBlock[] {
    const lines = text.split('\n').filter((line) => line.trim());
    const blocks: TextBlock[] = [];

    let yOffset = 0;
    for (const line of lines) {
      blocks.push({
        text: line,
        confidence: this.calculateConfidence(line),
        boundingBox: {
          x: 0,
          y: yOffset,
          width: 1,
          height: 1,
        },
      });
      yOffset += 1;
    }

    return blocks;
  }

  async setLanguage(language: string): Promise<void> {
    try {
      this.options.language = language;
      logger.info(`OCR language set to ${language}`);
    } catch (error) {
      logger.error('Failed to set OCR language', error);
      throw error;
    }
  }

  async getSupportedLanguages(): Promise<string[]> {
    return ['eng', 'por', 'spa', 'fra', 'deu', 'ita', 'jpn', 'kor', 'rus'];
  }

  async cleanup(): Promise<void> {
    try {
      this.workerReady = false;
      logger.info('OCR service cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup OCR service', error);
      throw error;
    }
  }
}
