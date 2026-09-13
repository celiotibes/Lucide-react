-- ============================================================================
-- Analytics Views for Metabase Dashboard
-- ============================================================================
-- Non-materialized views for real-time analytics on prestador module
-- ============================================================================

-- ============================================================================
-- 1. PRESTADOR PERFORMANCE - Horas Trabalhadas por Período
-- ============================================================================

create or replace view v_prestador_horas_trabalhadas as
select
  ps.id as prestador_id,
  ps.nome_completo,
  ps.categoria,
  date_trunc('week', ap.data)::date as semana_inicio,
  date_trunc('month', ap.data)::date as mes_inicio,
  ap.data::date as data,
  coalesce(ap.horas_trabalhadas, 0) as horas_dia,
  sum(coalesce(ap.horas_trabalhadas, 0)) over (
    partition by ps.id, date_trunc('week', ap.data)
    order by ap.data
  ) as horas_semana,
  sum(coalesce(ap.horas_trabalhadas, 0)) over (
    partition by ps.id, date_trunc('month', ap.data)
    order by ap.data
  ) as horas_mes,
  count(distinct ap.id) over (
    partition by ps.id, date_trunc('week', ap.data)
  ) as dias_trabalhados_semana,
  count(distinct ap.id) over (
    partition by ps.id, date_trunc('month', ap.data)
  ) as dias_trabalhados_mes
from prestadores_servico ps
join contratos_prestador cp on cp.prestador_id = ps.id
left join apontamentos_prestador ap on ap.contrato_id = cp.id
where ps.status = 'ativo' and ap.data is not null
order by ps.id, ap.data desc;

-- ============================================================================
-- 2. FECHAMENTO PIPELINE - Status Distribution & Metrics
-- ============================================================================

create or replace view v_fechamento_pipeline as
select
  fp.id as fechamento_id,
  ps.id as prestador_id,
  ps.nome_completo,
  ps.categoria,
  fp.data_inicio,
  fp.data_fim,
  fp.frequencia,
  fp.status,
  case
    when fp.status = 'rascunho' then 1
    when fp.status = 'enviado_para_gestao' then 2
    when fp.status = 'aprovado' then 3
    when fp.status = 'pago' then 4
    when fp.status = 'devolvido' then 5
    else 6
  end as status_order,
  fp.total_proventos,
  fp.total_deducoes,
  fp.valor_liquido,
  coalesce(fp.pix_status, 'nao_iniciado') as pix_status,
  coalesce(fp.nfse_status, 'nao_iniciada') as nfse_status,
  fp.criado_em,
  fp.atualizado_em,
  now() - fp.criado_em as tempo_desde_criacao,
  now() - fp.atualizado_em as tempo_desde_atualizacao
from fechamentos_prestador fp
join contratos_prestador cp on fp.contrato_id = cp.id
join prestadores_servico ps on cp.prestador_id = ps.id
where ps.status = 'ativo'
order by fp.data_fim desc, fp.criado_em desc;

-- ============================================================================
-- 3. EARNINGS ANALYSIS - Income by Prestador & Period
-- ============================================================================

create or replace view v_prestador_ganhos_periodo as
select
  ps.id as prestador_id,
  ps.nome_completo,
  ps.categoria,
  date_trunc('month', fp.data_fim)::date as mes,
  date_trunc('week', fp.data_fim)::date as semana,
  fp.frequencia,
  count(fp.id) as qtd_fechamentos,
  sum(fp.total_proventos) as total_proventos,
  sum(fp.total_deducoes) as total_deducoes,
  sum(fp.valor_liquido) as total_liquido,
  sum(fp.valor_diarias) as valor_diarias,
  sum(fp.valor_horas_adicionais) as valor_horas_adicionais,
  sum(fp.valor_deslocamentos) as valor_deslocamentos,
  sum(fp.valor_kits) as valor_kits,
  sum(fp.valor_combustivel) as valor_combustivel,
  sum(fp.valor_emergencias) as valor_emergencias,
  sum(fp.valor_adiantamentos_descontados) as adiantamentos_descontados,
  sum(fp.valor_parcelas_descontadas) as parcelas_descontadas,
  avg(fp.valor_liquido) as media_ganho_fechamento,
  max(fp.valor_liquido) as maior_ganho_fechamento,
  min(fp.valor_liquido) as menor_ganho_fechamento,
  sum(case when fp.status = 'pago' then 1 else 0 end) as fechamentos_pagos,
  sum(case when fp.status = 'aprovado' then 1 else 0 end) as fechamentos_aprovados,
  sum(case when fp.status = 'devolvido' then 1 else 0 end) as fechamentos_devolvidos
from prestadores_servico ps
join contratos_prestador cp on cp.prestador_id = ps.id
left join fechamentos_prestador fp on fp.contrato_id = cp.id
where ps.status = 'ativo'
group by ps.id, ps.nome_completo, ps.categoria, mes, semana, fp.frequencia
order by mes desc, semana desc, ps.nome_completo;

-- ============================================================================
-- 4. PIX & NFS-E TRACKING - Payment Pipeline Status
-- ============================================================================

create or replace view v_pix_nfse_status as
select
  fp.id as fechamento_id,
  ps.nome_completo as prestador,
  fp.data_fim,
  fp.valor_liquido,
  fp.status as fechamento_status,
  fp.pix_status,
  fp.pix_id,
  fp.pix_enviado_em,
  fp.pix_confirmado_em,
  fp.pix_motivo_devolucao,
  fp.nfse_status,
  fp.nfse_id,
  fp.nfse_url,
  fp.nfse_protocolo,
  case
    when fp.status = 'pago' and fp.pix_status = 'confirmado' and fp.nfse_status in ('emitida', 'processada')
      then 'completo'
    when fp.status in ('aprovado', 'enviado_para_gestao') and fp.pix_status is null
      then 'pendente_envio_pix'
    when fp.pix_status = 'enviado'
      then 'pix_em_andamento'
    when fp.pix_status = 'devolvido'
      then 'pix_devolvido'
    when fp.status = 'pago' and fp.nfse_status is null
      then 'pendente_nfse'
    when fp.nfse_status = 'emitida'
      then 'nfse_em_processamento'
    else 'em_andamento'
  end as pipeline_status,
  now() - fp.atualizado_em as tempo_parado_horas
from fechamentos_prestador fp
join contratos_prestador cp on fp.contrato_id = cp.id
join prestadores_servico ps on cp.prestador_id = ps.id
where ps.status = 'ativo'
order by fp.data_fim desc;

-- ============================================================================
-- 5. APONTAMENTOS DISTRIBUTION - Por Residencial e Categoria
-- ============================================================================

create or replace view v_apontamentos_distribuicao as
select
  ps.id as prestador_id,
  ps.nome_completo,
  r.id as residencial_id,
  r.nome as residencial,
  date_trunc('month', ap.data)::date as mes,
  ap.categoria_atividade,
  count(distinct ap.id) as qtd_apontamentos,
  count(distinct ap.data) as dias_trabalhados,
  sum(coalesce(ap.horas_trabalhadas, 0)) as total_horas,
  sum(coalesce(ap.quilometragem_extra, 0)) as total_km,
  sum(coalesce(ap.valor_deslocamento, 0)) as valor_deslocamento_total,
  sum(coalesce(ap.quantidade_kits_pos_hospedagem, 0)) as kits_pos_hospedagem,
  sum(coalesce(ap.quantidade_kits_dentro_horario, 0)) as kits_dentro_horario,
  count(case when ap.eh_emergencia then 1 end) as emergencias,
  avg(coalesce(ap.horas_trabalhadas, 0)) as media_horas_dia
from prestadores_servico ps
join contratos_prestador cp on cp.prestador_id = ps.id
left join apontamentos_prestador ap on ap.contrato_id = cp.id
left join residenciais r on ap.residenciais_ids like '%' || r.id::text || '%'
where ps.status = 'ativo' and ap.data is not null
group by ps.id, ps.nome_completo, r.id, r.nome, mes, ap.categoria_atividade
order by mes desc, ps.nome_completo, r.nome;

-- ============================================================================
-- 6. ADIANTAMENTOS & DEDUCOES - Tracking Advances & Deductions
-- ============================================================================

create or replace view v_adiantamentos_deducoes as
select
  ps.id as prestador_id,
  ps.nome_completo,
  ad.id as adiantamento_id,
  ad.data_lancamento,
  ad.tipo as tipo_adiantamento,
  ad.descricao,
  ad.valor_total,
  ad.numero_parcelas,
  ad.valor_parcela,
  ad.parcelas_restantes,
  ad.status,
  ad.data_quitacao,
  case when ad.status = 'quitado' then ad.valor_total else coalesce(ad.parcelas_restantes * ad.valor_parcela, 0) end as saldo_devedor,
  date_trunc('month', ad.data_lancamento)::date as mes_lancamento,
  (ad.numero_parcelas - coalesce(ad.parcelas_restantes, 0)) as parcelas_pagas
from prestadores_servico ps
join contratos_prestador cp on cp.prestador_id = ps.id
left join adiantamentos_prestador ad on ad.contrato_id = cp.id
where ps.status = 'ativo'
order by ad.data_lancamento desc, ps.nome_completo;

-- ============================================================================
-- 7. FINANCIAL SUMMARY BY MONTH - Agregado Mensal
-- ============================================================================

create or replace view v_resumo_financeiro_mensal as
with fechamentos_mes as (
  select
    ps.id as prestador_id,
    ps.nome_completo,
    date_trunc('month', fp.data_fim)::date as mes,
    sum(fp.total_proventos) as proventos,
    sum(fp.total_deducoes) as deducoes,
    sum(fp.valor_liquido) as liquido,
    count(case when fp.status = 'pago' then 1 end) as pagos,
    count(case when fp.status = 'aprovado' then 1 end) as aprovados,
    count(case when fp.status = 'devolvido' then 1 end) as devolvidos,
    sum(case when fp.pix_status = 'confirmado' then 1 else 0 end) as pix_confirmados,
    sum(case when fp.nfse_status = 'processada' then 1 else 0 end) as nfse_processadas
  from prestadores_servico ps
  join contratos_prestador cp on cp.prestador_id = ps.id
  left join fechamentos_prestador fp on fp.contrato_id = cp.id
  where ps.status = 'ativo'
  group by ps.id, ps.nome_completo, mes
)
select
  prestador_id,
  nome_completo,
  mes,
  proventos,
  deducoes,
  liquido,
  pagos,
  aprovados,
  devolvidos,
  pix_confirmados,
  nfse_processadas,
  round(100.0 * pagos / nullif(pagos + aprovados + devolvidos, 0), 2) as pct_pagos,
  round(100.0 * pix_confirmados / nullif(pagos, 0), 2) as pct_pix_confirmado,
  round(100.0 * nfse_processadas / nullif(pagos, 0), 2) as pct_nfse_processada
from fechamentos_mes
order by mes desc, nome_completo;

-- ============================================================================
-- 8. CONTRACT TERMS - Dados de Contrato para Análise
-- ============================================================================

create or replace view v_contratos_termos as
select
  ps.id as prestador_id,
  ps.nome_completo,
  ps.categoria,
  cp.id as contrato_id,
  cp.data_inicio,
  cp.data_fim,
  cp.tipo_contrato,
  cp.tipo_remuneracao,
  cp.valor_base,
  cp.valor_hora,
  cp.frequencia_fechamento,
  cp.dia_fechamento_semana,
  cp.dia_fechamento_mes,
  cp.reajuste_indice,
  cp.data_base_reajuste,
  cp.percentual_reajuste_ultimo,
  cp.data_ultimo_reajuste,
  case when cp.data_fim is null or cp.data_fim > current_date then 'ativo' else 'encerrado' end as status_contrato,
  extract(year from age(coalesce(cp.data_fim, current_date), cp.data_inicio)) * 12 +
  extract(month from age(coalesce(cp.data_fim, current_date), cp.data_inicio)) as meses_vigencia
from prestadores_servico ps
join contratos_prestador cp on cp.prestador_id = ps.id
where ps.status = 'ativo'
order by cp.data_fim desc nulls first, ps.nome_completo;

-- ============================================================================
-- 9. RESIDENCIAL ANALYSIS - Prestador Coverage & Hours Distribution
-- ============================================================================

create or replace view v_cobertura_residencial as
select
  r.id as residencial_id,
  r.nome as residencial,
  ps.id as prestador_id,
  ps.nome_completo,
  date_trunc('month', ap.data)::date as mes,
  count(distinct ap.id) as apontamentos,
  count(distinct ap.data) as dias,
  sum(coalesce(ap.horas_trabalhadas, 0)) as horas_trabalhadas,
  max(ap.data) as ultimo_apontamento
from residenciais r
join apontamentos_prestador ap on ap.residenciais_ids like '%' || r.id::text || '%'
join contratos_prestador cp on ap.contrato_id = cp.id
join prestadores_servico ps on cp.prestador_id = ps.id
where ps.status = 'ativo'
group by r.id, r.nome, ps.id, ps.nome_completo, mes
order by mes desc, r.nome, ps.nome_completo;

-- ============================================================================
-- 10. KPI DASHBOARD - Real-time Summary Metrics
-- ============================================================================

create or replace view v_kpi_resumo_geral as
select
  'Prestadores Ativos' as metrica,
  count(distinct ps.id)::text as valor,
  'count' as tipo
from prestadores_servico ps
where ps.status = 'ativo'

union all

select
  'Fechamentos em Rascunho' as metrica,
  count(*)::text as valor,
  'count' as tipo
from fechamentos_prestador
where status = 'rascunho'

union all

select
  'Fechamentos Pendentes de Aprovação' as metrica,
  count(*)::text as valor,
  'count' as tipo
from fechamentos_prestador
where status = 'enviado_para_gestao'

union all

select
  'Fechamentos Aprovados' as metrica,
  count(*)::text as valor,
  'count' as tipo
from fechamentos_prestador
where status = 'aprovado'

union all

select
  'PIX Pendente de Confirmação' as metrica,
  count(*)::text as valor,
  'count' as tipo
from fechamentos_prestador
where pix_status = 'enviado'

union all

select
  'PIX Devolvido' as metrica,
  count(*)::text as valor,
  'count' as tipo
from fechamentos_prestador
where pix_status = 'devolvido'

union all

select
  'NFS-e Pendente de Emissão' as metrica,
  count(*)::text as valor,
  'count' as tipo
from fechamentos_prestador
where status = 'pago' and nfse_status is null

union all

select
  'Total Ganhos (Último Mês)' as metrica,
  to_char(coalesce(sum(valor_liquido), 0), 'FM9,999,999.00') as valor,
  'currency' as tipo
from fechamentos_prestador
where date_trunc('month', data_fim) = date_trunc('month', current_date - interval '1 month')
  and status = 'pago';

-- ============================================================================
-- Create indexes for performance
-- ============================================================================

create index if not exists idx_apontamentos_prestador_data on apontamentos_prestador(data);
create index if not exists idx_fechamentos_prestador_status on fechamentos_prestador(status);
create index if not exists idx_fechamentos_prestador_data_fim on fechamentos_prestador(data_fim);
create index if not exists idx_fechamentos_prestador_pix_status on fechamentos_prestador(pix_status);
create index if not exists idx_fechamentos_prestador_nfse_status on fechamentos_prestador(nfse_status);
create index if not exists idx_adiantamentos_prestador_status on adiantamentos_prestador(status);
