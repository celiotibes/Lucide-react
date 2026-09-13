# Analytics & Reporting Setup

## Overview

This document covers the analytics layer for the CRMT prestador management system, including:
- Metabase BI dashboard setup
- Analytics views in PostgreSQL
- Data export functionality (CSV/Excel/PDF)
- KPI monitoring and alerts

## Analytics Views

All analytics views are defined in `database/views-analytics.sql` and automatically created when migrations run.

### Available Views

#### 1. **v_prestador_horas_trabalhadas**
- Daily, weekly, and monthly hours worked per prestador
- Rolling window calculations for trends
- Used for time tracking dashboards

#### 2. **v_fechamento_pipeline**
- Complete pipeline status tracking
- Rascunho → Enviado → Aprovado → Pago → (NFS-e)
- PIX and NFS-e status in real-time
- Time elapsed since creation/last update

#### 3. **v_prestador_ganhos_periodo**
- Monthly and weekly earnings summary
- Breakdown by earnings type (diárias, extras, deslocamento, etc.)
- Statistical metrics (avg, max, min per closing)
- Closed closing counts by status

#### 4. **v_pix_nfse_status**
- Payment pipeline tracking
- Pipeline stages: completo, pendente_envio_pix, pix_em_andamento, nfse_em_processamento
- Hours stalled detection for alerts

#### 5. **v_apontamentos_distribuicao**
- Timesheet distribution by residential and activity
- Monthly aggregation with hours, km, displacement cost
- Airbnb kit tracking (Cristiano)

#### 6. **v_adiantamentos_deducoes**
- Advance tracking and deductions
- Outstanding balance calculation
- Payment status and history

#### 7. **v_resumo_financeiro_mensal**
- Monthly financial summary by prestador
- Key metrics: proventos, deducoes, liquido
- Percentage metrics: % paid, % PIX confirmed, % NFS-e processed

#### 8. **v_contratos_termos**
- Active and historical contracts
- Adjustment terms and history
- Tenure calculation

#### 9. **v_cobertura_residencial**
- Prestador coverage by residential
- Monthly distribution
- Hours worked per residential

#### 10. **v_kpi_resumo_geral**
- Real-time KPI dashboard metrics
- Active counts, pending counts, totals
- Formatted for quick display

## Metabase Setup

### Docker Compose

```bash
# Start Metabase with PostgreSQL metadata database
docker-compose -f docker-compose.metabase.yml up -d

# Access at http://localhost:3000
# Initial setup: admin@crmt.dev / password
```

### Environment Variables

```bash
METABASE_DB_PASSWORD=secure_password
METABASE_SETUP_TOKEN=unique_setup_token
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=your_api_key
SMTP_FROM_ADDRESS=noreply@crmt.dev
```

### Initial Configuration

1. **Add Database Connection**
   - Host: `host.docker.internal` (local) or your Supabase host
   - Database: `postgres`
   - User: Supabase user
   - Password: Supabase password
   - Port: 5432

2. **Create Dashboards**
   - Performance Dashboard: v_prestador_horas_trabalhadas, v_prestador_ganhos_periodo
   - Pipeline Dashboard: v_fechamento_pipeline, v_pix_nfse_status
   - Financial Dashboard: v_resumo_financeiro_mensal
   - KPI Dashboard: v_kpi_resumo_geral

3. **Set Up Alerts**
   - Alert on fechamentos in "rascunho" > 2 days
   - Alert on PIX status "enviado" > 1 hour
   - Alert on NFS-e pending > 24 hours

## Data Export

### Server Action: `exportarDados()`

Exports in CSV, Excel (XLSX), or PDF formats.

```typescript
// From server actions
const resultado = await exportarDados({
  type: 'fechamentos', // 'fechamentos' | 'apontamentos' | 'resumo_financeiro' | 'adiantamentos'
  format: 'excel',      // 'csv' | 'excel' | 'pdf'
  dataInicio: '2024-01-01',
  dataFim: '2024-12-31',
  prestadorId: 'uuid', // optional
});

// Returns signed URL valid for 1 hour
if (resultado.sucesso) {
  window.location.href = resultado.url;
}
```

### API Endpoint

```bash
GET /api/exports/prestador?type=fechamentos&format=excel&dataInicio=2024-01-01&dataFim=2024-12-31
```

Query Parameters:
- `type`: Export type (fechamentos, apontamentos, resumo_financeiro, adiantamentos)
- `format`: Format (csv, excel, pdf)
- `dataInicio`: Start date (YYYY-MM-DD)
- `dataFim`: End date (YYYY-MM-DD)
- `prestadorId`: Filter by prestador (optional)

### Response

```json
{
  "sucesso": true,
  "url": "https://signed-url...",
  "nomeArquivo": "fechamentos_2024-07-17.xlsx"
}
```

## Excel Export Details

- **Frozen header row** for easy scrolling
- **Auto-fitted columns** based on content width
- **Bold blue header** for visual distinction
- **Localized number formatting** (Brazilian format)

## PDF Export Details

- **A4 landscape** layout for data tables
- **Table format** with auto-wrapping long text
- **Page breaks** to prevent data overflow
- **Limited to 100 rows** per page (rest summarized)
- **Metadata** with export timestamp

## CSV Export Details

- **RFC 4180 compliant** with quoted fields
- **UTF-8 encoding**
- **Proper escaping** for special characters
- **Compatible** with Excel, Google Sheets, Python pandas

## Performance Considerations

### View Optimization

- All views use indexed columns for joins
- Partial indexes on status columns for filtering
- Aggregate calculations use window functions

### Export Limitations

- Max 50,000 rows per export (client-side pagination)
- PDF limited to 100 rows per page (rest summarized)
- All exports stored for 1 hour then deleted

### Storage Configuration

Create S3/GCS bucket for exports:

```bash
# If using Supabase Storage
supabase storage create-bucket exports
supabase storage update exports --public
```

## Monitoring

### Key Metrics to Track

1. **Prestador Productivity**
   - Hours/week trend
   - Category breakdown
   - Residential distribution

2. **Payment Pipeline**
   - Closing throughput (% moving through pipeline)
   - PIX confirmation time
   - NFS-e issuance time

3. **Financial Health**
   - Monthly earnings trend
   - Deductions as % of gross
   - Outstanding advances

4. **Compliance**
   - NFS-e coverage (% of paid closings with issued invoice)
   - PIX success rate
   - Audit trail completeness

## Security

- **RLS enabled** on all views (inherited from tables)
- **Signed URLs** expire after 1 hour
- **Admin-only access** to exports via `fn_eh_admin_ou_economista()`
- **Audit logging** via `auditoria_prestador` table

## Troubleshooting

### Metabase not connecting

```bash
# Check network
docker exec crmt-metabase ping metabase-db

# Check logs
docker logs crmt-metabase

# Restart
docker-compose -f docker-compose.metabase.yml restart
```

### Views not appearing in Metabase

1. Sync database in Metabase UI (Settings → Admin → Databases → Sync)
2. Ensure views exist: `psql -c "SELECT schemaname, matviewname FROM pg_matviews ORDER BY matviewname;"`
3. Check permissions: `GRANT SELECT ON v_* TO metabase_user;`

### Export timeout

- Reduce date range
- Use CSV format (faster than PDF)
- Check storage quota

## Next Steps

1. **Dashboard Templates**: Create standard dashboards in Metabase for recurring needs
2. **Scheduled Exports**: Set up cron jobs for weekly/monthly export emails
3. **Real-time Alerts**: Configure PagerDuty/Slack for critical metrics
4. **Data Warehouse**: Consider dbt for complex transformations at scale
