-- ============================================================================
-- Row Level Security — quatro papéis (titular, contador, perito, advogado)
-- Aplica-se por cima de schema.postgres.sql. Rode este arquivo DEPOIS dele.
--
-- Sintaxe de RLS/Supabase conferida via Context7 (/supabase/supabase e
-- /websites/supabase) em 2026-09-20 — fontes citadas em cada bloco. NÃO
-- escrito de memória. O que o Context7 NÃO respondeu está listado no final,
-- na seção "O QUE NÃO FOI CONFIRMADO VIA CONTEXT7".
--
-- Validado sintaticamente com `psql` contra Postgres 16.13 local (mesmo
-- cluster efêmero do schema.postgres.sql). NÃO validado contra um projeto
-- Supabase real: `auth.users`/`auth.uid()`/`auth.jwt()` só existem de fato lá
-- dentro. Para rodar este arquivo localmente por conta própria, os stubs no
-- final do bloco 0 recriam o mínimo de `auth` necessário — REMOVA-OS antes de
-- aplicar num projeto Supabase de verdade (ele já tem o schema `auth` real).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCO 0 — papéis: infraestrutura que NÃO EXISTE em schema.sql/schema.postgres.sql
-- ----------------------------------------------------------------------------
-- schema.sql (SQLite, 51 tabelas) não tem tabela de usuário/papel nenhuma —
-- é um sistema de um titular só, sem login. A tabela `usuarios` que existe em
-- src/db/migrations-phase2-auth.sql é de outro subsistema (portal do
-- prestador: papéis 'admin'/'gestor'/'prestador', nada a ver com
-- titular/contador/perito/advogado) e não faz parte do schema.sql de 51
-- tabelas. Esta tabela de papéis é, portanto, NOVA — criada aqui, não uma
-- tradução de algo que já existia.
--
-- DECISÃO DE DESENHO: um único papel do Postgres (`authenticated`, o padrão
-- do Supabase para qualquer usuário logado) para todo mundo, com o papel de
-- NEGÓCIO (titular/contador/perito/advogado) guardado numa tabela de
-- aplicação e lido por uma função SECURITY DEFINER. É a via documentada pelo
-- guia de RBAC do Supabase (custom-claims-and-role-based-access-control-rbac)
-- para "papéis que não são os papéis nativos do Postgres". A ALTERNATIVA que
-- o Supabase também documenta — um Custom Access Token Hook que escreve o
-- papel como `claims['role']` no JWT, usando then `to contador`/`to perito`
-- etc. como papéis NATIVOS do Postgres — foi CONSIDERADA e DESCARTADA aqui
-- porque exige configurar o Hook pelo Dashboard/Auth config do projeto (fora
-- do alcance de um arquivo .sql) e recriar os papéis Postgres correspondentes
-- com GRANT; a tabela abaixo funciona com só SQL, portável entre projetos.
create type public.app_papel as enum ('titular', 'contador', 'perito', 'advogado');

create table if not exists public.usuarios_papeis (
    usuario_id  uuid primary key references auth.users(id) on delete cascade,
    papel       public.app_papel not null,
    ativo       boolean not null default true,
    nome        text,               -- nome de exibição (contador/perito/advogado contratado), não é dado sensível
    criado_em   timestamptz not null default now(),
    -- Um titular só é o desenho pretendido (um imóvel-locador de fato só, ver
    -- schema.sql); mais de um usuário com papel 'titular' é permitido pela
    -- constraint (não há UNIQUE em papel), mas o app deveria impedir isso na
    -- camada de aplicação se quiser garantir exclusividade — RLS não modela
    -- "no máximo 1 titular" (não é uma regra de linha, é uma regra sobre o
    -- conjunto de linhas; ver observação equivalente na seção final).
    unique (usuario_id, papel)
);

alter table public.usuarios_papeis enable row level security;
alter table public.usuarios_papeis force row level security;

-- Função central: qual é o papel do usuário autenticado agora. SECURITY
-- DEFINER + search_path fixo (recomendação do próprio guia de RBAC do
-- Supabase, para a função não poder ser sequestrada por um schema/tabela de
-- mesmo nome criado por quem não é dono) — permite ler usuarios_papeis
-- mesmo que a policy de usuarios_papeis não deixaria o usuário comum ler a
-- linha de outro usuário. `stable` (não `volatile`): dentro de uma mesma
-- consulta o Postgres pode reaproveitar o resultado em vez de rechamar por
-- linha, e é o padrão que o próprio guia usa (fonte: Context7,
-- custom-claims-and-role-based-access-control-rbac.mdx).
create or replace function public.meu_papel()
returns public.app_papel
language sql
stable
security definer
set search_path = ''
as $$
    select papel
    from public.usuarios_papeis
    where usuario_id = auth.uid() and ativo
    limit 1
$$;

create or replace function public.eh_titular()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((select public.meu_papel()) = 'titular', false)
$$;

-- Ids das contas do plano do razão (contas_plano_contas) que representam
-- despesa pessoal / renda pessoal fora da atividade — tradução das mesmas
-- duas linhas do plano do app (ver src/domain/planoDeContas.ts: códigos
-- "2.2.01" e "1.9.01", grupo "pessoal" nos dois casos) para o lado do razão
-- contábil, via src/domain/erp/mapeamentoPlanoApp.ts (2.2.01 → id 6501,
-- código ERP "6.5.01"; 1.9.01 → id 4401, código ERP "4.4.01" — ver
-- src/domain/erp/planoDeContasErp.ts). Centralizada numa função para não
-- repetir a lista em cada policy e para não depender de um id fixo (contas
-- diferentes por entidade_id têm ids diferentes na prática, embora o app hoje
-- assuma uma entidade só — ver limitação no fim do arquivo).
create or replace function public.contas_pessoais_erp()
returns setof integer
language sql
stable
security definer
set search_path = ''
as $$
    select id from public.contas_plano_contas where codigo in ('6.5.01', '4.4.01')
$$;

-- Toda tabela nova recebe GRANT de tabela para `authenticated` — RLS
-- restringe LINHA, não substitui o GRANT de OPERAÇÃO exigido pelo Postgres
-- (fonte: Context7, guides/realtime/postgres-changes.mdx — "Grant the
-- privileges roles need" antes de "Turn on security"/criar a policy). Sem
-- isso, mesmo com uma policy liberando a linha, a operação é recusada antes
-- de a policy ser avaliada.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant select on public.usuarios_papeis to authenticated;

-- --- stubs SOMENTE para validar este arquivo fora de um projeto Supabase ---
-- Um projeto Supabase real já tem `auth.users`/`auth.uid()`/`auth.jwt()` e a
-- role `authenticated`. Este bloco existe só para o `psql` local (sem
-- Supabase) aceitar o arquivo inteiro na verificação de sintaxe — APAGUE-O ao
-- aplicar num projeto Supabase de verdade (ele rejeitaria `create schema
-- auth`, que já existe lá, e não deveria rejeitar: o CREATE SCHEMA abaixo é
-- só para cá).
-- ---------------------------------------------------------------------------
-- create schema if not exists auth;
-- create table if not exists auth.users (id uuid primary key default gen_random_uuid());
-- create or replace function auth.uid() returns uuid language sql stable as $$ select current_setting('request.jwt.claim.sub', true)::uuid $$;
-- create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
-- do $$ begin
--   if not exists (select 1 from pg_roles where rolname = 'authenticated') then
--     create role authenticated nologin;
--   end if;
--   if not exists (select 1 from pg_roles where rolname = 'anon') then
--     create role anon nologin;
--   end if;
-- end $$;
-- ---------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- BLOCO 1 — TITULAR: acesso total a tudo (as 51 tabelas de schema.postgres.sql
-- + usuarios_papeis). Usa um laço sobre information_schema em vez de 51
-- blocos manuais — é SQL de verdade executado uma vez na migração (gera e
-- roda os CREATE POLICY), não pseudocódigo: confira o resultado com a query
-- de verificação ao final do bloco.
-- ----------------------------------------------------------------------------
do $$
declare
    tabela text;
begin
    for tabela in
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
    loop
        execute format('alter table public.%I enable row level security', tabela);
        execute format('alter table public.%I force row level security', tabela);
        execute format(
            'create policy titular_tudo on public.%I for all to authenticated using (public.eh_titular()) with check (public.eh_titular())',
            tabela
        );
    end loop;
end $$;

-- Verificação (não faz parte da migração, só confirma o laço acima):
--   select count(*) from pg_policies where policyname = 'titular_tudo';
--   -- esperado: 52 (as 51 de schema.postgres.sql + usuarios_papeis)


-- ----------------------------------------------------------------------------
-- BLOCO 2 — PERITO: leitura de tudo que é contábil + cofre de evidências +
-- trilha de auditoria. NUNCA escreve — por isso só policies `for select`,
-- nenhuma `for insert/update/delete`: sem uma policy permissiva para essas
-- operações, o Postgres nega por padrão (RLS é "deny by default"; fonte:
-- Context7, "Once Row Level Security is enabled... no data is accessible...
-- until policies are created", learn/auth-deep-dive/auth-row-level-security).
--
-- "Tudo que é contábil" é lido aqui como as 51 tabelas do domínio financeiro/
-- imobiliário/ERP (todas exceto usuarios_papeis, que é meta-dado de acesso,
-- não dado contábil). Ao contrário do contador, o perito NÃO tem a
-- despesa pessoal mascarada — uma perícia patrimonial existe frequentemente
-- para justamente separar gasto pessoal de gasto da atividade, então
-- esconder isso do perito inviabilizaria o próprio trabalho dele.
-- ----------------------------------------------------------------------------
do $$
declare
    tabela text;
begin
    for tabela in
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        and table_name <> 'usuarios_papeis'
    loop
        execute format(
            'create policy perito_select_tudo on public.%I for select to authenticated using (public.meu_papel() = ''perito'')',
            tabela
        );
    end loop;
end $$;

-- O perito também precisa saber seu PRÓPRIO papel (a UI faz isso pra
-- qualquer papel logado) — sem policy de select em usuarios_papeis para além
-- do titular, a própria função meu_papel() ainda funciona (é SECURITY
-- DEFINER, ignora RLS), mas uma consulta direta do app a usuarios_papeis
-- (fora da função) precisaria disso:
create policy qualquer_usuario_le_seu_proprio_papel
    on public.usuarios_papeis for select to authenticated
    using (usuario_id = (select auth.uid()));


-- ----------------------------------------------------------------------------
-- BLOCO 3 — CONTADOR: razão, balancete, plano de contas, períodos,
-- conciliação, contas bancárias (metadado, para dar contexto à conciliação).
-- SEM as transações/lançamentos classificados como despesa pessoal (códigos
-- do app "2.2.01"/"1.9.01" em `transacoes`; ids ERP em `contas_pessoais_erp()`
-- para `ledger_entries`).
--
-- Cada policy abaixo é ADITIVA à ausência de qualquer outra policy de select
-- para o contador nas demais tabelas: como todas as 51 tabelas já têm RLS
-- forçado (bloco 1) e nenhuma policy própria de contador nas tabelas fora
-- desta lista, o contador simplesmente NÃO VÊ NADA fora do que é concedido
-- aqui (imoveis, contratos_locacao, documentos, vistorias etc. ficam
-- fechados pra ele, por omissão, não por uma regra negativa explícita).
-- ----------------------------------------------------------------------------

-- plano de contas e estrutura — sem mascaramento: a DEFINIÇÃO da conta
-- "Despesas pessoais" pode aparecer (é metadado do plano, não um valor
-- lançado); o que fica de fora é o LANÇAMENTO/TRANSAÇÃO real.
create policy contador_select_plano_de_contas
    on public.plano_de_contas for select to authenticated
    using (public.meu_papel() = 'contador');

create policy contador_select_contas_plano_contas
    on public.contas_plano_contas for select to authenticated
    using (public.meu_papel() = 'contador');

create policy contador_select_entidades_legais
    on public.entidades_legais for select to authenticated
    using (public.meu_papel() = 'contador');

create policy contador_select_centros_custo
    on public.centros_custo for select to authenticated
    using (public.meu_papel() = 'contador');

create policy contador_select_regras_contabilizacao
    on public.regras_contabilizacao for select to authenticated
    using (public.meu_papel() = 'contador');

-- períodos
create policy contador_select_periodos_contabeis
    on public.periodos_contabeis for select to authenticated
    using (public.meu_papel() = 'contador');

create policy contador_select_ledger_encerramentos
    on public.ledger_encerramentos for select to authenticated
    using (public.meu_papel() = 'contador');

-- razão e balancete — AQUI está o mascaramento de despesa pessoal.
create policy contador_select_ledger_entries
    on public.ledger_entries for select to authenticated
    using (
        public.meu_papel() = 'contador'
        and conta_id not in (select public.contas_pessoais_erp())
    );

-- ledger_saldos_periodo é o BALANCETE agregado por conta/período. NÃO é
-- filtrado por conta_id aqui — ver "O QUE A RLS NÃO COBRE" ao final: filtrar
-- o saldo agregado da conta de despesa pessoal quebraria o balancete
-- (débito ≠ crédito apareceria sem explicação), e isso não é uma decisão que
-- SQL possa tomar sozinho.
create policy contador_select_ledger_saldos_periodo
    on public.ledger_saldos_periodo for select to authenticated
    using (public.meu_papel() = 'contador');

-- conciliação bancária
create policy contador_select_contas_bancarias
    on public.contas_bancarias for select to authenticated
    using (public.meu_papel() = 'contador');

create policy contador_select_extrato_saldos_informados
    on public.extrato_saldos_informados for select to authenticated
    using (public.meu_papel() = 'contador');

create policy contador_select_conciliacoes_bancarias
    on public.conciliacoes_bancarias for select to authenticated
    using (public.meu_papel() = 'contador');

create policy contador_select_conciliacoes_itens
    on public.conciliacoes_itens for select to authenticated
    using (public.meu_papel() = 'contador');

-- transações do app (`transacoes`) — mascaramento pelo código do app.
-- Transação SEM plano_conta_codigo (ainda não classificada) É MOSTRADA — ver
-- limitação equivalente ao final: uma transação pessoal ainda não
-- classificada não está coberta por este filtro.
create policy contador_select_transacoes
    on public.transacoes for select to authenticated
    using (
        public.meu_papel() = 'contador'
        and (plano_conta_codigo is null or plano_conta_codigo not in ('2.2.01', '1.9.01'))
    );

create policy qualquer_usuario_le_seu_proprio_papel_contador
    on public.usuarios_papeis for select to authenticated
    using (usuario_id = (select auth.uid()) and public.meu_papel() = 'contador');


-- ----------------------------------------------------------------------------
-- BLOCO 4 — ADVOGADO: processos, laudos e documentos. NÃO vê movimentação
-- bancária completa.
--
-- ACHADO IMPORTANTE: schema.sql (as 51 tabelas no escopo desta tarefa) NÃO
-- TEM tabela de "processos" (`processos_legais`/`despesas_legais` só existem
-- em src/domain/erp/__migrations__/20250116_create_apontamento_ledger_
-- integration.sql e primos, migrações do ERP fora do schema.sql principal e
-- fora do escopo de conversão pedido). Não há como escrever uma policy real
-- para "processos" porque a tabela não existe neste schema — se/quando essas
-- tabelas forem trazidas para o schema principal, precisam de policy própria
-- aqui (mesma forma das abaixo). "Laudos" é coberto por `documentos_gerados`
-- (tipo = 'laudo_pericial'), que JÁ é genérico o bastante (advogado vê os
-- dois tipos, laudo e RAD, não dá pra separar por linha sem outra coluna).
--
-- Interpretação adotada (não estava 100% definida no pedido): advogado LÊ E
-- ESCREVE nas tabelas que são "dele" (documentos e o que anexa a um
-- processo/imóvel), e só LÊ o contexto de contrato/imóvel/vistoria — ele não
-- cria contrato nem agenda vistoria. Se a intenção real for só-leitura em
-- tudo, troque os `for all`/`with check` abaixo por `for select`.
-- ----------------------------------------------------------------------------

create policy advogado_rw_documentos
    on public.documentos for all to authenticated
    using (public.meu_papel() = 'advogado')
    with check (public.meu_papel() = 'advogado');

create policy advogado_rw_documento_imoveis
    on public.documento_imoveis for all to authenticated
    using (public.meu_papel() = 'advogado')
    with check (public.meu_papel() = 'advogado');

-- documento_transacoes: não expõe `transacoes` (RLS nessa tabela continua
-- bloqueando o advogado — ver ausência de qualquer policy para ele lá); a
-- linha aqui só entrega documento_id/transacao_id/score/status.
create policy advogado_select_documento_transacoes
    on public.documento_transacoes for select to authenticated
    using (public.meu_papel() = 'advogado');

create policy advogado_rw_documentos_gerados
    on public.documentos_gerados for all to authenticated
    using (public.meu_papel() = 'advogado')
    with check (public.meu_papel() = 'advogado');

-- contexto do processo — só leitura
create policy advogado_select_contratos_locacao
    on public.contratos_locacao for select to authenticated
    using (public.meu_papel() = 'advogado');

create policy advogado_select_contrato_locatarios
    on public.contrato_locatarios for select to authenticated
    using (public.meu_papel() = 'advogado');

create policy advogado_select_contrato_reajustes
    on public.contrato_reajustes for select to authenticated
    using (public.meu_papel() = 'advogado');

create policy advogado_select_caucoes
    on public.caucoes for select to authenticated
    using (public.meu_papel() = 'advogado');

create policy advogado_select_imoveis
    on public.imoveis for select to authenticated
    using (public.meu_papel() = 'advogado');

create policy advogado_select_vistorias
    on public.vistorias for select to authenticated
    using (public.meu_papel() = 'advogado');

create policy advogado_select_vistoria_item
    on public.vistoria_item for select to authenticated
    using (public.meu_papel() = 'advogado');

create policy advogado_select_vistoria_anexo
    on public.vistoria_anexo for select to authenticated
    using (public.meu_papel() = 'advogado');

create policy advogado_select_vistoria_log
    on public.vistoria_log for select to authenticated
    using (public.meu_papel() = 'advogado');

-- "Não vê movimentação bancária completa": interpretado, deliberadamente, da
-- forma mais forte — NENHUMA policy de advogado em `transacoes`,
-- `contas_bancarias`, `extrato_saldos_informados`, `conciliacoes_*` ou
-- `ledger_*`. Com RLS forçado (bloco 1) e sem policy própria, essas tabelas
-- ficam inteiramente fechadas para o papel advogado — nem valor agregado, nem
-- uma transação isolada. Se a intenção real do produto for "vê o VALOR do
-- aluguel/multa mas não o extrato linha a linha", isso pede uma VIEW
-- derivada (ex: total cobrado x total pago por contrato) com sua própria
-- policy — não escrita aqui porque não foi pedida e mudaria o que "advogado
-- vê" além do que o enunciado descreveu.


-- ============================================================================
-- O QUE A RLS NÃO COBRE (declarado explicitamente, como pedido — nada aqui é
-- fingido como coberto por policy):
--
-- 1. TRANSAÇÃO PESSOAL AINDA NÃO CLASSIFICADA. O mascaramento de
--    `transacoes`/`ledger_entries` para o contador é por CÓDIGO DE CONTA
--    (plano_conta_codigo/conta_id). Uma transação com plano_conta_codigo
--    NULL — importada mas ainda não categorizada — passa pelo filtro e
--    aparece para o contador mesmo que VÁ ser classificada como pessoal
--    depois. RLS não tem como prever uma classificação futura. Mitigação
--    teria que ser de processo (classificar antes de liberar acesso ao
--    contador) ou de aplicação (uma fila de "pendente de classificação" que
--    o contador nunca vê, ortogonal a este arquivo).
--
-- 2. BALANCETE COMPLETO x DESPESA PESSOAL OCULTA são objetivos em tensão.
--    `ledger_saldos_periodo`/`ledger_encerramentos` (o balancete, que o
--    contador precisa ver PARA FECHAR) incluem o saldo agregado da conta de
--    despesa pessoal (6.5.01) e de salário/renda pessoal (4.4.01) — se esse
--    saldo fosse ocultado linha a linha, o total de débitos deixaria de bater
--    com o de créditos aos olhos do contador, e ele não conseguiria mais
--    confirmar que o período fecha. A política aqui optou por deixar o
--    AGREGADO visível (o contador vê "R$ X foi gasto em despesas pessoais no
--    mês", um número) e só oculta o DETALHE por trás dele (quais transações
--    especificamente). Isso é uma escolha de produto, não uma lacuna técnica
--    que outra sintaxe de RLS resolveria — registrada aqui para o dono do
--    sistema decidir se é aceitável.
--
-- 3. "NO MÁXIMO UM TITULAR." RLS restringe o que cada LINHA mostra a cada
--    usuário; não restringe quantas linhas com papel='titular' podem existir
--    na tabela. Duas contas com papel titular são permitidas pelo schema —
--    se isso for indesejado, é uma constraint de aplicação (ou um trigger),
--    não uma policy de RLS.
--
-- 4. MÚLTIPLAS ENTIDADES LEGAIS. `contas_pessoais_erp()` procura os códigos
--    '6.5.01'/'4.4.01' em `contas_plano_contas` sem filtrar por entidade_id —
--    contas_plano_contas.codigo é único POR entidade (UNIQUE (entidade_id,
--    codigo)), não globalmente. Com mais de uma entidade_legal cadastrada
--    (hoje o app assume implicitamente uma só — ver CONTA_CAIXA_ERP = 1101
--    fixo em mapeamentoPlanoApp.ts), a função devolve um id por entidade e o
--    mascaramento continua correto (todos entram no NOT IN); o ponto de
--    atenção é só se uma entidade um dia reaproveitar os códigos '6.5.01'/
--    '4.4.01' para outra finalidade — não há CHECK nem comentário que
--    impeça isso.
--
-- 5. "PROCESSOS" DO ADVOGADO NÃO EXISTEM NESTE SCHEMA. Ver bloco 4 — a
--    tabela não está nas 51 convertidas; a policy não pode cobrir o que não
--    existe.
--
-- 6. SERVICE ROLE / CHAVE DE SERVIÇO. Qualquer chamada feita com a
--    `service_role` key do Supabase ignora RLS por desenho da plataforma
--    (é a chave usada por Edge Functions/servidor, não pelo navegador) —
--    nenhuma policy aqui a restringe, porque nenhuma policy de Postgres
--    consegue: `service_role` tem o atributo `bypassrls`. Qualquer geração
--    de relatório/PDF do lado servidor que usar essa chave precisa filtrar
--    por papel NA APLICAÇÃO, não pode confiar neste arquivo.
-- ============================================================================


-- ============================================================================
-- O QUE NÃO FOI CONFIRMADO VIA CONTEXT7 (declarado como pedido)
-- ============================================================================
-- Confirmado com fonte (citada em cada trecho acima):
--   - `alter table ... enable row level security`
--   - `create policy ... for select/all to <role> using (...) with check (...)`
--   - padrão `to authenticated` / `to anon` como papel do Postgres
--   - `auth.uid()`, `(select auth.uid())` (padrão de "cachear" a chamada)
--   - `auth.jwt() ->> 'campo'` / `auth.jwt() -> 'app_metadata' ->> 'campo'`
--   - o guia oficial de RBAC com claims customizadas (authorize(), tabela de
--     permissões, função SECURITY DEFINER com search_path = '')
--   - GRANT necessário além da policy ("Grant the privileges roles need")
--   - Custom Access Token Hook para sobrescrever o claim `role` do JWT
--
-- NÃO encontrado/confirmado nas duas bibliotecas consultadas (/supabase/
-- supabase e /websites/supabase) nas consultas feitas nesta sessão:
--   - Se `force row level security` tem alguma interação especial documentada
--     com o modo como o Supabase Data API (PostgREST) conecta ao banco (qual
--     role de conexão é dona das tabelas, se ela cai sob FORCE ou não). Você
--     ADOTOU FORCE aqui seguindo a orientação geral de "nunca confie no dono
--     da tabela", não uma confirmação explícita do Context7 sobre esse ponto
--     específico — vale testar num projeto Supabase real antes de depender
--     disso em produção.
--   - Se `service_role` tem `bypassrls` documentado literalmente nesses
--     termos nessas duas fontes (é conhecimento geral de Postgres/Supabase,
--     não uma citação que o Context7 tenha devolvido nas consultas feitas)
--     — reafirmado aqui por prudência (item 6 acima), mas marcado como não
--     verificado nesta sessão via Context7 especificamente.
-- ============================================================================
