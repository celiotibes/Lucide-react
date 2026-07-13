# Auditoria de Sistema — Triggers de Auditoria e Constraints Faltando

Você pediu uma auditoria geral ("possíveis falhas, inconsistências, erros de código, integrações que faltem") antes de eu voltar a pedir os documentos pendentes. Em vez de rodar uma revisão genérica contra as ~28 mil linhas do branch inteiro, auditei sistematicamente as classes de bug que este projeto já tratou como sensíveis em rodadas anteriores — RLS em toda tabela, trigger de auditoria em toda tabela de decisão financeira/jurídica irreversível, constraint de não-negatividade como defesa em profundidade — e depois varri o código por classes conhecidas de bug (injeção SQL, vazamento de conexão, teste desabilitado, cron órfão, `as any`, XSS). Dois achados reais, ambos corrigidos; o resto foi checado e está limpo.

## Método

**Cobertura de RLS**: extraí o conjunto de `create table` (71 tabelas), o conjunto de `alter table ... enable row level security` e o conjunto de `create policy ... on X` via `grep -oP`, e comparei os três com `comm -23`. Duas armadilhas de metodologia encontradas e corrigidas antes de tirar qualquer conclusão:
- Um lookbehind de tamanho variável (`(?<=^create policy \w{1,80} on )`) é inválido em PCRE (`lookbehind assertion is not fixed length`) e devolvia silenciosamente zero resultados — o que teria sugerido, incorretamente, que nenhuma tabela tinha política nenhuma. Trocado por `\K` (`^create policy \S+ on \K\w+`), que não tem essa limitação.
- `grep -oP` de uma linha só não pega `create trigger trg_audit_X\n  after insert or update or delete on Y`, que no schema está sempre em duas linhas — contagem inicial deu 13 triggers de auditoria quando o real é 21. Corrigido com `perl -0777 -ne` (modo multilinha) antes de concluir que qualquer tabela estivesse sem trigger.

Resultado, com a metodologia corrigida: **71 de 71 tabelas com RLS habilitada têm pelo menos uma política — nenhum gap de RLS.**

**Cobertura de trigger de auditoria**: o padrão do projeto (visível em `garantias`, `contratos`, `split_pagamento`, etc.) é que toda tabela que registra uma decisão financeira ou jurídica irreversível — não qualquer tabela — ganha `trg_audit_X after insert or update or delete ... execute function fn_audit_trigger()`. Rodei o mesmo tipo de comparação de conjuntos entre "tabelas com RLS" e "tabelas com trigger de auditoria" e revisei manualmente cada tabela sem trigger, perguntando se ela se encaixa nessa classe (não é automático — várias tabelas sem trigger são de fato só cadastro/configuração, ex.: `cidades`, `modelos_contrato_categoria`, e não deveriam ganhar um).

## Achado 1 — 5 tabelas sensíveis sem trigger de auditoria

Cinco tabelas se encaixam na mesma classe de "decisão financeira/jurídica irreversível" das que já tinham trigger, mas não tinham:

| Tabela | Por que se encaixa na classe |
|---|---|
| `imovel_propriedade` | Mudança de propriedade/percentual societário — `database/README.md` já descreve isso como "manual e deve ter um `documentos_gerados` correspondente assinado", a mesma linguagem usada para justificar trigger em outras tabelas. |
| `confissoes_divida` | Reconhecimento formal de dívida entre as partes — mesma classe jurídica de `garantias`/`contratos`. |
| `transacoes_bancarias` | `server/integracao/importarExtratoBancarioOFX.ts` e `database/README.md` já documentam que `status` só deve mudar de `'sugerido'` para `'aprovado'` "por ação humana explícita" na tela de conciliação — decisão financeira irreversível sem trilha de auditoria até agora. |
| `cobrancas_asaas` | Registro de cobrança emitida/paga junto ao gateway de pagamento — mesma classe de `faturas`. |
| `extratos_mensais_proprietario` | Extrato oficial entregue ao investidor — mesma classe de `extrato_mensal_itens`, que já tinha trigger. |

Cada uma ganhou `trg_audit_X after insert or update or delete on X for each row execute function fn_audit_trigger()`, no mesmo padrão das 21 tabelas que já tinham. Total agora: 26.

## Achado 2 — `auditorias_energia_solar` sem constraint de não-negatividade

Precedente direto: `docs/08-auditoria-stress-test.md` já tinha adicionado `check (col >= 0)` em 10 tabelas de uma vez, não porque um teste tinha falhado em cada uma individualmente, mas por analogia direta de classe de bug — toda coluna numérica que representa quantidade física ou valor monetário não-negativo por natureza ganha o constraint como defesa em profundidade, mesmo quando o código que grava (`server/energia/auditoriaGeracaoSolar.ts`) já valida isso.

`auditorias_energia_solar` (criada em docs/30, depois daquela rodada) tinha ficado de fora. Adicionado `check (>= 0)` em 9 das 10 colunas numéricas: `energia_gerada_total_kwh`, `energia_injetada_kwh`, `consumo_proprio_instantaneo_kwh`, `energia_consumida_rede_kwh`, `total_consumido_kwh`, `total_cobrado_inquilinos_kwh`, `total_cobrado_inquilinos_valor`, `area_comum_kwh`, `area_comum_valor`.

**Exceção deliberada**: `resultado_financeiro_valor` NÃO ganhou o constraint. É "lucro ou custo absorvido pela administração" por design (`server/energia/auditoriaGeracaoSolar.ts`) — pode ser negativo quando o consumo real custa mais do que o valor cobrado dos inquilinos. Adicionar `>= 0` ali quebraria um caso de uso real, não corrigiria um bug.

## O que foi checado e está limpo (sem mudança)

- **Injeção SQL**: nenhuma concatenação de string em query — toda consulta usa parâmetro posicional (`$1`, `$2`...) via `pg`.
- **Vazamento de conexão**: todo `pool.connect()` tem `try/finally` com `client.release()`; toda transação (`BEGIN`/`COMMIT`/`ROLLBACK`) segue o mesmo padrão.
- **Teste desabilitado**: nenhum `.skip`/`.todo`/`it.skip` fora do `describe.skipIf(!DATABASE_URL)` intencional dos testes de integração (que exigem Postgres real).
- **Cron/rota/teste inconsistente**: toda rota em `app/api/cron/` corresponde a uma função em `server/integracao/`, e `vercel.json` referencia todas as rotas existentes — nenhum cron órfão nem função em lote sem rota.
- **TODO/FIXME**: nenhum comentário desse tipo no código de produção.
- **`as any` / bypass de tipo**: nenhuma ocorrência.
- **`dangerouslySetInnerHTML`**: um único uso, em `app/contratos/[id]/contrato` (iframe de pré-visualização do HTML do contrato gerado pelo próprio motor de merge, não input de usuário externo). Observação de baixo risco, não corrigida: o handler 404 de `app/api/contratos/[id]/html/route.ts` devolve a mensagem de erro sem escapar — como a rota só devolve texto fixo (não eco de input do usuário), não é um vetor de XSS real, mas fica registrado.

## Verificação

Nenhuma mudança de código TypeScript nesta rodada — só `database/schema.sql` (6 triggers de auditoria novos, 9 constraints novos). 335 testes, 3 execuções consecutivas limpas contra banco recriado do zero em cada rodada, `npx tsc --noEmit`, `npm run lint` e `npm run build` limpos.
