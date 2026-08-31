# Banco de Dados — CRMT Gestão Imobiliária

`schema.sql` é o DDL completo (PostgreSQL, compatível com Supabase) descrito em `docs/03-arquitetura-e-stack.md` e `docs/04-roadmap-fases.md`.

## Como aplicar

1. Criar um projeto Supabase dedicado a **homologação** primeiro (nunca aplicar direto em produção — ver `docs/05-riscos-e-custos.md`).
2. No SQL Editor do Supabase (ou via `psql`/CLI), rodar `schema.sql` inteiro — a ordem das tabelas já respeita as dependências de chave estrangeira.
3. Ativar backup/PITR (plano Pro) antes de qualquer dado real de produção.
4. Popular `usuarios` conforme cada pessoa se cadastra via Supabase Auth (trigger `on auth.users insert` ligando a um `pessoa_id`, a implementar na camada de aplicação conforme o fluxo de convite escolhido).

## Migrações incrementais

Bancos criados **antes** da correção que adicionou colunas de NFS-e/PIX a
`fechamentos_prestador` (motivo_devolucao, nfse_id, nfse_status, nfse_url,
nfse_protocolo, pix_id, pix_status, pix_enviado_em, pix_confirmado_em,
pix_motivo_devolucao) precisam rodar `migration-fechamentos-nfse-pix.sql`
uma vez — é idempotente (`add column if not exists`). Bancos criados do
zero a partir do `schema.sql` atual já vêm com essas colunas e não
precisam do script.

## O que já vem pronto no schema

- Todas as tabelas das Fases 0-4 (não precisa migração destrutiva ao avançar de fase — só passa a popular/consumir mais tabelas).
- Trigger que impede provisão de contingência fora da regra do CPC 25 (`fn_check_provisao_cpc25`).
- Constraint de exclusão (`no_overlap_reserva`) que **impede overbooking a nível de banco** — duas reservas confirmadas do mesmo imóvel não podem ter datas sobrepostas, é impossível violar isso mesmo com bug de aplicação.
- Audit log genérico (`fn_audit_trigger`) aplicado às tabelas financeiras/contratuais mais sensíveis.
- Políticas de RLS de exemplo para os 4 portais (inquilino, investidor, prestador, documentos). **Estas são o ponto de partida, não o conjunto final** — cada tabela nova exposta a um portal precisa de sua própria política antes de ir para produção.

## O que precisa de decisão humana antes de rodar em produção

- `imovel_propriedade.percentual`: qualquer alteração é manual e deve ter um `documentos_gerados` correspondente assinado (não existe rotina automática de diluição — ver auditoria item 5).
- `transacoes_bancarias.status = 'aprovado'`: só deve mudar de `'sugerido'` para `'aprovado'` por ação humana explícita na tela de conciliação, nunca em lote automático sem revisão.
- `processos_judiciais.probabilidade_perda`: preenchido por avaliação jurídica, não por heurística do sistema.
