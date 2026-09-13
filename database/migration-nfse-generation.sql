-- Tabela de auditoria para RPS e NFS-e (Nota Fiscal de Serviço Eletrônica)
-- Rastreia geração, emissão e cancelamento de notas fiscais de serviço

create table if not exists auditoria_nfse (
  id uuid primary key default gen_random_uuid(),
  -- Identificadores RPS
  rps_numero varchar(20) not null,
  rps_serie varchar(5) default '1',
  -- Identificadores NFS-e (preenchidos após emissão)
  numero_nfse varchar(20) unique,
  -- Dados do serviço
  descricao_servico text not null,
  valor_servico numeric(14,2) not null,
  valor_deducoes numeric(14,2) default 0,
  valor_iss numeric(14,2) not null,
  percentual_aliquota numeric(5,2) default 5.00,
  -- Identificação das partes
  prestador_cnpj varchar(20) not null, -- quem emite
  tomador_cpf_cnpj varchar(20) not null, -- quem recebe o serviço
  -- Datas
  data_emissao timestamp with time zone default now(),
  data_cancelamento timestamp with time zone,
  -- Status
  status varchar(20) not null default 'rps_criado' check (
    status in ('rps_criado', 'validado', 'emitido', 'cancelado', 'erro')
  ),
  motivo_cancelamento text,
  -- Código de verificação para validação offline
  codigo_verificacao varchar(32),
  -- Localização municipal
  municipio_codigo varchar(10),
  -- Rastreamento de faturas relacionadas
  fatura_ids jsonb, -- array de UUIDs
  -- XML assinado (armazenado se necessário)
  xml_nfse text,
  -- Logs de sincronização
  sincronizado_em timestamp with time zone,
  erro_sincronizacao text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Índices para performance
create index if not exists idx_auditoria_nfse_rps_numero on auditoria_nfse(rps_numero);
create index if not exists idx_auditoria_nfse_numero_nfse on auditoria_nfse(numero_nfse);
create index if not exists idx_auditoria_nfse_prestador on auditoria_nfse(prestador_cnpj);
create index if not exists idx_auditoria_nfse_data_emissao on auditoria_nfse(data_emissao);
create index if not exists idx_auditoria_nfse_status on auditoria_nfse(status);
create index if not exists idx_auditoria_nfse_municipio on auditoria_nfse(municipio_codigo);

-- RLS: Admin pode ler/escrever tudo
alter table auditoria_nfse enable row level security;

create policy "admin_can_manage_nfse" on auditoria_nfse
  as permissive for all
  using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
        and (auth.users.raw_user_meta_data->>'role' = 'admin'
          or auth.users.raw_user_meta_data->>'role' = 'proprietario')
    )
  );

-- Tabela de configuração de certificado digital (segura)
create table if not exists config_certificados_nfse (
  id uuid primary key default gen_random_uuid(),
  cnpj_empresa varchar(20) not null unique,
  tipo_certificado varchar(20) default 'A1', -- A1 (computador) ou A3 (token)
  -- Não armazenar senhas ou chaves privadas aqui - usar Key Vault externo
  thumbprint_certificado varchar(100),
  data_validade_certificado date,
  municipios_integrados jsonb default '[]'::jsonb, -- array de códigos IBGE
  url_webservice_municipal varchar(500),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Índice para consultas
create index if not exists idx_config_cert_cnpj on config_certificados_nfse(cnpj_empresa);

-- RLS
alter table config_certificados_nfse enable row level security;

create policy "admin_only_cert_config" on config_certificados_nfse
  as permissive for all
  using (
    exists (
      select 1 from auth.users
      where auth.users.id = auth.uid()
        and auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );
