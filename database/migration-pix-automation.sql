-- Tabelas para automação de pagamentos via PIX
-- QR codes dinâmicos, cópia e cola, liquidação em tempo real

-- Configuração PIX (chaves, dados do recebedor)
create table if not exists config_pix (
  id uuid primary key default gen_random_uuid(),
  chave_pix_type varchar(20) not null check (
    chave_pix_type in ('cpf', 'cnpj', 'email', 'aleatoria')
  ),
  chave_pix varchar(255) not null unique, -- CPF/CNPJ/email/chave aleatória
  nome_recebedor varchar(255) not null,
  municipio varchar(255),
  descricao_padrao text,
  ativo boolean default true,
  data_criacao timestamp with time zone default now(),
  data_atualizacao timestamp with time zone default now()
);

alter table config_pix enable row level security;

create policy "admin_only_pix_config" on config_pix
  as permissive for all
  using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
        and auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Cobranças PIX com QR code dinâmico
create table if not exists cobrancas_pix (
  id uuid primary key default gen_random_uuid(),
  cobranca_asaas_id varchar(100) not null unique, -- ID no Asaas
  fatura_ids jsonb not null, -- array de UUID das faturas relacionadas
  qr_code text not null, -- base64 do QR code binário
  copia_cola varchar(500) not null, -- string cópia e cola do PIX
  url_qr_code varchar(500), -- URL pública para exibição do QR code
  valor_cobrado numeric(14,2) not null,
  valor_recebido numeric(14,2),
  descricao text,
  data_expiracao timestamp with time zone not null,
  status varchar(20) not null default 'pendente' check (
    status in ('pendente', 'pago', 'expirado', 'cancelado')
  ),
  data_pagamento timestamp with time zone,
  motivo_cancelamento text,
  data_cancelamento timestamp with time zone,
  -- Rastreamento
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Índices para performance
create index if not exists idx_cobrancas_pix_asaas_id on cobrancas_pix(cobranca_asaas_id);
create index if not exists idx_cobrancas_pix_status on cobrancas_pix(status);
create index if not exists idx_cobrancas_pix_data_expiracao on cobrancas_pix(data_expiracao);
create index if not exists idx_cobrancas_pix_criacao on cobrancas_pix(created_at);

alter table cobrancas_pix enable row level security;

create policy "admin_can_manage_pix" on cobrancas_pix
  as permissive for all
  using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
        and auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Adicionar coluna à tabela faturas para vincular QR code
alter table faturas add column if not exists pix_qr_code_id uuid references cobrancas_pix(id) on delete set null;

-- Índice para referência cruzada
create index if not exists idx_faturas_pix_qr_code_id on faturas(pix_qr_code_id);

-- Log de tentativas de pagamento PIX (para auditoria)
create table if not exists auditoria_pix (
  id uuid primary key default gen_random_uuid(),
  cobranca_pix_id uuid not null references cobrancas_pix(id),
  tipo_evento varchar(50) not null check (
    tipo_evento in ('qr_gerado', 'copia_cola_exibido', 'pagamento_iniciado', 'pagamento_confirmado',
                    'pagamento_recusado', 'expirado', 'cancelado', 'erro')
  ),
  descricao text,
  dados_evento jsonb,
  ip_acesso inet,
  user_agent text,
  timestamp timestamp with time zone default now()
);

-- Índices
create index if not exists idx_auditoria_pix_cobranca_id on auditoria_pix(cobranca_pix_id);
create index if not exists idx_auditoria_pix_tipo_evento on auditoria_pix(tipo_evento);
create index if not exists idx_auditoria_pix_timestamp on auditoria_pix(timestamp);

alter table auditoria_pix enable row level security;

create policy "admin_can_read_pix_audit" on auditoria_pix
  as permissive for select
  using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
        and auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );
