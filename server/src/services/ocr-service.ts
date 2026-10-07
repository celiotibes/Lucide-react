/**
 * OCR Service for Document Text Extraction
 *
 * Handles:
 * - Tesseract.js initialization with Portuguese/English support
 * - PDF text extraction using pdfjs-dist
 * - Image preprocessing using Sharp
 * - Invoice field detection and parsing
 * - Confidence scoring for extracted fields
 */

import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import sharp from "sharp";
import { logger } from "./logger-service.js";

// Configure pdfjs worker
try {
  const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
} catch (e) {
  // Worker not available in test environment, skip configuration
  if (process.env.NODE_ENV !== "test") {
    logger.warn("Failed to configure pdfjs worker:", e);
  }
}

/**
 * Invoice field types
 */
export interface ExtractedInvoiceField {
  field: string;
  value: string | null;
  confidence: number; // 0-100
  rawText?: string;
}

export interface ExtractedInvoice {
  fields: ExtractedInvoiceField[];
  overallConfidence: number;
  requiresManualReview: boolean;
  extractedText: string;
  documentType: "invoice" | "receipt" | "contract" | "unknown";
}

export interface OCRExtractionResult {
  success: boolean;
  text?: string;
  error?: string;
  processingTime: number;
}

/**
 * Invoice field patterns for extraction
 */
const INVOICE_PATTERNS = {
  // Supplier/Buyer identifiers
  cnpj: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
  cpf: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,

  // Invoice numbers and dates
  invoiceNumber: /(?:nf|nota|invoice|fatura)[\s-:]*[#]?[\s]*(\d{1,8})/gi,
  invoiceDate: /(?:data|date|emissão)[\s-:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi,
  dueDate: /(?:vencimento|due|vence)[\s-:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi,

  // Amount patterns
  amount: /(?:total|valor|amount|R\$|€|£|\$)[\s]*([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})/gi,

  // Line items (description)
  lineItem: /^[\s]*(.*?)[\s]+([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})[\s]*$/gm,
};

/**
 * Tesseract instance (singleton)
 */
let tesseractWorker: Tesseract.Worker | null = null;

/**
 * Initialize Tesseract worker with Portuguese and English support
 */
export async function initializeOCR(): Promise<void> {
  if (tesseractWorker) {
    return; // Already initialized
  }

  try {
    tesseractWorker = await Tesseract.createWorker({
      logger: (m) => {
        logger.debug(`[OCR] Tesseract progress: ${m.status}`, { progress: m.progress });
      },
    });

    // Load Portuguese and English language data
    await tesseractWorker.loadLanguage("por+eng");
    await tesseractWorker.initialize("por+eng");
    await tesseractWorker.setParameters({
      tessedit_char_whitelist: "",
    });

    logger.info("[OCR] Tesseract initialized successfully with Portuguese and English");
  } catch (error) {
    logger.error("[OCR] Failed to initialize Tesseract:", error);
    throw error;
  }
}

/**
 * Terminate Tesseract worker
 */
export async function terminateOCR(): Promise<void> {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
    logger.info("[OCR] Tesseract terminated");
  }
}

/**
 * Extract text from PDF using pdfjs-dist
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<OCRExtractionResult> {
  const startTime = Date.now();

  try {
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    let fullText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: unknown) => item.str || "")
        .join(" ");
      fullText += `[PAGE ${pageNum}]\n${pageText}\n\n`;
    }

    const processingTime = Date.now() - startTime;
    logger.info(`[OCR] PDF text extraction completed`, {
      pages: pdf.numPages,
      textLength: fullText.length,
      processingTime,
    });

    return {
      success: true,
      text: fullText,
      processingTime,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error("[OCR] PDF extraction failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processingTime,
    };
  }
}

/**
 * Preprocess image and extract text using Tesseract
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<OCRExtractionResult> {
  const startTime = Date.now();

  if (!tesseractWorker) {
    await initializeOCR();
  }

  try {
    // Preprocess image: increase contrast, apply threshold for better OCR
    const preprocessedImage = await sharp(imageBuffer)
      .grayscale()
      .normalize()
      .toBuffer();

    // Perform OCR
    const {
      data: { text },
    } = await tesseractWorker!.recognize(preprocessedImage);

    const processingTime = Date.now() - startTime;
    logger.info(`[OCR] Image OCR completed`, {
      textLength: text.length,
      processingTime,
    });

    return {
      success: true,
      text,
      processingTime,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error("[OCR] Image OCR failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processingTime,
    };
  }
}

/**
 * Calculate confidence score for a field based on pattern matching
 */
function calculateFieldConfidence(pattern: RegExp | null, text: string, found: boolean): number {
  if (!found) return 0;
  if (!pattern) return 50; // Default confidence if no pattern

  // Check if text clearly matches the expected format
  const match = pattern.test(text);
  return match ? 95 : 60;
}

/**
 * Detect document type from extracted text
 */
function detectDocumentType(text: string): "invoice" | "receipt" | "contract" | "unknown" {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes("nf-e") ||
    lowerText.includes("nota fiscal") ||
    lowerText.includes("invoice")
  ) {
    return "invoice";
  }

  if (
    lowerText.includes("recibo") ||
    lowerText.includes("receipt") ||
    lowerText.includes("comprovante")
  ) {
    return "receipt";
  }

  if (
    lowerText.includes("contrato") ||
    lowerText.includes("contract") ||
    lowerText.includes("agreement")
  ) {
    return "contract";
  }

  return "unknown";
}

/**
 * Extract structured data from raw OCR text
 */
export function extractStructuredData(text: string): ExtractedInvoice {
  const fields: ExtractedInvoiceField[] = [];

  try {
    // Extract CNPJ (Supplier)
    const cnpjMatch = text.match(INVOICE_PATTERNS.cnpj);
    const supplierCnpj = cnpjMatch ? cnpjMatch[0] : null;
    fields.push({
      field: "supplier_cnpj",
      value: supplierCnpj,
      confidence: calculateFieldConfidence(INVOICE_PATTERNS.cnpj, text, !!supplierCnpj),
      rawText: supplierCnpj || undefined,
    });

    // Extract CPF (if present - buyer)
    const cpfMatches = text.match(INVOICE_PATTERNS.cpf);
    const buyerCpf = cpfMatches ? cpfMatches[cpfMatches.length - 1] : null;
    fields.push({
      field: "buyer_cpf",
      value: buyerCpf,
      confidence: calculateFieldConfidence(INVOICE_PATTERNS.cpf, text, !!buyerCpf),
      rawText: buyerCpf || undefined,
    });

    // Extract Invoice Number
    const invoiceNumberMatch = text.match(INVOICE_PATTERNS.invoiceNumber);
    const invoiceNumber = invoiceNumberMatch ? invoiceNumberMatch[1] : null;
    fields.push({
      field: "invoice_number",
      value: invoiceNumber,
      confidence: calculateFieldConfidence(INVOICE_PATTERNS.invoiceNumber, text, !!invoiceNumber),
      rawText: invoiceNumberMatch ? invoiceNumberMatch[0] : undefined,
    });

    // Extract Invoice Date
    const invoiceDateMatch = text.match(INVOICE_PATTERNS.invoiceDate);
    const invoiceDate = invoiceDateMatch ? invoiceDateMatch[1] : null;
    fields.push({
      field: "invoice_date",
      value: invoiceDate,
      confidence: calculateFieldConfidence(INVOICE_PATTERNS.invoiceDate, text, !!invoiceDate),
      rawText: invoiceDateMatch ? invoiceDateMatch[0] : undefined,
    });

    // Extract Due Date
    const dueDateMatch = text.match(INVOICE_PATTERNS.dueDate);
    const dueDate = dueDateMatch ? dueDateMatch[1] : null;
    fields.push({
      field: "due_date",
      value: dueDate,
      confidence: calculateFieldConfidence(INVOICE_PATTERNS.dueDate, text, !!dueDate),
      rawText: dueDateMatch ? dueDateMatch[0] : undefined,
    });

    // Extract Total Amount
    const amountMatches = text.match(INVOICE_PATTERNS.amount);
    const totalAmount = amountMatches ? amountMatches[amountMatches.length - 1] : null;
    fields.push({
      field: "total_amount",
      value: totalAmount,
      confidence: calculateFieldConfidence(INVOICE_PATTERNS.amount, text, !!totalAmount),
      rawText: totalAmount || undefined,
    });

    // Extract Line Items
    const lineItemMatches = text.match(INVOICE_PATTERNS.lineItem);
    const description = lineItemMatches
      ? lineItemMatches
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
          .join("; ")
          .substring(0, 500)
      : null;
    fields.push({
      field: "description",
      value: description,
      confidence: calculateFieldConfidence(INVOICE_PATTERNS.lineItem, text, !!description),
      rawText: description || undefined,
    });

    // Calculate overall confidence
    const validFields = fields.filter((f) => f.value !== null);
    const overallConfidence =
      validFields.length > 0
        ? Math.round(
            validFields.reduce((sum, f) => sum + f.confidence, 0) / validFields.length
          )
        : 0;

    // Detect document type
    const documentType = detectDocumentType(text);

    return {
      fields,
      overallConfidence,
      requiresManualReview: overallConfidence < 75,
      extractedText: text,
      documentType,
    };
  } catch (error) {
    logger.error("[OCR] Error extracting structured data:", error);
    return {
      fields: [],
      overallConfidence: 0,
      requiresManualReview: true,
      extractedText: text,
      documentType: "unknown",
    };
  }
}

/**
 * Process document (PDF or Image) and extract text + structured data
 */
export async function processDocument(
  fileBuffer: Buffer,
  fileName: string
): Promise<ExtractedInvoice | null> {
  try {
    const extension = fileName.toLowerCase().split(".").pop() || "";

    let extractionResult: OCRExtractionResult;

    if (extension === "pdf") {
      extractionResult = await extractTextFromPDF(fileBuffer);
    } else if (["jpg", "jpeg", "png"].includes(extension)) {
      extractionResult = await extractTextFromImage(fileBuffer);
    } else {
      logger.error(`[OCR] Unsupported file type: ${extension}`);
      return null;
    }

    if (!extractionResult.success || !extractionResult.text) {
      logger.error(`[OCR] Text extraction failed for ${fileName}`, extractionResult.error);
      return null;
    }

    const structured = extractStructuredData(extractionResult.text);
    logger.info(`[OCR] Document processed: ${fileName}`, {
      confidence: structured.overallConfidence,
      documentType: structured.documentType,
      requiresReview: structured.requiresManualReview,
    });

    return structured;
  } catch (error) {
    logger.error("[OCR] Document processing failed:", error);
    return null;
  }
}

/**
 * Format extracted confidence scores for storage
 */
export function formatConfidenceScores(invoice: ExtractedInvoice): Record<string, number> {
  const scores: Record<string, number> = {
    overall: invoice.overallConfidence,
  };

  invoice.fields.forEach((field) => {
    scores[field.field] = field.confidence;
  });

  return scores;
}
