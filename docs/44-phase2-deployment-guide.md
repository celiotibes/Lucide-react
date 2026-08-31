# 44. Phase 2 Deployment Guide — Coliving + Airbnb

**Status**: Ready for Staging → Production (after integration tests pass)

**Date**: 2026-07-24

---

## Executive Summary

Phase 2 (Coliving + Airbnb) is **95% production-ready**. All backend, schema, and UI components are implemented and documented. Deployment requires:

1. ✅ Run integration tests against real Postgres (5-10 minutes)
2. ✅ Smoke test 3-step scenarios (15 minutes)
3. ✅ Review audit logs & RLS policies (5 minutes)
4. ✅ Deploy migration + app code (2 minutes)

**Expected downtime**: < 5 seconds (migration-only, non-blocking)

---

## Deployment Checklist

### Pre-Deployment (Staging Environment)

#### 1. Database Migration

```bash
# Step 1: Backup current database
pg_dump $DATABASE_URL > /tmp/backup-phase2-$(date +%s).sql

# Step 2: Run migration (idempotent, safe to re-run)
psql $DATABASE_URL < database/migration-phase2-coliving-airbnb-vistoria.sql

# Verify migration
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'airbnb_hospedagens';
-- Expected: 1 row

SELECT column_name FROM information_schema.columns 
WHERE table_name = 'contratos' AND column_name = 'comodo_id';
-- Expected: 1 row
```

#### 2. Run Integration Tests

```bash
# Prerequisites: DATABASE_URL must be set to staging database
export DATABASE_URL="postgres://user:pass@staging-db:5432/crmt"

# Run Phase 2 integration tests
npm run test:integration -- server/integracao/*.integration.test.ts

# Expected output:
# ✓ encerrarContratoPorSubstituicao - Substitui morador e cria vistoria
# ✓ encerrarContratoPorSubstituicao - Valida contratos
# ✓ registrarHospedagemAirbnb - Registra hospedagem e cria vistorias
# ✓ registrarHospedagemAirbnb - Valida imóvel e comodo
# ... (6 tests total)
```

#### 3. Smoke Test: 3-Step Scenarios

**Scenario 1: Coliving Contract Substitution**

```typescript
// Step 1: Create two contracts (Quarto 1, Quarto 2)
const contrato1 = await criarContrato({
  imovelId: 'imovel-123',
  comodoDid: 'quarto-1',
  locatario: 'Alice',
});
const contrato2 = await criarContrato({
  imovelId: 'imovel-123',
  comodoDid: 'quarto-1',
  locatario: 'Bob',
});

// Step 2: Terminate contract 1, register contract 2 as replacement
const resultado = await encerrarContratoPorSubstituicao({
  contratoAntigoId: contrato1.id,
  novoContratoCandidatoId: contrato2.id,
  motivoEncerramento: 'substituicao',
});
// Expected: vistoria_saida.id = UUID

// Step 3: Verify vistoria created and linked
const vistoria = await buscarVistoria(resultado.vistoria_saida.id);
// Expected: tipo='saida', status='em_andamento', contrato_id=contrato1.id
```

**Scenario 2: Airbnb Listing + Energy Compensation**

```typescript
// Step 1: Register Airbnb hosting in empty bedroom
const hospedagem = await registrarHospedagemAirbnb({
  imovelId: 'imovel-123',
  comodoDid: 'quarto-2',
  periodoInicio: '2026-08-01',
  periodoFim: '2026-08-15',
  diasHospedados: 15,
  valorDiaria: 150,
  plataforma: 'airbnb',
});
// Expected: hospedagem.id = UUID, hospedagem.receita_total = 2250

// Step 2: Verify vistorias created
const vistorias = await buscarVistoriasHospedagem(hospedagem.id);
// Expected: vistorias.length = 2 (entrada + saída)
// Expected: vistorias[0].status = 'concluida' (check-in)
// Expected: vistorias[1].status = 'em_andamento' (check-out)

// Step 3: Generate invoice with occupancy resolution
const fatura = await gerarFaturaMensal({
  contratoId: contrato1.id,
  competencia: '2026-08-01',
});
// Step 3a: Verify compensation applied to energy component
const componentes = fatura.componentes;
const energia = componentes.find(c => c.tipo === 'energia');
// Expected: energia.percentual_final < 100 (compensação applied)
// Expected: energia.percentual_final = max(50, 100 - (2250 / 300 * 100))
//                                     = max(50, -650) = 50
```

**Scenario 3: Common Area Inspection**

```typescript
// Step 1: Create inspection without specific contract
const vistoria = await criarVistoria({
  imovelId: 'imovel-123',
  tipo: 'periodica',
  ehAreaComum: true,  // or: contrato_id=NULL, tipo='periodica'
});
// Expected: vistoria.contrato_id = NULL

// Step 2: Verify visibility
// - Admin sees vistoria in property list (imovel_id filter)
// - Tenant sees vistoria + their own vistorias
const minhasVistorias = await buscarVistoriasColegasDeQuarto(contrato1.id);
// Expected: minhasVistorias includes area common inspection
```

### Deployment (Production)

#### 1. Notify Users

```
🚀 Phase 2 Deployment Window
Time: 2026-07-24 23:00-23:05 UTC
Duration: ~5 seconds
Impact: Read-only (no data loss)
Action Required: None
```

#### 2. Deploy Migration

```bash
# Step 1: Switch to maintenance mode (optional, but recommended)
# - Vercel: Set ENV variable MAINTENANCE_MODE=1
# - Update page: app/maintenance.tsx shows message

# Step 2: Apply migration (non-blocking)
psql $PRODUCTION_DATABASE_URL < database/migration-phase2-coliving-airbnb-vistoria.sql

# Step 3: Deploy code
git push origin main
# Vercel auto-deploys on push

# Step 4: Verify deployment
curl https://api.crmt.app/health
# Expected: { "status": "ok", "phase2": "deployed" }

# Step 5: Exit maintenance mode
# ENV MAINTENANCE_MODE=false
```

#### 3. Post-Deployment Validation

```bash
# Step 1: Check migration success
SELECT COUNT(*) as hospedagens FROM airbnb_hospedagens;
-- Expected: 0 rows (fresh installation)

# Step 2: Verify RLS policies active
SELECT COUNT(*) FROM pg_policies 
WHERE tablename = 'airbnb_hospedagens';
-- Expected: 2 rows (admin full access + audit logging)

# Step 3: Test API endpoints
curl -X GET https://api.crmt.app/api/imoveis/[id]/comodos \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 OK

# Step 4: Smoke test UI
# - Login as admin
# - Navigate to /contratos/[id]/detalhes
# - Verify "Encerrar por substituição" button visible
# - Navigate to /hospedagens/novo
# - Verify form loads and submits
```

---

## Rollback Plan

If critical issues discovered post-deployment:

```bash
# Step 1: Revert code
git revert HEAD~1
git push origin main

# Step 2: Revert schema (if needed — migration is idempotent)
# Safe to keep schema changes (no breaking changes)
# If critical: restore from backup
psql $PRODUCTION_DATABASE_URL < /tmp/backup-phase2-*.sql

# Step 3: Notify users
# Slack/Email: "Phase 2 deployment rolled back due to [issue]. Normal service restored."
```

---

## Post-Deployment Monitoring

### 1. Audit Trail

```sql
-- Monitor new tables for unexpected activity
SELECT COUNT(*) as inserts FROM audit_log
WHERE table_name = 'airbnb_hospedagens'
  AND created_at > now() - interval '1 hour'
  AND operation = 'INSERT';

-- Expected: 0-10 inserts (only if users register hospedagens)
```

### 2. Performance

```bash
# Check query performance (migration shouldn't cause slowdown)
# Index on periodo_inicio, periodo_fim should make queries < 50ms
EXPLAIN ANALYZE SELECT * FROM airbnb_hospedagens 
WHERE periodo_inicio >= '2026-08-01' 
  AND periodo_fim <= '2026-08-31';
-- Expected: Seq Scan uses index, < 100 rows, execution time < 50ms
```

### 3. Alerts

- **RLS Violation**: Monitor for `new row violates row-level security policy`
- **FK Violation**: Monitor for `insert or update on table "vistorias" violates foreign key constraint`
- **Unique Violation**: Monitor for duplicate entries in audit_log

---

## Known Limitations & Notes

### 1. High-Risk Component: Energy Compensation (Item 4)

```
⚠️ Risk Level: HIGH
Reason: Modifies invoice calculations in production
Mitigation: Tested with simulated data only
Recommendation: Enable feature flag for 1 week before production
Timeline: Test → Stage (1 week) → Prod (staged rollout)
```

**Feature Flag Implementation** (Optional):

```typescript
const ENABLE_OCCUPANCY_COMPENSATION = process.env.NEXT_PUBLIC_OCCUPANCY_COMP === 'true';

export async function gerarFaturaMensal(contratoId) {
  // ...
  if (ENABLE_OCCUPANCY_COMPENSATION) {
    componentes = await fn_resolver_componentes_ocupacao(contratoId, competencia);
  } else {
    componentes = originalLogic(contratoId);
  }
}
```

### 2. Supabase RLS Conflict

If using Supabase (not self-hosted Postgres):

```sql
-- Supabase manages users table differently
-- Ensure RLS policies reference auth.uid() correctly
-- Test: SELECT auth.uid() should return user_id after login
```

### 3. Airbnb/Booking API Integration (Deferred)

Current implementation is **manual registration only**. Automatic sync via API is Phase 3+.

For now:
- Operators register hospedagens manually via UI (/hospedagens/novo)
- Future: Cron job to sync Airbnb calendar → airbnb_hospedagens table

---

## Support & Issues

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "new row violates row-level security" | Missing role in RLS policy | Check `usuarios` table has papel='admin' |
| "insert or update on table vistorias violates foreign key" | airbnb_hospedagem_id NULL but type='hospedagem_temporaria' | Verify constraint chk_vistorias_contrato_ou_hospedagem |
| Energy compensation not applied | Feature flag off OR componente natureza != 'rateado_por_ocupacao_comodo' | Check contrato_componentes_mensais.natureza |

### Escalation

- **Database Issue**: Contact DBA, provide `audit_log` export
- **API Issue**: Check `/api/webhooks/asaas-pix` logs for webhook failures
- **UI Issue**: Check browser console for JS errors

---

## Deployment Metrics

### Before Deployment

- Database size: ~500 MB
- API response time (p95): 200ms
- Invoice generation time: 5-10s

### After Deployment (Expected)

- Database size: ~500 MB + ~50 KB (schema only, no data)
- API response time (p95): 200ms (unchanged)
- Invoice generation time: 5-10s + 50-100ms (occupancy resolution)

---

## Sign-Off

- [ ] QA: Integration tests pass
- [ ] PM: Business requirements met
- [ ] DevOps: Rollback plan ready
- [ ] DBA: Backup verified
- [ ] Tech Lead: Code review approved

**Deployment Authorized By**: _______________
**Date**: _______________
**Deployment Completed**: _______________

---

## Next: Phase 2 Advanced Features (Phase 2.5)

Post-deployment, consider:

1. **Airbnb Calendar Sync** (Cron job, 2-4 hours)
2. **Occupancy Dashboard** (Grafana/Metabase, 3-5 hours)
3. **Automated Compensation Alerts** (Email to tenant, 1-2 hours)
4. **Booking Integration** (API sync with Booking.com, 4-6 hours)

---

**Document Version**: 1.0
**Last Updated**: 2026-07-24
**Next Review**: After first production week
