# Plano de virada: SQLite (sql.js) → PostgreSQL (Supabase)

Este plano descreve a virada de banco, não a reescrita do produto. Ele pressupõe que
`contabilidade-reconstituicao/schema.postgres.sql` e `contabilidade-reconstituicao/rls.postgres.sql`
já foram revisados e aplicados a um projeto Supabase, e que `scripts/migrar-sqlite-para-postgres.mjs`
já gerou e revisou a carga de um `.sqlite` real (ver os três arquivos-irmãos deste).

**O que este documento NÃO é**: uma lista de tarefas de código já prontas para aplicar.
Todo item marcado "quebra" abaixo é uma mudança em `src/**` fora do escopo deste pacote —
listada para quem for fazer o trabalho de código, não feita aqui.

---

## 0. Prontidão antes de começar

- [ ] `schema.postgres.sql` aplicado a um projeto Supabase de teste (branch/projeto isolado,
      nunca produção) e revisado por quem entende o domínio contábil (as decisões de
      `numeric(14,2)` vs `numeric(9,4)`, os `boolean`, o `balancete_ok` renomeado).
- [ ] `rls.postgres.sql` aplicado por cima, com a seção de stubs de `auth` **removida**
      (ela existe só para teste local fora do Supabase).
- [ ] Ao menos um usuário real de cada papel (titular/contador/perito/advogado) criado em
      Supabase Auth e uma linha correspondente em `public.usuarios_papeis` — sem isso,
      `meu_papel()` devolve `NULL` para todo mundo e toda política nega tudo (inclusive para
      o titular: ele também precisa da própria linha).
- [ ] Testado manualmente (ou com o roteiro da seção 6) que cada papel vê exatamente o que
      deveria — os testes que rodei durante a criação deste pacote (contador não vê
      transação 2.2.01, perito vê, advogado não vê nenhuma transação, titular vê tudo) estão
      documentados como referência em `rls.postgres.sql`, mas foram rodados contra um cluster
      Postgres efêmero local, não contra o projeto Supabase real — repita-os lá.

## 1. Por que a virada não é "trocar o driver"

O app hoje roda **inteiramente no navegador**: sql.js compila SQLite para WASM, o banco
inteiro vive na memória da aba, e é serializado para `IndexedDB` a cada escrita
(`salvarBanco()` em `src/db/connection.ts`). Não existe rede, não existe servidor, não
existe múltiplo usuário simultâneo — um único titular, offline-first.

Postgres via Supabase é o oposto: um servidor central, acessado por rede, com múltiplos
usuários simultâneos autenticados por papel — exatamente o que os quatro papéis pedem, e
exatamente o que o modelo atual não suporta (não tem conceito de "usuário" na maioria das
telas, só um `usuario_id`/`decidido_por` texto livre solto em algumas tabelas de auditoria).

Isso significa que a virada tem **duas frentes que não podem ser separadas**:

1. **Dado**: schema + carga (este pacote cobre isso: `schema.postgres.sql`,
   `rls.postgres.sql`, `scripts/migrar-sqlite-para-postgres.mjs`).
2. **Código de acesso a dado**: todo `src/db/connection.ts` (abrir/salvar/exportar/importar
   banco), `consultar`/`executar`, e cerca de 450+ pontos de chamada SQL espalhados por
   `src/domain/**` e `src/components/**` (ver o relatório de entrega para a lista completa
   de construções não portáveis) precisam de um driver Postgres assíncrono
   (`@supabase/supabase-js` ou `pg`) no lugar de `sql.js` síncrono. **Isso é reescrita de
   código de produção, não deste pacote** — mas nenhuma virada de banco funciona sem ela, e
   o dimensionamento dessa reescrita está na seção 4.

## 2. Passos, na ordem, e o que quebra em cada um

### Passo 1 — Provisionar o projeto Supabase e aplicar o schema

- Criar o projeto Supabase (ou uma branch de desenvolvimento, se o plano permitir).
- Aplicar `schema.postgres.sql`.
- Aplicar `rls.postgres.sql` (sem a seção de stubs de `auth`).
- **Quebra**: nada ainda — o app continua 100% em SQLite. Este passo só cria uma segunda
  base, vazia, em paralelo.
- **Como voltar atrás**: apagar o projeto/branch Supabase. Zero impacto no app em produção.

### Passo 2 — Cadastrar os usuários e papéis reais

- Criar as contas em Supabase Auth (titular + os profissionais que já tiverem sido
  contratados) e as linhas correspondentes em `usuarios_papeis`.
- **Quebra**: nada — ninguém está usando esse banco para valer ainda.
- **Como voltar atrás**: apagar as linhas/usuários.

### Passo 3 — Carga inicial (dados históricos)

- Exportar o `.sqlite` atual pelo próprio app (botão que chama `exportarArquivo()`).
- Rodar `node scripts/migrar-sqlite-para-postgres.mjs entrada.sqlite saida.sql`.
- **Ler os avisos no console com atenção** — cada linha "NÃO CARREGADA" listada ali (e como
  comentário no `.sql` gerado, com os valores originais) é um registro contábil real que
  **não entrou** na carga. Isso não é cosmético: uma transação bancária que sumiu da
  reconstituição é exatamente o tipo de furo que este sistema existe para não ter. Corrija
  a data/valor na origem (ou aceite manualmente o registro incompleto) e insira à mão antes
  de considerar a carga completa.
- Aplicar `saida.sql` ao projeto Supabase (`psql "$DATABASE_URL" -f saida.sql` ou o SQL
  Editor do Supabase — para um arquivo grande, prefira `psql`/`pgAdmin`, o SQL Editor do
  Supabase Studio tem limite de tamanho de statement mais apertado).
- Conferir contagens de linha por tabela contra o `.sqlite` de origem (`SELECT COUNT(*)` dos
  dois lados) e os totais de `SUM(valor)` de `transacoes`/`ledger_entries` batendo — é a
  checagem mais barata de "a carga não perdeu nem duplicou nada".
- **Quebra**: nada no app em produção — ele continua lendo do SQLite local. O Postgres
  passa a ter uma cópia dos dados, desatualizada a partir do instante da exportação.
- **Como voltar atrás**: truncar as tabelas do Postgres e recarregar depois de um novo
  export — o SQLite continua sendo a fonte da verdade até o Passo 5.

### Passo 4 — Reescrever a camada de acesso a dado (fora deste pacote)

Este é o passo que **não está incluído** neste trabalho e que precisa de dimensionamento
próprio antes de ser agendado. Resumo do que envolve (detalhe completo no relatório de
entrega, item 2):

- Trocar `sql.js` síncrono por um cliente Postgres assíncrono em `src/db/connection.ts` —
  toda função que hoje chama `consultar`/`executar` de forma síncrona (praticamente todo
  `src/domain/**`) precisa aceitar que a chamada agora é uma Promise. Isso se propaga: se
  `garantirPlanoDeContasPadrao(db)` vira `async`, todo chamador dela também precisa mudar,
  e assim por diante — não é um ponto único de mudança, é uma onda por toda a árvore de
  chamadas que hoje assume acesso a banco síncrono.
- Trocar todo placeholder `?` por `$1, $2, ...` (ou usar uma lib que faça essa tradução —
  ver recomendação no relatório) nos ~450+ pontos de chamada SQL.
- Resolver os ~35 usos de `last_insert_rowid()` com `RETURNING id` na própria query de
  INSERT (Postgres não tem equivalente à parte — é preciso pedir o id na mesma instrução).
- Resolver os ~81 usos de `datetime(...)` (SQLite) por `now()`/`now() - interval '...'`/cast
  explícito (Postgres).
- Resolver os 29 `INSERT OR IGNORE` e 5 `INSERT OR REPLACE` por `ON CONFLICT ... DO NOTHING`
  / `ON CONFLICT ... DO UPDATE` — que exigem saber qual é a constraint de conflito em cada
  caso (não é uma tradução mecânica 1:1, precisa ler cada UNIQUE/PK envolvido).
- Ajustar todo lugar que grava/lê `0`/`1` como booleano (11 colunas — lista em
  `schema.postgres.sql`, regra 6) para `true`/`false`.
- Ajustar `src/domain/fechamento/periodos.ts` (linhas 51 e 67) e o teste
  `periodos.test.ts:106`, que leem `balancete_OK` com essa grafia exata — a coluna chega
  como `balancete_ok` do Postgres (ver `schema.postgres.sql`, "achados adicionais").
- Decidir e implementar a estratégia de leitura de `numeric` (o driver `pg` devolve como
  string, não `number` — ver relatório, item 4) em todo cálculo financeiro.
- Reescrever `migracao-ledger.ts` (linha 179) para abrir a transação explícita (`BEGIN`)
  antes do `SAVEPOINT` — hoje funciona porque SQLite cria uma transação implícita sozinho;
  Postgres não faz isso e rejeitaria o `SAVEPOINT` fora de uma transação aberta.
- Reescrever `src/db/migracoes.ts` (a lógica de `garantirColunasAtualizadas`/
  `reconstruirLedgerEntries`, que existe porque SQLite não suporta `ALTER TABLE ... ALTER
  COLUMN` de tipo/constraint) — em Postgres, `ALTER TABLE ... ALTER COLUMN TYPE`/`ADD
  CONSTRAINT`/`DROP CONSTRAINT` fazem isso nativamente; a migração de schema em produção
  deveria passar a usar migrações Postgres versionadas (Supabase CLI/`supabase migration
  new`) em vez de "rodar `schema.sql` de novo e ver o que falta", que é a estratégia atual
  (idempotente via `CREATE TABLE IF NOT EXISTS`, mas não serve para mudar uma coluna já
  existente).
- **`src/db/db-init.ts`, `src/db/connection.ts` (import/export de `.sqlite`,
  `criarBancoVazio`, `abrirBanco`)**: essas funções deixam de fazer sentido como estão —
  não existe mais "banco local que a aba abre e serializa"; existe um cliente autenticado
  que se conecta a um servidor. O botão de "Exportar arquivo .sqlite" (backup do usuário,
  ver Passo 6) precisa de uma reimplementação equivalente do lado servidor (dump via `pg_dump`
  ou uma rotina de exportação para `.sqlite`/`.csv`), não uma tradução direta.

Isso é trabalho de várias semanas de engenharia, não um "find and replace" — dimensione
antes de comprometer uma data.

### Passo 5 — Corrida em paralelo (dupla escrita ou janela de congelamento)

Duas estratégias possíveis, mutuamente exclusivas:

- **(a) Janela de congelamento** (mais simples, recomendada para este sistema de um único
  titular): escolher um instante de corte, parar de usar o app em SQLite, exportar o
  `.sqlite` final, rodar a carga (Passo 3) uma última vez, e virar a chave para todo mundo
  usar só o Postgres a partir daí. Janela de indisponibilidade curta (minutos a poucas
  horas, dependendo do volume de dados), mas sem risco de dessincronia entre dois bancos
  vivos ao mesmo tempo.
- **(b) Dupla escrita**: o app escreve nos dois bancos por um período de transição. NÃO
  recomendado aqui: exigiria uma camada de sincronização bidirecional que não existe hoje,
  para um sistema que serve um titular e alguns profissionais — a complexidade não se paga
  para esse volume de usuários. Mencionado só para descartar explicitamente.
- **Quebra**: durante a janela de (a), o app fica indisponível para escrita (leitura do
  `.sqlite` local ainda funciona, mas qualquer lançamento novo precisa esperar o corte).
- **Como voltar atrás**: reabrir o app em SQLite (o `.sqlite` pré-corte não foi alterado) e
  descartar a carga no Postgres.

### Passo 6 — Dados já salvos no IndexedDB dos usuários (pergunta explícita do enunciado)

Hoje, `salvarBanco()` grava o banco inteiro serializado em `IndexedDB` (chave
`contabilidade-db-v1`, ver `src/db/connection.ts`) a cada escrita — é a persistência real
entre sessões, o `.sqlite` exportado é só um backup manual sob demanda.

Depois da virada, esse `IndexedDB` fica **obsoleto, mas não deve ser apagado
imediatamente**:

1. Antes do corte (Passo 5), garantir um export `.sqlite` fresco a partir do estado
   corrente do `IndexedDB` (não confiar em um export antigo) — é esse arquivo que alimenta
   a carga final.
2. Depois do corte, o `IndexedDB` local vira um **backup de recuperação**, não a fonte de
   verdade. Não apagar automaticamente: se algo na carga do Postgres se revelar incompleto
   dias depois, o `IndexedDB` (ou o `.sqlite` exportado dele) ainda é a única cópia
   independente do estado pré-migração para comparar/recuperar.
3. `src/domain/backupIntegridade.ts` já mantém um histórico de backups (hash SHA-256,
   timestamp) em `localStorage` — esse histórico não migra para lugar nenhum sozinho; se a
   trilha de "quando foi cada backup" tiver valor probatório/de auditoria, exporte-o
   também (é só `localStorage`, não `IndexedDB`) antes de descontinuar a versão SQLite do
   app.
4. Só depois de um período de retenção definido pelo dono do sistema (sugestão: até o
   primeiro fechamento contábil completo feito inteiramente em Postgres, o que dá uma
   confirmação prática de que a carga estava correta) é razoável considerar o `IndexedDB`
   descartável — e mesmo assim, isso é decisão do usuário em cada navegador dele, não algo
   que o servidor consiga forçar.

## 3. Como voltar atrás, resumido por passo

| Passo | Reversão |
|---|---|
| 1. Provisionar Supabase | Apagar o projeto/branch. |
| 2. Cadastrar papéis | Apagar as linhas/usuários. |
| 3. Carga inicial | Truncar tabelas e recarregar depois. |
| 4. Reescrita de código | Reverter o branch/PR de código (é código versionado em git, como qualquer outro). |
| 5. Corte de fato | Reabrir o app na versão SQLite anterior; o `.sqlite`/`IndexedDB` pré-corte não foi tocado. |
| 6. IndexedDB | Não se aplica — é o que permite reverter o Passo 5. |

O ponto sem volta fácil é **depois** que usuários começarem a lançar dados novos
diretamente no Postgres (pós-corte) — a partir daí, reverter para SQLite significa perder
ou ter que re-migrar manualmente qualquer lançamento feito só no Postgres. Por isso o Passo
5(a) (janela curta, corte único) é preferível a uma transição longa e ambígua sobre "qual
banco é a verdade agora".

## 4. Dimensionamento honesto do Passo 4 (código)

Não estimado em horas/dias aqui — depende de quem vai fazer e de quanto teste automatizado
cobre hoje o acesso a banco (os 1318 testes atuais rodam contra sql.js in-memory; muitos
deles precisarão de uma segunda versão ou de um modo de rodar contra Postgres também,
senão a suíte pára de proteger o código que mais mudou). O que dá para afirmar:

- **Não é incremental por tabela.** `src/db/connection.ts` é o único ponto de entrada
  (`consultar`/`executar`), mas 25 arquivos de produção chamam `db.exec`/`db.run`/
  `db.prepare` diretamente, contornando esse ponto único — cada um desses 25 precisa de
  atenção própria, não só o wrapper central.
- **A troca de síncrono para assíncrono é a mudança mais cara**, não a sintaxe SQL em si —
  qualquer função que hoje devolve um valor direto de uma consulta a banco passa a devolver
  uma Promise, e isso se propaga por toda a cadeia de chamadas acima dela.

## 5. O que este pacote garante e o que não garante

**Garante** (validado neste trabalho, ver relatório de entrega para os testes exatos
rodados):
- `schema.postgres.sql` aplica sem erro num Postgres 16 real (testado).
- As 51 tabelas nascem com a mesma contagem e os mesmos relacionamentos de `schema.sql`.
- `rls.postgres.sql` aplica sem erro e as quatro políticas de papel foram testadas
  funcionalmente (contador não vê despesa pessoal e não escreve; perito vê tudo e não
  escreve; advogado não vê nenhuma linha de `transacoes`; titular vê e escreve tudo) — num
  cluster Postgres local, não no Supabase real.
- `scripts/migrar-sqlite-para-postgres.mjs` gera uma carga que aplica sem erro, preserva
  ids, ajusta sequences, converte booleans e datas DD/MM/YYYY, e isola (sem abortar a carga
  inteira) qualquer linha com dado que o Postgres rejeitaria.

**Não garante**:
- Que o schema convertido é suficiente para o produto final — só que é uma tradução fiel
  do `schema.sql` atual. Decisões de produto sinalizadas ao longo do caminho (numeric vs
  double, o que o balancete do contador mostra agregado, se "advogado" precisa de escrita)
  ainda pedem uma decisão de quem é dono do sistema.
- Que o app funciona depois da virada — o Passo 4 (reescrita de código) é a maior parte do
  trabalho real e está fora deste pacote por regra explícita da tarefa.
- Comportamento num projeto Supabase de verdade — tudo foi validado contra Postgres puro
  local; `auth.users`/Custom Access Token Hook/Data API (PostgREST) têm particularidades de
  plataforma que só aparecem testando lá.
