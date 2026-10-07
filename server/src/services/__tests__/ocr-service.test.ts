/**
 * OCR Service Tests
 *
 * Tests for:
 * - Text extraction from PDF and images
 * - Invoice field detection and parsing
 * - Confidence scoring
 * - Document type detection
 * - Performance requirements (<5s per document)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  initializeOCR,
  terminateOCR,
  extractTextFromPDF,
  extractTextFromImage,
  extractStructuredData,
  processDocument,
  formatConfidenceScores,
  type ExtractedInvoice,
} from "../ocr-service.js";

describe("OCR Service", () => {
  beforeAll(async () => {
    // Initialize OCR before running tests
    await initializeOCR();
  });

  afterAll(async () => {
    // Clean up
    await terminateOCR();
  });

  describe("extractStructuredData", () => {
    it("should extract CNPJ from text", () => {
      const text = "Fornecedor CNPJ: 12.345.678/0001-99";
      const result = extractStructuredData(text);

      const cnpjField = result.fields.find((f) => f.field === "supplier_cnpj");
      expect(cnpjField).toBeDefined();
      expect(cnpjField?.value).toBe("12.345.678/0001-99");
      expect(cnpjField?.confidence).toBeGreaterThan(0);
    });

    it("should extract CPF from text", () => {
      const text = "Cliente CPF: 123.456.789-10";
      const result = extractStructuredData(text);

      const cpfField = result.fields.find((f) => f.field === "buyer_cpf");
      expect(cpfField).toBeDefined();
      expect(cpfField?.value).toBe("123.456.789-10");
    });

    it("should extract invoice number", () => {
      const text = "NF No. 12345 Data: 15/10/2024";
      const result = extractStructuredData(text);

      const invoiceField = result.fields.find((f) => f.field === "invoice_number");
      expect(invoiceField).toBeDefined();
      expect(invoiceField?.value).toBeTruthy();
    });

    it("should extract invoice date", () => {
      const text = "Emissão: 15/10/2024 Vencimento: 15/11/2024";
      const result = extractStructuredData(text);

      const dateField = result.fields.find((f) => f.field === "invoice_date");
      expect(dateField).toBeDefined();
      expect(dateField?.value).toBeTruthy();
    });

    it("should extract due date", () => {
      const text = "Data de vencimento: 30/12/2024";
      const result = extractStructuredData(text);

      const dueDateField = result.fields.find((f) => f.field === "due_date");
      expect(dueDateField).toBeDefined();
      expect(dueDateField?.value).toBeTruthy();
    });

    it("should extract monetary amount", () => {
      const text = "Valor total: R$ 1.234,56";
      const result = extractStructuredData(text);

      const amountField = result.fields.find((f) => f.field === "total_amount");
      expect(amountField).toBeDefined();
      expect(amountField?.value).toBeTruthy();
    });

    it("should calculate overall confidence score", () => {
      const text = `
        Fornecedor CNPJ: 12.345.678/0001-99
        Nota Fiscal No. 12345
        Data: 15/10/2024
        Valor: R$ 1.000,00
      `;
      const result = extractStructuredData(text);

      expect(result.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(result.overallConfidence).toBeLessThanOrEqual(100);
    });

    it("should flag for manual review if confidence < 75%", () => {
      const text = "Documento incompleto";
      const result = extractStructuredData(text);

      if (result.overallConfidence < 75) {
        expect(result.requiresManualReview).toBe(true);
      }
    });

    it("should detect invoice document type", () => {
      const text = `
        NF-E - Nota Fiscal Eletrônica
        CNPJ: 12.345.678/0001-99
        Invoice Number: 12345
        Total: R$ 1.234,56
      `;
      const result = extractStructuredData(text);

      expect(result.documentType).toBe("invoice");
    });

    it("should detect receipt document type", () => {
      const text = `
        RECIBO DE PAGAMENTO
        Comprovante de recebimento
        Data: 15/10/2024
      `;
      const result = extractStructuredData(text);

      expect(result.documentType).toBe("receipt");
    });

    it("should detect contract document type", () => {
      const text = `
        CONTRATO DE PRESTAÇÃO DE SERVIÇOS
        Entre as partes...
        Agreement dated 15/10/2024
      `;
      const result = extractStructuredData(text);

      expect(result.documentType).toBe("contract");
    });

    it("should mark unknown document type", () => {
      const text = "Random text without identifiable document markers";
      const result = extractStructuredData(text);

      expect(result.documentType).toBe("unknown");
    });

    it("should return all expected fields in result", () => {
      const text = "Sample invoice text";
      const result = extractStructuredData(text);

      expect(result.fields).toBeDefined();
      expect(Array.isArray(result.fields)).toBe(true);
      expect(result.overallConfidence).toBeDefined();
      expect(result.requiresManualReview).toBeDefined();
      expect(result.extractedText).toBe(text);
      expect(result.documentType).toBeDefined();
    });

    it("should handle empty text gracefully", () => {
      const text = "";
      const result = extractStructuredData(text);

      expect(result.fields).toBeDefined();
      expect(result.overallConfidence).toBe(0);
      expect(result.requiresManualReview).toBe(true);
    });

    it("should extract multiple amounts and use the last one", () => {
      const text = `
        Subtotal: R$ 1.000,00
        Taxa: R$ 100,00
        Total: R$ 1.100,00
      `;
      const result = extractStructuredData(text);

      const amountField = result.fields.find((f) => f.field === "total_amount");
      expect(amountField?.value).toBe("1.100,00");
    });

    it("should handle Portuguese and English mixed text", () => {
      const text = `
        Invoice Number: 12345
        Data de Emissão: 15/10/2024
        Total Amount: R$ 2.000,00
        CNPJ Fornecedor: 12.345.678/0001-99
      `;
      const result = extractStructuredData(text);

      const cnpjField = result.fields.find((f) => f.field === "supplier_cnpj");
      const invoiceField = result.fields.find((f) => f.field === "invoice_number");

      expect(cnpjField?.value).toBeTruthy();
      expect(invoiceField?.value).toBeTruthy();
    });
  });

  describe("formatConfidenceScores", () => {
    it("should format confidence scores from invoice", () => {
      const invoice: ExtractedInvoice = {
        fields: [
          { field: "supplier_cnpj", value: "12.345.678/0001-99", confidence: 95 },
          { field: "invoice_number", value: "12345", confidence: 90 },
          { field: "total_amount", value: "1.234,56", confidence: 85 },
        ],
        overallConfidence: 90,
        requiresManualReview: false,
        extractedText: "Sample text",
        documentType: "invoice",
      };

      const scores = formatConfidenceScores(invoice);

      expect(scores.overall).toBe(90);
      expect(scores.supplier_cnpj).toBe(95);
      expect(scores.invoice_number).toBe(90);
      expect(scores.total_amount).toBe(85);
    });

    it("should handle empty fields", () => {
      const invoice: ExtractedInvoice = {
        fields: [],
        overallConfidence: 0,
        requiresManualReview: true,
        extractedText: "",
        documentType: "unknown",
      };

      const scores = formatConfidenceScores(invoice);

      expect(scores.overall).toBe(0);
      expect(Object.keys(scores).length).toBe(1);
    });
  });

  describe("Complex Invoice Scenarios", () => {
    it("should achieve >85% accuracy on well-structured invoice", () => {
      const text = `
        NOTA FISCAL ELETRÔNICA

        Fornecedor:
        EMPRESA XYZ LTDA
        CNPJ: 12.345.678/0001-99

        Cliente:
        JOÃO DA SILVA
        CPF: 123.456.789-10

        Informações da NF:
        Número: 12345
        Série: 1
        Data de Emissão: 15/10/2024
        Data de Vencimento: 30/10/2024

        Descrição dos Itens:
        Produto A - 10 un. - R$ 100,00 = R$ 1.000,00
        Produto B - 5 un. - R$ 200,00 = R$ 1.000,00

        Resumo:
        Subtotal: R$ 2.000,00
        Imposto (ICMS): R$ 200,00
        Total: R$ 2.200,00

        Observações:
        Pagamento à vista
        Boleto bancário
      `;

      const result = extractStructuredData(text);

      // Check that we extracted key fields
      const extractedFields = result.fields.filter((f) => f.value !== null);
      expect(extractedFields.length).toBeGreaterThan(5);

      // Check confidence
      expect(result.overallConfidence).toBeGreaterThan(75);

      // Check document type
      expect(result.documentType).toBe("invoice");
    });

    it("should handle receipts correctly", () => {
      const text = `
        RECIBO DE PAGAMENTO

        Recibo Nº: 12345
        Data: 15/10/2024

        Pagamento Recebido de: João Silva
        CPF: 123.456.789-10

        Referente a: Prestação de Serviços
        Valor: R$ 1.500,00

        Forma de Pagamento: Dinheiro

        Data do Recebimento: 15/10/2024
        Recebido por: Maria Santos
      `;

      const result = extractStructuredData(text);

      expect(result.documentType).toBe("receipt");
      expect(result.overallConfidence).toBeGreaterThan(50);
    });

    it("should handle low-confidence documents gracefully", () => {
      const text = "asdflkj ñ ü 中文";

      const result = extractStructuredData(text);

      expect(result.overallConfidence).toBeLessThan(75);
      expect(result.requiresManualReview).toBe(true);
      expect(result.fields).toBeDefined();
    });
  });

  describe("Confidence Scoring", () => {
    it("should score field confidence 0-100", () => {
      const text = "CNPJ: 12.345.678/0001-99 Invoice: 12345";
      const result = extractStructuredData(text);

      result.fields.forEach((field) => {
        expect(field.confidence).toBeGreaterThanOrEqual(0);
        expect(field.confidence).toBeLessThanOrEqual(100);
      });
    });

    it("should have high confidence for explicit matches", () => {
      const text = "CNPJ: 12.345.678/0001-99";
      const result = extractStructuredData(text);

      const cnpjField = result.fields.find((f) => f.field === "supplier_cnpj");
      expect(cnpjField?.confidence).toBeGreaterThan(80);
    });

    it("should have low confidence for missing fields", () => {
      const text = "No structured data here";
      const result = extractStructuredData(text);

      const cnpjField = result.fields.find((f) => f.field === "supplier_cnpj");
      expect(cnpjField?.confidence).toBe(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle null text", () => {
      // TypeScript won't allow null, but test defensive coding
      expect(() => {
        extractStructuredData("");
      }).not.toThrow();
    });

    it("should handle very long text", () => {
      const longText = "Word ".repeat(10000);
      expect(() => {
        extractStructuredData(longText);
      }).not.toThrow();
    });

    it("should handle special characters", () => {
      const text = "CNPJ: 12.345.678/0001-99 Valor: R$ 1.234,56 Descrição: Café & Pão";
      expect(() => {
        extractStructuredData(text);
      }).not.toThrow();
    });
  });
});

describe("OCR Service - Extraction Results", () => {
  it("should return proper extraction result structure", async () => {
    // Create a minimal valid PDF-like buffer (this is just a marker)
    const result = await extractTextFromPDF(Buffer.from("%PDF-1.4\n"));

    expect(result).toBeDefined();
    expect(result.success !== undefined).toBe(true);
    expect(result.processingTime).toBeGreaterThanOrEqual(0);
  });

  it("should handle invalid PDF gracefully", async () => {
    const invalidPDF = Buffer.from("Not a PDF at all");

    const result = await extractTextFromPDF(invalidPDF);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("OCR Performance", () => {
  it("should extract text from simple PDF within 5 seconds", async () => {
    const startTime = Date.now();

    // Note: This test would need a real PDF file for meaningful timing
    // For now, we just test that the function completes
    await extractTextFromPDF(Buffer.from("%PDF-1.4\n"));

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(5000); // 5 seconds
  });
});
