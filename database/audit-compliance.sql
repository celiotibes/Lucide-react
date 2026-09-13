-- ============================================================================
-- Audit & Compliance Infrastructure (LGPD / Fiscal)
-- ============================================================================
-- Comprehensive audit trails, compliance tracking, and retention policies
-- for regulatory compliance (LGPD - Lei Geral de Proteção de Dados)
-- and fiscal requirements (NF-e, PIX, financial transactions)
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. AUDIT TRAIL - All sensitive changes
-- ============================================================================

-- Master audit log for all system actions
create table auditoria_geral (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references pessoas(id),
  acao text not null,                    -- 'criar', 'atualizar', 'deletar', 'exportar', 'login', 'logout'
  tabela text,                           -- tabela afetada
  registro_id uuid,                      -- ID do registro modificado
  valores_antes jsonb,                   -- snapshot anterior
  valores_depois jsonb,                  -- snapshot novo
  ip_address text,
  user_agent text,
  endpoint text,                         -- API endpoint ou página
  timestamp timestamptz not null default now(),

  constraint tabela_valida check (
    tabela in (
      'pessoas', 'contratos_prestador', 'apontamentos_prestador',
      'fechamentos_prestador', 'adiantamentos_prestador',
      'contratos', 'faturas', 'cobrancas_asaas',
      'usuarios', 'auditoria_geral', 'requisicoes_lgpd'
    )
  )
);

create index idx_auditoria_geral_usuario on auditoria_geral(usuario_id);
create index idx_auditoria_geral_tabela on auditoria_geral(tabela);
create index idx_auditoria_geral_timestamp on auditoria_geral(timestamp);
create index idx_auditoria_geral_registro on auditoria_geral(tabela, registro_id);

-- Trigger to auto-log sensitive changes
create or replace function log_auditoria_geral()
returns trigger as $$
declare
  v_usuario_id uuid;
begin
  -- Get current user from auth
  select (auth.jwt() ->> 'sub')::uuid into v_usuario_id;

  insert into auditoria_geral (
    usuario_id, acao, tabela, registro_id,
    valores_antes, valores_depois, timestamp
  ) values (
    v_usuario_id,
    tg_argv[0],                                    -- ação (arg from trigger)
    tg_table_name,
    coalesce(new.id, old.id),
    to_jsonb(old),
    to_jsonb(new),
    now()
  );

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 2. LGPD COMPLIANCE - Data Privacy Requests
-- ============================================================================

create table requisicoes_lgpd (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  tipo text not null check (tipo in ('anonimizacao', 'portabilidade', 'deletacao', 'consentimento')),
  status text not null default 'pendente' check (status in (
    'pendente', 'em_analise', 'aprovado', 'executado', 'negado', 'cancelado'
  )),

  -- Solicitação
  solicitado_em timestamptz not null default now(),
  solicitado_por uuid references pessoas(id),
  motivo text,

  -- Processamento
  analisado_por uuid references pessoas(id),
  analisado_em timestamptz,
  parecer_texto text,

  executado_por uuid references pessoas(id),
  executado_em timestamptz,

  -- Dados de anonimização
  dados_anonimizados_em timestamptz,
  campos_anonimizados text[],           -- array de coluna: nova_valor

  -- Dados de portabilidade
  arquivo_exportado_url text,
  arquivo_exportado_em timestamptz,
  arquivo_format text check (arquivo_format in ('json', 'csv', 'xml')),

  -- Dados de deletação
  dados_deletados_em timestamptz,
  confirmar_prazo_dias smallint default 30,
  confirmacao_recebida_em timestamptz,

  -- Rastreamento
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_requisicoes_lgpd_pessoa on requisicoes_lgpd(pessoa_id);
create index idx_requisicoes_lgpd_status on requisicoes_lgpd(status);
create index idx_requisicoes_lgpd_tipo on requisicoes_lgpd(tipo);
create index idx_requisicoes_lgpd_data on requisicoes_lgpd(solicitado_em);

-- Log de anonimizações executadas (imutável)
create table lgpd_anonimizacoes_log (
  id uuid primary key default gen_random_uuid(),
  requisicao_lgpd_id uuid not null references requisicoes_lgpd(id),
  pessoa_id uuid not null references pessoas(id),
  tabela text not null,
  coluna text not null,
  valor_antes text,
  valor_depois text,                    -- 'ANONIMIZADO_XXXXX' hash
  removido_integralmente boolean default false,
  removido_em timestamptz not null default now()
);

create index idx_lgpd_anonimizacoes_pessoa on lgpd_anonimizacoes_log(pessoa_id);
create index idx_lgpd_anonimizacoes_requisicao on lgpd_anonimizacoes_log(requisicao_lgpd_id);

-- ============================================================================
-- 3. FISCAL COMPLIANCE - Fiscal Audit Trail
-- ============================================================================

create table auditoria_fiscal (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'nfse_emitida', 'nfse_cancelada', 'pix_enviado', 'pix_confirmado',
    'pix_devolvido', 'fatura_gerada', 'cobranca_emitida', 'documento_assinado'
  )),

  -- Referências
  pessoa_id uuid references pessoas(id),
  prestador_id uuid references prestadores_servico(id),
  fechamento_id uuid references fechamentos_prestador(id),
  fatura_id uuid references faturas(id),
  nfse_id text,
  pix_id text,

  -- Valores
  valor_bruto numeric(14,2),
  valor_liquido numeric(14,2),
  impostos_retidos numeric(14,2),

  -- Documentação
  numero_documento text unique,         -- NF-e, RPS, etc
  protocolo text,
  data_emissao date,
  data_competencia date,

  -- Status
  status text not null default 'registrado' check (status in (
    'registrado', 'transmitido', 'autorizado', 'cancelado', 'denegado'
  )),

  -- Detalhamento
  url_documento text,
  hash_documento text,
  xml_content text,                     -- XML da NF-e
  chave_acesso text,                    -- Chave de acesso da NF-e

  -- Rastreamento
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references pessoas(id),

  constraint valor_positivo check (valor_bruto >= 0)
);

create index idx_auditoria_fiscal_tipo on auditoria_fiscal(tipo);
create index idx_auditoria_fiscal_pessoa on auditoria_fiscal(pessoa_id);
create index idx_auditoria_fiscal_prestador on auditoria_fiscal(prestador_id);
create index idx_auditoria_fiscal_data on auditoria_fiscal(data_emissao);
create index idx_auditoria_fiscal_status on auditoria_fiscal(status);
create index idx_auditoria_fiscal_nfse on auditoria_fiscal(nfse_id) where nfse_id is not null;
create index idx_auditoria_fiscal_pix on auditoria_fiscal(pix_id) where pix_id is not null;

-- Reconciliação de valores (auditoria item 9)
create table auditoria_fiscal_reconciliacao (
  id uuid primary key default gen_random_uuid(),
  auditoria_fiscal_id uuid not null references auditoria_fiscal(id),
  tabela_origem text not null,
  registro_origem_id uuid not null,
  valor_origem numeric(14,2) not null,
  valor_auditoria numeric(14,2) not null,
  diferenca numeric(14,2) generated always as (valor_auditoria - valor_origem) stored,
  reconciliado boolean not null default false,
  analisado_por uuid references pessoas(id),
  analise_data timestamptz,
  motivo_diferenca text,
  criado_em timestamptz not null default now()
);

create index idx_reconciliacao_diferenca on auditoria_fiscal_reconciliacao(diferenca) where diferenca != 0;
create index idx_reconciliacao_reconciliado on auditoria_fiscal_reconciliacao(reconciliado);

-- ============================================================================
-- 4. ACCESS CONTROL AUDIT - Authentication and Authorization
-- ============================================================================

create table auditoria_acesso (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references pessoas(id) on delete cascade,
  tipo_evento text not null check (tipo_evento in (
    'login', 'logout', 'login_falho', 'acesso_negado', 'permissao_alterada',
    'token_gerado', 'token_revogado', 'sessao_expirada'
  )),

  ip_address text not null,
  user_agent text,
  local_geografico text,                -- Geolocalização se disponível

  recurso_acessado text,                -- /api/..., /painel/...
  resultado text check (resultado in ('sucesso', 'falha')),
  motivo_falha text,                    -- 'permissao_insuficiente', 'credenciais_invalidas', etc

  timestamp timestamptz not null default now()
);

create index idx_auditoria_acesso_usuario on auditoria_acesso(usuario_id);
create index idx_auditoria_acesso_tipo on auditoria_acesso(tipo_evento);
create index idx_auditoria_acesso_timestamp on auditoria_acesso(timestamp);
create index idx_auditoria_acesso_falhas on auditoria_acesso(usuario_id, timestamp)
  where resultado = 'falha' and tipo_evento in ('login_falho', 'acesso_negado');

-- ============================================================================
-- 5. DATA RETENTION & DELETION POLICY
-- ============================================================================

create table politicas_retencao (
  id uuid primary key default gen_random_uuid(),
  tabela text not null unique,
  dias_retencao smallint not null default 2555, -- 7 anos por padrão (Ret. Fiscal)
  dias_retencao_apos_deletacao smallint not null default 90,
  permitir_anonimizacao boolean not null default true,
  permitir_deletacao_permanente boolean not null default false, -- Apenas para consentimento
  descricao text,
  criado_em timestamptz not null default now()
);

insert into politicas_retencao (tabela, dias_retencao, descricao) values
  ('faturas', 2555, 'Retenção fiscal de 7 anos'),
  ('auditoria_fiscal', 2555, 'Retenção fiscal de 7 anos'),
  ('cobrancas_asaas', 2555, 'Retenção fiscal de 7 anos'),
  ('apontamentos_prestador', 2555, 'Retenção fiscal de 7 anos'),
  ('fechamentos_prestador', 2555, 'Retenção fiscal de 7 anos'),
  ('auditoria_acesso', 365, 'Retenção de logs de acesso por 1 ano'),
  ('auditoria_geral', 1095, 'Retenção de auditoria geral por 3 anos'),
  ('pessoas', 365, 'Soft-delete com retenção de 1 ano');

-- Registro de deletações (soft-delete tracking)
create table deletacoes_log (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid not null,
  chave_original jsonb,                 -- Dados chave para recuperação
  deletado_por uuid references pessoas(id),
  deletado_em timestamptz not null default now(),
  motivo text,
  recuperavel_ate timestamptz,          -- Até quando pode ser recuperado
  recuperado boolean default false,
  recuperado_em timestamptz,

  constraint tabela_valida check (tabela in (
    'pessoas', 'contratos_prestador', 'apontamentos_prestador',
    'fechamentos_prestador', 'adiantamentos_prestador'
  ))
);

create index idx_deletacoes_tabela on deletacoes_log(tabela);
create index idx_deletacoes_recuperavel on deletacoes_log(recuperavel_ate) where not recuperado;
create index idx_deletacoes_registro on deletacoes_log(tabela, registro_id);

-- ============================================================================
-- 6. CONSENTIMENTO AUDIT
-- ============================================================================

create table auditoria_consentimento (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  tipo_consentimento text not null check (tipo_consentimento in (
    'processamento_dados', 'marketing', 'cookies', 'terceiros', 'anonimizacao'
  )),

  status text not null check (status in ('concedido', 'revogado', 'expirado')),
  versao_politica text,                 -- ex: 'privacy_policy_v2.1'

  concedido_em timestamptz,
  ip_consentimento text,
  user_agent_consentimento text,

  revogado_em timestamptz,
  motivo_revogacao text,

  valido_ate timestamptz,               -- Consentimentos expiram

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_consentimento_pessoa on auditoria_consentimento(pessoa_id);
create index idx_consentimento_tipo on auditoria_consentimento(tipo_consentimento);
create index idx_consentimento_status on auditoria_consentimento(status);

-- ============================================================================
-- 7. SISTEMA DE NOTIFICAÇÕES DE COMPLIANCE
-- ============================================================================

create table alertas_compliance (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'retencao_expirando', 'lgpd_pendente', 'acesso_anormal',
    'discrepancia_fiscal', 'nfse_falha', 'pix_anomalia'
  )),

  severidade text not null check (severidade in ('info', 'warning', 'critical')),
  descricao text not null,
  dados_alerta jsonb,

  status text not null default 'ativo' check (status in ('ativo', 'resolvido', 'ignorado')),

  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references pessoas(id),

  enviado_para_compliance boolean default false,
  enviado_para_fiscal boolean default false
);

create index idx_alertas_compliance_tipo on alertas_compliance(tipo);
create index idx_alertas_compliance_severidade on alertas_compliance(severidade);
create index idx_alertas_compliance_status on alertas_compliance(status);
create index idx_alertas_compliance_criado on alertas_compliance(criado_em);

-- ============================================================================
-- Views for Compliance Dashboard
-- ============================================================================

create or replace view v_compliance_status as
select
  'Requisições LGPD Pendentes' as metrica,
  count(*)::text as valor,
  'pending' as status
from requisicoes_lgpd
where status = 'pendente'

union all

select
  'Discrepâncias Fiscais' as metrica,
  count(*)::text as valor,
  'warning' as status
from auditoria_fiscal_reconciliacao
where diferenca != 0 and not reconciliado

union all

select
  'Acessos Negados (7 dias)' as metrica,
  count(*)::text as valor,
  'warning' as status
from auditoria_acesso
where tipo_evento = 'acesso_negado'
  and timestamp > now() - interval '7 days'

union all

select
  'NFS-e com Falha' as metrica,
  count(*)::text as valor,
  'warning' as status
from auditoria_fiscal
where tipo like '%nfse%' and status = 'denegado';

-- ============================================================================
-- Função para anonimizar dados de pessoa (LGPD)
-- ============================================================================

create or replace function anonimizar_pessoa(p_pessoa_id uuid, p_requisicao_id uuid)
returns json as $$
declare
  v_pessoa record;
  v_resultado json;
begin
  -- Buscar pessoa
  select * into v_pessoa from pessoas where id = p_pessoa_id;

  if v_pessoa is null then
    return json_build_object('erro', 'Pessoa não encontrada');
  end if;

  -- Anonimizar em transação
  begin
    -- Anonimizar dados pessoais
    update pessoas
    set
      nome = 'ANONIMIZADO_' || substring(md5(cpf_cnpj), 1, 8),
      email = 'anonimizado+' || substring(md5(id::text), 1, 8) || '@anonimo.local',
      telefone = null,
      endereco = null,
      dados_sensiveis_anonimizados = true
    where id = p_pessoa_id;

    -- Anonimizar contatos em contratos
    update contrato_partes
    set pessoa_id = null
    where pessoa_id = p_pessoa_id;

    -- Anonimizar e-mails em prestadores
    update prestadores_servico
    set
      email = 'anonimizado+' || substring(md5(id::text), 1, 8) || '@anonimo.local',
      telefone = null,
      chave_pix = null
    where pessoa_id = p_pessoa_id;

    -- Log de anonimização
    insert into lgpd_anonimizacoes_log (
      requisicao_lgpd_id, pessoa_id, tabela, coluna,
      valor_antes, valor_depois, removido_integralmente
    ) values
      (p_requisicao_id, p_pessoa_id, 'pessoas', 'nome', v_pessoa.nome, 'ANONIMIZADO_***', false),
      (p_requisicao_id, p_pessoa_id, 'pessoas', 'email', v_pessoa.email, 'anonimizado+***', false),
      (p_requisicao_id, p_pessoa_id, 'pessoas', 'telefone', v_pessoa.telefone, null, true);

    -- Atualizar requisição
    update requisicoes_lgpd
    set
      status = 'executado',
      dados_anonimizados_em = now(),
      campos_anonimizados = array['nome', 'email', 'telefone', 'endereco'],
      atualizado_em = now()
    where id = p_requisicao_id;

    v_resultado := json_build_object(
      'sucesso', true,
      'pessoa_id', p_pessoa_id,
      'campos_anonimizados', 4,
      'timestamp', now()
    );

  exception when others then
    v_resultado := json_build_object(
      'erro', sqlerrm,
      'pessoa_id', p_pessoa_id
    );
  end;

  return v_resultado;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- Create indexes for performance
-- ============================================================================

create index if not exists idx_auditoria_geral_composite
  on auditoria_geral(tabela, timestamp desc, usuario_id);

create index if not exists idx_auditoria_fiscal_valor
  on auditoria_fiscal(valor_bruto, valor_liquido) where status = 'autorizado';

create index if not exists idx_requisicoes_lgpd_pendentes
  on requisicoes_lgpd(status, solicitado_em) where status in ('pendente', 'em_analise');
