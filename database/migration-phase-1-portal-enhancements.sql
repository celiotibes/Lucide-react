-- Phase 1: Portal Inquilino Enhancements
-- Payment plans, lease modifications, payment methods

-- ============================================================================
-- 1. PLANOS DE PAGAMENTO (Payment Plans)
-- ============================================================================

create table if not exists planos_pagamento (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas(id) on delete cascade,
  locatario_id uuid not null references pessoas(id) on delete cascade,
  contrato_id uuid not null references contratos(id) on delete cascade,

  valor_original numeric(14,2) not null,
  valor_total numeric(14,2) not null,  -- pode incluir juros/multa
  num_parcelas smallint not null check (num_parcelas > 0 and num_parcelas <= 24),
  valor_parcela numeric(14,2) not null,

  data_inicio date not null,
  data_vencimento_primeira date not null,
  motivo text,  -- ex: "dificuldade financeira temporária"

  status text not null default 'pendente' check (status in (
    'pendente',      -- aguardando aprovação do proprietário
    'aprovado',      -- ativo
    'rejeitado',
    'pago',          -- todas parcelas pagas
    'cancelado'      -- cancelado antes de completar
  )),

  aprovado_em timestamptz,
  rejeitado_em timestamptz,
  motivo_rejeicao text,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_planos_pagamento_locatario on planos_pagamento(locatario_id);
create index idx_planos_pagamento_contrato on planos_pagamento(contrato_id);
create index idx_planos_pagamento_status on planos_pagamento(status);

-- Parcelas do plano de pagamento
create table if not exists parcelas_plano (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references planos_pagamento(id) on delete cascade,

  numero_parcela smallint not null,
  valor numeric(14,2) not null,
  vencimento date not null,

  status text not null default 'aberta' check (status in (
    'aberta',
    'paga',
    'atrasada',
    'cancelada'
  )),

  data_pagamento date,
  criado_em timestamptz not null default now()
);

create index idx_parcelas_plano_plano_id on parcelas_plano(plano_id);
create index idx_parcelas_plano_vencimento on parcelas_plano(vencimento);

-- ============================================================================
-- 2. MODIFICAÇÕES DE CONTRATO (Lease Modifications)
-- ============================================================================

create table if not exists modificacoes_contrato (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  solicitante_id uuid not null references pessoas(id) on delete set null,

  tipo text not null check (tipo in (
    'aumento_aluguel',
    'diminuicao_aluguel',
    'alteracao_prazo',
    'alteracao_uso',
    'outro'
  )),

  valor_anterior numeric(14,2),
  valor_novo numeric(14,2),
  data_anterior date,
  data_nova date,

  motivo text not null,
  detalhes text,

  status text not null default 'pendente' check (status in (
    'pendente',      -- aguardando proprietário
    'aprovado',
    'rejeitado',
    'implementado'
  )),

  aprovado_em timestamptz,
  implementado_em timestamptz,
  rejeitado_em timestamptz,
  motivo_rejeicao text,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_modificacoes_contrato_contrato_id on modificacoes_contrato(contrato_id);
create index idx_modificacoes_contrato_status on modificacoes_contrato(status);

-- ============================================================================
-- 3. MÉTODOS DE PAGAMENTO SALVOS (Payment Methods)
-- ============================================================================

create table if not exists metodos_pagamento (
  id uuid primary key default gen_random_uuid(),
  locatario_id uuid not null references pessoas(id) on delete cascade,

  tipo text not null check (tipo in (
    'pix',
    'cartao_credito',
    'transferencia_bancaria'
  )),

  -- PIX (encrypted)
  pix_chave text,
  pix_tipo text check (pix_tipo in ('cpf', 'telefone', 'email', 'chave_aleatoria')),

  -- Cartão (PCI-DSS: never store full card, use token)
  cartao_token text,  -- tokenized via Asaas/payment processor
  cartao_ultimos_digitos text,
  cartao_bandeira text,

  -- Banco
  banco_codigo text,
  agencia text,
  conta text,
  conta_tipo text,

  ativo boolean not null default true,
  padrao boolean not null default false,  -- método padrão para cobranças

  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz
);

create index idx_metodos_pagamento_locatario on metodos_pagamento(locatario_id);
create index idx_metodos_pagamento_ativo on metodos_pagamento(ativo) where ativo = true;

-- RLS: Locatário só vê seus próprios métodos
alter table metodos_pagamento enable row level security;

create policy "locatario_read_own_metodos_pagamento"
  on metodos_pagamento for select
  using (
    auth.jwt() ->> 'sub' = (select p.auth_id from pessoas p where p.id = locatario_id)::text
  );

-- ============================================================================
-- 4. HISTÓRICO DE COMPROVANTES (Payment Receipts)
-- ============================================================================

create table if not exists comprovantes_pagamento (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas(id) on delete cascade,
  cobranca_asaas_id uuid references cobrancas_asaas(id),

  tipo text not null check (tipo in ('boleto', 'pix', 'transferencia', 'cartao')),
  valor numeric(14,2) not null,

  data_pagamento date not null,
  hora_pagamento time,

  referencia_banco text,  -- NSU, identificador do PIX, etc
  comprovante_url text,   -- URL do comprovante em Storage

  criado_em timestamptz not null default now()
);

create index idx_comprovantes_fatura on comprovantes_pagamento(fatura_id);
create index idx_comprovantes_data on comprovantes_pagamento(data_pagamento);

-- ============================================================================
-- 5. PREFERÊNCIAS DE NOTIFICAÇÃO DO LOCATÁRIO
-- ============================================================================

alter table pessoas
  add column if not exists notif_email_opt_in boolean default true,
  add column if not exists notif_whatsapp_opt_in boolean default false,
  add column if not exists telefone_whatsapp text;

-- RLS: Locatários gerenciam suas próprias preferências
create policy "pessoa_read_own_notif_prefs"
  on pessoas for select
  using (
    auth.jwt() ->> 'sub' = auth_id::text
  );
