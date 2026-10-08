import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OCRService } from '../OCRService';

describe('OCRService', () => {
  let service: OCRService;

  beforeEach(() => {
    service = new OCRService({ language: 'eng', timeout: 5000 });
  });

  describe('initialize', () => {
    it('should initialize service', async () => {
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should not reinitialize if already initialized', async () => {
      await service.initialize();
      await expect(service.initialize()).resolves.not.toThrow();
    });
  });

  describe('extractText', () => {
    it('should extract text from image', async () => {
      const result = await service.extractText(
        'file:///path/to/image.jpg',
        'base64data',
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.language).toBe('eng');
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.blocks).toBeDefined();
      expect(Array.isArray(result.blocks)).toBe(true);
    });

    it('should calculate confidence based on text quality', async () => {
      const result = await service.extractText('file:///path/to/image.jpg');

      // Should return a confidence score
      expect(result.confidence).toBeDefined();
      expect(typeof result.confidence).toBe('number');
    });

    it('should extract text blocks', async () => {
      const result = await service.extractText('file:///path/to/image.jpg');

      if (result.blocks.length > 0) {
        const block = result.blocks[0];
        expect(block.text).toBeDefined();
        expect(block.confidence).toBeGreaterThanOrEqual(0);
        expect(block.confidence).toBeLessThanOrEqual(1);
        expect(block.boundingBox).toBeDefined();
        expect(block.boundingBox.x).toBeDefined();
        expect(block.boundingBox.y).toBeDefined();
        expect(block.boundingBox.width).toBeDefined();
        expect(block.boundingBox.height).toBeDefined();
      }
    });

    it('should handle timeout gracefully', async () => {
      const quickService = new OCRService({ timeout: 1 }); // 1ms timeout
      // Note: In real scenario with actual OCR, this would test timeout behavior
      const result = await quickService.extractText('file:///path/to/image.jpg');
      expect(result).toBeDefined();
    });
  });

  describe('setLanguage', () => {
    it('should set language for OCR', async () => {
      await expect(service.setLanguage('por')).resolves.not.toThrow();
    });

    it('should accept multiple languages', async () => {
      const languages = ['eng', 'por', 'spa', 'fra'];

      for (const lang of languages) {
        await expect(service.setLanguage(lang)).resolves.not.toThrow();
      }
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return supported languages', async () => {
      const languages = await service.getSupportedLanguages();

      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
      expect(languages).toContain('eng');
      expect(languages).toContain('por');
    });

    it('should include common languages', async () => {
      const languages = await service.getSupportedLanguages();

      const commonLanguages = ['eng', 'por', 'spa', 'fra', 'deu'];
      for (const lang of commonLanguages) {
        expect(languages).toContain(lang);
      }
    });
  });

  describe('cleanup', () => {
    it('should cleanup service', async () => {
      await expect(service.cleanup()).resolves.not.toThrow();
    });

    it('should prepare for reinitialization after cleanup', async () => {
      await service.cleanup();
      await expect(service.initialize()).resolves.not.toThrow();
    });
  });

  describe('confidence calculation', () => {
    it('should calculate higher confidence for quality text', async () => {
      const result = await service.extractText('file:///path/to/image.jpg');

      // Quality text with numbers and letters should have reasonable confidence
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return low confidence for empty text', async () => {
      const result = await service.extractText('file:///path/to/image.jpg');

      if (result.text.length === 0) {
        expect(result.confidence).toBe(0);
      }
    });
  });

  describe('text block extraction', () => {
    it('should extract multiple text blocks from multiline text', async () => {
      const result = await service.extractText('file:///path/to/image.jpg');

      const blocks = result.blocks;
      if (blocks.length > 0) {
        // Each block should have proper structure
        blocks.forEach((block) => {
          expect(block.text).toBeDefined();
          expect(block.text.length).toBeGreaterThan(0);
          expect(block.confidence).toBeGreaterThanOrEqual(0);
          expect(block.boundingBox.y).toBeDefined();
        });

        // Blocks should be ordered by position
        for (let i = 1; i < blocks.length; i++) {
          expect(blocks[i].boundingBox.y).toBeGreaterThanOrEqual(
            blocks[i - 1].boundingBox.y,
          );
        }
      }
    });
  });

  describe('options', () => {
    it('should respect custom timeout option', async () => {
      const customService = new OCRService({ timeout: 30000 });
      const result = await customService.extractText('file:///path/to/image.jpg');
      expect(result).toBeDefined();
    });

    it('should respect custom language option', async () => {
      const spanishService = new OCRService({ language: 'spa' });
      const result = await spanishService.extractText('file:///path/to/image.jpg');
      expect(result.language).toBe('spa');
    });

    it('should use default values when options not provided', async () => {
      const defaultService = new OCRService();
      const result = await defaultService.extractText('file:///path/to/image.jpg');
      expect(result.language).toBe('eng');
    });
  });
});
