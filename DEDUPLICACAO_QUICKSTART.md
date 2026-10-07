# Deduplication Engine - Quick Start Guide

## 5-Minute Setup

### 1. Apply Database Migration

```sql
-- In your database boot sequence, apply:
-- File: server/src/migrations-phase20-agentes-deduplicacao.sql
```

### 2. Register Routes

```typescript
// In your main Express setup file:
import { setupAgentesDeduplicacaoRoutes } from "./routes/agentes-deduplicacao-routes.js";
import express from "express";
import Database from "better-sqlite3";

const app = express();
const db = new Database("app.db");

// Register deduplication routes
setupAgentesDeduplicacaoRoutes(app, db);
```

### 3. That's It!

All endpoints are now available. Test with:

```bash
curl http://localhost:3000/api/v1/agentes/duplicatas/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Most Common Operations

### Find Duplicates for an Agent

```bash
# Get all potential duplicates for an agent
curl http://localhost:3000/api/v1/agentes/550e8400-e29b-41d4-a716-446655440000/duplicatas \
  -H "Authorization: Bearer $TOKEN"
```

Response shows candidates ranked by score.

### Get Review Queue

```bash
# Get duplicates waiting for review
curl http://localhost:3000/api/v1/agentes/duplicatas/review?status=pendente \
  -H "Authorization: Bearer $TOKEN"
```

### Merge Two Agents

```bash
# Merge agent B into agent A
curl -X POST \
  http://localhost:3000/api/v1/agentes/agent-A-uuid/merge/agent-B-uuid \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "motivo": "Duplicata confirmada - CNPJ idêntico"
  }'
```

Agent B is deactivated, all references moved to Agent A.

### Undo a Merge

```bash
# Undo the merge operation
curl -X POST \
  http://localhost:3000/api/v1/agentes/duplicatas/merge-id/unmerge \
  -H "Authorization: Bearer $TOKEN"
```

Everything is restored to original state.

### Check if Transaction is Duplicate

```bash
curl -X POST \
  http://localhost:3000/api/v1/transacoes/check-duplicata \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "valor": 1000.50,
    "data": "2024-10-07",
    "descricao": "Pagamento fornecedor X",
    "janela_dias": 3
  }'
```

---

## Programmatic Usage

### Detect Duplicates in Code

```typescript
import { AgentesDeduplicacaoService } from "./domain/erp/agentes-deduplicacao.js";
import Database from "better-sqlite3";

const db = new Database("app.db");
const service = new AgentesDeduplicacaoService(db);

// Find duplicates for an agent
const agenteId = "550e8400-e29b-41d4-a716-446655440000";
const usuarioId = "550e8400-e29b-41d4-a716-446655440001";

const candidatos = service.detectarDuplicatasAgente(agenteId, usuarioId);

// Print results
candidatos.forEach((c) => {
  console.log(`${c.nome_2}: ${c.score}% (${c.confidence_level})`);
});
```

### Merge Agents Programmatically

```typescript
const resultado = service.fundirAgentes(
  {
    agente_primario_id: "agent-A-uuid",
    agente_duplicado_id: "agent-B-uuid",
    motivo: "CNPJ match - system auto-merge",
  },
  usuarioId
);

console.log(`Merged! ${resultado.transacoes_migradas} transactions moved.`);
```

### Check Transaction Duplicates

```typescript
import { TransacoesDeduplicacaoService } from "./domain/erp/agentes-deduplicacao.js";

const txService = new TransacoesDeduplicacaoService(db);

const verificacao = txService.isDuplicate(
  {
    valor: 1000.50,
    data: "2024-10-07",
    descricao: "Pagamento fornecedor",
  },
  usuarioId,
  3 // 3-day window
);

if (verificacao.isDuplicate) {
  console.log(`Warning: Possible duplicate! Score: ${verificacao.score}`);
}
```

---

## Understanding Scores

| Score | Meaning | Action |
|-------|---------|--------|
| 100 | Exact match (CNPJ/CPF identical) | Auto-approve |
| 95-99 | Very high confidence | Quick review |
| 85-94 | High confidence | Recommended merge |
| 70-84 | Medium confidence | Manual review needed |
| <70 | Low confidence | Unlikely duplicate |

### Confidence Levels

- **EXACT**: 95-100 score (CNPJ match)
- **HIGH**: 85-94 score (Name + Address match)
- **MEDIUM**: 70-84 score (Partial match)
- **LOW**: <70 score (Unlikely duplicate)

---

## Viewing Results in Database

### See All Pending Duplicates

```sql
SELECT * FROM agentes_duplicatas_suspeitas 
WHERE status = 'pendente'
ORDER BY score DESC;
```

### See Merge History

```sql
SELECT 
  agente_1_nome,
  agente_2_nome,
  score,
  data_merge
FROM agentes_merges_historico
ORDER BY data_merge DESC
LIMIT 20;
```

### See All Operations

```sql
SELECT 
  tipo_evento,
  agente_primario_nome,
  agente_secundario_nome,
  evento_data
FROM agentes_operacoes_completo
ORDER BY evento_data DESC;
```

### Get Statistics

```sql
SELECT * FROM agentes_duplicatas_stats;
```

---

## Common Workflows

### Workflow A: Auto-Merge High Confidence

```
1. System scans daily → finds duplicates with score >= 95
2. Presents in review queue
3. User clicks "Merge"
4. System merges automatically
5. Done! Full audit trail created
```

### Workflow B: Manual Review Medium Confidence

```
1. System finds score 70-85 duplicates
2. Presents side-by-side comparison
3. User manually reviews all fields
4. User clicks "Merge" or "Reject"
5. Creates audit entry with decision
```

### Workflow C: Undo Merge if Wrong

```
1. User discovers merge was wrong
2. Clicks "Undo" on merge operation
3. System checks audit trail
4. Restores all original data
5. Reverts ledger references
6. Creates "UNMERGE" audit entry
7. No data lost, fully reversible
```

---

## Troubleshooting

### "Score is too low for obvious duplicates"

Increase the Levenshtein threshold or add more weight to email/address fields.

### "Merge failed - agent not found"

Check IDs exist: 
```sql
SELECT id, nome FROM agentes_economicos 
WHERE id IN ('agent-A-uuid', 'agent-B-uuid');
```

### "Need to see what changed in a merge"

Check audit trail:
```sql
SELECT 
  estado_anterior,
  estado_posterior,
  criado_em
FROM agentes_duplicatas_audit_trail 
WHERE agente_primario_id = 'agent-A-uuid'
ORDER BY criado_em DESC;
```

### "Transaction is slow"

Use indices:
```sql
CREATE INDEX idx_agentes_duplicatas_score 
  ON agentes_duplicatas_suspeitas(score DESC);
```

---

## Performance Tips

1. **Run scans during off-hours** for large datasets
2. **Use score_minimo parameter** to reduce results
3. **Check audit trail regularly** for compliance
4. **Monitor merge queue** to prevent backlog

---

## Key Files

| File | Purpose |
|------|---------|
| `agentes-deduplicacao.ts` | Core detection logic |
| `agentes-deduplicacao-routes.ts` | REST API endpoints |
| `migrations-phase20-agentes-deduplicacao.sql` | Database schema |
| `DEDUPLICACAO_GUIDE.md` | Detailed documentation |

---

## Support

For detailed docs: See `/DEDUPLICACAO_GUIDE.md`
For implementation details: See `/DEDUPLICACAO_ENGINE_SUMMARY.md`
For testing: See `agentes-deduplicacao.test.ts`

---

**Ready to go!** Start detecting duplicates in minutes. ✅

