// src/modules/ged/document.service.ts
import crypto from 'crypto';
import { Database } from '@/database';
import { logger } from '@/utils';
import {
  Document,
  DocumentUploadRequest,
  DocumentSearchResult,
  DocumentVersion,
  ExtractedData,
  OCRResult,
} from './types';

export class GEDService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Upload de documento
   */
  async uploadDocument(
    userId: string,
    request: DocumentUploadRequest
  ): Promise<Document> {
    const documentId = crypto.randomUUID();
    const storagePath = `documents/${request.caseId}/${documentId}/${request.fileName}`;

    try {
      logger.info(`[GED] Iniciando upload de documento: ${request.fileName}`);

      // 1. Validar caso existe
      const caseCheck = await this.db.query(
        'SELECT id FROM cases WHERE id = $1',
        [request.caseId]
      );

      if (caseCheck.rows.length === 0) {
        throw new Error('Caso não encontrado');
      }

      // 2. Inserir documento
      const docResult = await this.db.query(
        `INSERT INTO documents (
          id, case_id, file_name, document_type, uploaded_by,
          file_size, mime_type, storage_path, status, searchable_content,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          documentId,
          request.caseId,
          request.fileName,
          request.documentType,
          userId,
          request.file.length,
          this.getMimeType(request.fileName),
          storagePath,
          'ACTIVE',
          request.fileName, // Inicialmente apenas o nome é pesquisável
          new Date(),
          new Date(),
        ]
      );

      // 3. Criar versão inicial
      await this.createVersion(
        documentId,
        userId,
        storagePath,
        'Versão inicial'
      );

      // 4. Adicionar tags
      if (request.tags && request.tags.length > 0) {
        await this.addTags(documentId, request.tags);
      }

      logger.info(
        `[GED] Documento ${documentId} enviado com sucesso (${request.file.length} bytes)`
      );

      return this.toDocumentDTO(docResult.rows[0]);
    } catch (error) {
      logger.error(`[GED] Erro ao fazer upload: ${error.message}`);
      throw error;
    }
  }

  /**
   * Processar OCR de documento
   * (Simplicidade: retorna sucesso, em prod usar tesseract.js)
   */
  async extractOCR(
    documentId: string
  ): Promise<OCRResult> {
    try {
      logger.info(`[GED] Iniciando OCR para documento ${documentId}`);

      // 1. Buscar documento
      const result = await this.db.query(
        'SELECT * FROM documents WHERE id = $1',
        [documentId]
      );

      if (result.rows.length === 0) {
        throw new Error('Documento não encontrado');
      }

      const doc = result.rows[0];

      // 2. Simular OCR (em prod, usar tesseract.js ou API)
      const ocrContent = `[OCR] Conteúdo extraído de ${doc.file_name}`;
      const confidence = 0.92; // Simulado

      // 3. Atualizar documento com conteúdo OCR
      await this.db.query(
        `UPDATE documents SET
          ocr_content = $1,
          searchable_content = CONCAT(file_name, ' ', $1),
          ocr_processed_at = $2
        WHERE id = $3`,
        [ocrContent, new Date(), documentId]
      );

      // 4. Extrair entidades (simplificado)
      const extractedData = await this.extractEntities(ocrContent);

      // 5. Atualizar extracted_data
      if (extractedData) {
        await this.db.query(
          `UPDATE documents SET extracted_data = $1 WHERE id = $2`,
          [JSON.stringify(extractedData), documentId]
        );
      }

      logger.info(`[GED] OCR concluído para ${documentId}`);

      return {
        documentId,
        content: ocrContent,
        confidence,
        language: 'pt-BR',
        processingTime: 2500, // Simulado
      };
    } catch (error) {
      logger.error(`[GED] Erro ao processar OCR: ${error.message}`);
      throw error;
    }
  }

  /**
   * Buscar documentos
   */
  async searchDocuments(
    query: string,
    caseId?: string,
    limit: number = 20
  ): Promise<DocumentSearchResult[]> {
    try {
      let sql = `
        SELECT
          id, file_name, document_type, created_at,
          ts_rank(to_tsvector('portuguese', searchable_content),
                  plainto_tsquery('portuguese', $1)) as relevance_score,
          SUBSTRING(searchable_content, 1, 100) as excerpt
        FROM documents
        WHERE to_tsvector('portuguese', searchable_content) @@
              plainto_tsquery('portuguese', $1)
        AND status = 'ACTIVE'
      `;

      const params: any[] = [query];

      if (caseId) {
        sql += ` AND case_id = $2`;
        params.push(caseId);
      }

      sql += ` ORDER BY relevance_score DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(sql, params);

      return result.rows.map(row => ({
        id: row.id,
        fileName: row.file_name,
        documentType: row.document_type,
        uploadedAt: row.created_at,
        relevanceScore: row.relevance_score || 0,
        excerpt: row.excerpt,
      }));
    } catch (error) {
      logger.error(`[GED] Erro ao buscar documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Listar documentos de um caso
   */
  async listDocumentsByCase(caseId: string): Promise<Document[]> {
    const result = await this.db.query(
      `SELECT * FROM documents WHERE case_id = $1 AND status = 'ACTIVE'
       ORDER BY created_at DESC`,
      [caseId]
    );

    return Promise.all(
      result.rows.map(row => this.toDocumentDTO(row))
    );
  }

  /**
   * Criar versão de documento
   */
  async createVersion(
    documentId: string,
    userId: string,
    storagePath: string,
    changes?: string
  ): Promise<DocumentVersion> {
    // Obter número de versão
    const countResult = await this.db.query(
      'SELECT COUNT(*) as count FROM document_versions WHERE document_id = $1',
      [documentId]
    );

    const versionNumber = (countResult.rows[0].count || 0) + 1;

    const result = await this.db.query(
      `INSERT INTO document_versions (
        id, document_id, version_number, created_by, storage_path, changes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        crypto.randomUUID(),
        documentId,
        versionNumber,
        userId,
        storagePath,
        changes || null,
        new Date(),
      ]
    );

    return {
      id: result.rows[0].id,
      documentId: result.rows[0].document_id,
      versionNumber: result.rows[0].version_number,
      createdAt: result.rows[0].created_at,
      createdBy: result.rows[0].created_by,
      changes: result.rows[0].changes,
      storagePath: result.rows[0].storage_path,
    };
  }

  /**
   * Adicionar tags ao documento
   */
  private async addTags(
    documentId: string,
    tags: string[]
  ): Promise<void> {
    for (const tag of tags) {
      await this.db.query(
        `INSERT INTO document_tags (document_id, tag, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [documentId, tag.toLowerCase(), new Date()]
      );
    }
  }

  /**
   * Extrair entidades de documento (simplificado)
   */
  private async extractEntities(content: string): Promise<ExtractedData | null> {
    try {
      // Simplificado: buscar padrões básicos
      const datePattern = /\d{1,2}\/\d{1,2}\/\d{4}/g;
      const currencyPattern = /R\$\s*[\d.,]+/g;

      const dates = (content.match(datePattern) || []).map(
        d => new Date(d.split('/').reverse().join('-'))
      );

      const amounts = (content.match(currencyPattern) || []).map(a =>
        parseFloat(a.replace(/[^\d,]/g, '').replace(',', '.'))
      );

      return {
        dates,
        parties: [],
        amount: amounts[0] || undefined,
        judges: [],
        keyPhrases: [],
      };
    } catch (error) {
      logger.warn(`[GED] Erro ao extrair entidades: ${error.message}`);
      return null;
    }
  }

  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      txt: 'text/plain',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  private async toDocumentDTO(row: any): Promise<Document> {
    // Buscar versões
    const versionsResult = await this.db.query(
      `SELECT * FROM document_versions WHERE document_id = $1
       ORDER BY version_number ASC`,
      [row.id]
    );

    const versions = versionsResult.rows.map(v => ({
      id: v.id,
      documentId: v.document_id,
      versionNumber: v.version_number,
      createdAt: v.created_at,
      createdBy: v.created_by,
      changes: v.changes,
      storagePath: v.storage_path,
    }));

    // Buscar tags
    const tagsResult = await this.db.query(
      'SELECT tag FROM document_tags WHERE document_id = $1',
      [row.id]
    );

    const tags = tagsResult.rows.map(t => t.tag);

    return {
      id: row.id,
      caseId: row.case_id,
      fileName: row.file_name,
      documentType: row.document_type,
      uploadedAt: row.created_at,
      uploadedBy: row.uploaded_by,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      storagePath: row.storage_path,
      status: row.status,
      tags,
      extractedData: row.extracted_data ? JSON.parse(row.extracted_data) : undefined,
      ocrContent: row.ocr_content,
      searchableContent: row.searchable_content,
      versions,
    };
  }
}
