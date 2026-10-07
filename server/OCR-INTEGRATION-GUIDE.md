# OCR Document Extraction Integration Guide

## Overview

This guide explains the OCR (Optical Character Recognition) integration for document scanning and text extraction. The system handles invoices, receipts, and contracts with automated field detection and confidence scoring.

## Architecture

### Components

1. **OCR Service** (`services/ocr-service.ts`)
   - Tesseract.js initialization (Portuguese/English support)
   - PDF text extraction via pdfjs-dist
   - Image preprocessing and OCR via Tesseract
   - Invoice field detection and parsing
   - Confidence scoring (0-100%)

2. **OCR Routes** (`routes/ocr-document-routes.ts`)
   - GET `/api/documentos/:id/extraction` - Fetch extraction results
   - POST `/api/documentos/:id/approve` - Bulk approve extraction
   - POST `/api/documentos/:id/reject` - Reject with reason
   - POST `/api/documentos/:id/fields/:fieldName/correct` - Correct individual field

3. **Database Schema** (`migrations-phase18-ocr-extraction.sql`)
   - `document_extractions` - OCR results per document
   - `extraction_fields` - Individual field data with confidence
   - `extraction_reviews` - Manual review audit trail

### Workflow

```
Upload Document (PDF/Image)
    ↓
[importacao_lotes created]
    ↓
Trigger OCR Extraction
    ↓
Text Extraction (PDF or OCR)
    ↓
Field Detection & Parsing
    ↓
Confidence Scoring
    ↓
[document_extractions created]
    ↓
Requires Review? (confidence < 75%)
├─ Yes → Flag for manual review
└─ No → Ready for linking/processing
    ↓
Manual Review Workflow (Optional)
├─ Approve → Link to agents/ledger
├─ Reject → Mark for reprocessing
└─ Correct Fields → Update values
    ↓
Link to Agents (CNPJ/CPF)
Link to Ledger (Invoice #)
```

## Dependencies

Added to `package.json`:

```json
{
  "tesseract.js": "^5.1.0",
  "pdfjs-dist": "^4.6.82",
  "sharp": "^0.33.5"
}
```

## Installation

1. Install dependencies:
```bash
cd server
npm install
```

2. Database migrations run automatically on startup:
   - Creates `document_extractions` table
   - Creates `extraction_fields` table
   - Creates `extraction_reviews` table
   - Creates views for analysis

## API Usage

### 1. Get Extraction Results

```bash
GET /api/documentos/:lote_id/extraction

# Response
{
  "sucesso": true,
  "extracao": {
    "id": "uuid",
    "lote_id": "uuid",
    "documento_tipo": "invoice",
    "status": "COMPLETED",
    "confianca_geral": 92,
    "requer_revisao": false,
    "campos": [
      {
        "nome": "supplier_cnpj",
        "valor": "12.345.678/0001-99",
        "confianca": 95,
        "correto_por": null,
        "valor_corrigido": null
      },
      {
        "nome": "invoice_number",
        "valor": "12345",
        "confianca": 90,
        "correto_por": null,
        "valor_corrigido": null
      },
      {
        "nome": "total_amount",
        "valor": "1.234,56",
        "confianca": 88,
        "correto_por": null,
        "valor_corrigido": null
      }
    ],
    "confiancas": {
      "overall": 92,
      "supplier_cnpj": 95,
      "invoice_number": 90,
      "total_amount": 88
    },
    "criado_em": "2024-10-07T12:00:00Z",
    "aprovado_em": null
  }
}
```

### 2. Approve Extraction

```bash
POST /api/documentos/:lote_id/approve
Content-Type: application/json

{
  "motivo": "All fields verified and correct"
}

# Response
{
  "sucesso": true,
  "mensagem": "Extração aprovada com sucesso",
  "extracao_id": "uuid"
}
```

### 3. Reject Extraction

```bash
POST /api/documentos/:lote_id/reject
Content-Type: application/json

{
  "motivo": "Image quality too poor, insufficient data extracted"
}

# Response
{
  "sucesso": true,
  "mensagem": "Extração rejeitada com sucesso",
  "extracao_id": "uuid"
}
```

### 4. Correct Individual Field

```bash
POST /api/documentos/:lote_id/fields/supplier_cnpj/correct
Content-Type: application/json

{
  "valor_corrigido": "12.345.678/0001-88",
  "notas": "OCR confused 99 with 88 in last digits"
}

# Response
{
  "sucesso": true,
  "mensagem": "Campo corrigido com sucesso",
  "campo": "supplier_cnpj",
  "valor_novo": "12.345.678/0001-88"
}
```

## Extracted Fields

### Standard Fields

| Field | Type | Pattern | Example |
|-------|------|---------|---------|
| `supplier_cnpj` | CNPJ | `XX.XXX.XXX/XXXX-XX` | `12.345.678/0001-99` |
| `buyer_cpf` | CPF | `XXX.XXX.XXX-XX` | `123.456.789-10` |
| `invoice_number` | String | Numeric | `12345` |
| `invoice_date` | Date | `DD/MM/YYYY` | `15/10/2024` |
| `due_date` | Date | `DD/MM/YYYY` | `30/10/2024` |
| `total_amount` | Decimal | `X.XXX,XX` or `X,XXX.XX` | `1.234,56` |
| `description` | Text | Free text | `Product A, Product B` |

### Confidence Scoring

- **0-50**: Very low confidence, manual review recommended
- **50-75**: Low confidence, manual review required
- **75-95**: Good confidence, auto-approval possible
- **95-100**: Excellent confidence, can be trusted

### Document Types

- `invoice` - NF-E, Invoice, Nota Fiscal
- `receipt` - Recibo, Receipt, Comprovante
- `contract` - Contrato, Contract, Agreement
- `unknown` - Could not determine type

## Confidence Scoring Details

### Field-Level Scoring

Each extracted field receives a confidence score based on:
1. **Pattern match quality** (0-100)
   - Exact regex match: 95-100
   - Partial/fuzzy match: 60-90
   - Not found: 0

2. **Overall confidence** = Average of all field confidences

### Manual Review Threshold

- **Confidence < 75%**: Automatically flagged for manual review
- **Confidence >= 75%**: Can proceed without manual review (optional)

## Performance

### Extraction Time

- PDF text extraction: ~1-2 seconds
- Image OCR: ~2-4 seconds
- Field detection: ~100ms
- **Total per document**: < 5 seconds (requirement met)

### Scaling

- Single worker Tesseract instance (shared)
- Async processing recommended for bulk operations
- Database indexes optimized for queries

## Field Correction Workflow

### User Interface Flow

```
1. Display extracted fields to reviewer
2. For each field:
   - Show extracted value
   - Show confidence score
   - Allow inline editing
   - Provide undo/save options
3. Submit corrections
4. System records audit trail (who, when, what changed)
5. Fields marked as "corrected_by: user_id"
```

### Audit Trail

Every correction is recorded in `extraction_reviews`:
- User who made the correction
- Timestamp
- Fields that were changed
- Original vs corrected values
- Review notes

## Database Queries

### Find extractions pending review

```sql
SELECT * FROM v_documents_pending_review
ORDER BY overall_confidence ASC;
```

### Check extraction success rate

```sql
SELECT * FROM v_extraction_success_rate;
```

### Find extractions by supplier CNPJ

```sql
SELECT * FROM v_extractions_by_agent
WHERE identifier = '12.345.678/0001-99' AND type = 'CNPJ';
```

### Check field extraction quality

```sql
SELECT * FROM v_field_extraction_quality
ORDER BY avg_confidence DESC;
```

## Linking to Agents and Ledger

### By CNPJ (Supplier)

```sql
SELECT * FROM agentes_economicos
WHERE cnpj = (
  SELECT cnpj_extraido FROM document_extractions WHERE id = ?
);
```

### By CPF (Buyer)

```sql
SELECT * FROM agentes_economicos
WHERE cpf = (
  SELECT cpf_extraido FROM document_extractions WHERE id = ?
);
```

### By Invoice Number

```sql
SELECT * FROM ledger_entries
WHERE numero_nf = (
  SELECT numero_nf_extraido FROM document_extractions WHERE id = ?
);
```

## Testing

Run tests:

```bash
npm test -- ocr-service.test.ts
```

### Test Coverage

- PDF text extraction
- Image OCR with preprocessing
- Field detection accuracy (>85% target)
- Confidence scoring (0-100 range)
- Document type detection
- Portuguese/English text support
- Error handling and edge cases
- Performance (<5s per document)

### Sample Invoice for Testing

```
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
```

**Expected Results:**
- Document Type: `invoice`
- Overall Confidence: >85%
- Fields extracted: supplier_cnpj, invoice_number, invoice_date, due_date, total_amount, description
- All fields with high confidence (>90%)

## Troubleshooting

### Tesseract not initializing

```
Error: [OCR] Failed to initialize Tesseract

Solution:
1. Check Node.js version (14+)
2. Ensure pdfjs-dist and tesseract.js are installed
3. Check system memory (OCR needs ~300MB)
4. Restart the server
```

### Low OCR confidence

```
Causes:
1. Poor image quality (blurry, low resolution)
2. Unusual fonts or handwriting
3. Non-standard document format
4. Text in unsupported language

Solutions:
1. Preprocess image: increase contrast, deskew
2. Check document type detection
3. Enable manual review for <75% confidence
4. Train Tesseract on domain-specific fonts
```

### Performance issues

```
Causes:
1. Large batch of documents
2. High-resolution images
3. Insufficient server memory
4. Database connection pool exhausted

Solutions:
1. Process documents asynchronously
2. Resize images before OCR (max 2400x2400px)
3. Increase Node.js heap size
4. Optimize database indexes
```

## Future Enhancements

1. **Async Processing Queue**
   - Queue documents for processing
   - Worker pool for parallel OCR
   - Progress tracking per document

2. **Advanced Field Parsing**
   - Line item table extraction
   - Tax calculation recognition
   - Bank account number detection

3. **Machine Learning Integration**
   - Model training on extracted data
   - Anomaly detection in invoices
   - Automatic categorization

4. **Image Preprocessing**
   - Automatic rotation correction
   - Shadow/glare removal
   - Document boundary detection

5. **Integration with Ledger**
   - Auto-linking to existing entries
   - Duplicate detection across documents
   - Reconciliation automation

## Security Considerations

### Data Protection

- Extracted text stored in database (encrypted at rest recommended)
- Manual reviews create audit trail
- All corrections recorded with timestamp and user ID
- Access controlled via authentication middleware

### Input Validation

- File size limits (50MB max)
- File type validation (PDF, JPEG, PNG)
- Buffer overflow protection
- SQL injection prevention (parameterized queries)

### Rate Limiting

- OCR processing is resource-intensive
- Consider rate limiting per user
- Implement queue for batch processing
- Monitor resource usage

## References

- **Tesseract.js**: https://github.com/naptha/tesseract.js
- **pdfjs-dist**: https://mozilla.github.io/pdf.js/
- **Sharp**: https://sharp.pixelplumbing.com/
- **Invoice Parsing**: Industry standards for NF-E (Brazil)

## Support

For issues or questions:
1. Check logs: `logs/` directory
2. Review test cases: `services/__tests__/ocr-service.test.ts`
3. Check database schema: `migrations-phase18-ocr-extraction.sql`
4. Review integration examples: `routes/ocr-document-routes.ts`
