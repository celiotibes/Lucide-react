# CRMT Gestão Imobiliária - Implementation Guide
## 4 Critical Functionalities - Phase 2: Database & APIs

### Overview

This guide covers the database schema, RLS policies, and API endpoints for the 4 critical functionalities:

1. **Vistoria Eletrônica** (Electronic Inspection)
2. **Franquia de Lavanderia** (Laundry Franchise)
3. **Regras de Ocupação** (Occupancy Control)
4. **Prazos Críticos Automatizados** (Critical Dates / Payment Automation)

---

## Database Schema

### Migrations

All database schemas are defined in PostgreSQL/Supabase migrations:

```
supabase/migrations/
├── 001_inspection_schema.sql        # Inspection + video upload + deadline tracking
├── 002_laundry_schema.sql          # Laundry franchises + cycles + violations
├── 003_occupancy_schema.sql        # Occupancy rules + occupants + violations
├── 004_critical_dates_schema.sql   # Payment cycles + SERASA + collection actions
└── 005_rls_policies.sql            # Multi-tenant Row-Level Security policies
```

### Deployment

**Using Supabase CLI:**
```bash
supabase migration up
```

**Manual PostgreSQL:**
```bash
psql -U postgres -d crmt_db -f supabase/migrations/001_inspection_schema.sql
# Repeat for 002, 003, 004, 005
```

### Key Tables

#### 1. Inspections (Vistoria Eletrônica)
- **inspections**: Primary inspection record
- **inspection_damages**: Damage itemization with location/photo
- **inspection_notifications**: Challenge/RAD/return deadline notices

**Key Fields:**
- Video HD validation: `video_size_mb >= 50`, `video_duration_seconds >= 30`
- Deadlines: 7-day challenge, 15-day RAD, 10-day return (from Anexo II)
- Depreciation: 2% per year of property age (minimum 30% retention)

#### 2. Laundry Franchises (Franquia Lavanderia)
- **laundry_franchises**: Inclusion tracking
- **laundry_cycles**: Per-cycle usage records
- **laundry_packages**: Extra package purchases (p2/p4/p6/p10)
- **laundry_violations**: Neighbor laundry usage violations
- **laundry_monthly_reports**: Aggregated monthly summaries

**Key Fields:**
- Included: 2 cycles/week per resident (~8-9 per month)
- Packages: R$ 25/40/55/75 for 2/4/6/10 cycles
- Violations: 10% of `aluguel_efetivo` fine
- Alert: 80% usage trigger

#### 3. Occupancy Rules (Regras de Ocupação)
- **occupancy_rules**: Lease restrictions
- **registered_occupants**: Tenant list with CPF/role/documents
- **occupancy_violations**: AirBnB/Booking/sublet detections
- **occupancy_monitoring**: Automated monitoring status
- **occupancy_reports**: Monthly compliance summaries

**Key Fields:**
- Absolute block: `allow_airbnb = false`, `allow_booking = false`, `allow_sublet = false`
- Fines: 10% of `aluguel_efetivo` per violation
- Termination: Optional 30-day notice on violation
- Detection methods: neighbor_complaint, airbnb_api, booking_api, property_inspection, manual_report

#### 4. Payment Cycles (Prazos Críticos)
- **payment_cycles**: Monthly billing record
- **critical_dates**: Automated deadline tracking
- **critical_date_notifications**: Day 10/30/40/60 emails/SMS
- **serasa_registrations**: SPC/SERASA debt registry
- **collection_actions**: Day 40+ judicial collection
- **lease_renewal_notices**: 60-day renewal decision notice

**Key Fields:**
- Day 10: Due date (Cláusula Terceira)
- Day 30: SPC registration + 1% late fee (Cláusula Quinta)
- Day 40: Judicial execution notification
- Day 60 before end: Renewal notice
- Split: 55% aluguel_efetivo, 45% cota_custeio

---

## Row-Level Security (RLS)

### Multi-Tenant Architecture

All tables are protected by RLS policies via `user_lease_access` junction table:

```sql
user_lease_access (user_id UUID, lease_id UUID, role TEXT)
```

**Roles:**
- `viewer`: Read-only access
- `editor`: Create/update access
- `admin`: Full access + grant permissions

### Policy Pattern

```sql
CREATE POLICY "Users can view inspections for their leases"
  ON inspections FOR SELECT
  USING (
    lease_id IN (
      SELECT lease_id FROM user_lease_access WHERE user_id = auth.uid()
    )
  );
```

### Enabling RLS

```bash
# All tables have RLS enabled by default in migrations
# Verify with:
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

---

## API Endpoints

### Request/Response Types

All endpoints use unified response format:

```typescript
// Success Response
{
  success: true,
  data: { ... },
  timestamp: "2026-08-23T12:00:00Z"
}

// Error Response
{
  success: false,
  error: {
    code: "ERROR_CODE",
    message: "Human-readable message",
    details: { ... }
  },
  timestamp: "2026-08-23T12:00:00Z"
}
```

### Inspection Endpoints

**POST /api/inspections/create**
- Create video inspection with HD validation
- Request: `CreateInspectionRequest`
- Validates: Video >= 50MB, >= 30 seconds
- Returns: Inspection with deadline dates (7/15/10 days)

```bash
curl -X POST http://localhost:3000/api/inspections/create \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": "550e8400-e29b-41d4-a716-446655440000",
    "property_id": "550e8400-e29b-41d4-a716-446655440001",
    "video_url": "https://s3.example.com/vistoria.mp4",
    "video_size_mb": 150,
    "video_duration_seconds": 300,
    "uploaded_by_email": "inquilino@example.com"
  }'
```

**POST /api/inspections/challenge**
- Process tenant dispute of inspection
- Triggers notification to landlord
- Status changes to `challenged`

**POST /api/inspections/process-rad**
- Process damage assessment report
- Updates inspection status to `disputed` or `completed`
- Calculates deposit reduction with depreciation

### Laundry Endpoints

**POST /api/laundry/create-franchise**
- Initialize laundry franchise for lease
- Calculates monthly inclusion: 2 cycles/week × resident count

```bash
curl -X POST http://localhost:3000/api/laundry/create-franchise \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": "550e8400-e29b-41d4-a716-446655440000",
    "resident_count": 1
  }'
```

**POST /api/laundry/record-cycle**
- Log laundry cycle usage
- Auto-detect inclusion vs extra package
- Triggers 80% alert notification

**POST /api/laundry/purchase-package**
- Sell extra laundry package (p2/p4/p6/p10)
- Integrated with Asaas payment (placeholder)

**POST /api/laundry/report-violation**
- Log neighbor laundry usage violation
- Auto-calculate 10% fine

**GET /api/laundry/monthly-report**
- Generate monthly laundry summary
- Includes usage, extras, violations

### Occupancy Endpoints

**POST /api/occupancy/create-rules**
- Initialize occupancy constraints for property
- Hardcoded: AirBnB/Booking/sublet forbidden

**POST /api/occupancy/register-occupant**
- Register tenant with CPF validation
- Roles: primary, secondary, dependent

**POST /api/occupancy/report-violation**
- Report AirBnB/Booking/sublet/overcrowding violation
- Detection methods: neighbor_complaint, airbnb_api, booking_api, inspection, manual

```bash
curl -X POST http://localhost:3000/api/occupancy/report-violation \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": "550e8400-e29b-41d4-a716-446655440000",
    "property_id": "550e8400-e29b-41d4-a716-446655440001",
    "aluguel_efetivo": 846.45,
    "violation_type": "airbnb",
    "detection_evidence": "https://airbnb.com/rooms/12345...",
    "detection_method": "airbnb_api"
  }'
```

**POST /api/occupancy/initiate-termination**
- Start 30-day contract termination on violation
- Sends formal notice to tenant

**GET /api/occupancy/monitoring**
- Get current occupancy monitoring status
- Alert levels: none, warning, critical

### Payment Endpoints

**POST /api/payments/create-cycle**
- Create monthly payment cycle (day 10 due date)
- 55/45 split: aluguel_efetivo / cota_custeio

```bash
curl -X POST http://localhost:3000/api/payments/create-cycle \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": "550e8400-e29b-41d4-a716-446655440000",
    "property_id": "550e8400-e29b-41d4-a716-446655440001",
    "billing_month": 9,
    "billing_year": 2026,
    "aluguel_efetivo": 846.45,
    "cota_custeio": 692.55
  }'
```

**POST /api/payments/receive-payment**
- Record payment received
- Updates status, calculates days_late, applies late fee

**POST /api/payments/register-serasa**
- Register debt with SPC/SERASA (day 30 automation)
- Requires: debtor_cpf, debtor_name

**POST /api/payments/initiate-collection**
- Initiate judicial collection action (day 40 automation)
- Contacts notary/bailiff

**POST /api/payments/schedule-renewal-notice**
- Create 60-day pre-renewal notice
- Requests renewal decision

**GET /api/payments/cycle/:cycle_id**
- Get payment cycle status
- Returns: payment_status, days_late, late_fee, notifications

---

## External Service Integrations

### Required Placeholders → Production

| Service | Placeholder | Production |
|---------|-----------|-----------|
| **Email** | Template mock | Resend SDK (resend@example.com) |
| **SMS/WhatsApp** | Template mock | Twilio (SMS + WhatsApp) |
| **Payment** | Asaas mock | Asaas API (laundry packages, additional fees) |
| **Debt Registry** | SERASA mock | SPC/SERASA real API (day 30 registration) |
| **STR Detection** | Boolean mock | Airbnb/Booking API (airbnb_api, booking_api methods) |

### Integration Files to Create

```
src/integrations/
├── EmailService.ts        # Resend client + templates
├── SmsService.ts          # Twilio client + message templates
├── AsaasService.ts        # Laundry package payment processing
├── SerAsaService.ts       # SPC/SERASA debt registration
└── AirbnbService.ts       # STR listing detection API
```

---

## Testing Checklist

### Unit Tests (All Passing ✓)
- [x] Inspection: video validation, deadline calculation, deposit reduction with depreciation
- [x] Laundry: cycle tracking, 80% alert, package sales, violation fines
- [x] Occupancy: rules creation, occupant registration, CPF validation, violation detection
- [x] Payments: cycle creation, day 30/40 automation, renewal notice scheduling

**Run Tests:**
```bash
npm test -- src/tests/integration.test.ts
```

### Database Tests (To Do)
- [ ] RLS policies: verify user isolation
- [ ] Unique constraints: duplicate payment cycles rejected
- [ ] Cascade deletes: violation removal cascades properly
- [ ] Index performance: query plans use indexes

**Run Database Tests:**
```bash
npm run test:db  # After creating database test suite
```

### API Tests (To Do)
- [ ] Video quality validation (reject < 50MB or < 30s)
- [ ] Occupancy violation creation with proper fines
- [ ] Payment cycle due date = day 10
- [ ] Critical date notifications scheduled

**Run API Tests:**
```bash
npm run test:api  # After implementing API tests
```

---

## Deployment Steps

1. **Apply Database Migrations**
   ```bash
   supabase migration up
   ```

2. **Verify RLS Policies**
   ```sql
   SELECT * FROM pg_policies WHERE tablename LIKE 'payment%' LIMIT 5;
   ```

3. **Enable Auth via Supabase Console**
   - Configure: Email/Phone providers
   - Create test user

4. **Deploy API Routes**
   ```bash
   npm run build
   npm run start
   ```

5. **Test End-to-End Flow**
   ```bash
   # 1. Create payment cycle (day 10)
   # 2. Schedule notifications
   # 3. Check SERASA at day 30
   # 4. Verify judicial action at day 40
   ```

---

## Next Phases

### Phase 3: External Service Integration
- Resend email templates
- Twilio SMS/WhatsApp
- Asaas payment processing
- SPC/SERASA registration
- Airbnb/Booking API detection

### Phase 4: Remaining 5 Functionalities
- Contabilidade Segregada (Segregated Accounting)
- Franquia Hídrica (Water Allocation)
- Energia Individual (Individual Energy)
- Notificações Auditadas (Audited Notifications)
- Dossiê Operacional (Operational Dossier)

### Phase 5: Production Hardening
- Audit logging (append-only 7-year retention)
- Data encryption at rest
- 2FA + session management
- Rate limiting + DDoS protection
- Monitoring + alerting

---

## References

- **Contract**: Kitnet 02 Pottker (Curitiba/Floripa)
- **Real Data**: R$ 1.539,00/month (55% aluguel + 45% custeio), 1 resident, 2 cycles/week laundry, 5.8 m³ water
- **Brazilian Legal**: Lei do Inquilinato + Contract-specific clauses
- **Video Requirements**: Anexo II (HD 1080p minimum)
- **Inspection Deadlines**: Cláusula Nona (7-day challenge, 15-day RAD, 10-day return)
- **Payment Terms**: Cláusula Terceira (day 10 due), Cláusula Quinta (1% monthly late fee)
- **Execution**: Cláusula Décima Terceira (day 40+ judicial action)
