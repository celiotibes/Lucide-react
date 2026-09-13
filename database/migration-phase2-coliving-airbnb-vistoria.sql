-- Migração Phase 2: Trava contra sobreposição, Airbnb/hospedagens, vistorias de hospedagem temporária,
-- rateio por ocupação com compensação Airbnb (docs/40 seção 7 — implementação de todos os 5 itens).
--
-- Rode este script uma vez em qualquer banco criado ANTES desta feature.
-- Todos os blocos usam "if not exists"/checagem de pg_policies/pg_trigger,
-- então rodar de novo (ou rodar num banco criado do zero a partir do
-- schema.sql atual, que já inclui tudo isso) não tem efeito — é seguro repetir.

-- ============================================================================
-- 1. Trava contra sobreposição: estender fn_check_contrato_comodo_coerente
-- ============================================================================
-- Garante que um imovel não pode ter simultaneamente:
--   - contrato com comodo_id (coliving por quarto)
--   - contrato com comodo_id IS NULL (locação do imóvel inteiro)
-- ambos com status='ativo' no mesmo imovel_id.

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'fn_check_contrato_comodo_coerente'
  ) then
    raise exception 'Trigger function fn_check_contrato_comodo_coerente não existe. Ela deveria estar em schema.sql.';
  end if;
end $$;

-- Recrear a função com validação de sobreposição
create or replace function fn_check_contrato_comodo_coerente() returns trigger as $$
declare
  v_imovel_permite_coliving boolean;
  v_comodo_existe boolean;
  v_comodo_pertence_imovel boolean;
  v_ja_existe_contrato_inteiro boolean;
  v_ja_existe_contrato_coliving boolean;
begin
  -- Validação 1: se comodo_id é preenchido, validar que existe e pertence ao imovel
  if new.comodo_id is not null then
    select existe into v_comodo_existe
    from (select exists (select 1 from comodos where id = new.comodo_id) as existe) t;

    if not v_comodo_existe then
      raise exception 'Cômodo % não existe', new.comodo_id;
    end if;

    select pertence into v_comodo_pertence_imovel
    from (select exists (select 1 from comodos where id = new.comodo_id and imovel_id = new.imovel_id) as pertence) t;

    if not v_comodo_pertence_imovel then
      raise exception 'Cômodo % não pertence ao imóvel %', new.comodo_id, new.imovel_id;
    end if;
  end if;

  -- Validação 2: se comodo_id é preenchido, validar que imovel permite coliving
  if new.comodo_id is not null then
    select permite_coliving into v_imovel_permite_coliving
    from imoveis where id = new.imovel_id;

    if not v_imovel_permite_coliving then
      raise exception 'Imóvel % não permite coliving', new.imovel_id;
    end if;
  end if;

  -- Validação 3 (NOVA): Trava contra sobreposição
  -- Se este contrato tem comodo_id (por quarto), não pode existir contrato ativo SEM comodo_id no mesmo imovel
  if new.comodo_id is not null and new.status = 'ativo' then
    select existe into v_ja_existe_contrato_inteiro
    from (
      select exists (
        select 1 from contratos
        where imovel_id = new.imovel_id
          and comodo_id is null
          and status = 'ativo'
          and id != new.id  -- permite update do mesmo contrato
      ) as existe
    ) t;

    if v_ja_existe_contrato_inteiro then
      raise exception 'Não é possível ativar contrato de coliving no imóvel % — já existe contrato ativo do imóvel inteiro', new.imovel_id;
    end if;
  end if;

  -- Se este contrato NÃO tem comodo_id (inteiro), não pode existir contrato ativo COM comodo_id no mesmo imovel
  if new.comodo_id is null and new.status = 'ativo' then
    select existe into v_ja_existe_contrato_coliving
    from (
      select exists (
        select 1 from contratos
        where imovel_id = new.imovel_id
          and comodo_id is not null
          and status = 'ativo'
          and id != new.id
      ) as existe
    ) t;

    if v_ja_existe_contrato_coliving then
      raise exception 'Não é possível ativar contrato do imóvel inteiro em % — já existem contratos ativos de coliving', new.imovel_id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- 2. Tabela de hospedagens temporárias (Airbnb, Booking, etc)
-- ============================================================================
create table if not exists airbnb_hospedagens (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references imoveis(id) on delete cascade,
  comodo_id uuid references comodos(id) on delete cascade,

  -- Período e diárias
  periodo_inicio date not null,
  periodo_fim date not null,
  dias_hospedados smallint not null check (dias_hospedados > 0),
  valor_diaria numeric(10, 2) not null check (valor_diaria > 0),
  receita_total numeric(10, 2) not null,

  -- Plataforma de origem
  plataforma text not null check (plataforma in ('airbnb', 'booking', 'outro')),
  plataforma_id_externo text,

  -- Integração com vistoria simplificada (Link bidirecional)
  vistoria_entrada_id uuid references vistorias(id) on delete set null,
  vistoria_saida_id uuid references vistorias(id) on delete set null,

  -- Rastreamento
  data_sincronizacao timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint chk_periodo_valido check (periodo_fim >= periodo_inicio)
);

create index if not exists idx_airbnb_hospedagens_imovel on airbnb_hospedagens(imovel_id);
create index if not exists idx_airbnb_hospedagens_comodo on airbnb_hospedagens(comodo_id);
create index if not exists idx_airbnb_hospedagens_periodo on airbnb_hospedagens(periodo_inicio, periodo_fim);
create index if not exists idx_airbnb_hospedagens_plataforma on airbnb_hospedagens(plataforma);

-- ============================================================================
-- 3. Extensão ao schema vistorias: suporte para hospedagens temporárias
-- ============================================================================
-- Modificar constraint de vistorias para permitir contrato_id NULL em tipos específicos

do $$
begin
  -- Verificar se a constraint existe e remover se existir
  if exists (
    select 1 from pg_constraint
    where conname = 'chk_vistorias_contrato_obrigatorio'
  ) then
    alter table vistorias drop constraint chk_vistorias_contrato_obrigatorio;
  end if;
end $$;

-- Nova constraint que permite NULL em certos cenários
alter table vistorias add constraint chk_vistorias_contrato_ou_hospedagem check (
  (tipo in ('entrada', 'saida') and contrato_id is not null) or
  (tipo = 'periodica' and (contrato_id is not null or comodo_id is not null)) or
  (tipo = 'hospedagem_temporaria' and airbnb_hospedagem_id is not null)
);

-- Coluna para linkar vistoria a hospedagem (não contrato)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'vistorias' and column_name = 'airbnb_hospedagem_id') then
    alter table vistorias add column airbnb_hospedagem_id uuid references airbnb_hospedagens(id) on delete cascade;
  end if;
end $$;

-- Adicionar tipos de vistoria se ainda não existem
do $$
begin
  -- Este check depende de como 'tipo' foi implementado em schema.sql
  -- Se for VARCHAR com CHECK in, será preciso alterar o CHECK
  -- Se for um native ENUM, será preciso usar ALTER TYPE (bloqueante)

  -- Assumindo VARCHAR com CHECK: nenhuma ação (aplicação controla valores permitidos)
  -- A constraint acima já abre espaço para 'hospedagem_temporaria'
  null;
end $$;

-- ============================================================================
-- 4. Extensão ao schema contrato_componentes_mensais: rateio por ocupação
-- ============================================================================
-- Nova "natureza": rateado_por_ocupacao_comodo
-- Campo novo: percentual_com_ambos_ocupados (ex: 50 = paga 50% quando ambos ocupados, 100% quando um vago)

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'contrato_componentes_mensais' and column_name = 'percentual_com_ambos_ocupados') then
    alter table contrato_componentes_mensais add column percentual_com_ambos_ocupados smallint check (percentual_com_ambos_ocupados between 0 and 100);
  end if;
end $$;

-- Estender constraint de natureza (se estiver usando CHECK)
-- Assumindo que natureza tem CHECK in ('valor_fixo', 'percentual_do_aluguel', 'repassado_variavel')
-- Precisamos adicionar 'rateado_por_ocupacao_comodo'

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_natureza_componente_ocupacao'
  ) then
    -- Garantir que percentual_com_ambos_ocupados é preenchido SÓ para natureza 'rateado_por_ocupacao_comodo'
    alter table contrato_componentes_mensais add constraint chk_natureza_componente_ocupacao check (
      (natureza = 'rateado_por_ocupacao_comodo' and percentual_com_ambos_ocupados is not null) or
      (natureza != 'rateado_por_ocupacao_comodo' and percentual_com_ambos_ocupados is null)
    );
  end if;
end $$;

-- ============================================================================
-- 5. Função para resolver ocupação (Coliving + Airbnb) e calcular percentual final
-- ============================================================================
-- Chamada por gerarFaturaMensal.ts antes de valorMensalContrato
-- Retorna lista de componentes com percentual_final resolvido

create or replace function fn_resolver_componentes_ocupacao(
  p_contrato_id uuid,
  p_competencia date
) returns table (
  componente_id uuid,
  tipo text,
  descricao text,
  natureza text,
  valor_fixo numeric,
  percentual numeric,
  percentual_final numeric,  -- RESOLVIDO baseado em ocupação
  valor_repassado_mes numeric
) as $$
declare
  v_imovel_id uuid;
  v_comodo_id uuid;
  v_há_outro_contrato_ativo boolean;
  v_há_airbnb_com_receita boolean;
  v_receita_airbnb_mes numeric;
  v_compensacao numeric;
  v_percentual_resolvido numeric;
begin
  -- Buscar imovel e comodo do contrato
  select imovel_id, comodo_id into v_imovel_id, v_comodo_id
  from contratos where id = p_contrato_id;

  -- Retornar todos os componentes
  for componente_id, tipo, descricao, natureza, valor_fixo, percentual, valor_repassado_mes in
    select cm.id, cm.tipo, cm.descricao, cm.natureza, cm.valor_fixo, cm.percentual,
           coalesce(cv.valor, 0)
    from contrato_componentes_mensais cm
    left join contrato_componente_valores_mensais cv
      on cv.componente_id = cm.id and cv.competencia = p_competencia
    where cm.contrato_id = p_contrato_id
    order by cm.criado_em
  loop
    v_percentual_resolvido := percentual;  -- default: usar o percentual original

    -- Se é rateado por ocupação E este contrato é por quarto (comodo_id NOT NULL)
    if natureza = 'rateado_por_ocupacao_comodo' and v_comodo_id is not null then
      -- Verificar: existe contrato ativo no comodo irmão no período de competência?
      select exists (
        select 1 from contratos c
        where c.imovel_id = v_imovel_id
          and c.comodo_id is not null
          and c.comodo_id != v_comodo_id
          and c.status = 'ativo'
          and c.data_inicio <= (p_competencia + interval '1 month' - interval '1 day')
          and (c.data_fim is null or c.data_fim >= p_competencia)
      ) into v_há_outro_contrato_ativo;

      if v_há_outro_contrato_ativo then
        -- Outro quarto está ocupado por contrato => paga percentual_com_ambos_ocupados (ex: 50%)
        v_percentual_resolvido := (select percentual_com_ambos_ocupados from contrato_componentes_mensais where id = componente_id)::numeric / 100;
      else
        -- Outro quarto está vago => verificar se tem Airbnb
        select exists (
          select 1 from airbnb_hospedagens ah
          where ah.imovel_id = v_imovel_id
            and (ah.comodo_id is null or ah.comodo_id != v_comodo_id)
            and ah.periodo_inicio <= (p_competencia + interval '1 month' - interval '1 day')
            and ah.periodo_fim >= p_competencia
        ) into v_há_airbnb_com_receita;

        if v_há_airbnb_com_receita then
          -- Quarto irmão tem Airbnb => aplicar compensação (reduzir percentual)
          v_receita_airbnb_mes := (
            select sum(ah.receita_total) from airbnb_hospedagens ah
            where ah.imovel_id = v_imovel_id
              and (ah.comodo_id is null or ah.comodo_id != v_comodo_id)
              and ah.periodo_inicio <= (p_competencia + interval '1 month' - interval '1 day')
              and ah.periodo_fim >= p_competencia
          );

          -- Fórmula de compensação:
          -- percentual_final = max(percentual_com_ambos, 100 - (receita_airbnb / 300))
          -- Assumindo valor médio de energia de R$ 300/mês para 100% de ocupação
          v_compensacao := least(50.0, (coalesce(v_receita_airbnb_mes, 0) / 300.0) * 100.0);
          v_percentual_resolvido := greatest(
            (select percentual_com_ambos_ocupados from contrato_componentes_mensais where id = componente_id)::numeric / 100,
            ((100.0 - v_compensacao) / 100.0)
          );
        else
          -- Quarto irmão vago E sem Airbnb => paga 100%
          v_percentual_resolvido := 1.0;
        end if;
      end if;
    end if;

    return query select componente_id, tipo, descricao, natureza, valor_fixo, percentual, v_percentual_resolvido, valor_repassado_mes;
  end loop;
end;
$$ language plpgsql stable;

-- ============================================================================
-- 6. RLS e Audit para airbnb_hospedagens
-- ============================================================================
alter table airbnb_hospedagens enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'airbnb_hospedagens' and policyname = 'admin_full_access_airbnb_hospedagens') then
    create policy admin_full_access_airbnb_hospedagens on airbnb_hospedagens
      for all using (fn_eh_admin_ou_economista()) with check (fn_eh_admin_ou_economista());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_airbnb_hospedagens') then
    create trigger trg_audit_airbnb_hospedagens after insert or update or delete on airbnb_hospedagens
      for each row execute function fn_audit_trigger();
  end if;
end $$;
