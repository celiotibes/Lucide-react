# Agendamento da Geração de Fatura Mensal

`server/integracao/gerarFaturaMensal.ts` (docs/12) calcula e grava as faturas, mas precisa de algo externo chamando-o todo mês — nenhum processo dentro do Next.js "acorda sozinho". Esta rota e as duas opções de agendador abaixo fecham essa lacuna, mas **nenhuma das duas roda de fato ainda**: ambas dependem do projeto Supabase/deploy de homologação existir (`docs/09-credenciais-necessarias.md`), mesmo bloqueio já documentado. O que existe hoje é testável de ponta a ponta contra Postgres local — falta só apontar para o ambiente real.

## `app/api/cron/gerar-fatura-mensal/route.ts` (novo)

Rota HTTP fina: autentica por segredo compartilhado (não por sessão de usuário — quem chama é um agendador de infraestrutura), resolve a competência (parâmetro `?competencia=YYYY-MM` opcional, senão usa o mês corrente) e chama `gerarFaturaMensal`. Aceita `GET` e `POST` com o mesmo comportamento, porque os dois agendadores abaixo usam métodos diferentes por padrão.

Variável de ambiente necessária: `CRON_SECRET` (string aleatória longa, gerada por você — não existe um valor "padrão" no código, sem ela a rota responde 500 em vez de aceitar qualquer chamador). A chamada precisa do cabeçalho `Authorization: Bearer <CRON_SECRET>`.

Resposta (200): `{ competencia, geradas, contratos: [...], puladas: [...] }` — `puladas` é a mesma lista de `gerarFaturaMensal` (contratos com componente repassado sem valor do mês lançado); o agendador ou quem monitora deveria alertar quando essa lista não está vazia, porque significa fatura NÃO gerada por falta de dado.

6 testes de integração contra Postgres real, incluindo os dois casos de autenticação (sem cabeçalho, segredo errado) e o parsing de competência (formato inválido → 400, ausente → mês corrente).

## Opção 1: Vercel Cron (`vercel.json`, mais simples)

Se o deploy for na Vercel (decisão já tomada em `docs/03-arquitetura-e-stack.md`), `vercel.json` já declara o cron (`0 6 1 * *` — todo dia 1 às 06:00 UTC). A Vercel injeta automaticamente o cabeçalho `Authorization: Bearer $CRON_SECRET` nas chamadas de cron **desde que a variável de ambiente `CRON_SECRET` esteja configurada no projeto** — não precisa configurar nada além disso no lado da Vercel. Disponível mesmo no plano gratuito (limite de 1 execução/dia por cron, e este job roda 1x/mês — folga enorme).

## Opção 2: n8n (`n8n/gerar-fatura-mensal.workflow.json`)

Se preferir manter o agendamento dentro do n8n (decisão de arquitetura: "n8n orquestra, não calcula" — este workflow só dispara a rota, não recalcula nada) — importar o JSON direto no n8n (Workflows > Import from File). Três nós: gatilho de agenda (mesmo cron `0 6 1 * *`), chamada HTTP com o cabeçalho de autorização, e um nó condicional que verifica se `puladas` veio não-vazio (deixado sem uma ação de notificação conectada — plugue aí o canal que preferir, Slack/e-mail/WhatsApp; não inventei uma integração de notificação sem você confirmar qual canal usar). Requer duas variáveis de ambiente no n8n: `CRMT_APP_URL` (URL do deploy) e `CRMT_CRON_SECRET` (mesmo valor de `CRON_SECRET` na Vercel).

**Use uma opção OU a outra, não as duas** — rodar os dois agendadores ativos ao mesmo tempo chamaria a rota duas vezes no mesmo mês (inofensivo, porque `gerarFaturaMensal` é idempotente, mas redundante sem necessidade).

## Outros 4 crons (mesmo padrão, adicionados depois)

O mesmo desenho (rota fina + segredo compartilhado + `vercel.json`) foi replicado para os outros 4 processos em lote que existiam como função testada mas nunca eram disparados por nada:

| Rota | Função | Frequência | Motivo do horário |
|---|---|---|---|
| `/api/cron/faturar-energia` | `faturarEnergiaConfirmada` (docs/11) | Mensal, dia 2 | Um dia depois da fatura de aluguel (dia 1), para não competir pelo mesmo lock de conexão no mesmo instante |
| `/api/cron/regua-cobranca` | `processarReguaCobranca` (docs/04) | Diário | Precisa rodar todo dia para pegar a fatura no dia exato em que cruza D5/D15/D30 |
| `/api/cron/gerar-os-preventivas` | `gerarOrdensServicoPreventivas` (docs/14) | Diário | Mesmo raciocínio: recupera atraso gradualmente, uma ocorrência por vez, então precisa rodar todo dia |
| `/api/cron/calcular-auditoria-energia-solar` | `calcularAuditoriaEnergiaSolarDoResidencial` (docs/30) | Mensal, dia 5 | Dá margem para a fatura Celesc GD do mês anterior chegar e ser confirmada antes do cálculo rodar; por isso, ao contrário dos outros, o parâmetro `competencia` default é o **mês anterior**, não o corrente |

**Atenção ao plano da Vercel**: com esses 4 o projeto passa a ter 8 crons declarados em `vercel.json`. O plano Hobby da Vercel limita a quantidade de cron jobs por projeto (histórico: 2) além de só permitir granularidade diária — os 4 novos respeitam a granularidade diária, mas a contagem total pode exigir o plano Pro. Confirmar o limite vigente no painel da Vercel antes do deploy (não documentado aqui como fixo porque a Vercel já mudou esse número mais de uma vez).

## O que falta para isto rodar de verdade

- Projeto Supabase de homologação (bloqueio já documentado em `docs/09`) — sem ele, não há `DATABASE_URL` de produção para a rota apontar.
- Deploy do Next.js (Vercel ou outro) com `DATABASE_URL` e `CRON_SECRET` configurados como variáveis de ambiente.
- Decisão de qual das duas opções de agendador usar (Vercel Cron por padrão, a não ser que já exista uma instância de n8n rodando por outro motivo).
- Confirmar o limite de cron jobs do plano Vercel contratado (ver tabela acima) antes do deploy dos 8 crons.
