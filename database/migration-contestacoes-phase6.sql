-- Fase 6: Contestação e Reentrada de Reparos conforme Lei 8.245/91
-- Seção 1-B, Artigos 22-24 (direitos e deveres, danos, indenizações)

-- Tabela expandida de contestações com workflow jurídico completo
-- Nota: contestacoes básica já existe; aqui estende com preclusão e reparo
alter table contestacoes add column if not exists preclusao_data_limite timestamp;
alter table contestacoes add column if not exists dias_uteis_restantes integer;
alter table contestacoes add column if not exists status_reparo text default 'pendente'
  check (status_reparo in (
    'pendente', -- Contestação aceita, aguardando reparo
    'orcamento_solicitado',
    'orcamento_recebido',
    'reparo_agendado',
    'reparo_em_execucao',
    'reparo_concluido',
    'conferencia_agendada',
    'conferencia_em_andamento',
    'conferencia_concluida',
    'aceito',
    'rejeitado'
  ));
alter table contestacoes add column if not exists data_aceitacao timestamp;
alter table contestacoes add column if not exists data_rejeicao timestamp;
alter table contestacoes add column if not exists motivo_rejeicao text;
alter table contestacoes add column if not exists notas_auditor text;

-- Tabela de reparos orçados e executados
create table if not exists reparos_vistoria (
  id text primary key,
  contestacao_id text not null references contestacoes(id),
  vistoria_saida_id text references vistorias(id),
  status text not null default 'pendente' check (status in (
    'pendente',
    'orcado',
    'aprovado',
    'rejeitado',
    'agendado',
    'em_execucao',
    'concluido',
    'desistido'
  )),

  -- Orçamento
  orcamento_valor numeric(10,2),
  orcamento_data timestamp,
  orcamento_fornecedor text,
  orcamento_anexo_url text,

  -- Execução
  data_agendamento timestamp,
  data_inicio_execucao timestamp,
  data_conclusao_execucao timestamp,
  descricao_trabalho_realizado text,

  -- Conferência (nova vistoria)
  vistoria_conferencia_id text references vistorias(id),
  data_conferencia timestamp,
  resultado_conferencia text check (resultado_conferencia in (
    'aprovado',
    'parcialmente_aprovado',
    'reprovado',
    'pendente'
  )),
  observacoes_conferencia text,

  criado_em timestamp not null default now(),
  atualizado_em timestamp not null default now()
);

create index idx_reparos_contestacao_id on reparos_vistoria(contestacao_id);
create index idx_reparos_status on reparos_vistoria(status);
create index idx_reparos_vistoria_conferencia on reparos_vistoria(vistoria_conferencia_id);

-- Tabela de fotos de execução de reparo
create table if not exists fotos_reparo (
  id text primary key,
  reparo_id text not null references reparos_vistoria(id) on delete cascade,
  url_foto text not null,
  tipo text check (tipo in ('antes', 'durante', 'depois')),
  data_upload timestamp not null default now(),
  meta_dados jsonb
);

create index idx_fotos_reparo_id on fotos_reparo(reparo_id);

-- Tabela de auditoria de contestação (trilha jurídica completa)
create table if not exists auditoria_contestacao (
  id uuid primary key default gen_random_uuid(),
  contestacao_id text not null references contestacoes(id),
  acao text not null,
  usuario_id text,
  data_acao timestamp not null default now(),
  ip_address inet,
  detalhes text,

  -- Dados anteriores para rollback/auditoria
  dados_antes jsonb,
  dados_depois jsonb
);

create index idx_auditoria_contestacao_id on auditoria_contestacao(contestacao_id);
create index idx_auditoria_contestacao_data on auditoria_contestacao(data_acao);

-- Função para calcular preclusão (5 dias úteis conforme Lei 8.245/91)
create or replace function calcular_preclusao_contestacao()
returns trigger as $$
declare
  v_data_limite timestamp;
  v_dias_uteis integer := 0;
  v_data_atual date;
begin
  if new.data_aceitacao is not null and new.preclusao_data_limite is null then
    -- Começar a contar de 5 dias úteis após aceitação
    v_data_atual := new.data_aceitacao::date;

    -- Contar 5 dias úteis (seg-sex)
    while v_dias_uteis < 5 loop
      v_data_atual := v_data_atual + interval '1 day';
      -- Pular finais de semana (domingo=0, segunda=1, sexta=5)
      if extract(dow from v_data_atual) between 1 and 5 then
        v_dias_uteis := v_dias_uteis + 1;
      end if;
    end loop;

    -- Preclusão às 23:59:59 do quinto dia útil
    new.preclusao_data_limite := v_data_atual || ' 23:59:59'::time;
    new.dias_uteis_restantes := 5;
  end if;

  -- Recalcular dias restantes se contestação ainda pendente
  if new.status = 'pendente' and new.preclusao_data_limite is not null then
    new.dias_uteis_restantes := extract(day from new.preclusao_data_limite - now());
    if new.dias_uteis_restantes < 0 then
      new.status := 'preclusao_expirada';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_calcular_preclusao_contestacao
before insert or update on contestacoes
for each row
execute function calcular_preclusao_contestacao();

-- Tabela de notificações para prazos de contestação
create table if not exists notificacoes_preclusao (
  id uuid primary key default gen_random_uuid(),
  contestacao_id text not null references contestacoes(id),
  tipo text not null check (tipo in (
    'abertura_contestacao',
    'aviso_3_dias',
    'aviso_1_dia',
    'preclusao_expirada'
  )),
  enviado_em timestamp not null default now(),
  enviado_para text,
  canal text check (canal in ('email', 'sms', 'whatsapp', 'in_app')),
  status_entrega text default 'pendente',

  unique(contestacao_id, tipo) -- Uma notificação por tipo por contestação
);

create index idx_notificacoes_preclusao_contestacao on notificacoes_preclusao(contestacao_id);

-- RLS para contestações
alter table contestacoes enable row level security;
alter table reparos_vistoria enable row level security;
alter table fotos_reparo enable row level security;
alter table auditoria_contestacao enable row level security;
alter table notificacoes_preclusao enable row level security;

-- Política: Inquilino pode contestar seus próprios danos
create policy "Inquilino pode contestar danos de sua vistoria"
  on contestacoes
  for insert
  with check (
    vistoria_saida_id in (
      select v.id from vistorias v
      join contratos c on c.id = v.contrato_id
      where c.inquilino_id = auth.uid()
    )
  );

-- Política: Inquilino vê apenas suas contestações
create policy "Inquilino vê suas contestações"
  on contestacoes
  for select
  using (
    vistoria_saida_id in (
      select v.id from vistorias v
      join contratos c on c.id = v.contrato_id
      where c.inquilino_id = auth.uid()
    )
  );

-- Política: Vistoriador/admin vê contestações de suas vistorias
create policy "Vistoriador vê contestações de suas vistorias"
  on contestacoes
  for select
  using (
    vistoria_saida_id in (
      select id from vistorias where vistoriador_id = auth.uid()
    )
  );

-- Política: Admin vê tudo
create policy "Admin vê todas as contestações"
  on contestacoes
  for all
  using (
    (select role from pessoas where id = auth.uid()) = 'admin'
  );

-- Policies para reparos
create policy "Reparos visíveis a envolvidos"
  on reparos_vistoria
  for select
  using (
    contestacao_id in (
      select id from contestacoes
      where vistoria_saida_id in (
        select v.id from vistorias v
        join contratos c on c.id = v.contrato_id
        where c.inquilino_id = auth.uid()
        or v.vistoriador_id = auth.uid()
      )
    )
    or (select role from pessoas where id = auth.uid()) = 'admin'
  );

-- Políticas para auditoria (auditores veem tudo)
create policy "Auditoria visível a auditores"
  on auditoria_contestacao
  for select
  using (
    (select role from pessoas where id = auth.uid()) = 'admin'
  );
