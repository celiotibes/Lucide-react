# Lumin/DocuSign Integration Roadmap

## Status: PRECONDITION FOR PRODUCTION

This document outlines the integration plan for Lumin (document management and e-signatures) and/or DocuSign.

**Current State:** Not yet implemented. This is a blocker for production deployment.

## Requirements

### 1. API Credentials
- [ ] Lumin API key (from Lumin dashboard)
- [ ] Lumin workspace ID
- [ ] DocuSign API key (if choosing DocuSign instead)
- [ ] DocuSign account ID

### 2. Use Cases

#### Contract Signature Workflow
- [ ] Generate contract PDF from template
- [ ] Send to tenant for e-signature
- [ ] Track signature status
- [ ] Archive signed contract
- [ ] Webhook integration for signature events

#### Financial Documents
- [ ] Send invoices for digital signing
- [ ] Store signed receipts
- [ ] Warranty claim documentation

#### Guarantees & Insurance
- [ ] Store insurance policies
- [ ] Track policy expiration
- [ ] Digital signature for guarantee additions

### 3. Implementation Phases

**Phase 1: Basic Integration** (Sprint TBD)
- [ ] Set up API client wrapper
- [ ] Create document upload endpoint
- [ ] Implement signature request workflow
- [ ] Add webhook receiver for signature events
- [ ] Store document references in database

**Phase 2: Workflow Automation** (Sprint TBD)
- [ ] Auto-generate contracts from templates
- [ ] Auto-send to signers
- [ ] Auto-archive on completion
- [ ] Sync signature data to contracts table

**Phase 3: Advanced Features** (Sprint TBD)
- [ ] Batch signature requests
- [ ] Signature field mapping
- [ ] Template versioning
- [ ] Audit trail integration

## Database Schema Changes Required

```sql
-- Documents table
CREATE TABLE IF NOT EXISTS documentos_assinados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id),
  tipo VARCHAR(50), -- 'contrato', 'recibo', 'apolice', etc
  lumin_document_id VARCHAR(255),
  assinatura_request_id VARCHAR(255),
  status VARCHAR(50), -- 'pendente', 'assinado', 'rejeitado', 'expirado'
  enviado_em TIMESTAMPTZ,
  assinado_em TIMESTAMPTZ,
  url_arquivo TEXT,
  signatarios JSONB, -- [{email, name, status}]
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

-- Audit for signature events
CREATE TABLE IF NOT EXISTS audit_assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID REFERENCES documentos_assinados(id),
  evento VARCHAR(50), -- 'enviado', 'visualizado', 'assinado', 'rejeitado'
  detalhes JSONB,
  criado_em TIMESTAMPTZ DEFAULT now()
);
```

## Environment Variables Required

```bash
# Lumin
LUMIN_API_KEY=xxx
LUMIN_WORKSPACE_ID=xxx
LUMIN_WEBHOOK_SECRET=xxx

# OR DocuSign
DOCUSIGN_API_KEY=xxx
DOCUSIGN_ACCOUNT_ID=xxx
DOCUSIGN_WEBHOOK_SECRET=xxx

# Shared
DOCUMENT_STORAGE_PROVIDER=lumin|docusign
```

## Security Considerations

1. **Webhook Validation:** Verify signature on all incoming webhooks
2. **Timestamp Validation:** Reject old webhook events (similar to Asaas fix)
3. **Audit Trail:** Log all signature events
4. **Access Control:** Only admins/owners can view signed documents
5. **Data Encryption:** Encrypt sensitive document data at rest

## Acceptance Criteria

- [ ] Documents can be uploaded and signatures requested
- [ ] Webhook events are received and processed
- [ ] Signature status tracked in real-time
- [ ] Archived documents are retrievable
- [ ] Audit logs show all signature events
- [ ] Test coverage > 80%

## Blockers

- [ ] Lumin/DocuSign API access
- [ ] Contract template design
- [ ] Legal review of signature workflows
- [ ] Database migration scripts

---

**Last Updated:** 2026-09-13  
**Owner:** TBD  
**Next Steps:** Schedule kickoff meeting with legal and Lumin/DocuSign
