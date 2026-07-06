# Integração

Elo entre `database/schema.sql` e as funções puras de `server/financeiro`/`server/energia`: lê estado do banco, chama o cálculo, grava o resultado de volta. Diferente dos outros módulos, este **fala com um Postgres de verdade** — por isso tem uma suíte de teste separada, que só roda contra banco real (não mockado).

## `reguaCobranca.ts`
Lê faturas com `status in ('aberta','atrasada')` vencidas, recalcula com `calcularJurosMulta`, atualiza `faturas.status`/`valor_liquido`, e registra a passagem por D5/D15/D30 em `regua_cobranca_eventos` — de forma idempotente (rodar duas vezes no mesmo dia nunca duplica evento nem soma acréscimo duas vezes). Não envia WhatsApp/e-mail: isso é trabalho do n8n consumindo os eventos registrados (`docs/03-arquitetura-e-stack.md`).

Quando `faturas.permite_acordo = true`, a fatura ainda fica marcada como atrasada (para visibilidade), mas sem multa/juros/honorários e sem registrar eventos de régua — não faz sentido notificar cobrança de atraso numa fatura já em acordo.

## Bug real encontrado ao ligar isto ao banco pela primeira vez

Os testes unitários de `jurosMulta.ts` usavam datas de meia-noite UTC dos dois lados (`dataVencimento` e `dataReferencia`) e todos passavam. O teste de integração usa `new Date()` de verdade — hora real do relógio — como `dataReferencia`, exatamente como aconteceria num job rodando em produção a qualquer hora do dia. Isso expôs um bug imediatamente: uma fatura vencida há 3 dias virava "4 dias de atraso" sempre que o job rodava depois do meio-dia, porque a diferença em milissegundos incluía a fração de hora do dia e `Math.round` arredondava para cima.

Corrigido em `server/financeiro/jurosMulta.ts` truncando as duas datas para o dia de calendário UTC antes de calcular a diferença, com dois testes de regressão adicionados diretamente no arquivo unitário (não só no de integração) para travar o comportamento correto de forma rápida e sem depender de banco. **Esse é o argumento prático para ter teste de integração**: nenhum exemplo manual nos testes unitários originais usava uma data com hora real, porque "meia-noite exata" é o caso mais fácil de escrever à mão, não o caso mais realista.

## Rodando os testes

```
npm test                 # unitários — pula os de integração se DATABASE_URL não estiver definida
DATABASE_URL=postgres://usuario:senha@host:5432/banco npm run test:integration
```

O banco apontado por `DATABASE_URL` precisa ter `database/schema.sql` já aplicado (ver `database/README.md`). **Nunca aponte para um banco de produção** — os testes criam e leem dados livremente. Em produção, a mesma `DATABASE_URL` (via Supabase, usando a connection string de service role) é o que uma função serverless/cron chamaria de verdade.
