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
  -- Distribuidora de energia local — resolve automaticamente qual linha de
  -- tarifas_energia usar por cidade (server/integracao/faturarEnergia.ts).
  distribuidora_energia text,
  unique (nome, uf)
);

insert into cidades (nome, uf, distribuidora_energia) values
  ('Curitiba', 'PR', 'COPEL'),
  ('Florianópolis', 'SC', 'CELESC');

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

-- Índices únicos parciais (só para os dois tipos que já têm gerador
-- automático — 'aluguel' e 'energia', um por contrato+competência):
-- fecham no banco a mesma garantia que `gerarFaturaMensal.ts` e
-- `faturarEnergia.ts` só checavam em código (`not exists` seguido de
-- `insert`, sem transação nem lock — corrida real entre duas execuções
-- concorrentes do mesmo job, ou entre o job e um retry, geraria fatura
-- duplicada em vez de "pular por já existir"; foi exatamente o que a
-- suíte de teste pegou ao rodar arquivos de teste em paralelo contra o
-- mesmo banco). 'multa_juros'/'honorarios'/'taxa_condominio'/'outros'
-- ficam de fora de propósito — nenhum gerador os cria ainda, e uma
-- constraint única ampla demais bloquearia um uso legítimo futuro (ex.:
-- mais de uma cobrança "outros" no mesmo mês).
create unique index uq_faturas_aluguel_por_contrato_competencia
  on faturas(contrato_id, competencia) where tipo = 'aluguel';
create unique index uq_faturas_energia_por_contrato_competencia
  on faturas(contrato_id, competencia) where tipo = 'energia';

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

-- Extrato mensal do proprietário/investidor: agregado pré-calculado, não só
-- o ledger cru. Benchmark de mercado (Imobzi "Extrato do Proprietário" —
-- docs/06-benchmark-mercado.md): a prestação de contas precisa ser um
-- documento pronto, disparado proativamente por WhatsApp/e-mail, não algo
-- que o sócio precise montar sozinho consultando o ledger.
create table extratos_mensais_proprietario (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id),
  imovel_id uuid references imoveis(id),         -- null = extrato consolidado da carteira do sócio
  competencia date not null,
  receita_bruta numeric(14,2) not null,
  total_deducoes numeric(14,2) not null,
  valor_repassado numeric(14,2) not null,
  documento_id uuid references documentos_gerados(id),
  enviado_em timestamptz,
  canal_envio text check (canal_envio in ('whatsapp','email', null)),
  criado_em timestamptz not null default now(),
  unique (pessoa_id, imovel_id, competencia)
);

-- Detalhamento item a item do extrato (receita de aluguel, IPTU, manutenção,
-- taxa de administração etc.) — mesma lógica de transparência de fatura_itens.
create table extrato_mensal_itens (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references extratos_mensais_proprietario(id) on delete cascade,
  descricao text not null,
  tipo text not null check (tipo in ('receita','despesa')),
  valor numeric(14,2) not null
);

-- Nota Fiscal de Serviço (NFS-e) da própria CRMT sobre receita de
-- administração/honorários. Lacuna identificada via benchmark com o Imoview
-- (docs/06-benchmark-mercado.md): cobrar terceiros por gestão é prestação de
-- serviço sujeita a NFS-e municipal — não estava modelado antes.
create table notas_fiscais_servico (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('taxa_administracao', 'honorarios_corporativos', 'outros')),
  tomador_pessoa_id uuid references pessoas(id),   -- investidor/sócio que paga a taxa
  referencia_fatura_id uuid references faturas(id),
  competencia date not null,
  valor_servico numeric(14,2) not null,
  municipio text not null,
  numero_nfse text,
  status text not null default 'pendente' check (status in ('pendente','emitida','cancelada')),
  emitida_em timestamptz
);

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

-- 'zap'/'vivareal'/'olx' cobrem locação padrão vaga (benchmark Vista Office —
-- docs/06-benchmark-mercado.md); 'airbnb'/'booking' cobrem temporada.
create table anuncios (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  plataforma text not null check (plataforma in
    ('airbnb','booking','landing_page','zap','vivareal','olx','outro')),
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
create trigger trg_audit_notas_fiscais_servico after insert or update or delete on notas_fiscais_servico
  for each row execute function fn_audit_trigger();

-- ============================================================================
-- 16. ROW LEVEL SECURITY
-- ============================================================================
-- Esta seção foi reescrita depois de um ciclo de stress-test que rodou cada
-- tabela como o papel `authenticated` do Supabase (não como superusuário) e
-- encontrou 5 bugs reais na primeira versão:
--   1. `contratos` tinha RLS habilitado sem NENHUMA política -> admin
--      ficava bloqueado de ver a própria carteira de contratos.
--   2. Mesma causa bloqueava o inquilino de ver o próprio contrato.
--   3. `investidor_ledger` só tinha política para o investidor dono da
--      linha -> admin/economista não conseguiam auditar o ledger de
--      ninguém via papel authenticated.
--   4. `ordens_servico` só tinha política de SELECT -> o prestador não
--      conseguia gravar check-in/check-out (UPDATE), quebrando o fluxo
--      operacional inteiro do Módulo 5.
--   5. Mesma tabela: admin não tinha política de SELECT própria.
-- Regra geral daqui em diante: toda tabela com RLS habilitado tem uma
-- política de bypass para admin/economista (via fn_eh_admin_ou_economista,
-- para não repetir o mesmo EXISTS em cada policy) MAIS as políticas
-- específicas de papel que o portal correspondente precisa.

create or replace function fn_eh_admin_ou_economista()
returns boolean as $$
  select exists (
    select 1 from usuarios u where u.id = auth.uid() and u.papel in ('admin','economista')
  );
$$ language sql stable security definer;

alter table faturas enable row level security;
alter table contratos enable row level security;
alter table investidor_ledger enable row level security;
alter table extratos_mensais_proprietario enable row level security;
alter table extrato_mensal_itens enable row level security;
alter table ordens_servico enable row level security;
alter table documentos_gerados enable row level security;
alter table garantias enable row level security;
alter table leituras_energia enable row level security;
alter table cobrancas_asaas enable row level security;

-- ---- contratos ----
create policy admin_full_access_contratos on contratos
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy inquilino_ve_proprio_contrato on contratos
  for select using (
    exists (
      select 1 from usuarios u
      join contrato_partes cp on cp.pessoa_id = u.pessoa_id
      where u.id = auth.uid() and u.papel = 'inquilino' and cp.contrato_id = contratos.id
    )
  );

-- ---- faturas ----
create policy admin_full_access_faturas on faturas
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy inquilino_ve_proprias_faturas on faturas
  for select using (
    exists (
      select 1 from usuarios u
      join contrato_partes cp on cp.pessoa_id = u.pessoa_id
      where u.id = auth.uid() and u.papel = 'inquilino' and cp.contrato_id = faturas.contrato_id
    )
  );

-- ---- cobrancas_asaas (status de boleto/PIX — mesmo escopo de faturas) ----
create policy admin_full_access_cobrancas on cobrancas_asaas
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy inquilino_ve_proprias_cobrancas on cobrancas_asaas
  for select using (
    exists (
      select 1 from usuarios u
      join contrato_partes cp on cp.pessoa_id = u.pessoa_id
      join faturas f on f.contrato_id = cp.contrato_id
      where u.id = auth.uid() and u.papel = 'inquilino' and f.id = cobrancas_asaas.fatura_id
    )
  );
create trigger trg_audit_cobrancas_asaas
  after insert or update or delete on cobrancas_asaas
  for each row execute function fn_audit_trigger();

-- ---- garantias (caução/fiador/seguro — "Auditoria de Caução Exibida", gap 8-D) ----
create policy admin_full_access_garantias on garantias
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy inquilino_ve_proprias_garantias on garantias
  for select using (
    exists (
      select 1 from usuarios u
      join contrato_partes cp on cp.pessoa_id = u.pessoa_id
      where u.id = auth.uid() and u.papel = 'inquilino' and cp.contrato_id = garantias.contrato_id
    )
  );

-- ---- leituras_energia ("Dashboards de Consumo no Portal do Inquilino", gap 8-C) ----
create policy admin_full_access_leituras on leituras_energia
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy inquilino_ve_proprias_leituras on leituras_energia
  for select using (
    exists (
      select 1 from usuarios u
      join contrato_partes cp on cp.pessoa_id = u.pessoa_id
      where u.id = auth.uid() and u.papel = 'inquilino' and cp.contrato_id = leituras_energia.contrato_id
    )
  );

-- ---- investidor_ledger ----
create policy admin_full_access_ledger on investidor_ledger
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy investidor_ve_proprio_ledger on investidor_ledger
  for select using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.papel = 'investidor' and u.pessoa_id = investidor_ledger.pessoa_id
    )
  );

-- ---- extratos_mensais_proprietario ----
create policy admin_full_access_extratos on extratos_mensais_proprietario
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy investidor_ve_proprio_extrato on extratos_mensais_proprietario
  for select using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.papel = 'investidor' and u.pessoa_id = extratos_mensais_proprietario.pessoa_id
    )
  );
create trigger trg_audit_extratos_mensais_proprietario
  after insert or update or delete on extratos_mensais_proprietario
  for each row execute function fn_audit_trigger();

-- ---- extrato_mensal_itens (tabela filha — RLS NÃO herda da tabela pai,
-- por isso precisa de política própria; esquecer isso é o mesmo tipo de
-- bug encontrado no stress-test, só que numa tabela adicionada depois) ----
create policy admin_full_access_extrato_itens on extrato_mensal_itens
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy investidor_ve_proprios_itens_extrato on extrato_mensal_itens
  for select using (
    exists (
      select 1 from usuarios u
      join extratos_mensais_proprietario e on e.pessoa_id = u.pessoa_id
      where u.id = auth.uid() and u.papel = 'investidor' and e.id = extrato_mensal_itens.extrato_id
    )
  );

-- ---- ordens_servico ----
create policy admin_full_access_os on ordens_servico
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy prestador_ve_proprias_os on ordens_servico
  for select using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.papel = 'prestador' and u.pessoa_id = ordens_servico.prestador_id
    )
  );

-- Sem esta política, o prestador não consegue gravar check-in/check-out
-- nem status (bug nº4 do stress-test). Restrito à própria OS; campos como
-- imovel_id/prestador_id continuam protegidos por trigger de auditoria,
-- e reatribuição de OS para outro prestador deve ser feita pelo admin.
create policy prestador_atualiza_propria_os on ordens_servico
  for update using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.papel = 'prestador' and u.pessoa_id = ordens_servico.prestador_id
    )
  ) with check (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.papel = 'prestador' and u.pessoa_id = ordens_servico.prestador_id
    )
  );

-- Inquilino que abriu o chamado acompanha o próprio protocolo (não pode alterar)
create policy inquilino_ve_propria_os on ordens_servico
  for select using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.papel = 'inquilino' and u.pessoa_id = ordens_servico.aberto_por_pessoa_id
    )
  );

-- ---- documentos_gerados ----
create policy admin_full_access_documentos on documentos_gerados
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy pessoa_ve_proprios_documentos on documentos_gerados
  for select using (
    exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.pessoa_id = documentos_gerados.pessoa_id
    )
  );

-- Nota: a validação pública de documento (QR code -> hash) deve usar uma
-- rota específica com service role / função RPC que expõe apenas
-- tipo + validade + hash, nunca a linha completa da tabela.

-- ============================================================================
-- 17. HARDENING: CONSTRAINTS DE INTEGRIDADE (achadas via stress-test)
-- ============================================================================
-- O schema aceitava aluguel negativo, contrato com data_fim anterior à
-- data_inicio e um imóvel com 350% de propriedade somada — nenhum erro,
-- silenciosamente. Comandos abaixo fecham essas lacunas. Aplicados como
-- ALTER separado (em vez de reescrever cada CREATE TABLE) para deixar
-- explícito, no próprio arquivo, o que foi corrigido depois do stress-test.

-- Datas: fim não pode vir antes do início
alter table contratos
  add constraint chk_contrato_datas check (data_fim is null or data_fim > data_inicio);
alter table garantias
  add constraint chk_garantia_datas check (data_vencimento_apolice is null or data_inicio is null or data_vencimento_apolice > data_inicio);
alter table ativos_comodato
  add constraint chk_ativo_vida_util check (vida_util_meses > 0);

-- Valores monetários que nunca fazem sentido negativos ou zero
alter table contratos add constraint chk_valor_aluguel_positivo check (valor_aluguel > 0);
alter table faturas add constraint chk_fatura_valores_nao_negativos
  check (valor_bruto >= 0 and valor_liquido >= 0);
alter table garantias add constraint chk_garantia_valor_nao_negativo check (valor is null or valor >= 0);
alter table split_pagamento add constraint chk_split_valor_nao_negativo check (valor >= 0);
alter table lancamentos_prestador add constraint chk_lancamento_valores_nao_negativos
  check (valor_base >= 0 and km >= 0 and adicional_pct >= 0);
alter table ativos_comodato add constraint chk_ativo_valor_aquisicao_positivo check (valor_aquisicao > 0);
alter table ativos_comodato add constraint chk_ativo_valor_residual_coerente
  check (valor_residual >= 0 and valor_residual <= valor_aquisicao);
alter table depreciacao_mensal add constraint chk_depreciacao_nao_negativa check (valor_depreciado_mes >= 0);
-- investidor_ledger.valor é sempre a magnitude; a direção (crédito/débito) vem de `tipo`
alter table investidor_ledger add constraint chk_ledger_valor_positivo check (valor > 0);
alter table extratos_mensais_proprietario add constraint chk_extrato_receita_deducoes_nao_negativas
  check (receita_bruta >= 0 and total_deducoes >= 0);
alter table notas_fiscais_servico add constraint chk_nfse_valor_positivo check (valor_servico > 0);
alter table ordem_servico_custos add constraint chk_os_custo_nao_negativo check (valor >= 0);
alter table tributos_municipais add constraint chk_tributo_valor_positivo check (valor > 0);
alter table confissoes_divida add constraint chk_confissao_valor_positivo check (valor_principal > 0);

-- Percentuais de propriedade e taxa de administração são frações de 1, não podem ultrapassar 100%
alter table imovel_propriedade add constraint chk_percentual_fracao check (percentual > 0 and percentual <= 1);
alter table imovel_propriedade add constraint chk_taxa_administracao_fracao
  check (taxa_administracao_pct >= 0 and taxa_administracao_pct < 1);

-- Nota deliberada: `transacoes_bancarias.valor` e `fatura_itens.valor` NÃO
-- ganharam check de sinal — o primeiro usa negativo para representar débito
-- (documentado no comentário da coluna) e o segundo pode conter um item de
-- crédito/desconto negativo dentro de uma fatura consolidada.

-- Soma de imovel_propriedade.percentual por imóvel não pode ultrapassar 100%
-- somada entre todos os sócios ativos (data_fim is null). Constraint de
-- checagem entre linhas exige trigger, não um CHECK simples de coluna.
create or replace function fn_check_soma_percentual_imovel()
returns trigger as $$
declare
  soma numeric(6,4);
begin
  select coalesce(sum(percentual), 0) into soma
  from imovel_propriedade
  where imovel_id = new.imovel_id and data_fim is null;

  if soma > 1.0001 then -- tolerância de arredondamento
    raise exception 'Soma de percentual de propriedade do imóvel % excede 100%% (soma atual: %)',
      new.imovel_id, soma;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_check_soma_percentual_imovel
  after insert or update on imovel_propriedade
  for each row execute function fn_check_soma_percentual_imovel();

-- ============================================================================
-- 18. RLS — COBERTURA COMPLETA (achado crítico da 2ª rodada de auditoria)
-- ============================================================================
-- Uma varredura sistemática (não mais tabela-por-tabela ad hoc) encontrou
-- 39 das 49 tabelas do schema SEM RLS habilitado — incluindo `pessoas`.
-- Testei concretamente: um inquilino autenticado, via papel `authenticated`
-- (o mesmo usado pelo app real), conseguia rodar `select * from pessoas` e
-- ler o CPF de TODOS os inquilinos, investidores e prestadores do sistema.
-- Isso é uma violação grave de LGPD, não uma falha teórica. Esta seção
-- fecha essa lacuna de forma sistemática, tabela por tabela, com uma
-- segunda função auxiliar para reduzir repetição.

create or replace function fn_minha_pessoa_id()
returns uuid as $$
  select pessoa_id from usuarios where id = auth.uid();
$$ language sql stable security definer;

-- ---- Identidade e papéis: a exposição mais crítica encontrada ----
alter table pessoas enable row level security;
create policy admin_full_access_pessoas on pessoas
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy pessoa_ve_proprio_cadastro on pessoas
  for select using (id = fn_minha_pessoa_id());

alter table usuarios enable row level security;
create policy admin_full_access_usuarios on usuarios
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy usuario_ve_proprio_registro on usuarios
  for select using (id = auth.uid());

alter table pessoa_papeis enable row level security;
create policy admin_full_access_pessoa_papeis on pessoa_papeis
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy pessoa_ve_proprios_papeis on pessoa_papeis
  for select using (pessoa_id = fn_minha_pessoa_id());

-- ---- Dados de contrato ligados a uma pessoa específica ----
alter table contrato_partes enable row level security;
create policy admin_full_access_contrato_partes on contrato_partes
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy pessoa_ve_propria_participacao_contrato on contrato_partes
  for select using (pessoa_id = fn_minha_pessoa_id());

alter table imovel_propriedade enable row level security;
create policy admin_full_access_imovel_propriedade on imovel_propriedade
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy investidor_ve_propria_participacao on imovel_propriedade
  for select using (proprietario_pessoa_id = fn_minha_pessoa_id());
-- Auditoria encontrada faltando (docs/35): mudança de propriedade/percentual
-- é exatamente o tipo de alteração que database/README.md já descreve como
-- "manual e deve ter um documentos_gerados correspondente assinado" — mas
-- nunca tinha o trg_audit_trigger que o resto das tabelas dessa mesma
-- classe (garantias, contratos, split_pagamento) já tem.
create trigger trg_audit_imovel_propriedade
  after insert or update or delete on imovel_propriedade
  for each row execute function fn_audit_trigger();

alter table reajustes_contrato enable row level security;
create policy admin_full_access_reajustes on reajustes_contrato
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_reajustes_proprio_contrato on reajustes_contrato
  for select using (
    exists (select 1 from contrato_partes cp where cp.contrato_id = reajustes_contrato.contrato_id and cp.pessoa_id = fn_minha_pessoa_id())
  );

alter table notificacoes_preferencia_venda enable row level security;
create policy admin_full_access_pref_venda on notificacoes_preferencia_venda
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_propria_pref_venda on notificacoes_preferencia_venda
  for select using (
    exists (select 1 from contrato_partes cp where cp.contrato_id = notificacoes_preferencia_venda.contrato_id and cp.pessoa_id = fn_minha_pessoa_id())
  );

alter table fatura_itens enable row level security;
create policy admin_full_access_fatura_itens on fatura_itens
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_itens_propria_fatura on fatura_itens
  for select using (
    exists (
      select 1 from faturas f
      join contrato_partes cp on cp.contrato_id = f.contrato_id
      where f.id = fatura_itens.fatura_id and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );

-- ---- Vistorias e confissão de dívida: o inquilino assina/acompanha ----
alter table vistorias enable row level security;
create policy admin_full_access_vistorias on vistorias
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_propria_vistoria on vistorias
  for select using (
    exists (select 1 from contrato_partes cp where cp.contrato_id = vistorias.contrato_id and cp.pessoa_id = fn_minha_pessoa_id())
  );

alter table vistoria_fotos enable row level security;
create policy admin_full_access_vistoria_fotos on vistoria_fotos
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_fotos_propria_vistoria on vistoria_fotos
  for select using (
    exists (
      select 1 from vistorias v
      join contrato_partes cp on cp.contrato_id = v.contrato_id
      where v.id = vistoria_fotos.vistoria_id and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );

alter table confissoes_divida enable row level security;
create policy admin_full_access_confissoes on confissoes_divida
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_propria_confissao on confissoes_divida
  for select using (
    exists (select 1 from contrato_partes cp where cp.contrato_id = confissoes_divida.contrato_id and cp.pessoa_id = fn_minha_pessoa_id())
  );
create trigger trg_audit_confissoes_divida
  after insert or update or delete on confissoes_divida
  for each row execute function fn_audit_trigger();

alter table assinaturas enable row level security;
create policy admin_full_access_assinaturas on assinaturas
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy signatario_ve_propria_assinatura on assinaturas
  for select using (signatario_pessoa_id = fn_minha_pessoa_id());

alter table notificacoes_log enable row level security;
create policy admin_full_access_notificacoes on notificacoes_log
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy pessoa_ve_propria_notificacao on notificacoes_log
  for select using (pessoa_id = fn_minha_pessoa_id());

-- ---- Prestadores: veem a própria folha, não a de outro prestador ----
alter table lancamentos_prestador enable row level security;
create policy admin_full_access_lancamentos on lancamentos_prestador
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy prestador_ve_proprios_lancamentos on lancamentos_prestador
  for select using (prestador_id = fn_minha_pessoa_id());

alter table deficit_retencao enable row level security;
create policy admin_full_access_deficit on deficit_retencao
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy prestador_ve_proprio_deficit on deficit_retencao
  for select using (prestador_id = fn_minha_pessoa_id());

alter table folha_fechamento enable row level security;
create policy admin_full_access_folha on folha_fechamento
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy prestador_ve_propria_folha on folha_fechamento
  for select using (prestador_id = fn_minha_pessoa_id());

alter table ordem_servico_custos enable row level security;
create policy admin_full_access_os_custos on ordem_servico_custos
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy prestador_ve_custos_propria_os on ordem_servico_custos
  for select using (
    exists (select 1 from ordens_servico os where os.id = ordem_servico_custos.ordem_servico_id and os.prestador_id = fn_minha_pessoa_id())
  );

-- ---- Investidor: NFS-e e splits que dizem respeito a ele ----
alter table notas_fiscais_servico enable row level security;
create policy admin_full_access_nfse on notas_fiscais_servico
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy investidor_ve_propria_nfse on notas_fiscais_servico
  for select using (tomador_pessoa_id = fn_minha_pessoa_id());

alter table split_pagamento enable row level security;
create policy admin_full_access_split on split_pagamento
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy beneficiario_ve_proprio_split on split_pagamento
  for select using (beneficiario_pessoa_id = fn_minha_pessoa_id());

-- ---- Público (site/landing page, Módulo 12): captação e vitrine ----
-- `leads`: qualquer visitante do site pode SUBMETER (INSERT), ninguém além
-- do admin pode LER a lista de prospects — sem isso, a chave anônima
-- (pública, embutida no frontend) exporia nome/contato/score de crédito de
-- todo mundo que já preencheu o formulário.
alter table leads enable row level security;
create policy admin_full_access_leads on leads
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy publico_pode_cadastrar_lead on leads
  for insert with check (true);

-- `anuncios`: site público só vê o que está com status='publicado'
alter table anuncios enable row level security;
create policy admin_full_access_anuncios on anuncios
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy publico_ve_anuncios_publicados on anuncios
  for select using (status = 'publicado');

-- `imoveis`: site público só vê unidades disponíveis; inquilino/investidor
-- veem as unidades ligadas a eles independente do status.
alter table imoveis enable row level security;
create policy admin_full_access_imoveis on imoveis
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy publico_ve_imoveis_disponiveis on imoveis
  for select using (status = 'disponivel');
create policy investidor_ve_proprios_imoveis on imoveis
  for select using (
    exists (select 1 from imovel_propriedade ip where ip.imovel_id = imoveis.id and ip.proprietario_pessoa_id = fn_minha_pessoa_id())
  );
create policy inquilino_ve_proprio_imovel on imoveis
  for select using (
    exists (
      select 1 from contratos c
      join contrato_partes cp on cp.contrato_id = c.id
      where c.imovel_id = imoveis.id and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );
-- Nota: esta política ainda expõe a linha inteira de `imoveis` (inclusive
-- campos administrativos como franquia_energia_kwh) para o público quando
-- status='disponivel'. Nenhum desses campos é sigiloso, mas o ideal na
-- Fase 3 (M12) é servir a vitrine pública a partir de uma VIEW com apenas
-- as colunas de marketing, não da tabela bruta — registrado como melhoria
-- futura, não bloqueante para a Fase 0.

-- ---- Tabelas de referência (baixa sensibilidade): leitura ampla, escrita só admin ----
alter table cidades enable row level security;
create policy admin_escreve_cidades on cidades for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy qualquer_um_le_cidades on cidades for select using (true);

alter table residenciais enable row level security;
create policy admin_escreve_residenciais on residenciais for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy qualquer_um_le_residenciais on residenciais for select using (true);

alter table tarifas_energia enable row level security;
create policy admin_escreve_tarifas on tarifas_energia for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy autenticado_le_tarifas on tarifas_energia for select using (auth.uid() is not null);

alter table categorias_financeiras enable row level security;
create policy admin_escreve_categorias on categorias_financeiras for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy autenticado_le_categorias on categorias_financeiras for select using (auth.uid() is not null);

-- ---- Estritamente internas: só admin/economista, nenhuma outra política ----
-- (tesouraria, passivos, ativos, jurídico, tokens de acesso, log de auditoria)
alter table magic_links enable row level security;
create policy admin_full_access_magic_links on magic_links
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
-- Nenhuma outra política: a validação de um magic link pelo prestador
-- eventual acontece via rota de backend com service role (que sempre
-- ignora RLS), nunca por consulta direta do cliente à tabela — do
-- contrário, o token viraria enumerável.

alter table fundos enable row level security;
create policy admin_full_access_fundos on fundos
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table fundo_movimentacoes enable row level security;
create policy admin_full_access_fundo_mov on fundo_movimentacoes
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table contas_bancarias enable row level security;
create policy admin_full_access_contas on contas_bancarias
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table transacoes_bancarias enable row level security;
create policy admin_full_access_transacoes on transacoes_bancarias
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
-- server/integracao/importarExtratoBancarioOFX.ts já documenta que
-- status = 'aprovado' "só deve mudar por ação humana explícita na tela
-- de conciliação" (database/README.md) — a mesma classe de decisão
-- financeira irreversível que já tem trigger em garantias/contratos.
create trigger trg_audit_transacoes_bancarias
  after insert or update or delete on transacoes_bancarias
  for each row execute function fn_audit_trigger();

alter table ativos_comodato enable row level security;
create policy admin_full_access_ativos on ativos_comodato
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table depreciacao_mensal enable row level security;
create policy admin_full_access_depreciacao on depreciacao_mensal
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table dossies_inadimplencia enable row level security;
create policy admin_full_access_dossies on dossies_inadimplencia
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table processos_judiciais enable row level security;
create policy admin_full_access_processos on processos_judiciais
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table regua_cobranca_eventos enable row level security;
create policy admin_full_access_regua on regua_cobranca_eventos
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table reservas_temporada enable row level security;
create policy admin_full_access_reservas on reservas_temporada
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table tributos_municipais enable row level security;
create policy admin_full_access_tributos on tributos_municipais
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table audit_log enable row level security;
create policy admin_le_audit_log on audit_log
  for select using (fn_eh_admin_ou_economista());
-- Sem política de insert/update/delete para nenhum papel do client: a
-- única via de escrita é o trigger fn_audit_trigger, que roda como o dono
-- do schema (bypassa RLS) — nem o admin deve conseguir editar o log pela
-- API.

-- ============================================================================
-- 19. AJUSTES A PARTIR DE CONTRATO REAL (Kitnet 16, Residencial João Pottker)
-- ============================================================================
-- Auditoria feita sobre um contrato assinado de verdade (docs/10-auditoria-
-- contrato-real.md). Achados que exigiram schema novo, não só documentação:
-- responsável financeiro solidário distinto de fiador; política de
-- cobrança (multa/juros/honorários) como termo de CADA contrato, não
-- constante do sistema; "rateio de custeio coletivo" com natureza fiscal
-- própria (tributável vs. reembolso) exigida para IRPF correto; prestação
-- de contas semestral com prazo de impugnação e concordância tácita;
-- franquia hídrica por ocupação (água não é individualizável por unidade,
-- diferente de energia); geração solar como fonte de receita separada.

-- ---- 19.1 Responsável financeiro solidário: não é fiador ----
-- O contrato real distingue LOCATÁRIO (ocupante) de RESPONSÁVEL FINANCEIRO
-- SOLIDÁRIO (garantidor solidário sem ser fiador formal — normalmente pai/
-- mãe de estudante). Modelar os dois como "fiador" perderia essa distinção
-- semântica e jurídica (fiança tem regime próprio na Lei 8.245/91, distinto
-- de responsabilidade solidária simples do art. 275 do Código Civil).
alter table contrato_partes drop constraint contrato_partes_papel_check;
alter table contrato_partes add constraint contrato_partes_papel_check
  check (papel in ('locatario_principal','locatario_adicional','fiador','responsavel_solidario'));

-- ---- 19.2 Política de cobrança por contrato ----
-- Os parâmetros globais que o sistema assumia (multa 10% flat, juros 2%
-- a.m., honorários automáticos aos 30 dias) vieram da descrição genérica
-- original do projeto — o contrato real usa multa em degraus (2% até o 5º
-- dia, 10% substituindo dali em diante sobre principal+juros+correção),
-- juros de 1% a.m., e honorários só "em caso de necessidade de propositura
-- de medida judicial", não automáticos. Isso prova que esses números são
-- termo de cada contrato. server/financeiro/jurosMulta.ts consome esta
-- tabela via server/integracao/reguaCobranca.ts, com fallback para uma
-- política genérica quando um contrato não tiver linha própria aqui.
create table contrato_politica_cobranca (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null unique references contratos(id) on delete cascade,
  multa_ate_5_dias_pct numeric(6,4) not null check (multa_ate_5_dias_pct >= 0),
  dias_limite_multa_reduzida smallint not null default 5 check (dias_limite_multa_reduzida >= 0),
  multa_apos_5_dias_pct numeric(6,4) not null check (multa_apos_5_dias_pct >= 0),
  juros_pct_am numeric(6,4) not null check (juros_pct_am >= 0),
  honorarios_pct numeric(6,4) not null default 0.20 check (honorarios_pct >= 0),
  honorarios_somente_se_judicial boolean not null default true,
  dias_gatilho_honorarios_automatico smallint,
  criado_em timestamptz not null default now(),
  constraint chk_honorarios_gatilho_coerente check (
    honorarios_somente_se_judicial = true or dias_gatilho_honorarios_automatico is not null
  )
);

-- ---- 19.3 "Valor único mensal": aluguel efetivo vs. rateio de custeio ----
-- A parte tributável (aluguel efetivo, base do IRPF Carnê-Leão) e a parte
-- de reembolso não-tributável (rateio de custeio coletivo) têm proporção
-- fixada no contrato — 55/45 neste caso, mas varia por contrato/residencial.
-- Sem esse campo, o Módulo 15 (Tributário/DIRPF) não tem como separar
-- receita tributável de mero trânsito contábil.
alter table contratos add column percentual_aluguel_efetivo numeric(6,4);
alter table contratos add constraint chk_percentual_aluguel_efetivo_fracao
  check (percentual_aluguel_efetivo is null or (percentual_aluguel_efetivo > 0 and percentual_aluguel_efetivo <= 1));

create table categorias_rateio_coletivo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descricao text not null,
  natureza_fiscal text not null check (natureza_fiscal in ('aluguel_tributavel','reembolso_nao_tributavel'))
);

insert into categorias_rateio_coletivo (codigo, descricao, natureza_fiscal) values
  ('aluguel_efetivo', 'Aluguel Efetivo — base de cálculo para IRPF Carnê-Leão', 'aluguel_tributavel'),
  ('manutencao_mobiliario_areas_comuns', 'Custeio de uso e conservação de mobiliário e equipamentos de áreas comuns', 'reembolso_nao_tributavel'),
  ('pequenos_reparos_areas_comuns', 'Custeio de uso e pequenos reparos de áreas comuns e infraestrutura compartilhada', 'reembolso_nao_tributavel'),
  ('limpeza_zeladoria_terceirizada', 'Reembolso de custos de terceiros para limpeza e zeladoria de áreas comuns', 'reembolso_nao_tributavel'),
  ('limpeza_areas_hidraulicas_comuns', 'Custeio de uso e limpeza de áreas hidráulicas/sanitárias comuns', 'reembolso_nao_tributavel'),
  ('agua_esgoto_coletivo', 'Custeio de serviços essenciais de abastecimento coletivo (água e esgoto)', 'reembolso_nao_tributavel'),
  ('lavanderia_coletiva_uso', 'Custeio de uso da lavanderia coletiva', 'reembolso_nao_tributavel'),
  ('internet_wifi_coletivo', 'Custeio de uso do serviço de internet e rede wi-fi de uso coletivo', 'reembolso_nao_tributavel'),
  ('seguranca_monitoramento_coletivo', 'Custeio de uso e monitoramento de sistemas de segurança coletivos', 'reembolso_nao_tributavel');

alter table fatura_itens add column categoria_rateio_id uuid references categorias_rateio_coletivo(id);

-- ---- 19.4 Demonstrativo Semestral Simplificado (DSS) e concordância tácita ----
-- O contrato real obriga o envio semestral de um demonstrativo de
-- arrecadação/gasto por rubrica, com 10 dias corridos para impugnação —
-- silêncio do inquilino vira "concordância tácita absoluta" e serve como
-- prova de regularidade de gestão. Isso é uma obrigação contratual
-- recorrente, não um relatório opcional.
create table demonstrativos_rateio (
  id uuid primary key default gen_random_uuid(),
  residencial_id uuid references residenciais(id),
  periodo_inicio date not null,
  periodo_fim date not null,
  enviado_em timestamptz,
  prazo_impugnacao_dias smallint not null default 10,
  status text not null default 'rascunho' check (status in ('rascunho','enviado','aceito_tacito','impugnado')),
  documento_id uuid references documentos_gerados(id),
  constraint chk_dss_periodo check (periodo_fim > periodo_inicio)
);

create table demonstrativo_rateio_itens (
  id uuid primary key default gen_random_uuid(),
  demonstrativo_id uuid not null references demonstrativos_rateio(id) on delete cascade,
  categoria_rateio_id uuid not null references categorias_rateio_coletivo(id),
  valor_arrecadado numeric(14,2) not null check (valor_arrecadado >= 0),
  valor_gasto numeric(14,2) not null check (valor_gasto >= 0),
  saldo numeric(14,2) not null
);

create table impugnacoes_demonstrativo (
  id uuid primary key default gen_random_uuid(),
  demonstrativo_id uuid not null references demonstrativos_rateio(id),
  pessoa_id uuid not null references pessoas(id),
  categoria_rateio_id uuid references categorias_rateio_coletivo(id),
  texto text not null,
  criado_em timestamptz not null default now()
);

-- Fecha a janela de impugnação no próprio banco: sem isso, "concordância
-- tácita" viraria uma regra só de aplicação, fácil de furar por um bug de
-- UI que aceite impugnação fora do prazo.
create or replace function fn_check_prazo_impugnacao()
returns trigger as $$
declare
  v_enviado_em timestamptz;
  v_prazo smallint;
begin
  select enviado_em, prazo_impugnacao_dias into v_enviado_em, v_prazo
  from demonstrativos_rateio where id = new.demonstrativo_id;

  if v_enviado_em is null then
    raise exception 'Demonstrativo % ainda não foi enviado — não há prazo de impugnação em curso', new.demonstrativo_id;
  end if;

  if now() > v_enviado_em + (v_prazo || ' days')::interval then
    raise exception 'Prazo de impugnação de % dias já expirou para o demonstrativo % (concordância tácita)', v_prazo, new.demonstrativo_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_check_prazo_impugnacao
  before insert on impugnacoes_demonstrativo
  for each row execute function fn_check_prazo_impugnacao();

-- ---- 19.5 Franquia hídrica por ocupação ----
-- Diferente de energia (medida por unidade), água/esgoto não tem hidrômetro
-- individualizável neste residencial — o contrato instituiu uma franquia
-- em m³ por número de ocupantes, com rateio extraordinário de excedente
-- quando o consumo real do prédio ultrapassa a soma das franquias.
create table franquia_hidrica_ocupacao (
  id uuid primary key default gen_random_uuid(),
  residencial_id uuid not null references residenciais(id),
  numero_ocupantes smallint not null check (numero_ocupantes > 0),
  franquia_m3 numeric(8,2) not null check (franquia_m3 > 0),
  unique (residencial_id, numero_ocupantes)
);

create table leituras_hidricas_coletivas (
  id uuid primary key default gen_random_uuid(),
  residencial_id uuid not null references residenciais(id),
  competencia date not null,
  consumo_total_m3 numeric(10,2) not null check (consumo_total_m3 >= 0),
  valor_conta_agua numeric(14,2) not null check (valor_conta_agua >= 0),
  status text not null default 'pendente_confirmacao' check (status in ('pendente_confirmacao','confirmada')),
  confirmado_por uuid references pessoas(id),
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (residencial_id, competencia)
);

-- ---- 19.6 Geração de energia solar ----
-- Fonte de receita citada pelo cliente (não estava no contrato modelo, mas
-- é realidade operacional): geração solar exige leitura mensal obrigatória,
-- assim como o consumo de energia, e gera crédito/cobrança adicional no
-- boleto. A fórmula exata de faturamento é uma pergunta em aberto (ver
-- docs/10-auditoria-contrato-real.md) — aqui só a estrutura de dados.
create table geracao_solar (
  id uuid primary key default gen_random_uuid(),
  residencial_id uuid references residenciais(id),
  imovel_id uuid references imoveis(id),
  competencia date not null,
  energia_gerada_kwh numeric(10,2) not null check (energia_gerada_kwh >= 0),
  valor_credito numeric(14,2) check (valor_credito is null or valor_credito >= 0),
  status text not null default 'pendente_confirmacao' check (status in ('pendente_confirmacao','confirmada')),
  confirmado_por uuid references pessoas(id),
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint chk_geracao_solar_referencia check (residencial_id is not null or imovel_id is not null)
);
create unique index uq_geracao_solar_imovel_competencia
  on geracao_solar(imovel_id, competencia) where imovel_id is not null;
create unique index uq_geracao_solar_residencial_competencia
  on geracao_solar(residencial_id, competencia) where residencial_id is not null and imovel_id is null;

-- ---- 19.7 RLS das tabelas novas ----
alter table contrato_politica_cobranca enable row level security;
create policy admin_full_access_politica_cobranca on contrato_politica_cobranca
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table categorias_rateio_coletivo enable row level security;
create policy admin_escreve_categorias_rateio on categorias_rateio_coletivo
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy autenticado_le_categorias_rateio on categorias_rateio_coletivo
  for select using (auth.uid() is not null);

alter table demonstrativos_rateio enable row level security;
create policy admin_full_access_dss on demonstrativos_rateio
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_dss_do_proprio_residencial on demonstrativos_rateio
  for select using (
    exists (
      select 1 from contrato_partes cp
      join contratos c on c.id = cp.contrato_id
      join imoveis i on i.id = c.imovel_id
      where cp.pessoa_id = fn_minha_pessoa_id() and i.residencial_id = demonstrativos_rateio.residencial_id
    )
  );

alter table demonstrativo_rateio_itens enable row level security;
create policy admin_full_access_dss_itens on demonstrativo_rateio_itens
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_itens_dss_do_proprio_residencial on demonstrativo_rateio_itens
  for select using (
    exists (
      select 1 from demonstrativos_rateio d
      join imoveis i on i.residencial_id = d.residencial_id
      join contratos c on c.imovel_id = i.id
      join contrato_partes cp on cp.contrato_id = c.id
      where d.id = demonstrativo_rateio_itens.demonstrativo_id
        and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );

alter table impugnacoes_demonstrativo enable row level security;
create policy admin_full_access_impugnacoes on impugnacoes_demonstrativo
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy pessoa_ve_e_cria_propria_impugnacao on impugnacoes_demonstrativo
  for all using (pessoa_id = fn_minha_pessoa_id()) with check (pessoa_id = fn_minha_pessoa_id());

alter table franquia_hidrica_ocupacao enable row level security;
create policy admin_escreve_franquia_hidrica on franquia_hidrica_ocupacao
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy autenticado_le_franquia_hidrica on franquia_hidrica_ocupacao
  for select using (auth.uid() is not null);

alter table leituras_hidricas_coletivas enable row level security;
create policy admin_full_access_leituras_hidricas on leituras_hidricas_coletivas
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_leituras_hidricas_do_proprio_residencial on leituras_hidricas_coletivas
  for select using (
    exists (
      select 1 from contrato_partes cp
      join contratos c on c.id = cp.contrato_id
      join imoveis i on i.id = c.imovel_id
      where cp.pessoa_id = fn_minha_pessoa_id() and i.residencial_id = leituras_hidricas_coletivas.residencial_id
    )
  );

alter table geracao_solar enable row level security;
create policy admin_full_access_geracao_solar on geracao_solar
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy investidor_ve_geracao_solar_do_proprio_imovel on geracao_solar
  for select using (
    exists (select 1 from imovel_propriedade ip where ip.imovel_id = geracao_solar.imovel_id and ip.proprietario_pessoa_id = fn_minha_pessoa_id())
  );

-- ---- 19.8 Auditoria das tabelas financeiras/contratuais novas ----
create trigger trg_audit_politica_cobranca after insert or update or delete on contrato_politica_cobranca
  for each row execute function fn_audit_trigger();
create trigger trg_audit_demonstrativos_rateio after insert or update or delete on demonstrativos_rateio
  for each row execute function fn_audit_trigger();

-- ============================================================================
-- 20. AJUSTES A PARTIR DE TRÊS CONTRATOS REAIS DE CURITIBA
-- ============================================================================
-- docs/11-auditoria-contratos-curitiba.md. Três contratos (dois residenciais
-- em prédios com condomínio formal — Life Space Estação 509B e Central
-- Station 503 — e um comercial — Sala 923B, Edifício Inspira Business)
-- confirmam que Curitiba realmente é outra realidade, como o cliente havia
-- avisado antes de eu ver um contrato de lá: NENHUM dos três usa o modelo
-- de "rateio de custeio coletivo" de Florianópolis (Módulo 19) — em vez
-- disso, todos têm um punhado de componentes extras (comodato de móveis,
-- vaga de garagem, IPTU/condomínio repassados) somados a um aluguel-base.
-- Os três também confirmam, de forma independente do contrato de
-- Florianópolis, a base fixa de 30 dias no cálculo de pró-rata (item 20.4).

-- ---- 20.1 Índice de correção monetária e desconto de pontualidade por contrato ----
-- Achado: os quatro contratos reais analisados até aqui usam três índices
-- de correção monetária diferentes para o mesmo tipo de cláusula (IPCA em
-- João Pottker, IGPM na Sala Comercial 923B, "correção monetária" genérica
-- sem índice nomeado nos outros dois) — confirma que isso também é termo de
-- cada contrato, não uma constante.
alter table contrato_politica_cobranca add column indice_correcao_monetaria text
  check (indice_correcao_monetaria in ('IPCA','IGPM', null));

-- Achado (Sala Comercial 923B): existe desconto de pontualidade (R$70 sobre
-- R$1.360 nos primeiros 12 meses) que é perdido — não somado a uma multa
-- adicional, mas o valor-base para cálculo de multa/juros volta a ser o
-- valor "cheio" — quando o pagamento atrasa. Campo adicionado para não
-- perder o dado; a lógica de cálculo (somar de volta o desconto perdido
-- antes de aplicar multa/juros) AINDA NÃO foi implementada em
-- server/financeiro/jurosMulta.ts — documentado como pendência explícita,
-- apareceu em só 1 dos 4 contratos até aqui, não generalizei sem mais
-- exemplos confirmando o padrão.
alter table contrato_politica_cobranca add column desconto_pontualidade_valor numeric(14,2)
  check (desconto_pontualidade_valor is null or desconto_pontualidade_valor >= 0);

-- ---- 20.2 Finalidade da garantia (Apto 503, Central Station) ----
-- Achado: contrato misto locação+comodato pode ter DUAS garantias
-- distintas somadas num único depósito (2 aluguéis para a locação + 1
-- aluguel para o comodato = 3 aluguéis no total) — sem este campo, as
-- linhas de `garantias` não indicam a qual sub-relação (locação vs.
-- comodato) cada valor se refere, dificultando a prestação de contas em
-- caso de dedução parcial na saída.
alter table garantias add column finalidade text check (finalidade in ('locacao','comodato','geral', null));

-- ---- 20.3 Componentes mensais além do aluguel-base ----
-- Modelo distinto do "rateio de custeio coletivo" (Módulo 19, Florianópolis
-- — granular, com natureza fiscal, para até 9 rubricas de área comum
-- compartilhada entre muitas unidades). Aqui são itens que descrevem o
-- boleto de Curitiba, confirmados nos três contratos, MAS a relação com
-- `contratos.valor_aluguel` depende da `natureza` de cada item — não é
-- sempre soma:
--   - `valor_fixo`: item À PARTE, SOMADO ao aluguel-base (Apto 503:
--     comodato R$350 fixo; total do boleto R$1.300 aluguel + R$350
--     comodato = R$1.650, confirmado batendo o subtotal do contrato).
--   - `percentual_do_aluguel`: item **JÁ EMBUTIDO** no aluguel-base — é só
--     um DETALHAMENTO/DECOMPOSIÇÃO do mesmo total, NÃO uma soma. Life
--     Space: comodato "15% do aluguel, **já incluído**". Sala Comercial:
--     "o valor locatício mensal é composto em seu valor em 10% [vaga] e
--     90% [aluguel]" — 10%+90% descrevem o mesmo total contratual, não
--     duas parcelas somadas. Corrigido aqui após um primeiro rascunho
--     equivocado ter tratado percentual como aditivo (o que teria feito
--     `gerarFaturaMensal` cobrar em dobro nesses dois contratos).
--   - `repassado_variavel`: IPTU, condomínio, taxa de lixo, taxa de
--     bombeiros — repassados ao locatário no boleto consolidado, valor
--     mês a mês vindo de fonte externa (guia do condomínio/carnê do
--     IPTU), SOMADO ao aluguel-base. Presentes nos TRÊS contratos de
--     Curitiba, AUSENTES no contrato de Florianópolis (onde IPTU é
--     despesa exclusiva do locador, dedutível do IRPF). Confirma que essa
--     é uma diferença real de operação entre as duas cidades, não
--     suposição.
create table contrato_componentes_mensais (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  tipo text not null check (tipo in (
    'comodato_moveis', 'vaga_garagem', 'iptu_repassado', 'condominio_repassado',
    'taxa_lixo_repassada', 'taxa_bombeiros_repassada', 'outro'
  )),
  descricao text,
  natureza text not null check (natureza in ('valor_fixo', 'percentual_do_aluguel', 'repassado_variavel')),
  valor_fixo numeric(14,2),
  percentual numeric(6,4),
  criado_em timestamptz not null default now(),
  constraint chk_componente_valor_coerente check (
    (natureza = 'valor_fixo' and valor_fixo is not null and valor_fixo >= 0)
    or (natureza = 'percentual_do_aluguel' and percentual is not null and percentual > 0 and percentual <= 1)
    or (natureza = 'repassado_variavel')
  )
);

alter table contrato_componentes_mensais enable row level security;
create policy admin_full_access_componentes_mensais on contrato_componentes_mensais
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_componentes_do_proprio_contrato on contrato_componentes_mensais
  for select using (
    exists (
      select 1 from contrato_partes cp
      where cp.contrato_id = contrato_componentes_mensais.contrato_id and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );

-- ---- 20.4 Pró-rata de 30 dias fixos: confirmado por mais 3 contratos ----
-- Nenhuma mudança de schema — só registro de que a correção feita em
-- server/financeiro/prorata.ts (docs/10-auditoria-contrato-real.md) não era
-- peculiaridade de um único contrato: os três contratos de Curitiba usam a
-- mesma cláusula ("considerando-se sempre o conjunto de 30 dias,
-- independente do quantitativo de dias do mês em curso" — Apto 503;
-- "com base em um mês comercial de 30 dias" — implícito nos demais). A
-- correção já feita vale para os quatro contratos analisados até aqui.

-- ============================================================================
-- 21. GERADOR DE FATURA MENSAL — valor mês a mês dos componentes repassados
-- ============================================================================
-- `contrato_componentes_mensais.natureza = 'repassado_variavel'` (IPTU,
-- condomínio, taxa de lixo/bombeiros) não tem valor fixo: o valor real só é
-- conhecido mês a mês, vindo de fonte externa (guia do condomínio, carnê do
-- IPTU). Sem uma tabela para guardar esse valor por competência, o gerador
-- de fatura mensal (server/integracao/gerarFaturaMensal.ts) não teria como
-- ser autocontido — precisaria receber o valor por parâmetro toda vez, fora
-- do banco. Cada linha aqui é um valor já confirmado (lançado manualmente
-- ou via integração futura com o boleto do condomínio) para um componente e
-- um mês; sem linha para o mês, o gerador pula o contrato em vez de
-- inventar o valor (mesmo princípio de `faturarEnergia.ts`: dado
-- insuficiente é pulado, nunca faturado errado).
create table contrato_componente_valores_mensais (
  id uuid primary key default gen_random_uuid(),
  componente_id uuid not null references contrato_componentes_mensais(id) on delete cascade,
  competencia date not null,           -- sempre dia 1 do mês de referência
  valor numeric(14,2) not null check (valor >= 0),
  criado_em timestamptz not null default now(),
  unique (componente_id, competencia)
);

create or replace function fn_check_componente_valor_mensal_natureza()
returns trigger as $$
declare
  v_natureza text;
begin
  select natureza into v_natureza from contrato_componentes_mensais where id = new.componente_id;

  if v_natureza is distinct from 'repassado_variavel' then
    raise exception 'Componente % não é repassado_variavel (natureza atual: %) — só componentes repassados têm valor mês a mês',
      new.componente_id, v_natureza;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_check_componente_valor_mensal_natureza
  before insert or update on contrato_componente_valores_mensais
  for each row execute function fn_check_componente_valor_mensal_natureza();

create trigger trg_audit_componente_valores_mensais
  after insert or update or delete on contrato_componente_valores_mensais
  for each row execute function fn_audit_trigger();

alter table contrato_componente_valores_mensais enable row level security;
create policy admin_full_access_componente_valores_mensais on contrato_componente_valores_mensais
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_valores_do_proprio_contrato on contrato_componente_valores_mensais
  for select using (
    exists (
      select 1 from contrato_componentes_mensais cm
      join contrato_partes cp on cp.contrato_id = cm.contrato_id
      where cm.id = contrato_componente_valores_mensais.componente_id and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );

-- ============================================================================
-- 22. ORDENS DE SERVIÇO: CRONOGRAMA (MANUTENÇÃO PREVENTIVA) E ANDAMENTO
--     PASSO A PASSO
-- ============================================================================
-- Pedido explícito do cliente: ordens de serviço não só para o zelador e
-- serviços gerais, mas para qualquer prestador extra (eletricista,
-- encanador, técnico de interfone, técnico de internet, montador de
-- móveis etc. — `ordens_servico.categoria` já é texto livre desde o
-- início, não precisa mudar para isso), com (1) cronograma/agendamento —
-- não só chamado avulso reativo — e (2) relatório passo a passo do que
-- aconteceu durante o serviço, não só check-in/check-out. Diferente das
-- seções anteriores, isto não vem de um contrato assinado — é
-- especificação direta do cliente, tratada com o mesmo cuidado de não
-- inventar regra além do que foi pedido.

-- ---- 22.1 Ordem de serviço pode ser da unidade OU do prédio inteiro ----
-- Necessário para o cronograma de manutenção preventiva de área comum
-- (ex.: limpeza de caixa d'água, revisão elétrica do prédio) em
-- residenciais de Florianópolis sem condomínio formal (docs/11: em
-- Curitiba isso já é resolvido pelo condomínio formal — só Florianópolis
-- precisa que o CRMT gerencie manutenção de área comum diretamente).
alter table ordens_servico alter column imovel_id drop not null;
alter table ordens_servico add column residencial_id uuid references residenciais(id);
alter table ordens_servico add constraint chk_os_um_alvo check (
  (imovel_id is not null and residencial_id is null) or (imovel_id is null and residencial_id is not null)
);

-- ---- 22.2 Cronograma: data agendada da visita + origem (plano preventivo) ----
alter table ordens_servico add column data_agendada timestamptz;
alter table ordens_servico add column plano_manutencao_id uuid; -- FK adicionada em 22.4, após a tabela existir

create index idx_os_data_agendada on ordens_servico(data_agendada) where data_agendada is not null;

-- ---- 22.3 Andamento passo a passo (soma-se a, não substitui, check-in/check-out) ----
-- Log append-only de etapas durante a execução — checkin_at/checkout_at/
-- status continuam sendo o estado atual (já consumidos pela RLS
-- existente); isto adiciona o histórico de como se chegou lá, com foto
-- por etapa. A transição de status em si (aberto -> alocado ->
-- em_execucao -> concluido) é decidida em código
-- (server/integracao/andamentosOS.ts), não num trigger — mesma decisão
-- já tomada para juros/multa e pró-rata (docs/03): lógica de fluxo de
-- negócio vive em código testado, não escondida em SQL.
--
-- Sem política de UPDATE/DELETE para o prestador: o log é append-only de
-- propósito (evidência de execução) — uma correção depois do fato é
-- responsabilidade do admin, não do próprio prestador apagando o que
-- registrou.
create table ordem_servico_andamentos (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references ordens_servico(id) on delete cascade,
  tipo text not null check (tipo in (
    'atribuida','a_caminho','iniciada','pausada','material_pendente','retomada','concluida','cancelada','comentario'
  )),
  descricao text,
  fotos_urls text[] not null default '{}',
  registrado_por_pessoa_id uuid references pessoas(id),
  criado_em timestamptz not null default now()
);

create index idx_os_andamentos_os on ordem_servico_andamentos(ordem_servico_id, criado_em);

alter table ordem_servico_andamentos enable row level security;

create policy admin_full_access_os_andamentos on ordem_servico_andamentos
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

create policy prestador_registra_andamentos_da_propria_os on ordem_servico_andamentos
  for insert with check (
    exists (
      select 1 from ordens_servico os
      join usuarios u on u.pessoa_id = os.prestador_id
      where os.id = ordem_servico_andamentos.ordem_servico_id and u.id = auth.uid() and u.papel = 'prestador'
    )
  );

create policy prestador_ve_andamentos_da_propria_os on ordem_servico_andamentos
  for select using (
    exists (
      select 1 from ordens_servico os
      join usuarios u on u.pessoa_id = os.prestador_id
      where os.id = ordem_servico_andamentos.ordem_servico_id and u.id = auth.uid() and u.papel = 'prestador'
    )
  );

create policy inquilino_ve_andamentos_da_propria_os on ordem_servico_andamentos
  for select using (
    exists (
      select 1 from ordens_servico os
      join usuarios u on u.pessoa_id = os.aberto_por_pessoa_id
      where os.id = ordem_servico_andamentos.ordem_servico_id and u.id = auth.uid() and u.papel = 'inquilino'
    )
  );

create trigger trg_audit_os_andamentos after insert or update or delete on ordem_servico_andamentos
  for each row execute function fn_audit_trigger();

-- ---- 22.4 Planos de manutenção preventiva (cronograma recorrente) ----
-- Gerador: server/integracao/gerarOrdensServicoPreventivas.ts. Mesmo
-- padrão de idempotência de gerarFaturaMensal (docs/12): cada execução
-- gerada fica ligada ao plano + à data prevista, então rodar o job duas
-- vezes não duplica a OS.
create table planos_manutencao_preventiva (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid references imoveis(id),
  residencial_id uuid references residenciais(id),
  categoria text not null,
  descricao text,
  periodicidade_dias integer not null check (periodicidade_dias > 0),
  proxima_execucao date not null,
  prestador_padrao_id uuid references pessoas(id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint chk_plano_um_alvo check (
    (imovel_id is not null and residencial_id is null) or (imovel_id is null and residencial_id is not null)
  )
);

alter table ordens_servico add constraint fk_os_plano_manutencao
  foreign key (plano_manutencao_id) references planos_manutencao_preventiva(id);

alter table planos_manutencao_preventiva enable row level security;

create policy admin_full_access_planos_preventivos on planos_manutencao_preventiva
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
-- Sem política de prestador/inquilino: o plano é dado de planejamento
-- interno (não pedido como visível para prestador ou inquilino) — o
-- prestador continua vendo as OS geradas a partir dele normalmente, via
-- `prestador_ve_proprias_os` já existente.

create trigger trg_audit_planos_preventivos after insert or update or delete on planos_manutencao_preventiva
  for each row execute function fn_audit_trigger();

-- ---- 22.5 Data do custo de OS (faltava — necessária para relatório de despesas) ----
-- `ordem_servico_custos` não tinha nenhuma coluna de data. Sem isso, um
-- relatório de despesas por período (docs/15) teria que usar a data da OS
-- (criado_em/checkout_at), que não é a mesma coisa — a nota fiscal de um
-- material pode ser lançada dias depois da execução do serviço.
alter table ordem_servico_custos add column criado_em timestamptz not null default now();

-- ============================================================================
-- 23. PORTAL DO INQUILINO: CENTRAL DE CHAMADOS (HELPDESK)
-- ============================================================================
-- Pedido explícito do cliente: portal self-service com abertura de chamado
-- categorizada, protocolo, SLA por natureza da demanda, notificação a cada
-- mudança de status e pesquisa de satisfação ao concluir. `ordens_servico`
-- já modelava "chamado aberto pelo inquilino" (aberto_por_pessoa_id) e "OS
-- de prestador" (prestador_id) como a MESMA linha — decisão que se
-- mantém: não crio uma tabela `chamados` separada, porque "transformar o
-- chamado em O.S." (pilar 4 do pedido) já é automático quando um
-- `prestador_id` é atribuído à mesma linha — duas tabelas exigiriam
-- sincronizar estado em dois lugares para o mesmo conceito.

-- ---- 23.1 Protocolo legível ----
-- UUID não é um número que se fala ao telefone ou se escreve num e-mail.
-- Contador global (não reinicia por ano — o ano no texto é só rótulo,
-- não implica reinício da sequência), formatado "CH-2026-000123".
create sequence seq_protocolo_os;

create or replace function fn_gerar_protocolo_os()
returns trigger as $$
begin
  if new.protocolo is null then
    new.protocolo := 'CH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('seq_protocolo_os')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

alter table ordens_servico add column protocolo text unique;

create trigger trg_gerar_protocolo_os before insert on ordens_servico
  for each row execute function fn_gerar_protocolo_os();

-- ---- 23.2 Natureza da demanda (eixo diferente de urgência) ----
-- `urgencia` (já existente) é severidade subjetiva declarada por quem
-- abre. `natureza` é o eixo que decide PARA ONDE o chamado vai e QUAL
-- prazo de SLA se aplica — as quatro categorias pedidas pelo cliente.
-- Nullable na tabela de propósito: OS geradas internamente (cronograma
-- preventivo, ordem aberta direto pelo admin) não são obrigatoriamente
-- um dos quatro tipos de chamado do inquilino — a obrigatoriedade é
-- reforçada em código só no fluxo de abertura pelo inquilino
-- (`server/integracao/abrirChamado.ts`), não travada para toda a tabela.
alter table ordens_servico add column natureza text
  check (natureza in ('emergencia','financeiro','contratual','manutencao', null));

-- ---- 23.3 Vínculo direto com o contrato vigente na abertura ----
-- `imovel_id` já existia, mas um imóvel pode ter tido mais de um
-- contrato ao longo do tempo — sem isto, "qual contrato estava vigente
-- quando este chamado foi aberto" fica implícito e pode mudar de
-- resposta se o contrato for substituído depois.
alter table ordens_servico add column contrato_id uuid references contratos(id);

-- ---- 23.4 Anexos no ato de abertura ----
-- `ordem_servico_andamentos.fotos_urls` (docs/14) já cobre fotos DURANTE
-- a execução; isto é o mesmo padrão, mas para o que o inquilino já
-- anexa ao abrir o chamado (fotos/vídeos do problema, pedido do cliente).
alter table ordens_servico add column anexos_urls text[] not null default '{}';

-- ---- 23.5 SLA por natureza ----
-- "24 horas úteis para dúvidas... 2 horas para emergências" (texto do
-- cliente) — note a distinção real: emergência é em horas CORRIDAS (um
-- vazamento grave não espera o expediente abrir), as outras três em
-- horas ÚTEIS (seg-sex, 9h-18h — cálculo em
-- server/atendimento/prazoSla.ts). Fica como tabela, não constante no
-- código, para o prazo poder ser ajustado sem deploy.
create table sla_politicas (
  natureza text primary key check (natureza in ('emergencia','financeiro','contratual','manutencao')),
  prazo_horas numeric(6,2) not null check (prazo_horas > 0),
  horas_uteis boolean not null default true
);

insert into sla_politicas (natureza, prazo_horas, horas_uteis) values
  ('emergencia', 2, false),
  ('financeiro', 24, true),
  ('contratual', 24, true),
  ('manutencao', 48, true); -- não especificado no pedido do cliente; 48h fica explícito aqui, ajustável, em vez de suposição escondida em código

alter table ordens_servico add column sla_prazo_em timestamptz;

-- "Muda de cor na tela quando vence" (pedido do cliente) é
-- responsabilidade de quem lê (`sla_prazo_em < now() and status not in
-- ('concluido','cancelado')`) — não um booleano gravado, que ficaria
-- desatualizado no instante exato em que o relógio passasse do prazo
-- sem um job recalculando.

alter table sla_politicas enable row level security;
create policy admin_full_access_sla on sla_politicas
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy autenticado_le_sla on sla_politicas
  for select using (auth.uid() is not null);

-- ---- 23.6 Pesquisa de satisfação: quando foi enviada ----
-- `avaliacao_estrelas` (já existia) é a resposta (1 a 5). Isto é o
-- disparo — sem isto não dá para saber se a pesquisa já foi mandada
-- (evita mandar duas vezes) nem medir taxa de resposta (enviada vs.
-- respondida).
alter table ordens_servico add column pesquisa_enviada_em timestamptz;

-- ---- 23.7 Notificação a cada mudança de status ----
-- `notificacoes_log` (Módulo 14) já existia no schema mas nenhum código
-- gravava nela — estrutura morta. `server/integracao/andamentosOS.ts`
-- (docs/14, docs/16) passa a INSERIR nela a cada transição de status, e
-- ao concluir (pesquisa de satisfação). Duas mudanças pequenas na tabela
-- para isso ser honesto e rastreável:
--   - `status` só tinha 'enviado'/'falhou'/'lido' — todos implicam que
--     um provedor real confirmou algo. Sem chave de API de provedor de
--     notificação (mesma classe de bloqueio de
--     `docs/09-credenciais-necessarias.md`), gravar 'enviado' seria
--     afirmar uma entrega que não aconteceu. `pendente_envio` descreve o
--     que de fato acontece hoje: o conteúdo foi gerado e logado, o
--     disparo real por e-mail/SMS/WhatsApp ainda depende do provedor.
--   - `ordem_servico_id` (nullable — nem toda notificação futura será de
--     um chamado) liga a notificação ao chamado que a gerou, para o
--     histórico centralizado (pedido do cliente, pilar 4) conseguir
--     listar "todas as notificações deste protocolo".
alter table notificacoes_log drop constraint notificacoes_log_status_check;
alter table notificacoes_log add constraint notificacoes_log_status_check
  check (status in ('enviado','falhou','lido','pendente_envio'));
alter table notificacoes_log alter column status set default 'pendente_envio';
alter table notificacoes_log add column ordem_servico_id uuid references ordens_servico(id);

-- ---- 23.8 Inquilino pode abrir o próprio chamado ----
-- RLS já deixava o inquilino VER a própria OS (Módulo 6) mas não
-- INSERIR uma — sem isto, o pilar "self-service 24/7" do pedido do
-- cliente não existe no nível de dado, mesmo depois de a tela existir.
create policy inquilino_abre_propria_os on ordens_servico
  for insert with check (
    aberto_por_pessoa_id = fn_minha_pessoa_id()
    and exists (select 1 from usuarios u where u.id = auth.uid() and u.papel = 'inquilino')
  );

-- ============================================================================
-- 24. PIPELINE DE RECEBIMENTO: EMISSÃO DE COBRANÇA, WEBHOOK E REPASSE
-- ============================================================================
-- `server/asaas/client.ts` e `server/asaas/webhook.ts` existiam desde as
-- primeiras fases, testados isoladamente (fetch mockado — nunca contra o
-- sandbox real, sem chave de API neste ambiente), mas nada os ligava ao
-- banco: nenhuma fatura tinha uma cobrança emitida de verdade, nenhum
-- webhook atualizava nada, e `investidor_ledger` nunca recebia uma linha.
-- Esta seção fecha essa cadeia (docs/17-pipeline-recebimento.md).

-- Guarda o id do cliente no Asaas por pessoa, para não recriar o cadastro
-- lá a cada nova cobrança (`server/integracao/emitirCobranca.ts`).
alter table pessoas add column asaas_customer_id text unique;

-- Índice único parcial: no máximo um `credito_repasse` por (fatura,
-- pessoa) — mesma proteção contra corrida real já aplicada a
-- `faturas` (seção pós-22, `uq_faturas_aluguel_por_contrato_competencia`):
-- duas execuções concorrentes de `distribuirRecebimento.ts` não podem
-- creditar o mesmo proprietário duas vezes pela mesma fatura. Parcial
-- (não um índice único geral em `referencia_fatura_id, pessoa_id`) porque
-- outros tipos de lançamento (`debito_custo`, etc.) podem legitimamente
-- referenciar a mesma fatura para o mesmo proprietário por outro motivo.
create unique index uq_investidor_ledger_credito_repasse_por_fatura
  on investidor_ledger(referencia_fatura_id, pessoa_id) where tipo = 'credito_repasse';

-- ============================================================================
-- 25. EXTRATO DO PROPRIETÁRIO E CONCILIAÇÃO BANCÁRIA
-- ============================================================================
-- Auditoria pós-docs/17 ("audite e veja se falta desenvolver algo"):
-- investidor_ledger finalmente recebe dado real desde distribuirRecebimento.ts,
-- mas nada agregava isso no "Extrato do Proprietário" que o próprio comentário
-- da tabela (Módulo 10) já citava como referência de mercado (Imobzi) — e
-- `transacoes_bancarias.origem` já previa `'ofx'` como fonte, mas nenhum
-- código lia um arquivo OFX (só o exportador de docs/15 existia, na direção
-- contrária). `fundos`/`fundo_movimentacoes` (retenção FRO/CAPEX) ficam de
-- fora desta rodada: não há percentual de retenção documentado em nenhum
-- lugar (nem em `fundos`, nem em `imovel_propriedade`) — inventar um seria a
-- mesma classe de erro já evitada nesta sessão (docs/10, docs/11, docs/15).

-- `credito_repasse.valor` grava o líquido (pós taxa de administração) desde
-- docs/17 — correto para o saldo corrido, mas insuficiente para o extrato
-- mostrar "receita bruta" e "dedução" como linhas separadas (pedido
-- implícito do próprio design de `extrato_mensal_itens`, que já tem
-- `tipo in ('receita','despesa')`). Em vez de reescrever o ledger em duas
-- linhas por lançamento (mudaria a semântica de `saldo_apos` e quebraria os
-- 9 testes já existentes de `distribuirRecebimento.ts` sem necessidade),
-- adicionar o valor bruto como coluna extra no mesmo lançamento é a mudança
-- mínima que resolve o problema.
alter table investidor_ledger add column valor_bruto numeric(14,2);

-- `transacoes_bancarias` já previa `origem = 'ofx'`, mas não tinha nenhuma
-- forma de saber se uma transação de um extrato já tinha sido importada
-- antes — reimportar o mesmo arquivo (comum: usuário baixa o extrato do mês
-- de novo, sobrepondo dias já cobertos) duplicaria lançamentos sem uma
-- chave natural para deduplicar. FITID (financial institution transaction
-- ID) é exatamente o campo que o próprio padrão OFX existe para resolver
-- isso — cada banco garante que é único por conta.
alter table transacoes_bancarias add column referencia_externa text;
create unique index uq_transacoes_bancarias_conta_referencia_externa
  on transacoes_bancarias(conta_id, referencia_externa) where referencia_externa is not null;

-- ============================================================================
-- 26. SOLICITAÇÕES ESPECIALIZADAS: IMAGENS DE CÂMERA, CHAVE RESERVA E
--     AUTORIZAÇÃO DE INTERNET PARTICULAR
-- ============================================================================
-- Anexos I-VI de Florianópolis (Kitnet 16, Residencial João Pottker),
-- enviados após docs/10, trouxeram três coisas que o helpdesk genérico
-- (seção 23) ainda não cobria — não são "chamado qualquer", são pedidos
-- com regra própria de aprovação e/ou tarifa.

-- ---- 26.1 Imagens de câmera: o padrão do Anexo III é negar, não aprovar ----
-- O Anexo III, item B.2, veda expressamente "a solicitação de imagens por
-- inquilinos para fins particulares, exceto sob ordem judicial ou
-- policial". O cliente confirmou (nesta conversa): o pedido do inquilino
-- não é aprovado pelo admin — vira análise do jurídico para verificar se
-- há exceção legal aplicável, mantendo a regra do anexo como padrão
-- (ou seja: a resposta default é negar; só uma exceção legal fundamentada
-- muda isso). Por isso natureza ganha um quinto valor, distinto dos
-- quatro já existentes — nenhum dos quatro (emergência/financeiro/
-- contratual/manutenção) descreve corretamente "isto vai para análise
-- jurídica antes de qualquer resposta ao inquilino".
alter table ordens_servico drop constraint ordens_servico_natureza_check;
alter table ordens_servico add constraint ordens_servico_natureza_check
  check (natureza in ('emergencia','financeiro','contratual','manutencao','juridico', null));

alter table sla_politicas drop constraint sla_politicas_natureza_check;
alter table sla_politicas add constraint sla_politicas_natureza_check
  check (natureza in ('emergencia','financeiro','contratual','manutencao','juridico'));

-- Prazo de 5 dias úteis: não especificado pelo cliente para este caso
-- específico, mas é o mesmo prazo que o próprio Anexo III usa em toda
-- parte onde envolve manifestação/análise formal (item C.1-A: 5 dias
-- úteis para o inquilino se manifestar sobre uma multa; item 5.2:
-- "rotina" de manutenção em 5 dias úteis) — mantém a mesma régua do
-- contrato em vez de inventar um número novo. Ajustável, como
-- 'manutencao' (seção 23.5) já é.
insert into sla_politicas (natureza, prazo_horas, horas_uteis) values
  ('juridico', 40, true); -- 5 dias úteis * 8h

create table solicitacoes_imagens_cameras (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null unique references ordens_servico(id) on delete cascade,
  data_solicitada date not null,
  horario_solicitado text not null,
  justificativa text not null,
  status text not null default 'em_analise_juridica'
    check (status in ('em_analise_juridica', 'excecao_legal_deferida', 'indeferida_regra_padrao')),
  parecer_juridico text,
  analisado_por_pessoa_id uuid references pessoas(id),
  analisado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint chk_parecer_quando_decidido check (
    status = 'em_analise_juridica' or parecer_juridico is not null
  )
);

alter table solicitacoes_imagens_cameras enable row level security;
create policy admin_full_access_solicitacoes_cameras on solicitacoes_imagens_cameras
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_propria_solicitacao_cameras on solicitacoes_imagens_cameras
  for select using (
    exists (
      select 1 from ordens_servico os
      where os.id = solicitacoes_imagens_cameras.ordem_servico_id and os.aberto_por_pessoa_id = fn_minha_pessoa_id()
    )
  );

create trigger trg_audit_solicitacoes_cameras
  after insert or update or delete on solicitacoes_imagens_cameras
  for each row execute function fn_audit_trigger();

-- ---- 26.2 Chave reserva/cópia: tarifa é do contrato, não do sistema ----
-- O Anexo II, item 2, lista "Chaveiro (abertura/perda) — R$ 140,00" — e
-- mais uma dúzia de outras taxas fixas de manutenção (pintura,
-- desentupimento, limpeza pesada) que hoje não existem em lugar nenhum
-- do schema. Em vez de uma coluna só para "valor da chave" (repetindo o
-- erro já corrigido em docs/01/docs/10 de tratar termo de contrato como
-- constante do sistema), esta tabela generaliza a "Planilha de Taxas de
-- Manutenção" do Anexo II inteira, por contrato — serve para chave
-- reserva agora e para o resto da tabela (usada em indenização por
-- sinistro, Anexo II item 5) quando esse fluxo for construído.
create table contrato_tarifario_servicos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  servico text not null,
  valor numeric(10,2) not null check (valor >= 0),
  observacao text,
  criado_em timestamptz not null default now(),
  unique (contrato_id, servico)
);

alter table contrato_tarifario_servicos enable row level security;
create policy admin_full_access_tarifario_servicos on contrato_tarifario_servicos
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_tarifario_do_proprio_contrato on contrato_tarifario_servicos
  for select using (
    exists (
      select 1 from contrato_partes cp
      where cp.contrato_id = contrato_tarifario_servicos.contrato_id and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );

create trigger trg_audit_tarifario_servicos
  after insert or update or delete on contrato_tarifario_servicos
  for each row execute function fn_audit_trigger();

-- ---- 26.3 Autorização de internet particular: orientação é dado do imóvel, não do sistema ----
-- "Orientações de como fazer na estrutura do imóvel" é informação física
-- de cada prédio (por onde passa a fiação, se pode furar parede,
-- localização do rack) — não é algo que se possa inferir ou inventar por
-- código. Fica como campo cadastrável pelo admin, nulo até alguém
-- preencher; o fluxo de solicitação (server/integracao/
-- solicitarAutorizacaoInternetParticular.ts) devolve o texto se existir e
-- avisa explicitamente quando ainda não foi cadastrado, em vez de inventar
-- instrução técnica genérica.
alter table imoveis add column orientacoes_instalacao_internet text;

-- ============================================================================
-- 27. MOTOR DE GERAÇÃO DE CONTRATOS (LEGAL DESIGN / VISUAL LAW)
-- ============================================================================
-- Pedido explícito do cliente: gerar o contrato de locação em HTML/CSS
-- (Legal Design/Visual Law, custo zero de licenciamento), fundindo modelo
-- regional + dados variáveis do inquilino + inventário de mobília
-- independente + cláusulas adicionais de texto livre, com suporte a
-- Kitnet Integral ou Co-living por quarto. `docs/27-motor-de-contratos.md`
-- explica cada decisão; aqui só o schema. Reaproveita o que já existia em
-- vez de duplicar: `contrato_partes` já modela múltiplos locatários e
-- responsáveis solidários (seção 19.6), `garantias` já modela caução,
-- `ativos_comodato` já é o inventário de mobília por imóvel (seção 7,
-- CPC 27) — este módulo estende os três, não os recria.

-- ---- 27.1 Dados cadastrais que faltavam em `pessoas` para o contrato ----
-- RG, profissão e estado civil são exigidos na qualificação das partes de
-- qualquer contrato de locação — `pessoas` só tinha nome/CPF/e-mail/
-- telefone/endereço (bastava para faturamento, não para qualificação
-- jurídica).
alter table pessoas add column rg text;
alter table pessoas add column profissao text;
alter table pessoas add column estado_civil text
  check (estado_civil in ('solteiro','casado','divorciado','viuvo','uniao_estavel', null));

-- ---- 27.2 Co-living: cômodos como unidade locável dentro do imóvel ----
-- `imoveis` já é a unidade "kitnet" — para co-living, o contrato pode se
-- referir só a um cômodo dela, não à unidade inteira. `permite_coliving`
-- é a flag que o requisito pediu; `comodos` só existe quando essa flag é
-- usada (uma kitnet tradicional nunca ganha linha aqui).
alter table imoveis add column permite_coliving boolean not null default false;

create table comodos (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id) on delete cascade,
  identificacao text not null,           -- ex: "Quarto 1", "Suíte A"
  area_m2 numeric(6,2),
  valor_aluguel_referencia numeric(14,2), -- valor de mercado do cômodo isolado, referência para o contrato de co-living
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (imovel_id, identificacao)
);

create index idx_comodos_imovel on comodos(imovel_id);

alter table comodos enable row level security;
create policy admin_full_access_comodos on comodos
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create trigger trg_audit_comodos after insert or update or delete on comodos
  for each row execute function fn_audit_trigger();

-- `contratos.comodo_id` nulo = objeto da locação é o imóvel inteiro
-- (kitnet tradicional ou "Opção A: Kitnet Toda" do co-living); preenchido
-- = objeto é só aquele cômodo ("Opção B: Por Quartos"). A trigger garante
-- que só é possível vincular um cômodo de um imóvel que de fato permite
-- co-living e que o cômodo pertence ao mesmo imóvel do contrato — regra
-- demais para um `check` simples (precisa consultar duas tabelas).
alter table contratos add column comodo_id uuid references comodos(id);
alter table contratos add column clausulas_adicionais text; -- pedidos específicos do inquilino, texto livre injetado no HTML final

create or replace function fn_check_contrato_comodo_coerente()
returns trigger as $$
declare
  v_imovel_do_comodo uuid;
  v_permite_coliving boolean;
begin
  if new.comodo_id is null then
    return new;
  end if;

  select imovel_id into v_imovel_do_comodo from comodos where id = new.comodo_id;
  if v_imovel_do_comodo is distinct from new.imovel_id then
    raise exception 'Cômodo % não pertence ao imóvel % deste contrato', new.comodo_id, new.imovel_id;
  end if;

  select permite_coliving into v_permite_coliving from imoveis where id = new.imovel_id;
  if not coalesce(v_permite_coliving, false) then
    raise exception 'Imóvel % não permite co-living — contrato não pode se referir a um cômodo específico', new.imovel_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_check_contrato_comodo_coerente
  before insert or update on contratos
  for each row execute function fn_check_contrato_comodo_coerente();

-- ---- 27.3 Inventário de mobília: estender `ativos_comodato`, não duplicar ----
-- `ativos_comodato` (seção 7) já é "inventário de mobília vinculado ao
-- imóvel", já suporta adicionar/remover item a qualquer momento sem tocar
-- em texto jurídico nenhum (é uma tabela própria, sempre foi). O único
-- requisito novo é o co-living: um item pode ser de um cômodo específico
-- (`comodo_id`) ou de área comum compartilhada (`area_comum` — cozinha,
-- lavanderia, sala). Os dois são mutuamente exclusivos por natureza; a
-- constraint impede gravar os dois ao mesmo tempo. Quando o imóvel não
-- usa co-living, os dois ficam nulos/falsos e a busca de mobília do
-- contrato continua sendo "tudo do imóvel", como já era.
alter table ativos_comodato add column comodo_id uuid references comodos(id);
alter table ativos_comodato add column area_comum boolean not null default false;
alter table ativos_comodato add constraint chk_ativo_comodo_ou_area_comum_nao_ambos
  check (not (comodo_id is not null and area_comum));

-- ---- 27.4 Modelos de contrato por região: conteúdo de gestão, não código ----
-- Mesma decisão já validada para o resto do sistema (relatório de
-- auditoria do portal do inquilino, seção "Templates com variáveis"):
-- HTML/Markdown com marcadores `{{variavel}}`, mantido pela gestão via
-- cadastro, nunca hardcoded em TypeScript — trocar uma cláusula não pode
-- exigir um deploy. `cidade_id` decide automaticamente Florianópolis vs.
-- Curitiba a partir da cidade do imóvel (`imoveis.cidade_id` já existe);
-- `versao`/`ativo` permite corrigir um modelo sem invalidar contratos já
-- gerados com a versão anterior (o HTML final de cada contrato já fica
-- persistido em `documentos_gerados`, não recalculado depois).
create table modelos_contrato (
  id uuid primary key default gen_random_uuid(),
  cidade_id uuid not null references cidades(id),
  nome text not null,
  versao smallint not null default 1,
  corpo_html text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cidade_id, versao)
);

-- No máximo um modelo ativo por cidade — evita ambiguidade na hora de
-- resolver "qual modelo usar para este imóvel" sem precisar de ORDER
-- BY/LIMIT torcido no código de geração.
create unique index uq_modelos_contrato_ativo_por_cidade
  on modelos_contrato(cidade_id) where ativo;

alter table modelos_contrato enable row level security;
create policy admin_full_access_modelos_contrato on modelos_contrato
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create trigger trg_audit_modelos_contrato after insert or update or delete on modelos_contrato
  for each row execute function fn_audit_trigger();

-- ---- 27.5 Garantia: forma de devolução/pagamento (faltava em `garantias`) ----
-- O pedido do cliente inclui "forma de devolução e condições de
-- pagamento (PIX, boleto, parcelado em X vezes)" da caução — `garantias`
-- já tinha valor/tipo/status, faltava só como o dinheiro entra e sai.
alter table garantias add column forma_pagamento text
  check (forma_pagamento in ('pix','boleto','dinheiro','parcelado', null));
alter table garantias add column parcelas smallint check (parcelas is null or parcelas > 0);

-- ============================================================================
-- 28. MODELOS DE CONTRATO POR CATEGORIA DE IMÓVEL (NÃO SÓ POR CIDADE)
-- ============================================================================
-- Você enviou o texto corrido dos 3 contratos reais de Curitiba já
-- estruturalmente auditados em docs/11 (componentes mensais, garantia
-- dupla, IPTU repassado) e a heterogeneidade se mostrou maior do que só
-- valores: multa rescisória em três formatos diferentes (fixa em meses,
-- fixa em salários mínimos, proporcional com teto) e regras de forma de
-- pagamento que se contradizem entre os contratos residenciais, além da
-- Sala Comercial ser estruturalmente outra coisa (vaga como % do valor
-- total, reajuste em degraus, sem comodato). Um único modelo por cidade
-- (seção 27.4) obrigaria Curitiba a se parecer artificialmente homogênea
-- do jeito que Florianópolis genuinamente é — decisão sua, confirmada via
-- pergunta direta: modelos passam a ser por (cidade, categoria de imóvel).
alter table modelos_contrato add column categoria text not null default 'geral'
  check (categoria in ('geral', 'residencial', 'comercial'));

-- `'geral'` é o valor dos modelos já cadastrados antes desta seção (hoje,
-- só Florianópolis) — continuam resolvendo normalmente sem precisar de
-- categoria própria, porque lá a homogeneidade entre kitnets já foi
-- comprovada (docs/10). Curitiba passa a cadastrar `'residencial'` e
-- `'comercial'` como linhas próprias, cada uma com seu próprio ativo/
-- versão — `gerarContratoHtml.ts` resolve a categoria do imóvel
-- (`imoveis.tipo = 'sala_comercial'` → comercial, os demais →
-- residencial) e busca o modelo exato daquela categoria, caindo para
-- `'geral'` só quando a cidade não tiver um modelo específico cadastrado.
drop index uq_modelos_contrato_ativo_por_cidade;
create unique index uq_modelos_contrato_ativo_por_cidade_categoria
  on modelos_contrato(cidade_id, categoria) where ativo;

alter table modelos_contrato drop constraint modelos_contrato_cidade_id_versao_key;
alter table modelos_contrato add constraint uq_modelos_contrato_cidade_categoria_versao
  unique (cidade_id, categoria, versao);

-- A multa rescisória (3 meses fixos / 3 salários mínimos / 50% proporcional
-- com teto — nenhuma das três é a mesma fórmula) e a forma de pagamento
-- aceita (PIX proibido, PIX obrigatório só na caução, PIX como exceção)
-- deliberadamente NÃO ganharam campo próprio em `contrato_politica_cobranca`
-- nesta rodada: são 3 contratos residenciais/comerciais de Curitiba contra
-- 1 padrão homogêneo de Florianópolis — o mesmo risco de generalizar cedo
-- demais já documentado em docs/11 para o desconto de pontualidade. Os
-- modelos de Curitiba (residencial e comercial) tratam essas duas cláusulas
-- via `contratos.clausulas_adicionais` (seção 27.2), preenchido contrato a
-- contrato, em vez de fingir uma fórmula universal que nenhuma evidência
-- sustenta ainda.

-- ============================================================================
-- 29. SOLICITAÇÃO DE QUEBRA DE CONTRATO (CÁLCULO DE MULTA RESCISÓRIA)
-- ============================================================================
-- Item do pedido original do portal do inquilino ("pedido de quebra de
-- contrato com cálculo automático de multa rescisória para análise da
-- gestão") — a fórmula de Florianópolis (cláusula 11.2 + bonificação de
-- dezembro do Anexo I) já estava 100% evidenciada desde docs/10, só
-- faltava código (`server/financeiro/multaRescisoria.ts`). Curitiba
-- continua sem fórmula própria codificada (3 contratos reais, 3 fórmulas
-- diferentes — docs/11) — o pedido abre e calcula quando há fórmula
-- (Florianópolis), e abre sinalizando "sem cálculo automático, gestão
-- aplica a cláusula deste contrato" quando não há (Curitiba), em vez de
-- fingir uma fórmula universal.
create table solicitacoes_quebra_contrato (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null unique references ordens_servico(id) on delete cascade,
  contrato_id uuid not null references contratos(id),
  data_rescisao_desejada date not null,
  data_notificacao date not null,
  -- null quando a cidade do contrato não tem fórmula codificada ainda —
  -- nunca um valor "estimado"/adivinhado nesse caso.
  multa_calculada numeric(14,2),
  faixa_bonificacao text check (faixa_bonificacao in
    ('ate_22_novembro', 'ate_27_novembro', 'fora_da_janela', 'nao_aplicavel', null)),
  status text not null default 'em_analise' check (status in ('em_analise', 'aprovada', 'rejeitada')),
  parecer_gestao text,
  analisado_por_pessoa_id uuid references pessoas(id),
  analisado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint chk_quebra_parecer_quando_decidido check (
    status = 'em_analise' or parecer_gestao is not null
  )
);

alter table solicitacoes_quebra_contrato enable row level security;
create policy admin_full_access_quebra_contrato on solicitacoes_quebra_contrato
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy inquilino_ve_propria_solicitacao_quebra on solicitacoes_quebra_contrato
  for select using (
    exists (
      select 1 from ordens_servico os
      where os.id = solicitacoes_quebra_contrato.ordem_servico_id and os.aberto_por_pessoa_id = fn_minha_pessoa_id()
    )
  );

create trigger trg_audit_quebra_contrato
  after insert or update or delete on solicitacoes_quebra_contrato
  for each row execute function fn_audit_trigger();

-- ============================================================================
-- 30. AUDITORIA DE GERAÇÃO SOLAR (SHINEPHONE/GROWATT + FATURA CELESC GD)
-- ============================================================================
-- Resolve a pergunta em aberto desde docs/10 ("preciso que você descreva o
-- mecanismo real de monetização da energia solar"): geração fotovoltaica
-- com créditos de compensação (Lei 14.300/2022, REN ANEEL 1.059/2023),
-- monitorada pela API do app ShinePhone (Growatt) e cruzada com a fatura
-- de geração distribuída (GD) da Celesc para isolar quanto da energia
-- gerada/consumida corresponde às áreas comuns — a parte que não é
-- cobrada individualmente de nenhum inquilino.
--
-- `geracao_solar` (seção 19) já existia como o total mensal CONFIRMADO —
-- esta seção adiciona a granularidade diária de origem (API) que
-- alimenta essa confirmação, sem duplicar o que já existia.
create table leituras_geracao_solar_diaria (
  id uuid primary key default gen_random_uuid(),
  residencial_id uuid not null references residenciais(id),
  data date not null,
  energia_gerada_kwh numeric(10,2) not null check (energia_gerada_kwh >= 0),
  origem text not null check (origem in ('api_shinephone', 'manual')),
  -- Resposta bruta da API guardada para auditoria/depuração — o formato
  -- exato depende de qual das duas integrações (token V1 ou legada por
  -- usuário/senha) for usada; ainda não implementado (server/growatt/
  -- client.ts não existe até você confirmar qual caminho seguir).
  payload_bruto jsonb,
  criado_em timestamptz not null default now(),
  unique (residencial_id, data)
);

alter table leituras_geracao_solar_diaria enable row level security;
create policy admin_full_access_leituras_geracao_diaria on leituras_geracao_solar_diaria
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create trigger trg_audit_leituras_geracao_diaria
  after insert or update or delete on leituras_geracao_solar_diaria
  for each row execute function fn_audit_trigger();

-- Fatura de Geração Distribuída da Celesc: os três valores que a
-- auditoria precisa (valor total, kWh injetado, kWh consumido da rede)
-- entram por lançamento manual nesta rodada — sem uma fatura real de GD
-- em mãos, um parser automático seria adivinhar o layout do PDF (mesmo
-- erro que o projeto evita desde docs/10/11). `arquivo_url` guarda o PDF
-- de origem para auditoria; `status` segue o mesmo padrão de confirmação
-- humana de `leituras_energia`/`geracao_solar` — nunca vira auditoria
-- oficial sem confirmação.
create table faturas_celesc_gd (
  id uuid primary key default gen_random_uuid(),
  residencial_id uuid not null references residenciais(id),
  competencia date not null,
  valor_total numeric(14,2) not null check (valor_total >= 0),
  energia_injetada_kwh numeric(10,2) not null check (energia_injetada_kwh >= 0),
  energia_consumida_rede_kwh numeric(10,2) not null check (energia_consumida_rede_kwh >= 0),
  arquivo_url text,
  status text not null default 'pendente_confirmacao' check (status in ('pendente_confirmacao', 'confirmada')),
  confirmado_por uuid references pessoas(id),
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (residencial_id, competencia)
);

alter table faturas_celesc_gd enable row level security;
create policy admin_full_access_faturas_celesc_gd on faturas_celesc_gd
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create trigger trg_audit_faturas_celesc_gd
  after insert or update or delete on faturas_celesc_gd
  for each row execute function fn_audit_trigger();

-- Resultado da auditoria mensal (server/energia/auditoriaGeracaoSolar.ts):
-- cruza geração solar confirmada + fatura Celesc GD confirmada + soma do
-- que já foi cobrado dos inquilinos (fatura_itens, já existente via
-- faturarEnergia.ts) para isolar o consumo de área comum e o resultado
-- financeiro (lucro ou custo absorvido pela administração).
-- Checks de não-negatividade abaixo: docs/35 encontrou essa tabela sem
-- eles, mesma classe de lacuna que a auditoria stress-test (docs/08) já
-- havia corrigido em 10 outras tabelas de uma vez. A função pura que
-- grava aqui (server/energia/auditoriaGeracaoSolar.ts) já garante isso
-- em código — o constraint é defesa em profundidade, não substitui a
-- validação. `resultado_financeiro_valor` é a única exceção deliberada:
-- pode ser negativo por design (custo absorvido pela administração
-- quando o consumo real custa mais do que o cobrado dos inquilinos).
create table auditorias_energia_solar (
  id uuid primary key default gen_random_uuid(),
  residencial_id uuid not null references residenciais(id),
  competencia date not null,
  energia_gerada_total_kwh numeric(10,2) not null check (energia_gerada_total_kwh >= 0),
  energia_injetada_kwh numeric(10,2) not null check (energia_injetada_kwh >= 0),
  consumo_proprio_instantaneo_kwh numeric(10,2) not null check (consumo_proprio_instantaneo_kwh >= 0),
  energia_consumida_rede_kwh numeric(10,2) not null check (energia_consumida_rede_kwh >= 0),
  total_consumido_kwh numeric(10,2) not null check (total_consumido_kwh >= 0),
  total_cobrado_inquilinos_kwh numeric(10,2) not null check (total_cobrado_inquilinos_kwh >= 0),
  total_cobrado_inquilinos_valor numeric(14,2) not null check (total_cobrado_inquilinos_valor >= 0),
  area_comum_kwh numeric(10,2) not null check (area_comum_kwh >= 0),
  area_comum_valor numeric(14,2) not null check (area_comum_valor >= 0),
  resultado_financeiro_valor numeric(14,2) not null,
  calculado_em timestamptz not null default now(),
  unique (residencial_id, competencia)
);

alter table auditorias_energia_solar enable row level security;
create policy admin_full_access_auditorias_energia_solar on auditorias_energia_solar
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy investidor_ve_auditoria_do_proprio_residencial on auditorias_energia_solar
  for select using (
    exists (
      select 1 from imoveis i
      join imovel_propriedade ip on ip.imovel_id = i.id
      where i.residencial_id = auditorias_energia_solar.residencial_id and ip.proprietario_pessoa_id = fn_minha_pessoa_id()
    )
  );
create trigger trg_audit_auditorias_energia_solar
  after insert or update or delete on auditorias_energia_solar
  for each row execute function fn_audit_trigger();

-- ============================================================================
-- 31. FINANCIAMENTO/HIPOTECA POR IMÓVEL E PATRIMÔNIO LÍQUIDO
-- ============================================================================
-- Pedido direto do cliente ao revisar a cobertura do portfólio de Curitiba
-- (docs/33): todos os imóveis de Curitiba são financiados, um deles (Apto
-- 151A, Edifício Vega to Live) por consórcio com hipoteca — regime
-- diferente de financiamento bancário tradicional, daí `tipo` distinguir
-- os dois. Um imóvel pode ter mais de um financiamento ao longo do tempo
-- (quitado um, contratado outro), por isso é tabela própria, não colunas
-- em `imoveis` — mesmo padrão de `garantias` (várias linhas por contrato).
--
-- Uso pedido explicitamente: (1) apurar patrimônio líquido mensal por
-- imóvel e consolidado — `imoveis.valor_avaliacao` (nova coluna) menos o
-- saldo devedor somado dos financiamentos ativos daquele imóvel; (2)
-- entrar como despesa fixa recorrente do negócio — soma de
-- `valor_parcela` de todos os financiamentos ativos, por imóvel e total.
-- Nenhum dos dois cálculos vive aqui: schema só guarda o dado; o cálculo
-- é código testado (server/financeiro/patrimonioLiquido.ts), mesma
-- separação de sempre (docs/03).
--
-- NÃO inclui valor_avaliacao nem saldo_devedor nem valor_parcela reais
-- de nenhum imóvel específico — só quem tem os números (o cliente) pode
-- preenchê-los; inventar um valor aqui seria o mesmo erro que este
-- projeto evita desde docs/10.
alter table imoveis add column valor_avaliacao numeric(14,2) check (valor_avaliacao is null or valor_avaliacao >= 0);

create table financiamentos_imoveis (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id) on delete cascade,
  tipo text not null check (tipo in ('financiamento_bancario', 'consorcio_hipoteca')),
  instituicao text,
  valor_financiado numeric(14,2) check (valor_financiado is null or valor_financiado >= 0),
  valor_parcela numeric(14,2) not null check (valor_parcela >= 0),
  saldo_devedor numeric(14,2) check (saldo_devedor is null or saldo_devedor >= 0),
  data_inicio date,
  numero_parcelas smallint check (numero_parcelas is null or numero_parcelas > 0),
  status text not null default 'ativo' check (status in ('ativo', 'quitado')),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_financiamentos_imoveis_imovel on financiamentos_imoveis(imovel_id) where status = 'ativo';

-- Dado financeiro sensível do proprietário/CRMT (saldo devedor, valor de
-- avaliação) — mesmo tratamento de garantias/investidor_ledger: admin/
-- economista têm acesso total; investidor vê os financiamentos dos
-- imóveis dos quais é proprietário (mesmo padrão de imovel_propriedade).
alter table financiamentos_imoveis enable row level security;
create policy admin_full_access_financiamentos_imoveis on financiamentos_imoveis
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create policy investidor_ve_financiamento_do_proprio_imovel on financiamentos_imoveis
  for select using (
    exists (
      select 1 from imovel_propriedade ip
      where ip.imovel_id = financiamentos_imoveis.imovel_id and ip.proprietario_pessoa_id = fn_minha_pessoa_id()
    )
  );
create trigger trg_audit_financiamentos_imoveis
  after insert or update or delete on financiamentos_imoveis
  for each row execute function fn_audit_trigger();

-- ============================================================================
-- 32. PRESTADORES DE SERVIÇO (Zelador, Serviços Gerais, Eventuais)
-- ============================================================================
-- Contexto: Paulo (Zelador) e Cristiano (Serviços Gerais) são prestadores de
-- serviço com contrato fixo que geram NFS-e. Não são empregados CLT.
-- Fechamento: Paulo mensal (dia 10, referente mês anterior),
--             Cristiano semanal (sexta-feira).
-- Reajuste: IPCA, data base julho, efeito em agosto.
-- Dados: integrados com personas existente, RLS por papel, rateio por residencial.
-- Retroativo: 01/2023 em diante (migração de dados históricos).
--
-- Documentação completa: docs/36-prestadores-servico.md

create table prestadores_servico (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid unique references pessoas(id),
  nome_completo text not null,
  cpf_cnpj text not null unique,
  tipo text not null check (tipo in ('fixo', 'eventual')),
  categoria text not null check (categoria in ('zelador', 'servicos_gerais', 'manutencao', 'limpeza', 'outro')),

  -- Dados bancários para PIX
  chave_pix text,
  instituicao_bancaria text,
  tipo_conta text,
  agencia text,
  conta text,

  -- Contato
  email text,
  telefone text,

  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'suspenso')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  unique (cpf_cnpj)
);

-- Contrato de prestação de serviços (histórico + ativo)
create table contratos_prestador (
  id uuid primary key default gen_random_uuid(),
  prestador_id uuid not null references prestadores_servico(id) on delete cascade,

  data_inicio date not null,
  data_fim date,

  tipo_contrato text not null check (tipo_contrato in ('fixo', 'eventual')),
  tipo_remuneracao text not null check (tipo_remuneracao in (
    'diaria_fixa',
    'hora_fixa',
    'por_servico'
  )),
  valor_base numeric(10,2) not null check (valor_base > 0),
  valor_hora numeric(10,2),

  -- Reajuste automático (IPCA para Paulo e Cristiano)
  reajuste_indice text check (reajuste_indice in ('ipca', 'manual', 'none')),
  data_base_reajuste date,
  percentual_reajuste_ultimo numeric(5,2),
  data_ultimo_reajuste date,

  -- Frequência de fechamento
  frequencia_fechamento text not null check (frequencia_fechamento in (
    'semanal',
    'mensal',
    'por_servico'
  )),
  dia_fechamento_semana smallint check (dia_fechamento_semana between 1 and 7),
  dia_fechamento_mes smallint check (dia_fechamento_mes between 1 and 31),

  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint data_fim_maior_inicio check (data_fim is null or data_fim > data_inicio)
);

-- Regras específicas por contrato (JSON para flexibilidade)
create table regras_prestador (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null unique references contratos_prestador(id) on delete cascade,

  -- JSON com configurações por prestador
  -- Paulo: {"diaria": 121.63, "valor_hora": 14.53, "combustivel_diario_litros": 3,
  --         "combustivel_valor_litro": 7.20, "combustivel_base_mensal_litros": 25,
  --         "combustivel_base_mensal": 219.59, "adicional_comunicacao": 244.10, ...}
  -- Cristiano: {"diaria": 200.00, "valor_hora": 25.00, "horario_inicio": "08:00",
  --            "horario_saida": "17:00", "intervalo_almoco_minutos": 60, ...}
  regras jsonb not null,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Alocação de prestador por residencial (para rateio contábil)
create table alocacao_prestador_residencial (
  id uuid primary key default gen_random_uuid(),
  prestador_id uuid not null references prestadores_servico(id) on delete cascade,
  residencial_id uuid not null references residenciais(id) on delete cascade,

  data_inicio date not null default current_date,
  data_fim date,

  ativo boolean not null default true,
  criado_em timestamptz not null default now(),

  unique (prestador_id, residencial_id, data_inicio),
  constraint data_fim_maior_inicio check (data_fim is null or data_fim > data_inicio)
);

-- Apontamento diário (calendário de horas, atividades, quilometragem)
create table apontamentos_prestador (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos_prestador(id) on delete cascade,
  data date not null,

  hora_inicio time,
  hora_saida time,
  intervalo_almoco_minutos smallint default 60,
  horas_trabalhadas numeric(4,2),

  descricao_atividades text,
  categoria_atividade text,

  quilometragem_extra numeric(6,2),
  tipo_deslocamento text,
  valor_deslocamento numeric(10,2),

  -- Kits Airbnb (Cristiano)
  quantidade_kits_pos_hospedagem smallint default 0,
  quantidade_kits_dentro_horario smallint default 0,

  eh_emergencia boolean default false,

  -- Residenciais visitados (rateio)
  residenciais_ids text,

  observacoes text,
  enviado_para_fechamento boolean default false,
  foi_importado_retroativo boolean default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint hora_range check (hora_inicio is null or hora_saida is null or hora_saida > hora_inicio)
);

-- Detalhamento de apontamento por residencial (rateio)
create table apontamentos_residencial_detalhe (
  id uuid primary key default gen_random_uuid(),
  apontamento_id uuid not null references apontamentos_prestador(id) on delete cascade,
  residencial_id uuid not null references residenciais(id) on delete cascade,
  horas_trabalhadas numeric(5,2) not null,
  foi_rateado_automatico boolean default false,
  criado_em timestamptz not null default now()
);

-- Adiantamentos, vales, parcelamentos, empréstimos
create table adiantamentos_prestador (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos_prestador(id) on delete cascade,

  data_lancamento date not null,
  tipo text not null check (tipo in (
    'vale_adiantamento',
    'compra_intermediada',
    'emprestimo',
    'gasto_ressarcimento',
    'outro'
  )),

  descricao text not null,
  valor_total numeric(14,2) not null,

  numero_parcelas smallint,
  valor_parcela numeric(14,2),
  parcelas_restantes smallint,

  status text not null default 'ativo' check (status in ('ativo', 'suspenso', 'quitado')),
  data_quitacao date,

  comprovante_url text,
  observacoes text,
  foi_importado_retroativo boolean default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint parcelas_positivas check (numero_parcelas is null or numero_parcelas > 0),
  constraint valor_positivo check (valor_total > 0)
);

-- Fechamento (semanal ou mensal)
create table fechamentos_prestador (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos_prestador(id) on delete cascade,

  data_inicio date not null,
  data_fim date not null,
  frequencia text not null check (frequencia in ('semanal', 'mensal')),

  valor_diarias numeric(14,2) not null default 0,
  valor_horas_adicionais numeric(14,2) not null default 0,
  valor_deslocamentos numeric(14,2) not null default 0,
  valor_kits numeric(14,2) not null default 0,
  valor_emergencias numeric(14,2) not null default 0,
  valor_combustivel numeric(14,2) not null default 0,
  valor_adicionais_outros numeric(14,2) not null default 0,
  total_proventos numeric(14,2) not null default 0,

  valor_adiantamentos_descontados numeric(14,2) not null default 0,
  valor_parcelas_descontadas numeric(14,2) not null default 0,
  total_deducoes numeric(14,2) not null default 0,

  valor_liquido numeric(14,2) not null default 0,

  status text not null default 'rascunho' check (status in (
    'rascunho',
    'enviado_para_gestao',
    'aprovado',
    'devolvido',
    'pago',
    'cancelado'
  )),

  observacoes_gestor text,
  data_pagamento date,
  comprovante_pix text,
  nota_fiscal_url text,
  motivo_devolucao text,

  -- Emissão de NFS-e via Asaas (webhook app/api/webhooks/asaas/nfse) —
  -- nfse_status usa valores em português mapeados do evento Asaas
  -- (emitted→emitida, processed→processada, cancelled→cancelada).
  nfse_id text,
  nfse_status text check (nfse_status in ('emitida', 'processada', 'cancelada')),
  nfse_url text,
  nfse_protocolo text,

  -- Envio de PIX via Asaas (webhook app/api/webhooks/asaas/pix) —
  -- pix_status mapeado do evento Asaas (PENDING→enviado,
  -- TRANSFERRED→confirmado, FAILED→devolvido, EXPIRED→expirado).
  pix_id text,
  pix_status text check (pix_status in ('enviado', 'confirmado', 'devolvido', 'expirado')),
  pix_enviado_em timestamptz,
  pix_confirmado_em timestamptz,
  pix_motivo_devolucao text,

  foi_importado_retroativo boolean default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint data_fim_maior_inicio check (data_fim >= data_inicio),
  constraint liquido_coerente check (valor_liquido = total_proventos - total_deducoes)
);

-- Detalhamento de cada fechamento (item a item)
create table fechamento_itens_prestador (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references fechamentos_prestador(id) on delete cascade,

  data date not null,
  tipo_item text not null,
  descricao text,
  quantidade numeric(6,2),
  valor_unitario numeric(10,2),
  valor_total numeric(14,2) not null,

  residencial_id uuid references residenciais(id),
  observacoes text,
  criado_em timestamptz not null default now()
);

-- Solicitações de prestador eventual (orçamento → agendamento → execução)
create table solicitacoes_prestador_eventual (
  id uuid primary key default gen_random_uuid(),
  residencial_id uuid not null references residenciais(id) on delete cascade,

  tipo_servico text not null,
  descricao_detalhada text not null,

  valor_orcado numeric(14,2),
  observacoes_orcamento text,

  data_agendada date,
  hora_agendada time,
  observacoes_agendamento text,

  data_execucao date,
  hora_inicio time,
  hora_saida time,

  descricao_execucao text,
  valor_final numeric(14,2),

  nota_fiscal_url text,
  recibo_url text,
  fotos_url text,

  feedback_gestor text,
  aprovado_para_pagamento boolean default false,

  status text not null default 'orcamento' check (status in (
    'orcamento',
    'agendado',
    'em_execucao',
    'concluido',
    'pago',
    'cancelado'
  )),

  foi_importado_retroativo boolean default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint data_exec_maior_agenda check (data_execucao is null or data_agendada is null or data_execucao >= data_agendada)
);

-- Pagamento de prestador eventual
create table pagamentos_prestador_eventual (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null unique references solicitacoes_prestador_eventual(id) on delete cascade,

  cpf_cnpj_prestador text not null,
  nome_prestador text not null,
  chave_pix_prestador text not null,

  valor_pago numeric(14,2) not null,
  data_pagamento date not null,
  comprovante_pix text,

  criado_em timestamptz not null default now()
);

-- ============================================================================
-- RLS: PRESTADORES DE SERVIÇO
-- ============================================================================

alter table prestadores_servico enable row level security;
alter table contratos_prestador enable row level security;
alter table regras_prestador enable row level security;
alter table alocacao_prestador_residencial enable row level security;
alter table apontamentos_prestador enable row level security;
alter table apontamentos_residencial_detalhe enable row level security;
alter table adiantamentos_prestador enable row level security;
alter table fechamentos_prestador enable row level security;
alter table fechamento_itens_prestador enable row level security;
alter table solicitacoes_prestador_eventual enable row level security;
alter table pagamentos_prestador_eventual enable row level security;

-- Admin vê tudo
create policy admin_full_access_prestadores on prestadores_servico
  for all using (fn_eh_admin_ou_economista());

create policy admin_full_access_contratos_prestador on contratos_prestador
  for all using (fn_eh_admin_ou_economista());

-- Prestador vê apenas seus dados (via pessoa_id)
create policy prestador_ve_proprios_apontamentos on apontamentos_prestador
  for select using (
    exists (
      select 1 from prestadores_servico ps
      join personas p on ps.pessoa_id = p.id
      join auth.users u on p.email = u.email
      where ps.id = (select prestador_id from contratos_prestador where id = apontamentos_prestador.contrato_id)
        and u.id = auth.uid()
    )
  );

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_apontamentos_prestador_contrato_data on apontamentos_prestador(contrato_id, data);
create index idx_apontamentos_prestador_nao_enviados on apontamentos_prestador(contrato_id) where not enviado_para_fechamento;
create index idx_adiantamentos_prestador_ativo on adiantamentos_prestador(contrato_id) where status = 'ativo';
create index idx_fechamentos_prestador_status on fechamentos_prestador(contrato_id, status);
create index idx_fechamentos_prestador_data on fechamentos_prestador(data_inicio, data_fim);
create index idx_solicitacoes_eventual_status on solicitacoes_prestador_eventual(status, residencial_id);
create index idx_alocacao_prestador_ativo on alocacao_prestador_residencial(prestador_id) where ativo = true;

-- ============================================================================
-- 20. INTEGRAÇÃO PRESTADORES ↔ ORDENS DE SERVIÇO (TASK #51)
-- ============================================================================
-- Permite associar apontamentos de prestadores com ordens de serviço específicas,
-- viabilizando cobrança automática de custos de mão de obra.

alter table apontamentos_prestador add column ordem_servico_id uuid references ordens_servico(id) on delete set null;
create index idx_apontamentos_ordem_servico on apontamentos_prestador(ordem_servico_id) where ordem_servico_id is not null;

-- Rateio de custos: quando um apontamento não está vinculado a uma OS específica,
-- os custos são rateados entre os residenciais visitados (via apontamentos_residencial_detalhe).
-- Quando vinculado a uma OS, o custo integral fica alocado à OS.

-- Tabela de custo de apontamento (derivada dos apontamentos vinculados a uma OS)
create table apontamento_custos (
  id uuid primary key default gen_random_uuid(),
  apontamento_id uuid not null references apontamentos_prestador(id) on delete cascade,
  ordem_servico_id uuid not null references ordens_servico(id) on delete cascade,

  -- Valores calculados a partir do apontamento
  horas_trabalhadas numeric(5,2) not null,
  valor_hora_prestador numeric(10,2) not null,
  valor_total numeric(14,2) not null,

  -- Deslocamento (se houver)
  valor_deslocamento numeric(10,2) not null default 0,

  descricao text,
  criado_em timestamptz not null default now(),

  constraint check_valores_nao_negativos check (horas_trabalhadas >= 0 and valor_hora_prestador >= 0 and valor_deslocamento >= 0)
);

create index idx_apontamento_custos_ordem_servico on apontamento_custos(ordem_servico_id);
create index idx_apontamento_custos_apontamento on apontamento_custos(apontamento_id);

-- RLS: apontamento_custos
alter table apontamento_custos enable row level security;
create policy admin_full_access_apontamento_custos on apontamento_custos
  for all using (fn_eh_admin_ou_economista());

create policy prestador_ve_custos_seus_apontamentos on apontamento_custos
  for select using (
    exists (
      select 1 from apontamentos_prestador ap
      join contratos_prestador cp on ap.contrato_id = cp.id
      join prestadores_servico ps on cp.prestador_id = ps.id
      join usuarios u on ps.pessoa_id = u.pessoa_id
      where ap.id = apontamento_custos.apontamento_id and u.id = auth.uid()
    )
  );

-- Trigger para auditoria de custos de apontamento
create trigger trg_audit_apontamento_custos
  after insert or update or delete on apontamento_custos
  for each row execute function fn_audit_trigger();

-- ============================================================================
-- 37. DOCUMENTOS ANEXADOS PELO GESTOR (upload de contrato assinado, aditivo,
--     e-mail de negociação/renovação) — leitura e análise assistida por IA
-- ============================================================================
-- Distinta de `documentos_gerados` (seção 8): aquela é a SAÍDA do sistema —
-- contrato/aditivo/termo gerado pelo motor de contratos (server/integracao/
-- gerarContratoHtml.ts) e, quando aplicável, assinado digitalmente. Esta é a
-- ENTRADA: um arquivo que o gestor recebeu de fora (contrato já assinado
-- fisicamente, aditivo em PDF, print/PDF de e-mail de negociação de
-- renovação) e sobe para o sistema ler, converter em Markdown e analisar
-- via IA — sempre com validação humana antes de qualquer valor ser gravado
-- em `contratos`/`reajustes_contrato` (ver seção 38, `extracoes_documento_ia`).
create table documentos_anexados (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid references contratos(id),
  tipo text not null check (tipo in
    ('contrato_assinado','aditivo','comunicacao_renovacao','comunicacao_negociacao','outro')),
  nome_arquivo text not null,
  mime_type text not null,
  tamanho_bytes bigint not null check (tamanho_bytes > 0),
  hash_sha256 text not null unique,   -- também evita reprocessar o mesmo arquivo duas vezes
  storage_path text not null,
  -- Resultado da conversão (server/documentos/converterParaMarkdown.ts) —
  -- é o que a IA de fato lê; nunca o binário original.
  texto_extraido_md text,
  status_extracao text not null default 'pendente'
    check (status_extracao in ('pendente','processando','concluida','falhou')),
  erro_extracao text,
  enviado_por uuid references pessoas(id),
  criado_em timestamptz not null default now()
);

create index idx_documentos_anexados_contrato on documentos_anexados(contrato_id);

alter table documentos_anexados enable row level security;
create policy admin_full_access_documentos_anexados on documentos_anexados
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create trigger trg_audit_documentos_anexados after insert or update or delete on documentos_anexados
  for each row execute function fn_audit_trigger();

-- Bucket privado de Storage para o binário do arquivo (a linha em
-- `documentos_anexados` acima guarda só metadado + `storage_path`).
-- Privado porque pode conter dado pessoal (CPF, nome, assinatura) — acesso
-- só via URL assinada de expiração curta (lib/supabase/storage.ts), nunca
-- URL pública. O upload real (lib/supabase/serviceClient.ts) usa a
-- service_role key e por isso ignora as políticas abaixo — elas existem
-- como defesa em profundidade, para o dia em que uma tela do portal
-- (sessão de usuário real, não service role) também precisar deste bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false,
  26214400, -- 25MB, mesmo limite validado em server/documentos/logicaUpload.ts
  array['application/pdf','image/jpeg','image/png','image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create policy admin_upload_documentos on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and fn_eh_admin_ou_economista());
create policy admin_leitura_documentos on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and fn_eh_admin_ou_economista());

-- ============================================================================
-- 38. EXTRAÇÕES DE DOCUMENTO POR IA (proposta sujeita a validação humana)
-- ============================================================================
-- Resultado da leitura por IA (server/ai-gateway/providers/claudeProvider.ts
-- + server/documentos/extrairDadosContrato.ts) do texto Markdown de um
-- `documentos_anexados`. Tabela DISTINTA de `documentos_anexados` porque o
-- mesmo documento pode ser reprocessado (nova tentativa após falha, ou nova
-- versão do prompt) sem perder o histórico de propostas anteriores — e
-- porque `dados_extraidos` é sempre uma PROPOSTA: nada aqui é gravado em
-- `contratos`/`garantias`/`contrato_componentes_mensais` automaticamente.
-- Só a ação de revisão do operador (status -> 'aprovada', com
-- `campos_aplicados` registrando o que de fato foi copiado para o contrato)
-- move dado desta tabela para o cadastro real.
create table extracoes_documento_ia (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos_anexados(id) on delete cascade,
  contrato_id uuid references contratos(id),
  modelo_ia text not null,             -- ex.: 'claude-sonnet-5' — auditoria de qual modelo gerou a proposta
  dados_extraidos jsonb,                -- null quando status = 'falhou'
  erro_ia text,
  status text not null default 'pendente_revisao'
    check (status in ('pendente_revisao','aprovada','rejeitada','falhou')),
  campos_aplicados jsonb,               -- preenchido só quando aprovada: quais campos foram de fato copiados para o contrato
  revisado_por uuid references pessoas(id),
  revisado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index idx_extracoes_documento_ia_documento on extracoes_documento_ia(documento_id);
create index idx_extracoes_documento_ia_contrato on extracoes_documento_ia(contrato_id);

alter table extracoes_documento_ia enable row level security;
create policy admin_full_access_extracoes_documento_ia on extracoes_documento_ia
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
create trigger trg_audit_extracoes_documento_ia after insert or update or delete on extracoes_documento_ia
  for each row execute function fn_audit_trigger();
