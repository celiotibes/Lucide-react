/**
 * OCR Document Routes
 *
 * Handles OCR text extraction and invoice field parsing workflow:
 * - POST /api/documentos/upload — Upload and trigger OCR extraction
 * - GET /api/documentos/:id/extraction — Fetch OCR results
 * - POST /api/documentos/:id/approve — Bulk approve extraction
 * - POST /api/documentos/:id/reject — Reject extraction
 * - POST /api/documentos/:id/fields/:fieldName/correct — Correct individual field
 *
 * Integrates with:
 * - importacao_lotes: Document metadata and upload info
 * - document_extractions: OCR results and confidence scores
 * - extraction_fields: Individual field data
 * - extraction_reviews: Manual review audit trail
 */

import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { logger } from "../services/logger-service.js";
import { initializeOCR, processDocument, formatConfidenceScores } from "../services/ocr-service.js";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";

interface AuthRequest extends Request {
  auth?: {
    usuario?: {
      id: string;
    };
  };
}

export interface OCRDocumentRoutesOptions {
  authService: AuthServiceDB;
  db: Database.Database;
}

/**
 * Generate UUID v4 (simplified, no external dependency)
 */
function gerarUUID(): string {
  const chars = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4";
    } else if (i === 19) {
      uuid += chars[(Math.random() * 4) | 8];
    } else {
      uuid += chars[Math.random() * 16 | 0];
    }
  }
  return uuid;
}

/**
 * Get file buffer from lote_id
 */
function getFileBufferFromLote(db: Database.Database, loteId: string): Buffer | null {
  try {
    // In a real implementation, the file would be stored in a blob table
    // For now, we return null (would need file storage implementation)
    // This is a placeholder for demonstration
    const stmt = db.prepare(`
      SELECT arquivo_nome, tipo FROM importacao_lotes WHERE id = ?
    `);
    const lote = stmt.get(loteId) as unknown;
    if (!lote) {
      logger.warn(`[OCR] Lote not found: ${loteId}`);
      return null;
    }
    return null; // Would need proper file storage
  } catch (error) {
    logger.error("[OCR] Failed to retrieve file from lote:", error);
    return null;
  }
}

/**
 * Store extraction results in database
 */
function storeExtractionResults(
  db: Database.Database,
  loteId: string,
  usuarioId: string,
  invoice: unknown
): string {
  const extractionId = gerarUUID();
  const agora = new Date().toISOString();

  try {
    // Start transaction
    const insertExtraction = db.prepare(`
      INSERT INTO document_extractions (
        id, lote_id, usuario_id, document_type, extraction_status,
        extracted_text, extracted_text_length,
        confidence_scores, overall_confidence,
        requires_manual_review, manual_review_flag_reason,
        cnpj_extraido, cpf_extraido, numero_nf_extraido,
        data_nf_extraida, valor_extraido,
        criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const confidenceScores = formatConfidenceScores(invoice);

    insertExtraction.run(
      extractionId,
      loteId,
      usuarioId,
      invoice.documentType,
      "COMPLETED",
      invoice.extractedText,
      invoice.extractedText.length,
      JSON.stringify(confidenceScores),
      invoice.overallConfidence,
      invoice.requiresManualReview ? 1 : 0,
      invoice.requiresManualReview
        ? `Low confidence: ${invoice.overallConfidence}% < 75% threshold`
        : null,
      invoice.fields.find((f: unknown) => f.field === "supplier_cnpj")?.value || null,
      invoice.fields.find((f: unknown) => f.field === "buyer_cpf")?.value || null,
      invoice.fields.find((f: unknown) => f.field === "invoice_number")?.value || null,
      invoice.fields.find((f: unknown) => f.field === "invoice_date")?.value || null,
      invoice.fields.find((f: unknown) => f.field === "total_amount")?.value || null,
      agora,
      agora
    );

    // Store individual field extractions
    const insertField = db.prepare(`
      INSERT INTO extraction_fields (
        id, extraction_id, lote_id, field_name, field_value,
        field_confidence, raw_text, is_valid, criado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const field of invoice.fields) {
      const fieldId = gerarUUID();
      insertField.run(
        fieldId,
        extractionId,
        loteId,
        field.field,
        field.value,
        field.confidence,
        field.rawText || null,
        field.value ? 1 : 0,
        agora
      );
    }

    logger.info(`[OCR] Extraction stored successfully`, {
      extractionId,
      loteId,
      confidence: invoice.overallConfidence,
      documentType: invoice.documentType,
    });

    return extractionId;
  } catch (error) {
    logger.error("[OCR] Failed to store extraction results:", error);
    throw error;
  }
}

/**
 * Trigger OCR extraction for a lote (asynchronous)
 */
async function triggerOCRExtraction(
  db: Database.Database,
  loteId: string,
  usuarioId: string,
  fileBuffer: Buffer,
  fileName: string
): Promise<string | null> {
  try {
    // Initialize OCR on first use
    await initializeOCR();

    // Process document
    const invoice = await processDocument(fileBuffer, fileName);

    if (!invoice) {
      logger.error("[OCR] Document processing returned null");
      return null;
    }

    // Store results
    const extractionId = storeExtractionResults(db, loteId, usuarioId, invoice);
    return extractionId;
  } catch (error) {
    logger.error("[OCR] Extraction trigger failed:", error);
    return null;
  }
}

/**
 * Create OCR document routes
 */
export function criarRotasOCRDocumento(options: OCRDocumentRoutesOptions): Router {
  const router = Router();
  const { authService, db } = options;
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  /**
   * GET /api/documentos/:id/extraction
   * Fetch OCR extraction results for a document/lote
   *
   * Returns:
   * - 200: Extraction results with confidence scores
   * - 404: Extraction not found
   * - 500: Server error
   */
  router.get("/documentos/:id/extraction", exigirAutenticacao, async (req: AuthRequest, res: Response) => {
    try {
      const loteId = req.params.id;
      const usuarioId = req.auth?.usuario?.id;

      if (!usuarioId) {
        return res.status(401).json({
          sucesso: false,
          erro: "Usuário não autenticado",
        });
      }

      // Verify lote belongs to user
      const loteStmt = db.prepare(
        "SELECT * FROM importacao_lotes WHERE id = ? AND usuario_id = ?"
      );
      const lote = loteStmt.get(loteId) as unknown;

      if (!lote) {
        return res.status(404).json({
          sucesso: false,
          erro: "Documento não encontrado",
        });
      }

      // Get extraction
      const extractionStmt = db.prepare(
        "SELECT * FROM document_extractions WHERE lote_id = ? LIMIT 1"
      );
      const extraction = extractionStmt.get(loteId) as unknown;

      if (!extraction) {
        return res.status(404).json({
          sucesso: false,
          erro: "Extração OCR não encontrada",
        });
      }

      // Get extraction fields
      const fieldsStmt = db.prepare(
        "SELECT * FROM extraction_fields WHERE extraction_id = ? ORDER BY field_name"
      );
      const fields = fieldsStmt.all(extraction.id) as unknown[];

      const confidenceScores = extraction.confidence_scores
        ? JSON.parse(extraction.confidence_scores)
        : {};

      return res.status(200).json({
        sucesso: true,
        extracao: {
          id: extraction.id,
          lote_id: extraction.lote_id,
          documento_tipo: extraction.document_type,
          status: extraction.extraction_status,
          confianca_geral: extraction.overall_confidence,
          requer_revisao: extraction.requires_manual_review === 1,
          texto_extraido_tamanho: extraction.extracted_text_length,
          campos: fields.map((f: unknown) => ({
            nome: f.field_name,
            valor: f.field_value,
            confianca: f.field_confidence,
            correto_por: f.corrected_by,
            valor_corrigido: f.corrected_value,
          })),
          confiancas: confidenceScores,
          criado_em: extraction.criado_em,
          aprovado_em: extraction.aprovado_em,
        },
      });
    } catch (erro) {
      logger.error("[OCR] GET /documentos/:id/extraction failed:", erro);
      return res.status(500).json({
        sucesso: false,
        erro: "Erro ao buscar extração",
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * POST /api/documentos/:id/approve
   * Bulk approve extraction results
   *
   * Body: { motivo?: string }
   *
   * Returns:
   * - 200: Extraction approved
   * - 404: Extraction not found
   * - 500: Server error
   */
  router.post(
    "/documentos/:id/approve",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const loteId = req.params.id;
        const usuarioId = req.auth?.usuario?.id;
        const { motivo } = req.body as { motivo?: string };

        if (!usuarioId) {
          return res.status(401).json({
            sucesso: false,
            erro: "Usuário não autenticado",
          });
        }

        // Get extraction
        const extractionStmt = db.prepare(
          "SELECT * FROM document_extractions WHERE lote_id = ?"
        );
        const extraction = extractionStmt.get(loteId) as unknown;

        if (!extraction) {
          return res.status(404).json({
            sucesso: false,
            erro: "Extração não encontrada",
          });
        }

        const agora = new Date().toISOString();

        // Update extraction
        const updateExtraction = db.prepare(`
          UPDATE document_extractions
          SET aprovado_por = ?, aprovado_em = ?, atualizado_em = ?
          WHERE id = ?
        `);

        updateExtraction.run(usuarioId, agora, agora, extraction.id);

        // Record review
        const reviewId = gerarUUID();
        const insertReview = db.prepare(`
          INSERT INTO extraction_reviews (
            id, extraction_id, usuario_id, review_type, action, notes, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertReview.run(
          reviewId,
          extraction.id,
          usuarioId,
          "BULK_APPROVAL",
          "APPROVED",
          motivo || null,
          agora
        );

        logger.info(`[OCR] Extraction approved`, {
          extractionId: extraction.id,
          loteId,
          approvedBy: usuarioId,
        });

        return res.status(200).json({
          sucesso: true,
          mensagem: "Extração aprovada com sucesso",
          extracao_id: extraction.id,
        });
      } catch (erro) {
        logger.error("[OCR] POST /documentos/:id/approve failed:", erro);
        return res.status(500).json({
          sucesso: false,
          erro: "Erro ao aprovar extração",
          detalhes: erro instanceof Error ? erro.message : String(erro),
        });
      }
    }
  );

  /**
   * POST /api/documentos/:id/reject
   * Reject extraction results
   *
   * Body: { motivo: string (required) }
   *
   * Returns:
   * - 200: Extraction rejected
   * - 400: Missing reason
   * - 404: Extraction not found
   * - 500: Server error
   */
  router.post(
    "/documentos/:id/reject",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const loteId = req.params.id;
        const usuarioId = req.auth?.usuario?.id;
        const { motivo } = req.body as { motivo?: string };

        if (!usuarioId) {
          return res.status(401).json({
            sucesso: false,
            erro: "Usuário não autenticado",
          });
        }

        if (!motivo) {
          return res.status(400).json({
            sucesso: false,
            erro: "Motivo da rejeição é obrigatório",
          });
        }

        // Get extraction
        const extractionStmt = db.prepare(
          "SELECT * FROM document_extractions WHERE lote_id = ?"
        );
        const extraction = extractionStmt.get(loteId) as unknown;

        if (!extraction) {
          return res.status(404).json({
            sucesso: false,
            erro: "Extração não encontrada",
          });
        }

        const agora = new Date().toISOString();

        // Update extraction
        const updateExtraction = db.prepare(`
          UPDATE document_extractions
          SET rejeitado_por = ?, rejeitado_em = ?, motivo_rejeicao = ?, atualizado_em = ?
          WHERE id = ?
        `);

        updateExtraction.run(usuarioId, agora, motivo, agora, extraction.id);

        // Record review
        const reviewId = gerarUUID();
        const insertReview = db.prepare(`
          INSERT INTO extraction_reviews (
            id, extraction_id, usuario_id, review_type, action, notes, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertReview.run(
          reviewId,
          extraction.id,
          usuarioId,
          "BULK_REJECTION",
          "REJECTED",
          motivo,
          agora
        );

        logger.info(`[OCR] Extraction rejected`, {
          extractionId: extraction.id,
          loteId,
          rejectedBy: usuarioId,
          reason: motivo,
        });

        return res.status(200).json({
          sucesso: true,
          mensagem: "Extração rejeitada com sucesso",
          extracao_id: extraction.id,
        });
      } catch (erro) {
        logger.error("[OCR] POST /documentos/:id/reject failed:", erro);
        return res.status(500).json({
          sucesso: false,
          erro: "Erro ao rejeitar extração",
          detalhes: erro instanceof Error ? erro.message : String(erro),
        });
      }
    }
  );

  /**
   * POST /api/documentos/:id/fields/:fieldName/correct
   * Correct individual extracted field
   *
   * Body: { valor_corrigido: string, notas?: string }
   *
   * Returns:
   * - 200: Field corrected
   * - 404: Field not found
   * - 500: Server error
   */
  router.post(
    "/documentos/:id/fields/:fieldName/correct",
    exigirAutenticacao,
    async (req: AuthRequest, res: Response) => {
      try {
        const loteId = req.params.id;
        const fieldName = req.params.fieldName;
        const usuarioId = req.auth?.usuario?.id;
        const { valor_corrigido, notas } = req.body as {
          valor_corrigido?: string;
          notas?: string;
        };

        if (!usuarioId) {
          return res.status(401).json({
            sucesso: false,
            erro: "Usuário não autenticado",
          });
        }

        if (!valor_corrigido) {
          return res.status(400).json({
            sucesso: false,
            erro: "Valor corrigido é obrigatório",
          });
        }

        // Get extraction
        const extractionStmt = db.prepare(
          "SELECT id FROM document_extractions WHERE lote_id = ? LIMIT 1"
        );
        const extraction = extractionStmt.get(loteId) as unknown;

        if (!extraction) {
          return res.status(404).json({
            sucesso: false,
            erro: "Extração não encontrada",
          });
        }

        // Get field
        const fieldStmt = db.prepare(
          "SELECT * FROM extraction_fields WHERE extraction_id = ? AND field_name = ? LIMIT 1"
        );
        const field = fieldStmt.get(extraction.id, fieldName) as unknown;

        if (!field) {
          return res.status(404).json({
            sucesso: false,
            erro: `Campo não encontrado: ${fieldName}`,
          });
        }

        const agora = new Date().toISOString();

        // Update field with correction
        const updateField = db.prepare(`
          UPDATE extraction_fields
          SET corrected_by = ?, corrected_value = ?, corrected_em = ?, correction_notes = ?
          WHERE id = ?
        `);

        updateField.run(usuarioId, valor_corrigido, agora, notas || null, field.id);

        // Record review
        const reviewId = gerarUUID();
        const insertReview = db.prepare(`
          INSERT INTO extraction_reviews (
            id, extraction_id, usuario_id, review_type, action, reviewed_fields, notes, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertReview.run(
          reviewId,
          extraction.id,
          usuarioId,
          "INDIVIDUAL_CORRECTION",
          "CORRECTIONS_MADE",
          JSON.stringify([fieldName]),
          notas || null,
          agora
        );

        logger.info(`[OCR] Field corrected`, {
          extractionId: extraction.id,
          fieldName,
          correctedBy: usuarioId,
        });

        return res.status(200).json({
          sucesso: true,
          mensagem: "Campo corrigido com sucesso",
          campo: fieldName,
          valor_novo: valor_corrigido,
        });
      } catch (erro) {
        logger.error("[OCR] POST /documentos/:id/fields/:fieldName/correct failed:", erro);
        return res.status(500).json({
          sucesso: false,
          erro: "Erro ao corrigir campo",
          detalhes: erro instanceof Error ? erro.message : String(erro),
        });
      }
    }
  );

  return router;
}
