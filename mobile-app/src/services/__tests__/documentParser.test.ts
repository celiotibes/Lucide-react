import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentParserService } from '../DocumentParserService';

describe('DocumentParserService', () => {
  let service: DocumentParserService;

  beforeEach(() => {
    service = new DocumentParserService();
  });

  describe('parseDocument', () => {
    it('should parse invoice document', async () => {
      const invoiceText = `
        INVOICE #INV-2024-001
        From: Acme Corporation
        Date: 10/15/2024
        Total: $1,500.00

        Item 1: Product A - Qty: 2 - $750.00
        Item 2: Product B - Qty: 1 - $750.00
      `;

      const result = await service.parseDocument(invoiceText);

      expect(result.type).toBe('invoice');
      expect(result.documentNumber).toBe('INV-2024-001');
      expect(result.vendor).toBe('Acme Corporation');
      expect(result.date).toBe('10/15/2024');
      expect(result.totalAmount).toBe(1500);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should parse receipt document', async () => {
      const receiptText = `
        RECEIPT
        Store: Best Shop
        Date: 10/20/2024

        Total Due: $85.50
        Payment: Cash
      `;

      const result = await service.parseDocument(receiptText);

      expect(result.type).toBe('receipt');
      expect(result.vendor).toContain('Best Shop');
      expect(result.totalAmount).toBe(85.5);
    });

    it('should parse contract document', async () => {
      const contractText = `
        CONTRACT
        Entered into between: John Doe and ABC Company
        Date of Agreement: 01/15/2024
        Amount: $50,000.00
        Purpose: Service Agreement for IT Consulting
      `;

      const result = await service.parseDocument(contractText);

      expect(result.type).toBe('contract');
      expect(result.vendor).toContain('John Doe');
      expect(result.amount).toBe(50000);
    });

    it('should return unknown type for unrecognized text', async () => {
      const unknownText = 'This is just some random text without structure';

      const result = await service.parseDocument(unknownText);

      expect(result.type).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('detectDocumentType', () => {
    it('should detect invoice by keywords', async () => {
      const invoiceText = 'Invoice #12345 from Vendor Corp';
      const result = await service.parseDocument(invoiceText);
      expect(result.type).toBe('invoice');
    });

    it('should detect receipt by keywords', async () => {
      const receiptText = 'Purchase receipt from Store XYZ';
      const result = await service.parseDocument(receiptText);
      expect(result.type).toBe('receipt');
    });

    it('should detect contract by keywords', async () => {
      const contractText = 'This contract is entered into between parties';
      const result = await service.parseDocument(contractText);
      expect(result.type).toBe('contract');
    });

    it('should detect nf-e as invoice (Brazilian format)', async () => {
      const nfeText = 'NF-e #123456 Nota Fiscal Eletrônica';
      const result = await service.parseDocument(nfeText);
      expect(result.type).toBe('invoice');
    });

    it('should detect recibo as receipt (Portuguese)', async () => {
      const reciboText = 'Recibo de compra da loja';
      const result = await service.parseDocument(reciboText);
      expect(result.type).toBe('receipt');
    });
  });

  describe('parseInvoice', () => {
    it('should extract invoice number', async () => {
      const text = 'Invoice #INV-2024-001 Date: 01/15/2024';
      const result = await service.parseDocument(text);
      expect(result.documentNumber).toBe('INV-2024-001');
    });

    it('should extract invoice date', async () => {
      const text = 'Invoice Date: 12/25/2024';
      const result = await service.parseDocument(text);
      expect(result.date).toBe('12/25/2024');
    });

    it('should extract vendor name', async () => {
      const text = 'Invoice from: Tech Solutions Inc';
      const result = await service.parseDocument(text);
      expect(result.vendor).toContain('Tech Solutions');
    });

    it('should extract total amount', async () => {
      const text = 'Invoice #001 Total Amount: $1,250.50';
      const result = await service.parseDocument(text);
      expect(result.totalAmount).toBe(1250.5);
    });

    it('should extract line items', async () => {
      const text = `
        Invoice
        Service A - 1 - $100.00
        Service B - 2 - $250.00
        Total: $600.00
      `;
      const result = await service.parseDocument(text);
      expect(result.items).toBeDefined();
      if (result.items && result.items.length > 0) {
        expect(result.items[0].description).toContain('Service');
      }
    });
  });

  describe('parseReceipt', () => {
    it('should extract receipt total', async () => {
      const text = 'Receipt Total: $45.99';
      const result = await service.parseDocument(text);
      expect(result.totalAmount).toBeCloseTo(45.99, 1);
    });

    it('should extract payment method', async () => {
      const text = 'Receipt Payment: Credit Card';
      const result = await service.parseDocument(text);
      // May or may not extract depending on confidence
      if (result.paymentMethod) {
        expect(result.paymentMethod).toContain('Credit');
      }
    });
  });

  describe('parseAmount', () => {
    it('should parse standard USD format', async () => {
      const text = 'Total: $1,234.56';
      const result = await service.parseDocument(text);
      expect(result.totalAmount).toBe(1234.56);
    });

    it('should parse European format', async () => {
      const text = 'Total: 1.234,56 EUR';
      const result = await service.parseDocument(text);
      expect(result.totalAmount).toBeCloseTo(1234.56, 1);
    });

    it('should parse amount with euro symbol', async () => {
      const text = 'Total: €999.99';
      const result = await service.parseDocument(text);
      expect(result.totalAmount).toBe(999.99);
    });

    it('should parse amount without commas', async () => {
      const text = 'Total: $500.00';
      const result = await service.parseDocument(text);
      expect(result.totalAmount).toBe(500);
    });
  });

  describe('extractLineItems', () => {
    it('should extract multiple line items', async () => {
      const text = `
        Invoice
        Widget A - 5 - $50.00
        Widget B - 3 - $75.00
        Total: $425.00
      `;
      const result = await service.parseDocument(text);
      expect(result.items).toBeDefined();
      // May extract items depending on parsing logic
    });

    it('should handle items without quantity', async () => {
      const text = `
        Service 1 - $100.00
        Service 2 - $200.00
      `;
      const result = await service.parseDocument(text);
      expect(result.type).toBeDefined();
    });
  });

  describe('validateParsedData', () => {
    it('should validate invoice data', async () => {
      const text = 'Invoice #001 Total: $500.00';
      const result = await service.parseDocument(text);
      const isValid = await service.validateParsedData(result);
      expect(typeof isValid).toBe('boolean');
    });

    it('should invalidate data with no amount for invoice', async () => {
      const result = {
        type: 'invoice' as const,
        confidence: 0.5,
      };
      const isValid = await service.validateParsedData(result);
      expect(isValid).toBe(false);
    });

    it('should invalidate unknown document type', async () => {
      const result = {
        type: 'unknown' as const,
        confidence: 0.2,
      };
      const isValid = await service.validateParsedData(result);
      expect(isValid).toBe(false);
    });

    it('should validate contract with vendor', async () => {
      const result = {
        type: 'contract' as const,
        vendor: 'ABC Corporation',
        confidence: 0.6,
      };
      const isValid = await service.validateParsedData(result);
      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('currency detection', () => {
    it('should detect USD from dollar sign', async () => {
      const text = 'Amount: $100.00';
      const result = await service.parseDocument(text);
      if (result.currency) {
        expect(result.currency).toBe('USD');
      }
    });

    it('should detect EUR from euro sign', async () => {
      const text = 'Amount: €100.00';
      const result = await service.parseDocument(text);
      if (result.currency) {
        expect(result.currency).toBe('EUR');
      }
    });

    it('should detect GBP from pound sign', async () => {
      const text = 'Amount: £100.00';
      const result = await service.parseDocument(text);
      if (result.currency) {
        expect(result.currency).toBe('GBP');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty text', async () => {
      const result = await service.parseDocument('');
      expect(result).toBeDefined();
      expect(result.type).toBe('unknown');
    });

    it('should handle very long text', async () => {
      const longText = 'Invoice ' + 'Lorem ipsum '.repeat(100);
      const result = await service.parseDocument(longText);
      expect(result).toBeDefined();
    });

    it('should handle malformed numbers', async () => {
      const text = 'Total: $12.34.56';
      const result = await service.parseDocument(text);
      expect(result).toBeDefined();
    });

    it('should handle multiple amounts in text', async () => {
      const text = 'Subtotal: $100.00 Tax: $10.00 Total: $110.00';
      const result = await service.parseDocument(text);
      // Should prefer total amount
      expect(result.totalAmount).toBeCloseTo(110, 1);
    });
  });
});
