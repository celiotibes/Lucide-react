# Integração

Elo entre `database/schema.sql` e as funções puras de `server/financeiro`/`server/energia`: lê estado do banco, chama o cálculo, grava o resultado de volta. Diferente dos outros módulos, este **fala com um Postgres de verdade** — por isso tem uma suíte de teste separada, que só roda contra banco real (não mockado).

## `reguaCobranca.ts`
Lê faturas com `status in ('aberta','atrasada')` vencidas, recalcula com `calcularJurosMulta` **usando a política de cobrança do próprio contrato** (`contrato_politica_cobranca` — juros/multa variam contrato a contrato, ver `docs/10-auditoria-contrato-real.md`), atualiza `faturas.status`/`valor_liquido`, e registra a passagem por D5/D15/D30 em `regua_cobranca_eventos` de forma idempotente. Contratos sem política própria caem no fallback `POLITICA_COBRANCA_GENERICA`, e o resultado sinaliza isso (`politicaGenericaUsada`) para que o painel administrativo possa alertar "este contrato ainda não tem política de cobrança cadastrada".

## `faturarEnergia.ts`
Lê leituras de energia com `status = 'confirmada'` de um mês de competência, busca a leitura anterior do mesmo imóvel, resolve a tarifa vigente (por distribuidora — derivada da cidade do imóvel via `cidades.distribuidora_energia`, confirmado pelo cliente: medição é por medidor individual, com tarifa dependente da bandeira verde/amarela/vermelha_1/vermelha_2) e grava uma fatura `tipo = 'energia'` com os itens discriminados via `calcularFaturaEnergia`. Idempotente (não duplica fatura para o mesmo imóvel+competência) e nunca lança erro para dado insuficiente — leituras sem leitura anterior, sem tarifa cadastrada ou sem contrato vinculado ficam em `puladas`, para revisão manual, em vez de gerar uma fatura errada.

## `gerarFaturaMensal.ts`
Gera a fatura `tipo = 'aluguel'` de cada contrato `locacao_padrao` ativo, mês a mês — a peça que faltava para o sistema efetivamente cobrar alguém (`docs/12-gerador-fatura-mensal.md`). Usa `../financeiro/valorMensalContrato.ts` para somar `contratos.valor_aluguel` + `contrato_componentes_mensais` (fixo soma, percentual só decompõe sem somar, repassado soma se o valor do mês estiver lançado em `contrato_componente_valores_mensais`), e `../financeiro/prorata.ts` no mês de início do contrato. Contratos com componente repassado sem valor lançado para o mês são pulados inteiros, não faturados parcialmente — mesmo princípio de `faturarEnergia.ts`. Agendamento real em `docs/13-agendamento-fatura-mensal.md` (`app/api/cron/gerar-fatura-mensal`).

## `andamentosOS.ts`
Registra uma etapa (andamento) da execução de uma ordem de serviço e sincroniza `ordens_servico.status`/`checkin_at`/`checkout_at` quando o tipo do andamento implica mudança de status — "relatório passo a passo", não só check-in/check-out (`docs/14-ordens-servico-cronograma-e-andamento.md`). Log append-only: uma OS em estado final (`concluido`/`cancelado`) não aceita novo andamento.

## `gerarOrdensServicoPreventivas.ts`
Gera a OS de cada ocorrência vencida de `planos_manutencao_preventiva` (cronograma recorrente — zeladoria, manutenção de área comum) e avança a próxima data. Mesmo princípio de idempotência de `gerarFaturaMensal.ts`; se o job ficar atrasado, recupera uma ocorrência por execução, não um backlog inteiro de uma vez (`docs/14`).

## `relatorios.ts`
Liga `../relatorios/csv.ts` e `../relatorios/ofx.ts` (serializadores puros) ao banco: faturas e despesas de prestador em CSV (regime de competência), extrato de cobranças pagas em OFX (regime de caixa, formato de conciliação bancária/contábil). Não inventa a fórmula de total de `lancamentos_prestador` (valor_base/adicional_pct/km sem confirmação contratual) — exporta os campos crus separados (`docs/15-relatorios-exportaveis.md`).

## Bug real encontrado ao ligar isto ao banco pela primeira vez

Os testes unitários de `jurosMulta.ts` usavam datas de meia-noite UTC dos dois lados (`dataVencimento` e `dataReferencia`) e todos passavam. O teste de integração usa `new Date()` de verdade — hora real do relógio — como `dataReferencia`, exatamente como aconteceria num job rodando em produção a qualquer hora do dia. Isso expôs um bug imediatamente: uma fatura vencida há 3 dias virava "4 dias de atraso" sempre que o job rodava depois do meio-dia, porque a diferença em milissegundos incluía a fração de hora do dia e `Math.round` arredondava para cima.

Corrigido em `server/financeiro/jurosMulta.ts` truncando as duas datas para o dia de calendário UTC antes de calcular a diferença, com dois testes de regressão adicionados diretamente no arquivo unitário (não só no de integração) para travar o comportamento correto de forma rápida e sem depender de banco. **Esse é o argumento prático para ter teste de integração**: nenhum exemplo manual nos testes unitários originais usava uma data com hora real, porque "meia-noite exata" é o caso mais fácil de escrever à mão, não o caso mais realista.

## Segundo bug real: corrida entre execuções concorrentes de `gerarFaturaMensal`/`faturarEnergia`

Ao adicionar mais arquivos de teste de integração (docs/12-15), a suíte começou a falhar de forma intermitente — não sempre, só às vezes, o assinalador clássico de corrida. Causa raiz: `gerarFaturaMensal`/`faturarEnergia` selecionam contratos/leituras elegíveis com um `select ... where not exists (select 1 from faturas ...)` e só *depois* fazem o `insert` — sem transação nem lock entre as duas consultas. Duas execuções concorrentes (dois jobs de cron sobrepostos, um retry enquanto o anterior ainda roda, ou — como aqui — dois arquivos de teste rodando em paralelo contra o mesmo Postgres) podem passar as duas pelo `not exists` antes de qualquer uma comitar, gerando fatura duplicada para o mesmo contrato+competência.

Corrigido em duas camadas: (1) índices únicos parciais no banco (`uq_faturas_aluguel_por_contrato_competencia`, `uq_faturas_energia_por_contrato_competencia` — schema seção pós-22) que tornam a duplicata fisicamente impossível, não só improvável; (2) os dois `insert` passaram a usar `on conflict ... do nothing`, tratando a corrida como "outra execução já gerou, pular" em vez de deixar o `pg` lançar um erro de violação de constraint. Also corrigido: `vitest.config.ts` ganhou `fileParallelism: false` — os arquivos de teste de integração fazem varredura de portfólio inteiro de propósito (é o que a função faz em produção), então rodá-los em paralelo contra o mesmo banco sempre teria esse risco, independente da constraint.

## Rodando os testes

```
npm test                 # unitários — pula os de integração se DATABASE_URL não estiver definida
DATABASE_URL=postgres://usuario:senha@host:5432/banco npm run test:integration
```

O banco apontado por `DATABASE_URL` precisa ter `database/schema.sql` já aplicado (ver `database/README.md`). **Nunca aponte para um banco de produção** — os testes criam e leem dados livremente. Em produção, a mesma `DATABASE_URL` (via Supabase, usando a connection string de service role) é o que uma função serverless/cron chamaria de verdade.

**Nota sobre reexecução manual:** `faturarEnergiaConfirmada` e `processarReguaCobranca` operam sobre o portfólio inteiro para uma competência/data de referência, não sobre um imóvel isolado — rodar a suíte de integração várias vezes seguidas contra o mesmo banco (fora do `npm run test:integration`, que já isola por execução) sem recriá-lo entre as rodadas acumula dado residual de execuções anteriores e pode confundir asserções que esperam contagens exatas. Isso não é um bug do código, é uma característica de testar contra estado persistente — recrie o banco de teste (schema.sql do zero) antes de cada rodada de validação limpa.
