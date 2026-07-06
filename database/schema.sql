-- ============================================================================
-- CRMT Gestão Imobiliária — Schema Relacional (PostgreSQL / Supabase)
-- ============================================================================
-- Cobre Fases 0-4 do roadmap (docs/04-roadmap-fases.md). Tabelas de fases
-- posteriores já existem aqui para não exigir migração destrutiva depois,
-- mas a aplicação só precisa popular/consumir as tabelas da fase corrente.
--
-- Convenções:
--   - PK sempre uuid (default gen_random_uuid()).
--   - Dinheiro em numeric(14,2). Percentual em numeric(6,4) (ex: 0.1200 = 12%).
--   - Enums implementados como CHECK em texto (mais fácil de alterar que
--     native ENUM em Postgres, que exige ALTER TYPE bloqueante).
--   - Toda tabela financeira/contratual tem coluna criado_em/atualizado_em.
--   - RLS: habilitada nas tabelas voltadas a portal (inquilino/investidor/
--     prestador). Políticas de exemplo ao final; adaptar aos papéis reais
--     de auth.uid() -> usuarios.pessoa_id.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 0. LOCALIZAÇÃO E ESTRUTURA FÍSICA
-- ============================================================================

create table cidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  uf text not null,
  unique (nome, uf)
);

insert into cidades (nome, uf) values ('Curitiba', 'PR'), ('Florianópolis', 'SC');

create table residenciais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade_id uuid not null references cidades(id),
  endereco text,
  permite_temporada boolean not null default true,
  permite_temporada_verificado_em date,
  criado_em timestamptz not null default now()
);

create table imoveis (
  id uuid primary key default gen_random_uuid(),
  residencial_id uuid references residenciais(id),
  cidade_id uuid not null references cidades(id),
  identificacao text not null,                 -- ex: "Kitnet 14", "Apto Igloo 193B"
  tipo text not null check (tipo in ('kitnet','apartamento','sala_comercial','casa')),
  endereco text,
  status text not null default 'disponivel'
    check (status in ('disponivel','ocupado','manutencao','indisponivel','vacancia_anunciada')),
  franquia_energia_kwh numeric(6,2) not null default 30,   -- 30 ou 50 kWh conforme data do contrato
  taxa_administracao_energia_pct numeric(6,4) not null default 0.25,
  data_desocupacao timestamptz,                 -- dispara régua de vacância (D+10/D+20/D+30)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_imoveis_status on imoveis(status);
create index idx_imoveis_residencial on imoveis(residencial_id);

-- ============================================================================
-- 1. PESSOAS E PAPÉIS
-- ============================================================================

create table pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf_cnpj text unique,
  email text,
  telefone text,
  endereco text,
  dados_sensiveis_anonimizados boolean not null default false, -- LGPD (gap 19)
  criado_em timestamptz not null default now()
);

create table pessoa_papeis (
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  papel text not null check (papel in
    ('locatario','fiador','investidor','prestador_fixo','prestador_eventual','colaborador','fornecedor')),
  primary key (pessoa_id, papel)
);

-- composição societária / propriedade de cada imóvel
create table imovel_propriedade (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id) on delete cascade,
  proprietario_pessoa_id uuid references pessoas(id), -- null = CRMT (propriedade integral)
  percentual numeric(6,4) not null default 1.0000,
  taxa_administracao_pct numeric(6,4) not null default 0, -- 0.12 p/ Ana Maria Nunes; 0 p/ Apto 509B
  data_inicio date not null default current_date,
  data_fim date,
  observacao text
);

create index idx_imovel_propriedade_imovel on imovel_propriedade(imovel_id);

-- ============================================================================
-- 2. CONTRATOS, GARANTIAS E REAJUSTES
-- ============================================================================

create table contratos (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  tipo text not null check (tipo in ('locacao_padrao','temporada')),
  data_inicio date not null,
  data_fim date,
  dia_vencimento smallint check (dia_vencimento between 1 and 31), -- 1 ou 10, ver regra de pró-rata
  valor_aluguel numeric(14,2) not null,
  indice_reajuste text check (indice_reajuste in ('IGPM','IPCA','INPC', null)),
  data_ultimo_reajuste date,
  data_proximo_reajuste date,
  aviso_previo_dias smallint default 30,
  aviso_previo_lancado_em date,        -- dispara publicação antecipada em M12
  status text not null default 'ativo'
    check (status in ('ativo','aviso_previo','encerrado','extrajudicial','em_despejo')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_contratos_imovel on contratos(imovel_id);
create index idx_contratos_status on contratos(status);

create table contrato_partes (
  contrato_id uuid not null references contratos(id) on delete cascade,
  pessoa_id uuid not null references pessoas(id),
  papel text not null check (papel in ('locatario_principal','locatario_adicional','fiador')),
  primary key (contrato_id, pessoa_id, papel)
);

-- Garantias: caução, fiador, seguro-fiança, título de capitalização, seguro-incêndio
-- (seguro-incêndio é OBRIGATÓRIO por lei — Art. 22, VII, Lei 8.245/91 — gap 1)
create table garantias (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  tipo text not null check (tipo in
    ('caucao','fiador','seguro_fianca','titulo_capitalizacao','seguro_incendio')),
  valor numeric(14,2),
  data_inicio date,
  data_vencimento_apolice date,        -- alerta 60 dias antes (seguro-fiança/incêndio)
  apolice_numero text,
  status text not null default 'ativa' check (status in ('ativa','vencida','baixada')),
  criado_em timestamptz not null default now()
);

create index idx_garantias_vencimento on garantias(data_vencimento_apolice) where status = 'ativa';

-- Rendimento do caução (TR/poupança) fica calculado em runtime pela aplicação
-- a partir de garantias.valor + data_inicio; não versionamos "yield" diário
-- em tabela própria para não duplicar fonte de verdade dos índices oficiais.

create table reajustes_contrato (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  indice text not null,
  percentual numeric(8,5) not null,
  valor_anterior numeric(14,2) not null,
  valor_novo numeric(14,2) not null,
  status text not null default 'proposto' check (status in ('proposto','aprovado','rejeitado','aplicado')),
  aprovado_por uuid references pessoas(id),
  data_proposta date not null default current_date,
  data_aprovacao date
);

-- Direito de preferência do locatário em caso de venda (Art. 27-34) — gap 2
create table notificacoes_preferencia_venda (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id),
  valor_oferta numeric(14,2) not null,
  notificado_em date not null default current_date,
  prazo_resposta_dias smallint not null default 30,
  resposta text check (resposta in ('exerceu_preferencia','recusou','sem_resposta', null))
);

-- ============================================================================
-- 3. FATURAMENTO (competência) E COBRANÇA (caixa / Asaas)
-- ============================================================================

create table categorias_financeiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  tipo text not null check (tipo in ('receita','despesa')),
  dre_grupo text not null
);

-- Regime de Competência: o "fato gerador" (mês a que se refere), independente de pagamento
create table faturas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid references contratos(id),
  imovel_id uuid not null references imoveis(id),
  competencia date not null,           -- sempre dia 1 do mês de referência
  tipo text not null check (tipo in ('aluguel','energia','taxa_condominio','multa_juros','honorarios','outros')),
  valor_bruto numeric(14,2) not null,
  valor_liquido numeric(14,2) not null,
  vencimento date not null,
  status text not null default 'aberta'
    check (status in ('aberta','paga','atrasada','cancelada','renegociada')),
  permite_acordo boolean not null default false, -- flag que suspende juros/multa e habilita parcelamento
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_faturas_contrato on faturas(contrato_id);
create index idx_faturas_status_vencimento on faturas(status, vencimento);

-- Detalhamento por item (transparência da taxa de 25% de energia — gap/auditoria item 1)
create table fatura_itens (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas(id) on delete cascade,
  descricao text not null,             -- ex: "Energia (consumo)", "Taxa adm. infra. compartilhada 25%"
  valor numeric(14,2) not null,
  categoria_financeira_id uuid references categorias_financeiras(id)
);

-- Regime de Caixa: o que efetivamente transitou via Asaas
create table cobrancas_asaas (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas(id),
  asaas_id text unique,
  tipo text not null check (tipo in ('boleto','pix')),
  valor_cobrado numeric(14,2) not null,
  data_pagamento timestamptz,
  status text not null default 'pendente'
    check (status in ('pendente','pago','atrasado','cancelado')),
  criado_em timestamptz not null default now()
);

create index idx_cobrancas_asaas_fatura on cobrancas_asaas(fatura_id);

-- Régua de cobrança automatizada (D+5 / D+15 / D+30)
create table regua_cobranca_eventos (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas(id) on delete cascade,
  evento text not null check (evento in ('D5','D15','D30')),
  canal text not null check (canal in ('whatsapp','email')),
  disparado_em timestamptz,
  unique (fatura_id, evento)
);

-- Split de pagamento (Asaas Split): destino de cada parte do valor liquidado
create table split_pagamento (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas(id) on delete cascade,
  beneficiario_pessoa_id uuid references pessoas(id), -- null = CRMT
  tipo text not null check (tipo in ('proprietario','taxa_administracao','fundo_reserva','caucao')),
  valor numeric(14,2) not null
);

-- ============================================================================
-- 4. ENERGIA
-- ============================================================================

create table tarifas_energia (
  id uuid primary key default gen_random_uuid(),
  distribuidora text not null,
  vigencia_inicio date not null,
  te_valor numeric(10,6) not null,     -- Tarifa de Energia (R$/kWh)
  tusd_valor numeric(10,6) not null,   -- Tarifa de Uso do Sistema de Distribuição
  bandeira text not null default 'verde' check (bandeira in ('verde','amarela','vermelha_1','vermelha_2'))
);

-- Leitura sempre nasce 'pendente_confirmacao' (auditoria item 7: OCR não é
-- fonte de verdade sozinho — precisa de confirmação humana antes de faturar)
create table leituras_energia (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  contrato_id uuid references contratos(id),
  data_leitura date not null,
  leitura_kwh numeric(10,2),
  foto_url text,
  origem text not null check (origem in ('ocr','manual','media_fallback')),
  status text not null default 'pendente_confirmacao'
    check (status in ('pendente_confirmacao','confirmada','rejeitada')),
  confirmado_por uuid references pessoas(id),
  confirmado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index idx_leituras_energia_imovel on leituras_energia(imovel_id, data_leitura desc);

-- ============================================================================
-- 5. PRESTADORES FIXOS (Paulo, Cristiano) E FOLHA
-- ============================================================================

create table lancamentos_prestador (
  id uuid primary key default gen_random_uuid(),
  prestador_id uuid not null references pessoas(id),
  data date not null,
  tipo text not null check (tipo in ('diaria','meia_diaria','extra','limpeza_airbnb')),
  valor_base numeric(14,2) not null,
  km numeric(8,2) default 0,
  adicional_pct numeric(6,4) default 0,     -- 0.25 combustível veículo próprio, 0.20 noturno/feriado
  motivo_adicional text check (motivo_adicional in ('noturno','feriado','fim_de_semana', null)),
  imovel_id uuid references imoveis(id),    -- centro de custo, quando aplicável
  status text not null default 'pendente' check (status in ('pendente','pago')),
  criado_em timestamptz not null default now()
);

create index idx_lancamentos_prestador_prestador on lancamentos_prestador(prestador_id, data);

-- "Déficit de Retenção Contratual": desconto na folha seguinte se diárias
-- obrigatórias não cumpridas
create table deficit_retencao (
  id uuid primary key default gen_random_uuid(),
  prestador_id uuid not null references pessoas(id),
  competencia date not null,
  dias_faltantes smallint not null,
  valor_descontado numeric(14,2) not null,
  aplicado_na_competencia date not null  -- mês subsequente
);

create table folha_fechamento (
  id uuid primary key default gen_random_uuid(),
  prestador_id uuid not null references pessoas(id),
  competencia_inicio date not null,
  competencia_fim date not null,        -- limpeza Airbnb fecha sextas à tarde
  valor_total numeric(14,2) not null,
  status text not null default 'aberto' check (status in ('aberto','pago')),
  pago_em timestamptz
);

-- ============================================================================
-- 6. MANUTENÇÃO / TICKETING / PRESTADORES EVENTUAIS (Magic Link)
-- ============================================================================

create table ordens_servico (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  aberto_por_pessoa_id uuid references pessoas(id),
  categoria text not null,
  descricao text,
  urgencia text not null default 'media' check (urgencia in ('baixa','media','alta','urgente')),
  status text not null default 'aberto'
    check (status in ('aberto','alocado','em_execucao','concluido','cancelado')),
  prestador_id uuid references pessoas(id),
  checkin_at timestamptz,
  checkin_geo point,
  checkout_at timestamptz,
  checkout_geo point,
  avaliacao_estrelas smallint check (avaliacao_estrelas between 1 and 5),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_os_imovel on ordens_servico(imovel_id);
create index idx_os_status on ordens_servico(status);

-- custo do serviço + nota fiscal (OCR de comprovante — gap Módulo Capex/Opex)
create table ordem_servico_custos (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references ordens_servico(id) on delete cascade,
  descricao text not null,
  valor numeric(14,2) not null,
  nota_fiscal_url text,
  nota_fiscal_ocr_status text default 'pendente_confirmacao'
    check (nota_fiscal_ocr_status in ('pendente_confirmacao','confirmada','rejeitada', null))
);

-- Fricção zero para prestador eventual: link tokenizado, sem exigir login
create table magic_links (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references ordens_servico(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expira_em timestamptz not null,
  usado_em timestamptz
);

-- ============================================================================
-- 7. PATRIMÔNIO / COMODATO E DEPRECIAÇÃO (CPC 27)
-- ============================================================================

create table ativos_comodato (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  descricao text not null,
  categoria text,                      -- ex: 'moveis' (10 anos), 'eletronicos' (5 anos)
  valor_aquisicao numeric(14,2) not null,
  data_aquisicao date not null,
  vida_util_meses smallint not null,
  valor_residual numeric(14,2) not null default 0,
  qr_code text unique,
  status text not null default 'ativo' check (status in ('ativo','baixado')),
  criado_em timestamptz not null default now()
);

create table depreciacao_mensal (
  id uuid primary key default gen_random_uuid(),
  ativo_id uuid not null references ativos_comodato(id) on delete cascade,
  competencia date not null,
  valor_depreciado_mes numeric(14,2) not null,
  valor_contabil_acumulado numeric(14,2) not null,
  unique (ativo_id, competencia)
);

-- ============================================================================
-- 8. DOCUMENTOS, ASSINATURAS E VISTORIAS
-- ============================================================================

create table documentos_gerados (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in
    ('contrato','aditivo','distrato','declaracao_residencia','declaracao_quitacao',
     'notificacao_extrajudicial','termo_confissao_divida','termo_acordo')),
  pessoa_id uuid references pessoas(id),
  contrato_id uuid references contratos(id),
  hash_sha256 text not null unique,
  storage_path text not null,
  qr_validacao_url text not null,
  nivel_assinatura_exigido text not null default 'simples'
    check (nivel_assinatura_exigido in ('simples','avancada')), -- decidido por tipo de doc, ver auditoria item 4
  emitido_em timestamptz not null default now(),
  emitido_por uuid references pessoas(id)
);

create table assinaturas (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos_gerados(id) on delete cascade,
  signatario_pessoa_id uuid not null references pessoas(id),
  provedor text not null default 'autentique',
  status text not null default 'pendente' check (status in ('pendente','assinado','recusado')),
  assinado_em timestamptz
);

create table vistorias (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id),
  imovel_id uuid not null references imoveis(id),
  tipo text not null check (tipo in ('entrada','periodica','saida')),
  realizada_por uuid references pessoas(id),
  data timestamptz not null default now(),
  leitura_energia_id uuid references leituras_energia(id),
  checklist_json jsonb not null default '{}'::jsonb, -- chaves devolvidas, reparo estrutural, pintura, etc.
  status text not null default 'em_andamento' check (status in ('em_andamento','concluida')),
  documento_id uuid references documentos_gerados(id)
);

create table vistoria_fotos (
  id uuid primary key default gen_random_uuid(),
  vistoria_id uuid not null references vistorias(id) on delete cascade,
  url text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  capturado_em timestamptz not null default now()
);

-- Termo de confissão de dívida quando saldo de vistoria de saída é negativo
-- (auditoria de dupla garantia — caução insuficiente para cobrir danos)
create table confissoes_divida (
  id uuid primary key default gen_random_uuid(),
  vistoria_id uuid not null references vistorias(id),
  contrato_id uuid not null references contratos(id),
  valor_principal numeric(14,2) not null,
  juros_pct_am numeric(6,4) not null default 0.02,
  multa_pct numeric(6,4) not null default 0.10,
  honorarios_pct numeric(6,4) not null default 0.20,
  documento_id uuid references documentos_gerados(id),
  status text not null default 'pendente' check (status in ('pendente','acordado','pago','judicializado'))
);

-- ============================================================================
-- 9. TESOURARIA MULTI-BANCOS
-- ============================================================================

create table contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  instituicao text not null,
  titular_pessoa_id uuid references pessoas(id),
  tipo text not null check (tipo in ('corrente','poupanca','cartao_credito'))
);

create table transacoes_bancarias (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_bancarias(id),
  data date not null,
  valor numeric(14,2) not null,           -- negativo = débito
  descricao text,
  categoria_sugerida uuid references categorias_financeiras(id),
  categoria_final uuid references categorias_financeiras(id),
  centro_custo_imovel_id uuid references imoveis(id),
  transferencia_interna boolean not null default false,
  status text not null default 'sugerido' check (status in ('sugerido','aprovado','ignorado')),
  origem text not null check (origem in ('ofx','open_finance','manual')),
  aprovado_por uuid references pessoas(id),   -- nunca vira DRE oficial sem isso (auditoria item 8)
  aprovado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index idx_transacoes_conta_data on transacoes_bancarias(conta_id, data);
create index idx_transacoes_status on transacoes_bancarias(status);

-- ============================================================================
-- 10. FUNDOS (FRO / CAPEX / FPC) E LEDGER DO INVESTIDOR
-- ============================================================================

create table fundos (
  id uuid primary key default gen_random_uuid(),
  escopo_tipo text not null check (escopo_tipo in ('imovel','residencial','global')),
  escopo_id uuid,                          -- id do imóvel/residencial, null se global
  tipo text not null check (tipo in ('FRO','CAPEX','FPC')),
  saldo numeric(14,2) not null default 0,
  teto_configurado numeric(14,2)           -- FRO para de reter ao atingir o teto
);

create table fundo_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  fundo_id uuid not null references fundos(id) on delete cascade,
  tipo text not null check (tipo in ('credito','debito')),
  valor numeric(14,2) not null,
  referencia_fatura_id uuid references faturas(id),
  descricao text,
  criado_em timestamptz not null default now()
);

-- Conta corrente do investidor (NÃO cap table automático — auditoria item 5).
-- Mudança de percentual de propriedade é sempre um evento manual em
-- imovel_propriedade, documentado por um documentos_gerados correspondente.
create table investidor_ledger (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id),
  imovel_id uuid not null references imoveis(id),
  data date not null default current_date,
  tipo text not null check (tipo in ('credito_repasse','debito_custo','retencao_reinvestimento','saque')),
  valor numeric(14,2) not null,
  saldo_apos numeric(14,2) not null,
  referencia_fatura_id uuid references faturas(id),
  criado_em timestamptz not null default now()
);

create index idx_investidor_ledger_pessoa on investidor_ledger(pessoa_id, data desc);

-- ============================================================================
-- 11. JURÍDICO
-- ============================================================================

create table processos_judiciais (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('despejo','cobranca','trabalhista','consumidor','outro')),
  contrato_id uuid references contratos(id),
  imovel_id uuid references imoveis(id),
  parte_contraria text,
  valor_causa numeric(14,2),
  -- CPC 25: só se provisiona quando "provavel"; "possivel" é nota explicativa;
  -- "remota" nem isso (auditoria item 6)
  probabilidade_perda text not null check (probabilidade_perda in ('provavel','possivel','remota')),
  provisionado boolean not null default false,
  status text not null default 'em_andamento',
  advogado_responsavel text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- trigger de exemplo: só permite provisionado=true quando probabilidade='provavel'
create or replace function fn_check_provisao_cpc25()
returns trigger as $$
begin
  if new.provisionado and new.probabilidade_perda <> 'provavel' then
    raise exception 'Só é permitido provisionar quando probabilidade_perda = provavel (CPC 25)';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_check_provisao_cpc25
  before insert or update on processos_judiciais
  for each row execute function fn_check_provisao_cpc25();

create table dossies_inadimplencia (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id),
  gerado_em timestamptz not null default now(),
  valor_consolidado numeric(14,2) not null,
  status text not null default 'gerado' check (status in ('gerado','enviado_juridico','encerrado'))
);

-- ============================================================================
-- 12. COMERCIAL (Leads, Anúncios)
-- ============================================================================

create table leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  contato text,
  origem text,
  status text not null default 'novo'
    check (status in ('novo','visita','analise_credito','aprovado','reprovado','contrato_assinado')),
  imovel_interesse_id uuid references imoveis(id),
  score_credito numeric(5,2),
  criado_em timestamptz not null default now()
);

create table anuncios (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  plataforma text not null check (plataforma in ('airbnb','booking','landing_page','outro')),
  status text not null default 'rascunho' check (status in ('rascunho','publicado','pausado')),
  link text,
  publicado_em timestamptz
);

-- Sincronização de calendário multi-canal (evitar overbooking — gap 5)
create table reservas_temporada (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  contrato_id uuid references contratos(id),
  plataforma text not null check (plataforma in ('airbnb','booking','direto','outro')),
  checkin date not null,
  checkout date not null,
  valor_repassado numeric(14,2),
  status text not null default 'confirmada' check (status in ('confirmada','cancelada','chargeback')),
  criado_em timestamptz not null default now(),
  constraint chk_datas check (checkout > checkin)
);

-- Impede overbooking: nenhuma reserva confirmada pode sobrepor outra do mesmo imóvel
create extension if not exists btree_gist;
alter table reservas_temporada
  add constraint no_overlap_reserva
  exclude using gist (
    imovel_id with =,
    daterange(checkin, checkout) with &&
  ) where (status = 'confirmada');

-- ============================================================================
-- 13. MUNICIPAL / TRIBUTÁRIO
-- ============================================================================

create table tributos_municipais (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  tipo text not null check (tipo in ('iptu','iss','taxa_lixo','outro')),
  competencia date not null,
  valor numeric(14,2) not null,
  vencimento date not null,
  status text not null default 'aberto' check (status in ('aberto','pago','parcelado'))
);

-- ============================================================================
-- 14. NOTIFICAÇÕES E AUTENTICAÇÃO
-- ============================================================================

create table notificacoes_log (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid references pessoas(id),
  canal text not null check (canal in ('whatsapp','email','sms','push')),
  template text not null,
  status text not null default 'enviado' check (status in ('enviado','falhou','lido')),
  enviado_em timestamptz not null default now()
);

-- Vínculo entre auth.users (Supabase Auth) e pessoa/papel no domínio.
-- É a base de todas as políticas de RLS abaixo.
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  pessoa_id uuid references pessoas(id),
  papel text not null check (papel in ('admin','economista','inquilino','investidor','prestador'))
);

-- ============================================================================
-- 15. AUDITORIA (imutável, cobre todas as tabelas financeiras/contratuais)
-- ============================================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid not null,
  operacao text not null check (operacao in ('insert','update','delete')),
  dados_antes jsonb,
  dados_depois jsonb,
  usuario_id uuid references usuarios(id),
  criado_em timestamptz not null default now()
);

create or replace function fn_audit_trigger()
returns trigger as $$
begin
  insert into audit_log (tabela, registro_id, operacao, dados_antes, dados_depois, usuario_id)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op in ('update','delete') then to_jsonb(old) else null end,
    case when tg_op in ('update','insert') then to_jsonb(new) else null end,
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Aplicar em todas as tabelas financeiras/contratuais sensíveis:
create trigger trg_audit_contratos after insert or update or delete on contratos
  for each row execute function fn_audit_trigger();
create trigger trg_audit_faturas after insert or update or delete on faturas
  for each row execute function fn_audit_trigger();
create trigger trg_audit_split_pagamento after insert or update or delete on split_pagamento
  for each row execute function fn_audit_trigger();
create trigger trg_audit_garantias after insert or update or delete on garantias
  for each row execute function fn_audit_trigger();
create trigger trg_audit_investidor_ledger after insert or update or delete on investidor_ledger
  for each row execute function fn_audit_trigger();
create trigger trg_audit_processos_judiciais after insert or update or delete on processos_judiciais
  for each row execute function fn_audit_trigger();

-- ============================================================================
-- 16. ROW LEVEL SECURITY — exemplos por papel (adaptar conforme portais reais)
-- ============================================================================

alter table faturas enable row level security;
alter table contratos enable row level security;
alter table investidor_ledger enable row level security;
alter table ordens_servico enable row level security;
alter table documentos_gerados enable row level security;

-- Admin/economista: acesso total (via policy permissiva checando papel)
create policy admin_full_access_faturas on faturas
  for all using (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.papel in ('admin','economista'))
  );

-- Inquilino: só enxerga faturas do próprio contrato
create policy inquilino_ve_proprias_faturas on faturas
  for select using (
    exists (
      select 1 from usuarios u
      join contrato_partes cp on cp.pessoa_id = u.pessoa_id
      where u.id = auth.uid() and u.papel = 'inquilino' and cp.contrato_id = faturas.contrato_id
    )
  );

-- Investidor: só enxerga o próprio ledger
create policy investidor_ve_proprio_ledger on investidor_ledger
  for select using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.papel = 'investidor' and u.pessoa_id = investidor_ledger.pessoa_id
    )
  );

-- Prestador: só enxerga ordens de serviço alocadas a ele
create policy prestador_ve_proprias_os on ordens_servico
  for select using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.papel = 'prestador' and u.pessoa_id = ordens_servico.prestador_id
    )
  );

-- Documentos: cada pessoa só vê os próprios; admin/economista veem tudo
create policy pessoa_ve_proprios_documentos on documentos_gerados
  for select using (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.papel in ('admin','economista'))
    or
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.pessoa_id = documentos_gerados.pessoa_id
    )
  );

-- Nota: a validação pública de documento (QR code -> hash) deve usar uma
-- rota específica com service role / função RPC que expõe apenas
-- tipo + validade + hash, nunca a linha completa da tabela.
