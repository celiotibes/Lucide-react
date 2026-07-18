-- Fase: Gestão de Contratos de Aluguel com Análise de IA
-- Módulo para upload, análise automática e validação de contratos de locação

-- Tabela de Contratos de Aluguel
create table if not exists contratos_aluguel (
  id text primary key,
  imovel_id text,
  proprietario_id text,
  inquilino_id text,
  data_inicio date not null,
  data_fim date,
  numero_contrato text unique,

  -- Valores contratuais
  valor_aluguel numeric(10,2),
  valor_caucao numeric(10,2),
  valor_taxa_condominio numeric(10,2),
  valor_iptu numeric(10,2),
  valor_seguro numeric(10,2),
  valor_agua_esgoto numeric(10,2),
  valor_luz numeric(10,2),
  valor_outras_despesas numeric(10,2),

  -- Índices de reajuste
  indice_reajuste text default 'IPCA', -- IPCA, INCC, IGP-M, etc
  percentual_reajuste numeric(5,2),
  data_ultimo_reajuste date,

  -- Status
  status text not null check (status in (
    'rascunho',
    'ativo',
    'renovado',
    'expirado',
    'rescindido',
    'em_negociacao'
  )) default 'rascunho',

  -- Documentação
  arquivo_contrato_url text,
  arquivo_contrato_tipo text, -- pdf, docx, image, etc
  arquivo_contrato_md text, -- Markdown convertido para análise de IA

  -- Análise de IA
  analise_ia jsonb, -- Resultado da análise automática
  dados_extraidos jsonb, -- Dados extraídos: aluguel, caução, índices, etc
  confianca_extracao numeric(3,2), -- 0.00 a 1.00

  -- Validação
  validado_por text,
  data_validacao timestamp,
  observacoes_validacao text,
  ajustes_solicitados jsonb, -- Campos que precisam correção manual

  -- Auditoria
  criado_em timestamp not null default now(),
  atualizado_em timestamp not null default now(),
  criado_por text,

  unique(imovel_id, data_inicio)
);

create index idx_contratos_aluguel_imovel on contratos_aluguel(imovel_id);
create index idx_contratos_aluguel_inquilino on contratos_aluguel(inquilino_id);
create index idx_contratos_aluguel_proprietario on contratos_aluguel(proprietario_id);
create index idx_contratos_aluguel_status on contratos_aluguel(status);
create index idx_contratos_aluguel_data_fim on contratos_aluguel(data_fim);

-- Tabela de histórico de renovações e negociações
create table if not exists contratos_aluguel_renovacoes (
  id text primary key,
  contrato_id text not null references contratos_aluguel(id) on delete cascade,
  tipo text not null check (tipo in (
    'renovacao',
    'ajuste_aluguel',
    'ajuste_indices',
    'negociacao',
    'rescisao',
    'extensao'
  )),

  -- Dados da renovação
  data_solicitacao timestamp not null default now(),
  data_vigencia date,
  novo_valor_aluguel numeric(10,2),
  percentual_aumento numeric(5,2),
  motivo text,

  -- Documentos
  arquivo_renovacao_url text,
  arquivo_renovacao_tipo text,
  arquivo_renovacao_md text,

  -- E-mail de comunicação
  email_enviado_para text,
  data_email_enviado timestamp,
  resposta_recebida boolean default false,
  data_resposta timestamp,
  anexos_resposta jsonb,

  -- Análise de IA
  analise_ia jsonb,
  dados_extraidos jsonb,
  confianca_extracao numeric(3,2),

  -- Status
  status text not null check (status in (
    'proposto',
    'em_analise',
    'pendente_resposta',
    'aceito',
    'rejeitado',
    'em_negociacao'
  )) default 'proposto',

  -- Validação
  validado_por text,
  data_validacao timestamp,

  criado_em timestamp not null default now(),
  atualizado_em timestamp not null default now()
);

create index idx_renovacoes_contrato on contratos_aluguel_renovacoes(contrato_id);
create index idx_renovacoes_tipo on contratos_aluguel_renovacoes(tipo);
create index idx_renovacoes_status on contratos_aluguel_renovacoes(status);

-- Tabela de Arquivos de Contrato (suporta múltiplos arquivos/anexos)
create table if not exists contratos_aluguel_arquivos (
  id text primary key,
  contrato_id text not null references contratos_aluguel(id) on delete cascade,
  tipo_documento text not null check (tipo_documento in (
    'contrato_principal',
    'aditivo',
    'anexo',
    'recibo',
    'documento_inquilino',
    'documento_proprietario',
    'comprovante_pagamento',
    'outro'
  )),

  nome_arquivo text not null,
  url_arquivo text not null,
  tipo_arquivo text, -- pdf, docx, image, etc
  tamanho_bytes integer,

  -- Conversão para Markdown
  conteudo_markdown text,
  data_conversao timestamp,

  -- OCR/Análise
  texto_extraido text,
  data_extracao_ocr timestamp,
  confianca_ocr numeric(3,2),

  criado_em timestamp not null default now(),

  constraint unique_arquivo_contrato unique (contrato_id, url_arquivo)
);

create index idx_arquivos_contrato on contratos_aluguel_arquivos(contrato_id);
create index idx_arquivos_tipo on contratos_aluguel_arquivos(tipo_documento);

-- Tabela de Análise de Índices (IPCA, INCC, etc)
create table if not exists contratos_aluguel_indices (
  id text primary key,
  contrato_id text not null references contratos_aluguel(id) on delete cascade,
  tipo_indice text not null, -- IPCA, INCC, IGP-M, etc

  -- Valores históricos
  data_indice date not null,
  valor_indice numeric(8,4),
  percentual_acumulado numeric(8,4),

  -- Data próximo reajuste
  data_proximo_reajuste date,
  valor_aluguel_atual numeric(10,2),
  valor_aluguel_atualizado numeric(10,2),
  percentual_reajuste numeric(8,4),

  -- Status
  reajuste_aplicado boolean default false,
  data_aplicacao timestamp,

  criado_em timestamp not null default now(),
  atualizado_em timestamp not null default now(),

  unique(contrato_id, tipo_indice, data_indice)
);

create index idx_indices_contrato on contratos_aluguel_indices(contrato_id);
create index idx_indices_tipo on contratos_aluguel_indices(tipo_indice);
create index idx_indices_data_reajuste on contratos_aluguel_indices(data_proximo_reajuste);

-- Tabela de Checklist de Validação
create table if not exists contratos_aluguel_checklist (
  id text primary key,
  contrato_id text not null references contratos_aluguel(id) on delete cascade,

  -- Checklist de campos
  campo_checado text not null,
  valor_esperado text,
  valor_encontrado text,
  validado boolean default false,
  datavalidacao timestamp,
  observacoes text,

  criado_em timestamp not null default now()
);

create index idx_checklist_contrato on contratos_aluguel_checklist(contrato_id);

-- RLS para contratos
alter table contratos_aluguel enable row level security;
alter table contratos_aluguel_renovacoes enable row level security;
alter table contratos_aluguel_arquivos enable row level security;
alter table contratos_aluguel_indices enable row level security;
alter table contratos_aluguel_checklist enable row level security;

-- Políticas básicas (permitir acesso a gestores)
create policy "Gestores veem contratos"
  on contratos_aluguel
  for select
  using (
    (select role from pessoas where id = auth.uid()) in ('admin', 'gestor_imovel', 'proprietario')
    or proprietario_id = auth.uid()
  );

create policy "Gestores modificam contratos"
  on contratos_aluguel
  for update
  using (
    (select role from pessoas where id = auth.uid()) in ('admin', 'gestor_imovel')
  );
