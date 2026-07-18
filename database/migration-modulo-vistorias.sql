-- ============================================================================
-- Módulo de Vistorias — migração incremental
-- ============================================================================
-- Contexto: plano em celiotibes/app-bruxel (docs/plano-desenvolvimento-
-- vistorias.md, v2.2). Estende o schema já existente em vez de recriar —
-- `imoveis`, `pessoas`, `pessoa_papeis`, `contratos`, `contrato_partes`,
-- `garantias` (caução), `ordens_servico`, `magic_links`,
-- `documentos_gerados`, `assinaturas`, `confissoes_divida`, `vistorias` e
-- `vistoria_fotos` continuam sendo a fonte de verdade; este script só
-- adiciona o que falta (ambientes/itens de checklist, contestação,
-- notificação registrada, chaves/medidores, fechamento de contrato e
-- importação de acervo do WhatsApp).
--
-- Idempotente de ponta a ponta: seguro rodar mais de uma vez. Tabelas via
-- `if not exists`; constraints, policies e triggers via `drop ... if
-- exists` seguido de recriação (Postgres não tem "create policy/trigger
-- if not exists").
--
-- ATENÇÃO — colisão de nome evitada: o schema já tem uma tabela
-- `comodos` (seção 27, motor de contratos) que representa cômodos
-- LOCÁVEIS de co-living — um conceito comercial diferente de "ambiente a
-- vistoriar" (cozinha, banheiro etc., que toda kitnet tem, com ou sem
-- co-living). Por isso usamos `ambientes_vistoria`, não `comodos`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Papel "vistoriador" — faltava em usuarios.papel e pessoa_papeis.papel
-- ----------------------------------------------------------------------------
-- `usuarios.papel` governa o bypass de RLS (fn_eh_admin_ou_economista) e a
-- identidade de portal; sem 'vistoriador' aqui, um vistoriador terceirizado
-- não tem como logar como um papel próprio (cairia em 'prestador', que tem
-- semântica financeira distinta — ver server/financeiro/*).
alter table usuarios drop constraint if exists usuarios_papel_check;
alter table usuarios add constraint usuarios_papel_check
  check (papel in ('admin','economista','inquilino','investidor','prestador','vistoriador'));

alter table pessoa_papeis drop constraint if exists pessoa_papeis_papel_check;
alter table pessoa_papeis add constraint pessoa_papeis_papel_check
  check (papel in
    ('locatario','fiador','investidor','prestador_fixo','prestador_eventual',
     'colaborador','fornecedor','vistoriador'));

-- ----------------------------------------------------------------------------
-- 2. Extensão de `vistorias` — ciclo completo (entrada/periódica/saída/
--    conferência), modo (presencial/autovistoria), agenda e comparação
-- ----------------------------------------------------------------------------
alter table vistorias drop constraint if exists vistorias_tipo_check;
alter table vistorias add constraint vistorias_tipo_check
  check (tipo in ('entrada','periodica','saida','conferencia'));

alter table vistorias drop constraint if exists vistorias_status_check;
alter table vistorias add constraint vistorias_status_check
  check (status in
    ('agendada','em_andamento','concluida','aguardando_assinatura',
     'assinada','contestada','encerrada'));

alter table vistorias
  add column if not exists modo text not null default 'presencial'
    check (modo in ('presencial','autovistoria')),
  add column if not exists data_agendada timestamptz,
  -- Vistoria de saída/conferência aponta para a vistoria de entrada que
  -- serve de base à comparação automática (seção 2.5 do plano). Nula para
  -- vistorias de entrada e periódicas.
  add column if not exists vistoria_base_id uuid references vistorias(id),
  add column if not exists prazo_contestacao_dias smallint not null default 10;

create index if not exists idx_vistorias_base on vistorias(vistoria_base_id);
create index if not exists idx_vistorias_tipo_status on vistorias(tipo, status);

-- Nada impede, só com a FK, de uma vistoria de saída apontar para a
-- entrada de OUTRO imóvel — mesmo tipo de checagem cross-row que
-- `fn_check_contrato_comodo_coerente` já resolve para `comodos`/
-- `contratos` (seção 27). Sem isto, o comparador (obterComparativoVistoria)
-- poderia silenciosamente comparar itens de checklist de imóveis
-- diferentes.
create or replace function fn_check_vistoria_base_coerente()
returns trigger as $$
declare
  v_imovel_da_base uuid;
  v_tipo_da_base text;
begin
  if new.vistoria_base_id is null then
    return new;
  end if;

  select imovel_id, tipo into v_imovel_da_base, v_tipo_da_base
  from vistorias where id = new.vistoria_base_id;

  if v_imovel_da_base is distinct from new.imovel_id then
    raise exception 'vistoria_base_id % não pertence ao mesmo imóvel % desta vistoria', new.vistoria_base_id, new.imovel_id;
  end if;

  if v_tipo_da_base is distinct from 'entrada' then
    raise exception 'vistoria_base_id % precisa apontar para uma vistoria do tipo entrada (encontrado: %)', new.vistoria_base_id, v_tipo_da_base;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_vistoria_base_coerente on vistorias;
create trigger trg_check_vistoria_base_coerente
  before insert or update on vistorias
  for each row execute function fn_check_vistoria_base_coerente();

-- ----------------------------------------------------------------------------
-- 3. Ambientes e itens de checklist
-- ----------------------------------------------------------------------------
-- Templates reutilizáveis por tipo de imóvel (padrão VistoHouse) — a
-- estrutura JSONB descreve os ambientes/itens padrão; ao iniciar uma
-- vistoria de entrada, o app materializa `ambientes_vistoria`/
-- `itens_checklist` a partir do template escolhido (ou o gestor edita à
-- mão para imóveis atípicos).
create table if not exists templates_checklist (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo_imovel text not null check (tipo_imovel in
    ('kitnet','apartamento','sala_comercial','casa')),
  estrutura jsonb not null default '[]'::jsonb, -- [{ambiente, itens: [{nome}]}]
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists ambientes_vistoria (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id) on delete cascade,
  nome text not null,                  -- ex: "Cozinha", "Banheiro Social"
  ordem smallint not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists idx_ambientes_vistoria_imovel on ambientes_vistoria(imovel_id);

-- Sem discriminação de `tipo` aqui de propósito: chaves/controles e
-- leituras de medidor são registradas em `chaves_controles`/
-- `leituras_medidor` (tabelas próprias, ligadas a imóvel/vistoria, não a
-- um item de ambiente específico) — um item de checklist é sempre um
-- elemento físico do ambiente (parede, piso, janela...) com um `estado`.
create table if not exists itens_checklist (
  id uuid primary key default gen_random_uuid(),
  ambiente_id uuid not null references ambientes_vistoria(id) on delete cascade,
  nome text not null,                  -- ex: "Parede", "Piso", "Janela"
  ordem smallint not null default 0
);

create index if not exists idx_itens_checklist_ambiente on itens_checklist(ambiente_id);

-- ----------------------------------------------------------------------------
-- 4. Registro por item vistoriado
-- ----------------------------------------------------------------------------
-- `vistoria_fotos` (existente) continua servindo fotos gerais/avulsas da
-- vistoria; o detalhe por item — estado, observação, ditado transcrito e
-- mídia associada — fica aqui. `checklist_json` em `vistorias` permanece
-- por retrocompatibilidade e deixa de ser a fonte de verdade para
-- vistorias criadas a partir desta migração.
create table if not exists itens_vistoria (
  id uuid primary key default gen_random_uuid(),
  vistoria_id uuid not null references vistorias(id) on delete cascade,
  item_checklist_id uuid not null references itens_checklist(id),
  estado text check (estado in ('novo','bom','regular','danificado','inexistente')),
  observacao text,
  transcricao_audio text,
  audio_url text,
  midia jsonb not null default '[]'::jsonb,   -- [{url, tipo: foto|video, largura, altura}]
  latitude numeric(10,7),
  longitude numeric(10,7),
  exif_capturado_em timestamptz,
  hash_sha256 text,                            -- integridade do arquivo principal
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (vistoria_id, item_checklist_id)
);

create index if not exists idx_itens_vistoria_vistoria on itens_vistoria(vistoria_id);

-- ----------------------------------------------------------------------------
-- 5. Trilha jurídica: notificação registrada e contestação por item
-- ----------------------------------------------------------------------------
-- Sem isto, o laudo de saída é produzido unilateralmente e a jurisprudência
-- majoritária (ver docs/plano-desenvolvimento-vistorias.md §2.2 e §7) trata
-- isso como prova frágil para cobrar reparos. Reaproveita `notificacoes_log`
-- como padrão de canal, mas com campos próprios de comprovação de entrega/
-- abertura que o log genérico não tem.
create table if not exists notificacoes_vistoria (
  id uuid primary key default gen_random_uuid(),
  vistoria_id uuid not null references vistorias(id) on delete cascade,
  destinatario_pessoa_id uuid not null references pessoas(id),
  canal text not null check (canal in ('email','whatsapp','sms','push')),
  enviada_em timestamptz not null default now(),
  aberta_em timestamptz,
  comprovante_url text
);

create index if not exists idx_notificacoes_vistoria_vistoria on notificacoes_vistoria(vistoria_id);

create table if not exists contestacoes (
  id uuid primary key default gen_random_uuid(),
  vistoria_id uuid not null references vistorias(id) on delete cascade,
  item_vistoria_id uuid references itens_vistoria(id) on delete cascade,
  contestado_por_pessoa_id uuid not null references pessoas(id),
  texto text not null,
  midia jsonb not null default '[]'::jsonb,
  status text not null default 'aberta'
    check (status in ('aberta','aceita','rejeitada','revistoria_solicitada')),
  prazo_fim timestamptz not null,
  resolvida_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_contestacoes_vistoria on contestacoes(vistoria_id);

-- ----------------------------------------------------------------------------
-- 6. Chaves/controles e leitura de medidores
-- ----------------------------------------------------------------------------
create table if not exists chaves_controles (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id) on delete cascade,
  tipo text not null,                  -- ex: "chave portão", "controle garagem"
  quantidade smallint not null default 1,
  foto_url text,
  status_entrega text not null default 'com_locador'
    check (status_entrega in ('com_locador','entregue','devolvido','extraviado')),
  vistoria_id uuid references vistorias(id),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_chaves_controles_imovel on chaves_controles(imovel_id);

-- Reaproveita o vocabulário de origem já usado em leituras_energia
-- (ocr/manual) para o mesmo tipo de decisão de confiança.
create table if not exists leituras_medidor (
  id uuid primary key default gen_random_uuid(),
  vistoria_id uuid not null references vistorias(id) on delete cascade,
  tipo text not null check (tipo in ('agua','luz','gas')),
  valor numeric(12,2),
  foto_url text,
  origem text not null default 'manual' check (origem in ('ocr','manual')),
  ocr_confianca numeric(5,4),
  criado_em timestamptz not null default now()
);

create index if not exists idx_leituras_medidor_vistoria on leituras_medidor(vistoria_id);

-- ----------------------------------------------------------------------------
-- 7. Fechamento financeiro do contrato (seção 2.7 do plano)
-- ----------------------------------------------------------------------------
-- Snapshot do fechamento, não ledger contínuo — mesmo princípio já adotado
-- para `garantias` (rendimento calculado em runtime, sem tabela de yield
-- diário paralela à fonte oficial do índice). `caucao_valor_atualizado`
-- aqui é o valor congelado no momento do fechamento, calculado por
-- server/financeiro/rendimentoCaucao.ts a partir de garantias + índice do
-- Bacen (fonte 'indice_bacen') ou lançado manualmente a partir do extrato
-- da poupança vinculada (fonte 'extrato_manual').
create table if not exists fechamentos_contrato (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id),
  vistoria_saida_id uuid not null references vistorias(id),
  caucao_garantia_id uuid references garantias(id),
  caucao_valor_atualizado numeric(14,2),
  caucao_fonte text check (caucao_fonte in ('indice_bacen','extrato_manual', null)),
  caucao_indice_periodo text,           -- ex: "2024-01 a 2026-07"
  total_debitos numeric(14,2) not null default 0,
  total_creditos numeric(14,2) not null default 0,
  saldo_final numeric(14,2) not null default 0,  -- positivo = a devolver, negativo = a cobrar
  confissao_divida_id uuid references confissoes_divida(id),
  documento_id uuid references documentos_gerados(id),
  status text not null default 'rascunho'
    check (status in ('rascunho','confirmado','exportado')),
  exportado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (vistoria_saida_id)
);

create table if not exists itens_fechamento (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references fechamentos_contrato(id) on delete cascade,
  tipo text not null check (tipo in ('debito','credito')),
  origem text not null check (origem in
    ('previsto_em_contrato','orcamento','estimativa','encargo_aberto',
     'multa','caucao','adiantamento','saldo_a_favor')),
  -- garante que a origem é compatível com a direção do lançamento (ex.:
  -- caução nunca pode ser lançada como débito) — achado da auditoria.
  constraint itens_fechamento_tipo_origem_check check (
    (tipo = 'debito' and origem in
      ('previsto_em_contrato','orcamento','estimativa','encargo_aberto','multa'))
    or
    (tipo = 'credito' and origem in ('caucao','adiantamento','saldo_a_favor'))
  ),
  descricao text not null,
  valor numeric(14,2) not null check (valor > 0), -- sempre positivo; `tipo` dá o sinal
  item_vistoria_id uuid references itens_vistoria(id),
  ordem_servico_id uuid references ordens_servico(id),
  anexo_url text
);

create index if not exists idx_itens_fechamento_fechamento on itens_fechamento(fechamento_id);

-- ----------------------------------------------------------------------------
-- 8. Importação do acervo legado do WhatsApp (Fase 4 do plano)
-- ----------------------------------------------------------------------------
create table if not exists importacoes_whatsapp (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id),
  arquivo_txt_url text not null,
  status text not null default 'pendente'
    check (status in ('pendente','processando','revisao','concluida','erro')),
  vistoria_gerada_id uuid references vistorias(id),
  criado_em timestamptz not null default now()
);

create table if not exists mensagens_whatsapp (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references importacoes_whatsapp(id) on delete cascade,
  autor text not null,
  enviado_em timestamptz not null,
  texto text,
  midia_url text,
  ordem integer not null
);

create index if not exists idx_mensagens_whatsapp_importacao on mensagens_whatsapp(importacao_id, ordem);

-- ============================================================================
-- 9. RLS — novas tabelas seguem a mesma convenção da seção 16/18 do
--    schema.sql: bypass total para admin/economista via
--    fn_eh_admin_ou_economista(), mais políticas específicas de papel.
--    Todo `create policy` é precedido de `drop policy if exists` para a
--    migração poder ser reaplicada sem erro.
-- ============================================================================

alter table templates_checklist enable row level security;
drop policy if exists admin_escreve_templates_checklist on templates_checklist;
create policy admin_escreve_templates_checklist on templates_checklist
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
drop policy if exists autenticado_le_templates_checklist on templates_checklist;
create policy autenticado_le_templates_checklist on templates_checklist
  for select using (auth.uid() is not null);

alter table ambientes_vistoria enable row level security;
drop policy if exists admin_escreve_ambientes_vistoria on ambientes_vistoria;
create policy admin_escreve_ambientes_vistoria on ambientes_vistoria
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
drop policy if exists autenticado_le_ambientes_vistoria on ambientes_vistoria;
create policy autenticado_le_ambientes_vistoria on ambientes_vistoria
  for select using (auth.uid() is not null);

alter table itens_checklist enable row level security;
drop policy if exists admin_escreve_itens_checklist on itens_checklist;
create policy admin_escreve_itens_checklist on itens_checklist
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
drop policy if exists autenticado_le_itens_checklist on itens_checklist;
create policy autenticado_le_itens_checklist on itens_checklist
  for select using (auth.uid() is not null);

-- ---- vistoriador: gap real encontrado na auditoria — schema.sql só dava
-- escrita em `vistorias`/`vistoria_fotos` para admin/economista; um
-- vistoriador de campo (papel próprio criado nesta migração) não
-- conseguia registrar a própria vistoria. Mesmo tipo de gap do achado #4
-- da auditoria original do schema (prestador sem UPDATE em ordens_servico).
drop policy if exists vistoriador_gerencia_vistoria_designada on vistorias;
create policy vistoriador_gerencia_vistoria_designada on vistorias
  for all using (realizada_por = fn_minha_pessoa_id())
  with check (realizada_por = fn_minha_pessoa_id());

-- Autovistoria: inquilino conclui a própria vistoria periódica guiada.
drop policy if exists inquilino_conclui_propria_autovistoria on vistorias;
create policy inquilino_conclui_propria_autovistoria on vistorias
  for update using (
    modo = 'autovistoria'
    and exists (select 1 from contrato_partes cp where cp.contrato_id = vistorias.contrato_id and cp.pessoa_id = fn_minha_pessoa_id())
  )
  with check (
    modo = 'autovistoria'
    and exists (select 1 from contrato_partes cp where cp.contrato_id = vistorias.contrato_id and cp.pessoa_id = fn_minha_pessoa_id())
  );

drop policy if exists vistoriador_gerencia_fotos_vistoria_designada on vistoria_fotos;
create policy vistoriador_gerencia_fotos_vistoria_designada on vistoria_fotos
  for all using (
    exists (select 1 from vistorias v where v.id = vistoria_fotos.vistoria_id and v.realizada_por = fn_minha_pessoa_id())
  )
  with check (
    exists (select 1 from vistorias v where v.id = vistoria_fotos.vistoria_id and v.realizada_por = fn_minha_pessoa_id())
  );

alter table itens_vistoria enable row level security;
drop policy if exists admin_full_access_itens_vistoria on itens_vistoria;
create policy admin_full_access_itens_vistoria on itens_vistoria
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
drop policy if exists vistoriador_gerencia_itens_vistoria_designada on itens_vistoria;
create policy vistoriador_gerencia_itens_vistoria_designada on itens_vistoria
  for all using (
    exists (select 1 from vistorias v where v.id = itens_vistoria.vistoria_id and v.realizada_por = fn_minha_pessoa_id())
  )
  with check (
    exists (select 1 from vistorias v where v.id = itens_vistoria.vistoria_id and v.realizada_por = fn_minha_pessoa_id())
  );
drop policy if exists inquilino_ve_itens_propria_vistoria on itens_vistoria;
create policy inquilino_ve_itens_propria_vistoria on itens_vistoria
  for select using (
    exists (
      select 1 from vistorias v
      join contrato_partes cp on cp.contrato_id = v.contrato_id
      where v.id = itens_vistoria.vistoria_id and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );
-- autovistoria: inquilino registra/edita o próprio item quando
-- vistorias.modo = 'autovistoria' e a vistoria ainda está em andamento.
drop policy if exists inquilino_registra_autovistoria on itens_vistoria;
create policy inquilino_registra_autovistoria on itens_vistoria
  for insert with check (
    exists (
      select 1 from vistorias v
      join contrato_partes cp on cp.contrato_id = v.contrato_id
      where v.id = itens_vistoria.vistoria_id
        and v.modo = 'autovistoria'
        and v.status = 'em_andamento'
        and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );
drop policy if exists inquilino_atualiza_propria_autovistoria on itens_vistoria;
create policy inquilino_atualiza_propria_autovistoria on itens_vistoria
  for update using (
    exists (
      select 1 from vistorias v
      join contrato_partes cp on cp.contrato_id = v.contrato_id
      where v.id = itens_vistoria.vistoria_id
        and v.modo = 'autovistoria'
        and v.status = 'em_andamento'
        and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );

alter table notificacoes_vistoria enable row level security;
drop policy if exists admin_full_access_notificacoes_vistoria on notificacoes_vistoria;
create policy admin_full_access_notificacoes_vistoria on notificacoes_vistoria
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
drop policy if exists pessoa_ve_propria_notificacao_vistoria on notificacoes_vistoria;
create policy pessoa_ve_propria_notificacao_vistoria on notificacoes_vistoria
  for select using (destinatario_pessoa_id = fn_minha_pessoa_id());

alter table contestacoes enable row level security;
drop policy if exists admin_full_access_contestacoes on contestacoes;
create policy admin_full_access_contestacoes on contestacoes
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
drop policy if exists inquilino_ve_propria_contestacao on contestacoes;
create policy inquilino_ve_propria_contestacao on contestacoes
  for select using (contestado_por_pessoa_id = fn_minha_pessoa_id());
drop policy if exists inquilino_cria_propria_contestacao on contestacoes;
create policy inquilino_cria_propria_contestacao on contestacoes
  for insert with check (
    contestado_por_pessoa_id = fn_minha_pessoa_id()
    and exists (
      select 1 from vistorias v
      join contrato_partes cp on cp.contrato_id = v.contrato_id
      where v.id = contestacoes.vistoria_id and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );

alter table chaves_controles enable row level security;
drop policy if exists admin_full_access_chaves_controles on chaves_controles;
create policy admin_full_access_chaves_controles on chaves_controles
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table leituras_medidor enable row level security;
drop policy if exists admin_full_access_leituras_medidor on leituras_medidor;
create policy admin_full_access_leituras_medidor on leituras_medidor
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
drop policy if exists vistoriador_gerencia_leituras_medidor on leituras_medidor;
create policy vistoriador_gerencia_leituras_medidor on leituras_medidor
  for all using (
    exists (select 1 from vistorias v where v.id = leituras_medidor.vistoria_id and v.realizada_por = fn_minha_pessoa_id())
  )
  with check (
    exists (select 1 from vistorias v where v.id = leituras_medidor.vistoria_id and v.realizada_por = fn_minha_pessoa_id())
  );

alter table fechamentos_contrato enable row level security;
drop policy if exists admin_full_access_fechamentos_contrato on fechamentos_contrato;
create policy admin_full_access_fechamentos_contrato on fechamentos_contrato
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
drop policy if exists inquilino_ve_proprio_fechamento on fechamentos_contrato;
create policy inquilino_ve_proprio_fechamento on fechamentos_contrato
  for select using (
    exists (select 1 from contrato_partes cp where cp.contrato_id = fechamentos_contrato.contrato_id and cp.pessoa_id = fn_minha_pessoa_id())
  );

alter table itens_fechamento enable row level security;
drop policy if exists admin_full_access_itens_fechamento on itens_fechamento;
create policy admin_full_access_itens_fechamento on itens_fechamento
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
drop policy if exists inquilino_ve_itens_proprio_fechamento on itens_fechamento;
create policy inquilino_ve_itens_proprio_fechamento on itens_fechamento
  for select using (
    exists (
      select 1 from fechamentos_contrato fc
      join contrato_partes cp on cp.contrato_id = fc.contrato_id
      where fc.id = itens_fechamento.fechamento_id and cp.pessoa_id = fn_minha_pessoa_id()
    )
  );

alter table importacoes_whatsapp enable row level security;
drop policy if exists admin_full_access_importacoes_whatsapp on importacoes_whatsapp;
create policy admin_full_access_importacoes_whatsapp on importacoes_whatsapp
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

alter table mensagens_whatsapp enable row level security;
drop policy if exists admin_full_access_mensagens_whatsapp on mensagens_whatsapp;
create policy admin_full_access_mensagens_whatsapp on mensagens_whatsapp
  for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());

-- ============================================================================
-- 10. Auditoria imutável — mesmo critério do schema.sql (tabelas
--     financeiras/contratuais/legais sensíveis ganham trigger de audit_log)
-- ============================================================================
drop trigger if exists trg_audit_fechamentos_contrato on fechamentos_contrato;
create trigger trg_audit_fechamentos_contrato
  after insert or update or delete on fechamentos_contrato
  for each row execute function fn_audit_trigger();

drop trigger if exists trg_audit_contestacoes on contestacoes;
create trigger trg_audit_contestacoes
  after insert or update or delete on contestacoes
  for each row execute function fn_audit_trigger();

drop trigger if exists trg_audit_vistorias_itens on itens_vistoria;
create trigger trg_audit_vistorias_itens
  after insert or update or delete on itens_vistoria
  for each row execute function fn_audit_trigger();
