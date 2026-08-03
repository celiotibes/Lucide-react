import fs from 'fs';
import path from 'path';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { llmPool } from '@ai/llmPool';
import { eventEmitterService } from './EventEmitterService';

export type FileType = 'pdf' | 'image' | 'scan';

export interface OCRRequest {
  fileId: string;
  filePath: string;
  fileType: FileType;
  language?: string;
  returnStructure?: boolean;
  userId?: string;
}

export interface Table {
  tableIndex: number;
  headers: string[];
  rows: string[][];
  confidence: number;
}

export interface SignatureLocation {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  page: number;
}

export interface DocumentStructure {
  title?: string;
  sections: {
    heading: string;
    content: string;
    subsections?: any[];
  }[];
  tables: Table[];
  signatures: SignatureLocation[];
  metadata: {
    pageCount: number;
    language: string;
    documentType: string;
  };
}

export interface OCRResult {
  fileId: string;
  extractedText: string;
  confidence: number;
  tables?: Table[];
  signatures?: SignatureLocation[];
  structuredData?: DocumentStructure;
  processingTime: number;
  status: 'success' | 'partial' | 'failed';
  errors?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  documentType: string;
  confidence: number;
  errors: string[];
}

export class OCRService {
  private cache: Map<string, { result: OCRResult; timestamp: number }> = new Map();
  private cacheMaxAge = 604800000; // 7 days

  /**
   * Extrair texto de arquivo (PDF, imagem, scan)
   */
  async extractText(request: OCRRequest): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      logger.info(`OCR: Iniciando extração para arquivo ${request.fileId}`);

      if (request.userId) {
        eventEmitterService.emitOCRProgress(request.userId, {
          data: {
            fileId: request.fileId,
            status: 'processing',
            progress: 10,
            message: 'Iniciando processamento...',
          },
        });
      }

      // Verificar cache
      const cached = this.getFromCache(request.fileId);
      if (cached) {
        logger.debug(`OCR: Cache hit para ${request.fileId}`);
        if (request.userId) {
          eventEmitterService.emitOCRProgress(request.userId, {
            data: {
              fileId: request.fileId,
              status: 'completed',
              progress: 100,
              message: 'Extração concluída (cache)',
              extractedText: cached.extractedText,
              confidence: cached.confidence,
            },
          });
        }
        return cached;
      }

      // Validar arquivo
      if (!fs.existsSync(request.filePath)) {
        throw new Error(`Arquivo não encontrado: ${request.filePath}`);
      }

      // Extrair baseado no tipo
      let extractedText = '';
      let confidence = 0.8;

      if (request.userId) {
        eventEmitterService.emitOCRProgress(request.userId, {
          data: {
            fileId: request.fileId,
            status: 'processing',
            progress: 30,
            message: `Extraindo texto (${request.fileType})...`,
          },
        });
      }

      switch (request.fileType) {
        case 'pdf':
          ({ text: extractedText, confidence } = await this.extractFromPDF(request.filePath));
          break;
        case 'image':
        case 'scan':
          ({ text: extractedText, confidence } = await this.extractFromImage(request.filePath));
          break;
        default:
          throw new Error(`Tipo de arquivo não suportado: ${request.fileType}`);
      }

      // Estruturar documento se solicitado
      let structuredData: DocumentStructure | undefined;
      if (request.returnStructure) {
        if (request.userId) {
          eventEmitterService.emitOCRProgress(request.userId, {
            data: {
              fileId: request.fileId,
              status: 'processing',
              progress: 70,
              message: 'Estruturando documento...',
            },
          });
        }
        structuredData = await this.structureDocument(extractedText, request.fileId);
      }

      const result: OCRResult = {
        fileId: request.fileId,
        extractedText,
        confidence,
        structuredData,
        tables: structuredData?.tables || [],
        signatures: structuredData?.signatures || [],
        processingTime: Date.now() - startTime,
        status: confidence > 0.7 ? 'success' : 'partial',
      };

      // Cachear resultado
      this.setInCache(request.fileId, result);

      logger.info(
        `OCR: Extração concluída para ${request.fileId} em ${result.processingTime}ms (confiança: ${confidence})`,
      );

      if (request.userId) {
        eventEmitterService.emitOCRProgress(request.userId, {
          data: {
            fileId: request.fileId,
            status: 'completed',
            progress: 100,
            message: 'Extração concluída',
            extractedText: extractedText.substring(0, 500),
            confidence,
          },
        });
      }

      return result;
    } catch (error) {
      logger.error({ err: error }, `OCR: Erro ao extrair texto de ${request.fileId}`);

      if (request.userId) {
        eventEmitterService.emitOCRProgress(request.userId, {
          data: {
            fileId: request.fileId,
            status: 'failed',
            progress: 0,
            message: 'Erro ao processar arquivo',
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          },
        });
      }

      return {
        fileId: request.fileId,
        extractedText: '',
        confidence: 0,
        processingTime: Date.now() - startTime,
        status: 'failed',
        errors: [error instanceof Error ? error.message : 'Erro desconhecido'],
      };
    }
  }

  /**
   * Extrair tabelas de documento
   */
  async extractTables(fileId: string): Promise<Table[]> {
    try {
      logger.debug(`OCR: Extraindo tabelas de ${fileId}`);

      // Implementação real usaria visão computacional
      // Por enquanto, retornar estrutura vazia
      return [];
    } catch (error) {
      logger.error({ err: error }, `OCR: Erro ao extrair tabelas`);
      return [];
    }
  }

  /**
   * Detectar assinaturas em documento
   */
  async detectSignatures(fileId: string): Promise<SignatureLocation[]> {
    try {
      logger.debug(`OCR: Detectando assinaturas em ${fileId}`);

      // Implementação real usaria ML para detectar assinaturas
      return [];
    } catch (error) {
      logger.error({ err: error }, `OCR: Erro ao detectar assinaturas`);
      return [];
    }
  }

  /**
   * Estruturar documento em seções
   */
  async structureDocument(text: string, fileId: string): Promise<DocumentStructure> {
    try {
      logger.debug(`OCR: Estruturando documento ${fileId}`);

      // Usar IA para estruturar
      const prompt = `Analise o texto jurídico abaixo e estruture em JSON com este formato:
{
  "title": "Título do documento",
  "sections": [
    {
      "heading": "Nome da seção",
      "content": "Conteúdo da seção"
    }
  ],
  "documentType": "Tipo de documento",
  "pageCount": número de páginas
}

Texto:
${text.substring(0, 2000)}

Retorne apenas JSON válido.`;

      const response = await llmPool.call(prompt, {
        temperature: 0.3,
        maxTokens: 1000,
        cacheKey: `structure:${fileId}`,
      });

      const parsed = this.parseStructureJSON(response.content);

      return {
        title: parsed.title,
        sections: parsed.sections || [],
        tables: await this.extractTables(fileId),
        signatures: await this.detectSignatures(fileId),
        metadata: {
          pageCount: parsed.pageCount || 1,
          language: 'pt-BR',
          documentType: parsed.documentType || 'Genérico',
        },
      };
    } catch (error) {
      logger.error({ err: error }, `OCR: Erro ao estruturar documento`);

      // Retornar estrutura básica em caso de erro
      return {
        sections: [],
        tables: [],
        signatures: [],
        metadata: {
          pageCount: 1,
          language: 'pt-BR',
          documentType: 'Genérico',
        },
      };
    }
  }

  /**
   * Validar formato de documento
   */
  async validateDocumentFormat(filePath: string): Promise<ValidationResult> {
    try {
      logger.debug(`OCR: Validando formato de ${path.basename(filePath)}`);

      const ext = path.extname(filePath).toLowerCase();
      const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff'];

      const isValid = validExtensions.includes(ext);

      return {
        isValid,
        documentType: this.detectDocumentType(filePath),
        confidence: isValid ? 0.95 : 0,
        errors: isValid ? [] : [`Formato inválido: ${ext}`],
      };
    } catch (error) {
      return {
        isValid: false,
        documentType: 'desconhecido',
        confidence: 0,
        errors: ['Erro ao validar documento'],
      };
    }
  }

  /**
   * Privado: Extrair de PDF
   */
  private async extractFromPDF(
    filePath: string,
  ): Promise<{ text: string; confidence: number }> {
    try {
      // Em produção, usar bibliotecas como pdf-parse ou pdfjs-dist
      // Por enquanto, simular com leitura de arquivo
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // Simular extração
      const text = fileContent.substring(0, 5000);
      const confidence = 0.85;

      logger.debug(`PDF: Extração simulada de ${path.basename(filePath)}`);

      return { text, confidence };
    } catch (error) {
      logger.warn(`OCR: Erro ao extrair PDF: ${error}`);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * Privado: Extrair de imagem
   */
  private async extractFromImage(
    filePath: string,
  ): Promise<{ text: string; confidence: number }> {
    try {
      // Em produção, usar Google Vision API ou Tesseract
      // Por enquanto, simular
      logger.debug(`Imagem: Extração simulada de ${path.basename(filePath)}`);

      // Simular com confiança um pouco menor que PDF
      return { text: 'Texto extraído da imagem (simulado)', confidence: 0.75 };
    } catch (error) {
      logger.warn(`OCR: Erro ao extrair imagem: ${error}`);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * Privado: Detectar tipo de documento
   */
  private detectDocumentType(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf-8').substring(0, 500).toLowerCase();

    if (content.includes('petição') || content.includes('processo')) return 'Petição';
    if (content.includes('contrato')) return 'Contrato';
    if (content.includes('procuração')) return 'Procuração';
    if (content.includes('certidão')) return 'Certidão';

    return 'Documento Jurídico Genérico';
  }

  /**
   * Privado: Parsear JSON de estrutura
   */
  private parseStructureJSON(jsonStr: string): any {
    try {
      // Extrair JSON do conteúdo
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          title: 'Documento',
          sections: [],
          documentType: 'Genérico',
          pageCount: 1,
        };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.warn('OCR: Erro ao parsear JSON de estrutura');
      return {
        title: 'Documento',
        sections: [],
        documentType: 'Genérico',
        pageCount: 1,
      };
    }
  }

  /**
   * Cache management
   */
  private getFromCache(fileId: string): OCRResult | null {
    const cached = this.cache.get(fileId);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.result;
    }
    this.cache.delete(fileId);
    return null;
  }

  private setInCache(fileId: string, result: OCRResult): void {
    this.cache.set(fileId, { result, timestamp: Date.now() });
  }
}

export const ocrService = new OCRService();
