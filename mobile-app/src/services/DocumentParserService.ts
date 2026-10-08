import { logger } from '../utils/logger';

export interface ParsedDocument {
  type: 'invoice' | 'receipt' | 'contract' | 'unknown';
  vendor?: string;
  date?: string;
  amount?: number;
  currency?: string;
  items?: LineItem[];
  taxAmount?: number;
  totalAmount?: number;
  documentNumber?: string;
  paymentMethod?: string;
  description?: string;
  confidence: number;
}

export interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
}

export class DocumentParserService {
  async parseDocument(ocrText: string): Promise<ParsedDocument> {
    try {
      const type = this.detectDocumentType(ocrText);
      const parsed = await this.parseByType(ocrText, type);

      logger.info(
        `Document parsed as ${type} with ${parsed.confidence} confidence`,
      );
      return parsed;
    } catch (error) {
      logger.error('Failed to parse document', error);
      return {
        type: 'unknown',
        confidence: 0,
        description: ocrText,
      };
    }
  }

  private detectDocumentType(
    text: string,
  ): 'invoice' | 'receipt' | 'contract' | 'unknown' {
    const lowerText = text.toLowerCase();

    // Invoice patterns
    if (
      this.matchesPattern(lowerText, [
        'invoice',
        'nota fiscal',
        'nf-e',
        'invoice number',
      ])
    ) {
      return 'invoice';
    }

    // Receipt patterns
    if (
      this.matchesPattern(lowerText, [
        'receipt',
        'recibo',
        'cupom',
        'purchase receipt',
        'order receipt',
      ])
    ) {
      return 'receipt';
    }

    // Contract patterns
    if (
      this.matchesPattern(lowerText, [
        'contract',
        'contrato',
        'agreement',
        'termo',
        'accordance',
      ])
    ) {
      return 'contract';
    }

    return 'unknown';
  }

  private matchesPattern(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern.toLowerCase()));
  }

  private async parseByType(
    text: string,
    type: 'invoice' | 'receipt' | 'contract' | 'unknown',
  ): Promise<ParsedDocument> {
    switch (type) {
      case 'invoice':
        return this.parseInvoice(text);
      case 'receipt':
        return this.parseReceipt(text);
      case 'contract':
        return this.parseContract(text);
      default:
        return this.parseUnknown(text);
    }
  }

  private parseInvoice(text: string): ParsedDocument {
    const doc: ParsedDocument = {
      type: 'invoice',
      confidence: 0.5,
    };

    // Extract document number
    const invoiceMatch = text.match(
      /(?:invoice|invoice #|nf-e)\s*:?\s*([#\d\-/]+)/i,
    );
    if (invoiceMatch) {
      doc.documentNumber = invoiceMatch[1].trim();
    }

    // Extract vendor/company name
    const vendorMatch = text.match(/(?:from|empresa|company):\s*([^\n]+)/i);
    if (vendorMatch) {
      doc.vendor = vendorMatch[1].trim();
    }

    // Extract date
    const dateMatch = text.match(
      /(?:date|data|invoice date):\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
    );
    if (dateMatch) {
      doc.date = dateMatch[1];
    }

    // Extract amounts
    const amountMatch = text.match(
      /(?:total|amount|total amount)[\s:]*[\$€£¥]?\s*([0-9]+[.,][0-9]{2})/i,
    );
    if (amountMatch) {
      doc.totalAmount = this.parseAmount(amountMatch[1]);
      doc.amount = doc.totalAmount;
    }

    // Extract currency
    const currencyMatch = text.match(/[\$€£¥]/);
    if (currencyMatch) {
      doc.currency = this.currencySymbolToCode(currencyMatch[0]);
    }

    // Extract items
    doc.items = this.extractLineItems(text);

    return doc;
  }

  private parseReceipt(text: string): ParsedDocument {
    const doc: ParsedDocument = {
      type: 'receipt',
      confidence: 0.6,
    };

    // Extract vendor name
    const vendorMatch = text.match(/^[\s]?([^0-9\n]{5,})/m);
    if (vendorMatch) {
      doc.vendor = vendorMatch[1].trim();
    }

    // Extract total amount
    const totalMatch = text.match(
      /(?:total|amount due)[\s:]*[\$€£¥]?\s*([0-9]+[.,][0-9]{2})/i,
    );
    if (totalMatch) {
      doc.totalAmount = this.parseAmount(totalMatch[1]);
      doc.amount = doc.totalAmount;
    }

    // Extract date
    const dateMatch = text.match(
      /(?:date|data):\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
    );
    if (dateMatch) {
      doc.date = dateMatch[1];
    }

    // Extract payment method
    const paymentMatch = text.match(
      /(?:payment|paid|payment method):\s*([^\n]+)/i,
    );
    if (paymentMatch) {
      doc.paymentMethod = paymentMatch[1].trim();
    }

    // Extract items
    doc.items = this.extractLineItems(text);

    return doc;
  }

  private parseContract(text: string): ParsedDocument {
    const doc: ParsedDocument = {
      type: 'contract',
      confidence: 0.4,
    };

    // Extract parties involved
    const partiesMatch = text.match(/(?:between|entered into|parties):\s*([^\n]+)/i);
    if (partiesMatch) {
      doc.vendor = partiesMatch[1].trim();
    }

    // Extract date
    const dateMatch = text.match(
      /(?:dated|date of):\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
    );
    if (dateMatch) {
      doc.date = dateMatch[1];
    }

    // Extract amount if contract involves payment
    const amountMatch = text.match(
      /(?:value|amount|consideration)[\s:]*[\$€£¥]?\s*([0-9]+[.,][0-9]{2})/i,
    );
    if (amountMatch) {
      doc.amount = this.parseAmount(amountMatch[1]);
    }

    // Extract description (first paragraph)
    const descMatch = text.match(
      /(?:purpose|subject matter|herein):\s*([^\n]{10,200})/i,
    );
    if (descMatch) {
      doc.description = descMatch[1].trim();
    }

    return doc;
  }

  private parseUnknown(text: string): ParsedDocument {
    const doc: ParsedDocument = {
      type: 'unknown',
      confidence: 0.2,
      description: text.substring(0, 200),
    };

    // Try to extract any amount
    const amountMatch = text.match(
      /[\$€£¥]?\s*([0-9]+[.,][0-9]{2})/,
    );
    if (amountMatch) {
      doc.amount = this.parseAmount(amountMatch[1]);
    }

    return doc;
  }

  private extractLineItems(text: string): LineItem[] {
    const items: LineItem[] = [];

    // Look for lines with quantity and price patterns
    const itemPattern = /^(.+?)\s+(\d+)\s+[\$€£¥]?\s*([0-9]+[.,][0-9]{2})/gm;
    let match;

    while ((match = itemPattern.exec(text)) !== null) {
      items.push({
        description: match[1].trim(),
        quantity: parseInt(match[2]),
        unitPrice: this.parseAmount(match[3]),
        total: this.parseAmount(match[3]),
      });
    }

    return items;
  }

  private parseAmount(amountStr: string): number {
    if (!amountStr) return 0;

    // Remove currency symbols and spaces
    let cleaned = amountStr
      .replace(/[\$€£¥\s]/g, '')
      .replace(/[.,]/g, (match) => {
        // Convert to standard decimal point
        return '.';
      });

    // Handle European format (1.234,56 -> 1234.56)
    if (cleaned.lastIndexOf('.') < cleaned.lastIndexOf(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  private currencySymbolToCode(symbol: string): string {
    switch (symbol) {
      case '$':
        return 'USD';
      case '€':
        return 'EUR';
      case '£':
        return 'GBP';
      case '¥':
        return 'JPY';
      default:
        return 'USD';
    }
  }

  async validateParsedData(parsed: ParsedDocument): Promise<boolean> {
    try {
      // Validate document has minimum required fields
      if (!parsed.type || parsed.type === 'unknown') {
        return false;
      }

      // Type-specific validation
      switch (parsed.type) {
        case 'invoice':
        case 'receipt':
          return parsed.amount !== undefined && parsed.amount > 0;
        case 'contract':
          return parsed.vendor !== undefined && parsed.vendor.length > 0;
        default:
          return false;
      }
    } catch (error) {
      logger.error('Validation failed', error);
      return false;
    }
  }
}
