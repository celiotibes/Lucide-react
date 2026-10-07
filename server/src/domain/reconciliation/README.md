# Reconciliation Engine - Phase 19

Sistema automático de reconciliação de transações contábeis usando fuzzy matching com fuse.js.

## Overview

O Reconciliation Engine automatiza o processo de matching entre lançamentos contábeis (ledger entries) e transações de origem (banco, sistemas externos). Utiliza scoring inteligente baseado em data, valor e descrição para encontrar matches com alta precisão.

**Objetivos:**
- Automatizar reconciliação de transações (matching > 85% accuracy)
- Performance: <1s por 100 entradas
- Auditoria completa de matches e alterações
- Interface simples para aprovação manual de matches

## Arquitetura

### Componentes Principais

1. **ReconciliationEngine** - Motor de matching e reconciliação
2. **reconciliation_matches** - Armazena matches encontrados
3. **reconciliation_audit_log** - Audit trail de todas as alterações
4. **reconciliation_status** - Status e estatísticas por período

### Fluxo de Reconciliação

```
1. Buscar ledger entries e source transactions para um período
2. Executar fuzzy matching (fuse.js)
3. Calcular score (data: 30pts + valor: 40pts + descrição: 30pts)
4. Salvar matches com status PENDING/AUTO_MATCHED
5. Usuários aprovam/rejeitam matches
6. Gerar relatório com estatísticas e unmatched entries
```

## Algoritmo de Scoring

Cada match recebe um score de 0-100 baseado em:

### Date Score (max 30 pts)
- Mesma data: 30 pontos
- ±1 dia: escala progressiva (30 → 0)
- Além de ±1 dia: 0 pontos

**Configurável:** `date_tolerance_days` (default: 1)

### Amount Score (max 40 pts)
- Diferença ≤ 5%: escala progressiva (40 → 0)
- Diferença > 5%: 0 pontos

**Configurável:** `amount_tolerance_percent` (default: 5%)

### Description Score (max 30 pts)
- Usa Fuse.js para fuzzy matching de strings
- Threshold mínimo: 70% similarity (configurável)
- Score final: 30 * similarity_ratio

**Configurável:** `description_similarity_threshold` (default: 0.7)

## Thresholds

| Métrica | Padrão | Configurável |
|---------|--------|--------------|
| Score mínimo para match | 80 | `minimum_match_score` |
| Candidatos retornados | 3 | `max_candidates` |
| Tolerância de data | ±1 dia | `date_tolerance_days` |
| Tolerância de valor | ±5% | `amount_tolerance_percent` |
| Similaridade descrição | 70% | `description_similarity_threshold` |

## API

### POST /api/v1/reconciliation/agents/:agente_id/match

Executa o processo de matching para um agente no período especificado.

**Query Params:**
- `start_date`: ISO date (ex: 2024-01-01)
- `end_date`: ISO date (ex: 2024-12-31)

**Response:**
```json
{
  "id": "uuid",
  "agente_id": "agente-uuid",
  "period_start": "2024-01-01",
  "period_end": "2024-12-31",
  "status": "COMPLETE",
  "completion_percentage": 95.5,
  "total_ledger_entries": 100,
  "total_source_transactions": 98,
  "matched_entries": 95,
  "pending_matches": 5,
  "approved_matches": 0,
  "rejected_matches": 0,
  "processing_time_ms": 850
}
```

### GET /api/v1/reconciliation/agents/:agente_id/status

Retorna status de reconciliação (histórico).

**Query Params (opcionais):**
- `start_date`: filtrar por período
- `end_date`: filtrar por período

**Response:** `ReconciliationStatus[]`

### GET /api/v1/reconciliation/matches

Lista matches com filtros avançados.

**Query Params (opcionais):**
- `agente_id`: filtrar por agente
- `status`: PENDING|APPROVED|REJECTED|AUTO_MATCHED
- `min_score`: score mínimo (0-100)
- `limit`: máximo de resultados (default: 100)
- `offset`: paginação (default: 0)

**Response:**
```json
{
  "matches": [
    {
      "id": "match-uuid",
      "ledger_entry_id": "ledger-uuid",
      "source_transaction_id": "source-uuid",
      "match_score": 95,
      "status": "PENDING",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 42
}
```

### PUT /api/v1/reconciliation/matches/:match_id/approve

Aprova um match.

**Body:**
```json
{
  "notes": "Looks good" // opcional
}
```

### PUT /api/v1/reconciliation/matches/:match_id/reject

Rejeita um match.

**Body:**
```json
{
  "reason": "Amount mismatch" // obrigatório
}
```

### GET /api/v1/reconciliation/report/:agente_id

Gera relatório completo de reconciliação.

**Query Params:**
- `start_date`: ISO date
- `end_date`: ISO date

**Response:**
```json
{
  "agente_id": "agente-uuid",
  "period_start": "2024-01-01",
  "period_end": "2024-12-31",
  "matching_rate": 95.5,
  "unmatched_ledger_entries": 5,
  "unmatched_source_transactions": 3,
  "recommendations": [
    "5 ledger entries remain unmatched",
    "3 source transactions remain unmatched"
  ],
  "unmatched_ledger": [...],
  "unmatched_source": [...]
}
```

### GET /api/v1/reconciliation/unmatched

Lista transações desemparelhadas.

**Query Params:**
- `agente_id`: obrigatório
- `start_date`: obrigatório
- `end_date`: obrigatório
- `type`: ledger|source (opcional)

## Performance

### Benchmarks Alvo

- **Matching:** < 1 segundo para 100 entradas
- **Query:** < 500ms para listagem de 1000 matches
- **Accuracy:** > 85% em dados limpos

### Otimizações Implementadas

1. **Índices de banco de dados** - Queries rápidas
2. **Batch matching** - Processa múltiplas entradas eficientemente
3. **Score caching** - Reutiliza cálculos entre requisições
4. **Lazy loading** - Carrega candidatos sob demanda

### Monitoramento

```typescript
// Measure performance
const start = Date.now();
const results = await engine.matchTransactions(ledger, source);
const duration = Date.now() - start;
logger.info(`Matching completed in ${duration}ms for ${ledger.length} entries`);
```

## Casos de Uso

### 1. Reconciliação Mensal de Aluguel

```typescript
const report = await engine.generateReport(
  agenteId,
  "2024-01-01",
  "2024-01-31"
);
// → Mostra matches automáticos + pendências
```

### 2. Auditoria de Transações

```typescript
const matches = await engine.matchTransactions(
  ledgerEntries,
  bankTransactions
);
// → Valida se todas as entradas têm origem rastreável
```

### 3. Detecção de Fraude

```typescript
const unmatched = await engine.detectUnmatchedTransactions(
  agenteId,
  startDate,
  endDate
);
// → Identifica gaps potenciais no registro
```

## Edge Cases Tratados

### ✓ Múltiplas Entradas no Mesmo Dia
Sistema processa corretamente:
- 2+ pagamentos de mesmo valor na mesma data
- Distingue por descrição / referência

### ✓ Valores Duplicados
- Trata matches ambíguos
- Retorna top 3 candidatos para revisão

### ✓ Descrições Nulas
- Score de descrição = 0 (não afeta total)
- Confia em data + valor

### ✓ Operações Concorrentes
- Transações ACID no banco
- Audit log de todas as mudanças

### ✓ Dados Incompletos
- Source transactions sem data
- Ledger entries sem descrição
- Ambos tratados graciosamente

## Testes

```bash
npm run test -- reconciliation-engine.test.ts
```

### Coverage

- **Matching:** 15 casos de teste
- **Performance:** 2 benchmarks
- **Accuracy:** 1 validação (>85%)
- **Edge cases:** 5 casos
- **Aprovação/Rejeição:** 2 testes

### Exemplo de Teste

```typescript
it("should match identical transactions", async () => {
  const ledger = [{
    id: "L1", data: "2024-01-15", valor: 1000,
    descricao: "Invoice #123", tipo: "receita", categoria: "receita"
  }];
  const source = [{
    id: "S1", date: "2024-01-15", amount: 1000,
    description: "Invoice #123"
  }];
  
  const results = await engine.matchTransactions(ledger, source);
  
  expect(results).toHaveLength(1);
  expect(results[0].match_score).toBeGreaterThanOrEqual(90);
});
```

## Integração

### 1. Adicionar ao Servidor

Em `server/src/index.ts`:

```typescript
import { criarRotasReconciliacao } from "./routes/reconciliation-routes.js";

// Dentro do setup de rotas
app.use("/api/v1/reconciliation", criarRotasReconciliacao({ db, authService }));
```

### 2. Usar Programaticamente

```typescript
import { ReconciliationEngine } from "./domain/reconciliation/index.js";

const engine = new ReconciliationEngine(db);
const results = await engine.matchTransactions(ledger, source);
```

### 3. Configurar Thresholds

```typescript
const config = {
  date_tolerance_days: 2,
  amount_tolerance_percent: 10,
  minimum_match_score: 75,
};

const engine = new ReconciliationEngine(db, config);
```

## Troubleshooting

### Problema: Matching muito rigoroso (muitos false negatives)

**Solução:** Aumentar tolerâncias
```typescript
const config = {
  date_tolerance_days: 3,
  amount_tolerance_percent: 10,
  minimum_match_score: 70,
};
```

### Problema: Matching muito permissivo (muitos false positives)

**Solução:** Aumentar threshold
```typescript
const config = {
  minimum_match_score: 90,
  description_similarity_threshold: 0.85,
};
```

### Problema: Performance lenta

**Solução:** Verificar índices de banco
```sql
-- Validar índices
SELECT * FROM sqlite_master WHERE type = 'index' 
AND name LIKE 'idx_reconciliation_%';
```

## Futuras Melhorias

- [ ] Machine learning para otimizar weights
- [ ] Integração com bank APIs para automação completa
- [ ] Batch approval de matches de alta confiança
- [ ] Alertas para anomalias detectadas
- [ ] Export relatórios (PDF/Excel)
- [ ] Dashboard de reconciliação em tempo real

## Contato

Para dúvidas sobre o Reconciliation Engine:
- Documentação: `/server/src/domain/reconciliation/README.md`
- Código: `/server/src/domain/reconciliation/reconciliation-engine.ts`
- Testes: `/server/src/domain/reconciliation/__tests__/`
