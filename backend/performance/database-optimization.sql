-- ============================================================================
-- Database Optimization Script - Índices e Queries
-- ============================================================================
-- Executar como: psql rental_sync < database-optimization.sql

-- Desabilitar autocommit para performance
BEGIN;

-- ============================================================================
-- 1. ÍNDICES CRÍTICOS - Properties
-- ============================================================================

-- Index para buscar por proprietário
CREATE INDEX IF NOT EXISTS idx_properties_owner_id
ON properties(owner_id)
WHERE status = 'active';

-- Index para buscar por cidade (comum em queries de localização)
CREATE INDEX IF NOT EXISTS idx_properties_city
ON properties(city, state)
WHERE status = 'active';

-- Index para tipo de propriedade
CREATE INDEX IF NOT EXISTS idx_properties_type
ON properties(type)
WHERE status = 'active';

-- ============================================================================
-- 2. ÍNDICES CRÍTICOS - Listings
-- ============================================================================

-- Index para buscar por propriedade
CREATE INDEX IF NOT EXISTS idx_listings_property_id
ON listings(property_id)
WHERE is_active = true;

-- Index para sincronização
CREATE INDEX IF NOT EXISTS idx_listings_sync_status
ON listings(sync_status, updated_at DESC)
WHERE is_active = true;

-- Index para plataforma
CREATE INDEX IF NOT EXISTS idx_listings_platform
ON listings(platform)
WHERE is_active = true;

-- Index composto para performance queries
CREATE INDEX IF NOT EXISTS idx_listings_property_platform
ON listings(property_id, platform)
WHERE is_active = true;

-- ============================================================================
-- 3. ÍNDICES CRÍTICOS - Leads
-- ============================================================================

-- Index para buscar por propriedade
CREATE INDEX IF NOT EXISTS idx_leads_property_id
ON leads(property_id)
WHERE is_active = true;

-- Index para stage (funil)
CREATE INDEX IF NOT EXISTS idx_leads_stage
ON leads(stage)
WHERE is_active = true;

-- Index para último contato (follow-ups)
CREATE INDEX IF NOT EXISTS idx_leads_last_contact
ON leads(last_contact_at)
WHERE is_active = true AND stage NOT IN ('closed', 'lost');

-- Index para canal de origem
CREATE INDEX IF NOT EXISTS idx_leads_source_channel
ON leads(source_channel)
WHERE is_active = true;

-- ============================================================================
-- 4. ÍNDICES CRÍTICOS - Lead Touchpoints
-- ============================================================================

-- Index para buscar touchpoints de um lead
CREATE INDEX IF NOT EXISTS idx_lead_touchpoints_lead_id
ON lead_touchpoints(lead_id, created_at DESC);

-- ============================================================================
-- 5. ÍNDICES CRÍTICOS - Occupancy History
-- ============================================================================

-- Index para performance de ocupação
CREATE INDEX IF NOT EXISTS idx_occupancy_history_property_date
ON occupancy_history(property_id, date DESC)
WHERE status = 'occupied';

-- ============================================================================
-- 6. ÍNDICES DE PERFORMANCE - Queries Lentas Comuns
-- ============================================================================

-- Dashboard query: buscar stats de múltiplas propriedades
CREATE INDEX IF NOT EXISTS idx_listings_performance
ON listings(property_id, views_count, clicks_count, bookings_count);

-- Análise de preços competitivos
CREATE INDEX IF NOT EXISTS idx_listings_price_city
ON listings(platform, base_price)
WHERE is_active = true;

-- ============================================================================
-- 7. CRIAR MATERIALIZED VIEW - Funnel Statistics
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_lead_funnel_stats AS
SELECT
  property_id,
  stage,
  COUNT(*) as stage_count,
  AVG(EXTRACT(EPOCH FROM (last_contact_at - first_contact_at))/3600) as avg_hours_in_stage
FROM leads
WHERE is_active = true
GROUP BY property_id, stage;

-- Index na materialized view
CREATE INDEX IF NOT EXISTS idx_mv_lead_funnel_property_id
ON mv_lead_funnel_stats(property_id);

-- Refresh schedule (usar em cron ou worker)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_lead_funnel_stats;

-- ============================================================================
-- 8. CRIAR MATERIALIZED VIEW - Property Performance
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_property_performance AS
SELECT
  p.id as property_id,
  p.address,
  p.city,
  COUNT(DISTINCT l.id) as total_listings,
  SUM(l.views_count) as total_views,
  SUM(l.clicks_count) as total_clicks,
  SUM(l.bookings_count) as total_bookings,
  ROUND(SUM(l.bookings_count)::numeric / NULLIF(SUM(l.views_count), 0), 4) as conversion_rate,
  COUNT(DISTINCT CASE WHEN led.stage = 'closed' THEN led.id END) as closed_leads,
  COUNT(DISTINCT CASE WHEN led.stage = 'inquiry' THEN led.id END) as inquiry_leads
FROM properties p
LEFT JOIN listings l ON p.id = l.property_id AND l.is_active = true
LEFT JOIN leads led ON p.id = led.property_id AND led.is_active = true
WHERE p.status = 'active'
GROUP BY p.id, p.address, p.city;

-- Index na materialized view
CREATE INDEX IF NOT EXISTS idx_mv_property_performance_city
ON mv_property_performance(city);

-- ============================================================================
-- 9. ANALYZE TABLES - Atualizar estatísticas de query planner
-- ============================================================================

ANALYZE properties;
ANALYZE listings;
ANALYZE leads;
ANALYZE lead_touchpoints;
ANALYZE occupancy_history;

-- ============================================================================
-- 10. VACUUM - Limpar espaço desalocado
-- ============================================================================

VACUUM ANALYZE properties;
VACUUM ANALYZE listings;
VACUUM ANALYZE leads;
VACUUM ANALYZE lead_touchpoints;
VACUUM ANALYZE occupancy_history;

-- ============================================================================
-- 11. VERIFICAR ÍNDICES CRIADOS
-- ============================================================================

-- Ver todos os índices criados
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('properties', 'listings', 'leads', 'lead_touchpoints', 'occupancy_history')
ORDER BY tablename, indexname;

-- ============================================================================
-- 12. MONITORAR PERFORMANCE DE ÍNDICES
-- ============================================================================

-- Ver índices não usados (para potencial remoção)
SELECT
  i.relname as index_name,
  t.relname as table_name,
  idx.idx_scan as number_of_scans
FROM pg_class t
JOIN pg_index idx ON t.oid = idx.indrelid
JOIN pg_class i ON i.oid = idx.indexrelid
WHERE t.relname IN ('properties', 'listings', 'leads')
  AND idx.idx_scan = 0
ORDER BY t.relname;

-- Ver índices mais usados
SELECT
  i.relname as index_name,
  t.relname as table_name,
  idx.idx_scan as number_of_scans,
  idx.idx_tup_read as tuples_read,
  idx.idx_tup_fetch as tuples_fetched
FROM pg_class t
JOIN pg_index idx ON t.oid = idx.indrelid
JOIN pg_class i ON i.oid = idx.indexrelid
WHERE t.relname IN ('properties', 'listings', 'leads')
ORDER BY idx.idx_scan DESC;

-- ============================================================================
-- 13. VERIFICAR SLOW QUERIES (PostgreSQL 12+)
-- ============================================================================

-- Habilitar log de slow queries (executar em postgresql.conf)
-- log_min_duration_statement = 1000  # 1 segundo

-- Ver queries lentas
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
  AND mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;

-- ============================================================================
-- 14. OTIMIZAÇÕES DE CONNECTION POOLING
-- ============================================================================

-- Ver conexões ativas
SELECT
  datname,
  count(*) as connections,
  max_conn,
  (count(*)::float / max_conn * 100)::numeric(5,2) as usage_percent
FROM (
  SELECT
    datname,
    (SELECT setting FROM pg_settings WHERE name = 'max_connections')::int as max_conn
  FROM pg_stat_activity
) s
GROUP BY datname, max_conn;

-- ============================================================================
-- 15. CONFIGURAÇÕES RECOMENDADAS (postgresql.conf)
-- ============================================================================

/*
# Aumentar max_connections
max_connections = 100

# Aumentar shared_buffers (25% da RAM)
shared_buffers = 8GB

# Aumentar effective_cache_size (50-75% da RAM)
effective_cache_size = 24GB

# Aumentar work_mem para queries maiores
work_mem = 256MB

# Enable parallel queries
max_parallel_workers_per_gather = 4
max_worker_processes = 4

# Query planner
random_page_cost = 1.1  # SSD
effective_io_concurrency = 200

# Logging
log_min_duration_statement = 1000  # Log queries > 1s
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

# Checkpoint tuning
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9
wal_buffers = 16MB
min_wal_size = 2GB
max_wal_size = 8GB
*/

-- ============================================================================
-- 16. COMMIT CHANGES
-- ============================================================================

COMMIT;

-- ============================================================================
-- 17. INFORMAÇÕES E PRÓXIMOS PASSOS
-- ============================================================================

/*
📊 ÍNDICES CRIADOS:
✅ Properties: owner_id, city, type
✅ Listings: property_id, sync_status, platform, property_platform
✅ Leads: property_id, stage, last_contact, source_channel, lead_id
✅ Materialized Views: lead_funnel_stats, property_performance

🎯 IMPACTO ESPERADO:
✅ Queries de lista: -70% latência
✅ Queries de detalhe: -50% latência
✅ Dashboard: -60% latência (com materialized views)
✅ Throughput: +40% mais requisições por segundo

⚠️ PONTOS DE ATENÇÃO:
⚠️ Materialized views requerem refresh periódico
⚠️ Índices ocupam espaço em disco (~500MB)
⚠️ Write performance pode aumentar levemente
⚠️ Monitorar uso de índices com pg_stat_user_indexes

📈 MONITORAMENTO:
1. Verificar índices não usados a cada semana
2. Executar ANALYZE semanalmente
3. Executar VACUUM ANALYZE mensalmente
4. Refreshar materialized views a cada hora
5. Monitorar pg_stat_statements para novas slow queries

✅ PRÓXIMOS PASSOS:
1. Executar este script em staging
2. Validar performance com load tests
3. Monitorar por 48h antes de produção
4. Executar backup antes de produção
5. Executar em produção durante low-traffic window
*/
