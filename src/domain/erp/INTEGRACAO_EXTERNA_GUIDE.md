# Phase 4: External Systems Integration Guide

## Overview

This guide covers Phase 4 of the ERP Ledger system, which implements comprehensive external systems integration for banking, tax compliance, open banking, cloud ERP synchronization, API gateway, payment processing, audit logging, and data migration.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Ledger Central                        │
│            (Phases 1-3: Core Ledger)                    │
└─────────────────────────────────────────────────────────┘
                           ▲
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    ┌────────┐         ┌────────┐        ┌────────┐
    │Banking │         │ Tax    │        │ Open   │
    │Integration      │Compliance     │Banking  │
    │(4a)    │        │(4b)    │       │(4c)    │
    └────────┘        └────────┘       └────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                    ┌────────────────┐
                    │ Audit Log (4g) │
                    │ Compliance     │
                    └────────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
    ┌────────┐         ┌────────┐        ┌────────┐
    │Payment │         │ERP     │        │ API    │
    │Gateway │         │Cloud   │        │Gateway │
    │(4f)    │         │(4d)    │        │(4e)    │
    └────────┘         └────────┘        └────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                    ┌────────────────┐
                    │Data Migration  │
                    │(4h)            │
                    └────────────────┘
```

## Module Details

### 4a: Banking Integration

**Purpose**: Connect with bank systems for statement reconciliation and transaction matching.

**Key Features**:
- Support for OFX, CNAB240, and CSV formats
- Automatic bank reconciliation with ledger
- Transaction matching algorithm (date ±2 days, amount, description)
- Discrepancy detection (missing, duplicate, amount mismatch)
- Integration with account 1.1.01 (Caixa) for settlement

**Main Functions**:
```typescript
// Parse different formats
parseOFX(conteudo: string): ExtratoTransacao[]
parseCNAB240(linhas: string[]): ExtratoTransacao[]
parseCSV(linhas: string[]): ExtratoTransacao[]

// Reconciliation
sincronizarExtratoBancario(db, entidade_id, periodo_id, extrato_raw, conta_caixa_id): ConciliacaoBancaria
conciliarTransacoes(db, periodo_id, conta_caixa_id, matching): { reconciliadas, divergencias }
gerarRelatorioConciliacao(db, periodo_id): ConciliacaoBancaria[]
detectarDiscrepancias(db, periodo_id, conta_id, matching): { duplicadas, faltantes, etc }
```

**Usage Example**:
```typescript
const extrato = {
  linhas: bankStatementLines,
  formato: 'CSV' as const,
  data_inicio: '2026-01-01',
  data_fim: '2026-01-31',
};

const resultado = sincronizarExtratoBancario(
  db,
  entidade_id,
  periodo_id,
  extrato,
  contaCaixaId
);

if (resultado.reconciliado) {
  console.log('✓ Reconciliação concluída');
} else {
  console.log('⚠ Divergências encontradas:', resultado.transacoes_nao_reconciliadas);
}
```

---

### 4b: Tax Compliance

**Purpose**: Calculate taxes and manage fiscal obligations.

**Key Features**:
- Federal taxes: IRPJ (15-25%), PIS (1.65%), COFINS (7.6%), INSS (28.8% employer)
- State taxes: ICMS (14-20% by UF)
- Municipal taxes: ISS (5% standard)
- Support for 27 Brazilian states (UFs)
- DRE with tax impact analysis
- Quarterly and annual compliance reporting

**Tax Calculation Examples**:
```typescript
// IRPJ: 15% lucro real + 10% if > R$20k
calcularIRPJ(50000, 'lucro_real') → { valor_imposto: 7500 }

// PIS: 1.65% on gross revenue
calcularPIS(100000) → { valor_imposto: 1650 }

// COFINS: 7.6% on gross revenue
calcularCOFINS(100000) → { valor_imposto: 7600 }

// INSS: 28.8% on payroll (employer)
calcularINSS(10000, 'patrao') → { valor_imposto: 2880 }

// ICMS: Variable by state (SP=18%, RJ=20%)
calcularICMS(10000, 'SP') → { valor_imposto: 1800 }

// ISS: 5% on services
calcularISS(10000, 'SP') → { valor_imposto: 500 }
```

**Compliance Features**:
- EFD-Reinf validation
- Tax payment schedule generation
- SPED eletrônico integration
- 7-year retention for records

---

### 4c: Open Banking Integration

**Purpose**: Real-time payment processing via SPB (Sistema de Pagamentos Brasileiro).

**Key Features**:
- PIX: Instant payments (00 seconds to 3 minutes)
- TED: Electronic transfer (next business day)
- DOC: Document transfer (2-3 business days)
- Real-time payment status tracking
- Auto-settlement to ledger
- Webhook receivers for payment confirmations
- Rate limiting (1000 req/min per key)

**Payment Flows**:
```typescript
// PIX: Instant, no fee
initiarPagamentoPIX(db, entidade_id, periodo_id, {
  chave_pix: 'user@email.com', // CPF, CNPJ, Email, or Phone
  valor: 500,
  beneficiario: 'Recipient Name',
  descricao: 'Payment description',
  data_solicitacao: '2026-01-15'
})

// TED: Transfer with fee (R$3.50-R$6.50)
initiarPagamentoTED(db, entidade_id, periodo_id, {
  banco_destino: '001',
  agencia_destino: '0001',
  conta_destino: '123456',
  cpf_cnpj_destino: '12345678901234',
  valor: 1000,
  data_agendado: '2026-01-16' // Can be scheduled
})

// DOC: Transfer with fee (R$5-R$10)
initiarPagamentoDOC(db, entidade_id, periodo_id, {
  banco_destino: '001',
  agencia_destino: '0001',
  conta_destino: '123456',
  cpf_cnpj_destino: '12345678901',
  valor: 500
})
```

**Webhook Handling**:
```typescript
// Webhook receiver
app.post('/webhooks/pix', (req, res) => {
  const confirmado = processarWebhookPIX(db, req.body);
  if (confirmado) {
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

// Auto-settlement to ledger (Conta 1.1.01 - Caixa)
// Ledger entry created automatically on confirmation
```

---

### 4d: ERP Cloud Sync

**Purpose**: Bidirectional synchronization with cloud ERPs.

**Supported Systems**:
- SAP (SAP Cloud)
- Oracle (NetSuite)
- Microsoft Dynamics 365

**Sync Strategies**:
- **Full Sync**: Complete ledger synchronization
- **Incremental Sync**: Only changes since last sync
- **Conflict Resolution**: last-write-wins, manual override, local/cloud priority

**Account Mapping**:
```typescript
// Map local account to cloud account
mapearContasPlan(db, entidade_id, 'local_code', 'cloud_code')

// Auto-sync will reconcile balances
sincronizarComNuvem(db, entidade_id, config, 'incremental')
```

**Conflict Resolution**:
```typescript
const conflito = {
  recurso_tipo: 'saldo',
  id_local: 1,
  id_nuvem: 'SAP123',
  valor_local: 1000,
  valor_nuvem: 1500,
  estrategia_resolucao: 'last_write_wins'
};

resolverConflitos(db, conflito, 'last_write_wins')
```

---

### 4e: API Gateway

**Purpose**: Expose ledger functionality via RESTful API with security and rate limiting.

**Authentication**:
- API Key generation: `criarChaveAPI()`
- HMAC SHA-256 request signing
- Rate limiting: 1000 requests/minute per key
- OAuth 2.0 compatible

**API Endpoints**:

```
GET  /api/v1/ledger/saldos?periodo_id=1
GET  /api/v1/ledger/entries?periodo_id=1&data_inicio=2026-01-01&data_fim=2026-01-31
POST /api/v1/ledger/entries
     { data_lancamento, conta_id, descricao, valor_debito/credito }

GET  /api/v1/health
GET  /api/v1/spec (OpenAPI documentation)
```

**Rate Limiting**:
- Default: 1000 req/minute per API key
- Configurable per client
- Returns 429 (Too Many Requests) when exceeded

**Example Client Code**:
```typescript
const config = {
  apiUrl: 'https://erp-api.example.com/v1',
  apiKey: 'PK_XXXXXXXXXXXXXXXX',
  apiSecret: 'sk_...', // Used for request signing
};

// Create signed request
const timestamp = Date.now();
const payload = { periodo_id: 1 };
const signature = HMAC_SHA256(`${timestamp}:${JSON.stringify(payload)}`, apiSecret);

const response = await fetch(`${config.apiUrl}/ledger/saldos`, {
  method: 'GET',
  headers: {
    'X-API-Key': config.apiKey,
    'X-Timestamp': timestamp.toString(),
    'X-Signature': signature,
  },
});
```

---

### 4f: Payment Gateway

**Purpose**: Process payments via third-party providers with auto-settlement.

**Supported Gateways**:
- Stripe (card, ACH, PIX)
- PayPal (wallet, bank transfer)
- MercadoPago (card, wallet)

**Payment Processing**:
```typescript
const config = {
  tipo_gateway: 'stripe',
  api_key: 'sk_live_...',
  taxa_percentual: 0.029, // 2.9%
  taxa_fixa: 0.30,        // R$0.30
};

processarPagamento(db, entidade_id, periodo_id, config, {
  gateway: 'stripe',
  valor: 1000,
  moeda: 'BRL',
  descricao: 'Invoice #123',
  cliente_email: 'customer@example.com',
  cliente_nome: 'Customer Name',
  data_solicitacao: '2026-01-15'
});
```

**Chargeback Handling**:
```typescript
handleChargebacks(db, 'PAG-123', {
  data_chargeback: '2026-01-20',
  valor_chargeback: 500,
  motivo: 'Produto não recebido',
  status: 'recebido'
});
// Auto-registers debit entry to account 6.5.01 (Chargebacks)
```

**Refunds**:
```typescript
processarReembolso(db, entidade_id, periodo_id, config, {
  pagamento_original_id: 'PAG-123',
  valor_reembolso: 500,
  motivo_reembolso: 'Cancelamento do cliente',
  data_solicitacao: '2026-01-15'
});
// Auto-reverses original ledger entry
```

---

### 4g: Compliance Audit Log

**Purpose**: Immutable, tamper-proof log of all external integrations.

**Features**:
- SHA-256 hash chaining for integrity
- HMAC SHA-256 digital signatures for non-repudiation
- 7-year retention (LGPD compliance)
- Automated integrity verification
- Export in JSON and CSV formats

**Log Entry Structure**:
```typescript
{
  timestamp: '2026-01-15T10:30:00Z',
  usuario_id: 1,
  usuario_nome: 'Admin',
  ip_origem: '192.168.1.100',
  modulo_chamador: 'api-gateway',
  tipo_operacao: 'escrita',
  entidade_afetada: 'ledger_entry',
  id_entidade: 12345,
  descricao_alteracao: 'Lançamento criado via API',
  valor_anterior: null,
  valor_novo: { /* entry data */ },
  hash_sha256: 'abc123...', // Hash of this entry
  hash_anterior: 'xyz789...', // Hash of previous entry (chain)
  status: 'sucesso',
  tempo_processamento_ms: 145,
  assinado: true,
  assinatura_digital: 'sig_...', // HMAC signature
}
```

**Audit Verification**:
```typescript
// Verify integrity of audit log
const verificacao = verificarIntegridade(db, '2026-01-01', '2026-01-31');

if (verificacao.integro) {
  console.log('✓ Audit log is tamper-proof');
} else {
  console.log('✗ Detected tampering in records:',
    verificacao.registros_corrompidos
  );
}
```

**Audit Reports**:
```typescript
// Generate audit report
const relatorio = gerarRelatorioAuditoria(db, '2026-01-01', '2026-01-31');
console.log(`Total operations: ${relatorio.total_registros}`);
console.log(`Operations by module:`, relatorio.operacoes_por_modulo);
console.log(`Errors: ${relatorio.erros_registrados}`);
```

---

### 4h: Data Migration

**Purpose**: Bulk import from legacy systems with validation and reconciliation.

**Supported Legacy Systems**:
- SAP (ECC, S/4HANA)
- Tally.ERP
- QuickBooks
- Generic CSV/JSON format

**Migration Workflow**:
```
1. Extract data from legacy system
2. Validate data integrity
3. Map legacy accounts to local chart of accounts
4. Import transactions
5. Reconcile balances
6. Generate difference report
7. Commit or rollback
```

**Import Example**:
```typescript
const dados = {
  tipo_sistema: 'SAP',
  periodo_inicio: '2026-01-01',
  periodo_fim: '2026-01-31',
  contas: [
    {
      codigo_original: '1000',
      descricao: 'Caixa',
      tipo_conta: 'ativo',
      natureza: 'debito',
      saldo_inicial: 5000,
    },
  ],
  lancamentos: [
    {
      data: '2026-01-15',
      conta_codigo: '1000',
      descricao: 'Depósito inicial',
      valor_credito: 10000,
      referencia_documento: 'DOC001',
    },
  ],
};

const resultado = importarDadosLegacy(db, entidade_id, periodo_id, dados);

if (resultado.status === 'concluido') {
  console.log('✓ Migration completed successfully');
  console.log(`Imported: ${resultado.total_contas_importadas} accounts`);
  console.log(`Imported: ${resultado.total_lancamentos_importados} entries`);
} else {
  console.log('✗ Migration completed with errors');
  console.log(`Errors: ${resultado.contas_erro + resultado.lancamentos_erro}`);
}
```

**Rollback**:
```typescript
if (something_went_wrong) {
  const rollback = rollbackMigracao(db, migracao_id);
  console.log(`Removed: ${rollback.registros_removidos} records`);
}
```

---

## Security Considerations

### API Security
- API keys are hashed (SHA-256) in database
- Request signing with HMAC prevents tampering
- Rate limiting prevents abuse
- SSL/TLS 1.3 for all external communications

### Audit Log Security
- Hash chaining prevents tampering with past entries
- Digital signatures enable non-repudiation
- 7-year retention for compliance
- Read-only access to audit log

### Banking Integration
- Encrypted credential storage
- Bank account masking in logs
- OFX/CNAB parsing without persistent storage of sensitive data

### Tax Compliance
- Compliance with LGPD (Lei Geral de Proteção de Dados)
- Compliance with Lei 6404/76 (Accounting Law)
- 7-year record retention

---

## Database Schema

### Banking Tables
- `conciliacao_bancaria`: Bank reconciliation records
- `conciliacao_transacao_matching`: Transaction matching details

### Tax Tables
- `impostos_calculados`: Calculated tax amounts
- `obrigacoes_fiscais`: Fiscal obligations tracking
- `relatorio_dre_impostos`: DRE with tax impact

### Open Banking Tables
- `pagamentos_pix`: PIX payments
- `pagamentos_ted`: TED transfers
- `pagamentos_doc`: DOC transfers
- `confirmacoes_pagamento`: Payment confirmations

### ERP Sync Tables
- `conta_mapeamento`: Account mappings
- `sincronizacao_status`: Sync history
- `conflito_sincronizacao`: Conflict records

### API Gateway Tables
- `api_chaves`: API keys
- `webhooks`: Webhook registrations
- `requisicoes_api`: API request log

### Payment Gateway Tables
- `pagamentos_gateway`: Payment records
- `chargebacks`: Chargeback records
- `reembolsos`: Refund records

### Audit Tables
- `auditoria_log`: Complete audit trail

### Migration Tables
- `migracao_dados`: Migration records
- `divergencias_migracao`: Balance differences

---

## Testing

Comprehensive test suite with 200+ test cases:

```bash
npm run test src/domain/erp/__tests__/integracao-externa-completa.test.ts
```

**Test Coverage**:
- Banking: OFX/CNAB240/CSV parsing, reconciliation, discrepancy detection
- Tax: All tax calculations, compliance validation, DRE generation
- Open Banking: PIX/TED/DOC payments, webhook handling, status tracking
- ERP Sync: Account mapping, conflict resolution, data export/import
- API Gateway: Authentication, rate limiting, endpoint testing
- Payment Gateway: Payment processing, chargebacks, refunds, reconciliation
- Audit Log: Log creation, integrity verification, reporting
- Migration: Data validation, import, rollback, balance reconciliation

---

## Monitoring & Alerting

### Key Metrics to Monitor

1. **Banking**
   - Reconciliation success rate
   - Average reconciliation time
   - Number of discrepancies

2. **Tax**
   - Number of overdue obligations
   - Tax calculation accuracy
   - Compliance status

3. **Open Banking**
   - Payment success rate
   - Average processing time
   - Failed payment count

4. **API Gateway**
   - Request rate by endpoint
   - Error rate
   - Response time percentiles

5. **Payment Gateway**
   - Chargeback rate
   - Refund rate
   - Revenue impact

6. **Audit Log**
   - Log write latency
   - Integrity check failures
   - Export operations

---

## Support & Troubleshooting

### Common Issues

**Banking Reconciliation Not Matching**
- Check date format in statement (±2 days tolerance)
- Verify amount precision (no rounding)
- Check for duplicate transactions in bank statement
- Review transaction descriptions for encoding issues

**Tax Calculation Incorrect**
- Verify regime selection (lucro_real vs lucro_presumido)
- Check state (UF) for ICMS rate
- Verify base calculation (receita_bruta, lucro_operacional)

**API Rate Limiting Triggered**
- Increase rate_limit for API key
- Implement exponential backoff in client
- Use batch endpoints when available

**Audit Log Integrity Failed**
- Check database consistency
- Run integrity verification tool
- Review error logs for tampering attempts
- Restore from backup if necessary

---

## Performance Tuning

### Indexes
- Add index on `ledger_entries(origem_modulo, criado_em)`
- Add index on `auditoria_log(timestamp, modulo_chamador)`
- Add index on `pagamentos_gateway(status, data_solicitacao)`

### Query Optimization
- Use batch inserts for large imports
- Archive old audit logs (>7 years) to separate storage
- Use pagination for API list endpoints

### Caching
- Cache chart of accounts in memory
- Cache API key validations (60-second TTL)
- Cache recent bank reconciliations

---

## References

- [SPB - Sistema de Pagamentos Brasileiro](https://www.bcb.gov.br/)
- [PIX Documentation](https://www.bcb.gov.br/en/financialstability/pix)
- [SPED Eletrônico](https://www.gov.br/receitafederal/)
- [Lei 6404/76](https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm)
- [LGPD - Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

---

## Changelog

### Phase 4 - Release 1.0
- ✅ 8 integration modules implemented
- ✅ 200+ test cases passing
- ✅ Database schema created
- ✅ API documentation generated
- ✅ Audit logging with hash chaining
- ✅ Tax compliance calculations
- ✅ Open banking payments
- ✅ Data migration tools
