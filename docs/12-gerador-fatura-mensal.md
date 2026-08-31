# Gerador de Fatura Mensal

Até agora o sistema calculava juros/multa de faturas já existentes (`reguaCobranca.ts`) e faturava energia a partir de leituras confirmadas (`faturarEnergia.ts`), mas nenhuma função gerava a fatura de aluguel em si. Duas peças já existiam mas não estavam ligadas a nada: `server/financeiro/prorata.ts` (pró-rata do primeiro mês, função pura sem chamador) e `contrato_componentes_mensais` (schema criado em `docs/11-auditoria-contratos-curitiba.md`, mas nenhum cálculo lia essa tabela). Este documento cobre o que fechou essa lacuna.

## Correção de semântica antes de calcular (achado próprio, sem contrato novo)

Ao revisar `contrato_componentes_mensais` para escrever o cálculo em cima dela, o comentário original do schema (item 20.3) estava errado: tratava `natureza = 'percentual_do_aluguel'` como se fosse somado ao aluguel-base, igual a `valor_fixo`. Reler o texto dos dois contratos reais que motivaram esse campo mostra o contrário:

- Life Space Estação 509B: comodato de móveis "15% do aluguel, **já incluído**".
- Sala Comercial 923B: "o valor locatício mensal é composto em seu valor em 10% [vaga] e 90% [aluguel]" — as duas parcelas somam o total contratual, não o excedem.

Ou seja, `percentual_do_aluguel` é um **detalhamento** do mesmo total (para discriminar no boleto o que é aluguel e o que é comodato/vaga), não uma cobrança extra. Só `valor_fixo` (Apto 503: comodato R$350 à parte) e `repassado_variavel` (IPTU/condomínio) são de fato somados ao aluguel-base. Se essa confusão tivesse ido para produção, contratos como o da Life Space e o da Sala Comercial teriam sido cobrados em dobro na parte do comodato/vaga. Corrigido no comentário do schema (`database/schema.sql`, item 20.3) e na assinatura de `server/financeiro/valorMensalContrato.ts` antes de qualquer fatura real ser gerada — nenhuma fatura chegou a ser criada com a semântica errada.

## `server/financeiro/valorMensalContrato.ts` (novo, função pura)

Recebe `valor_aluguel` + a lista de componentes do contrato e devolve o valor total do mês e os itens discriminados:

- `valor_fixo`: soma ao total (Apto 503: 1.300 + 350 = 1.650, reproduzido em teste).
- `percentual_do_aluguel`: decompõe o aluguel-base em duas linhas (ex.: "Aluguel" + "Comodato (15%, incluído)") sem alterar o total.
- `repassado_variavel`: soma ao total **somente se o valor do mês for informado**; se não for, o componente entra em `faltantes` e não é estimado nem ignorado — quem chama decide o que fazer (aqui, pular o contrato inteiro).

8 testes unitários, incluindo os dois casos reais confirmados (Apto 503 fixo, Life Space/Sala Comercial percentual) e um caso combinando as três naturezas no mesmo contrato.

## Nova tabela: `contrato_componente_valores_mensais`

`repassado_variavel` não tem valor fixo — o valor real (guia do condomínio, carnê do IPTU) só existe mês a mês. Sem uma tabela para guardá-lo, o gerador de fatura não seria autocontido (precisaria receber o valor por fora do banco toda vez). Cada linha é `(componente_id, competencia, valor)`, única por par, com um trigger que rejeita lançar valor mensal em componente que não seja `repassado_variavel` (`fn_check_componente_valor_mensal_natureza`). RLS: admin lança/vê tudo, inquilino vê só os valores do próprio contrato. Audit trigger aplicado (mesma sensibilidade de `garantias`/`faturas` — afeta diretamente o que é cobrado).

## `server/integracao/gerarFaturaMensal.ts` (novo)

Para cada contrato `locacao_padrao` ativo, num mês de competência dado, sem fatura `tipo='aluguel'` já gravada:

1. Busca os componentes do contrato e o valor do mês de cada `repassado_variavel`.
2. Calcula o total via `valorMensalContrato.ts`. Se algum `repassado_variavel` não tem valor lançado para o mês, **pula o contrato inteiro** (`puladas`, motivo `componente_repassado_sem_valor_do_mes`) — mesmo princípio de `faturarEnergia.ts`: dado insuficiente nunca vira fatura errada.
3. Se o mês de competência é o mês de início do contrato, aplica `prorata.ts` sobre o total (não só sobre o aluguel) e grava um único item "Aluguel (pró-rata, N dias)" — decidido gravar um item único em vez de escalar proporcionalmente cada componente, porque nenhum contrato real confirma se comodato/vaga/repassado também deveriam ser prorateados junto; escalar tudo teria inventado uma regra sem evidência.
4. Nos meses seguintes, grava o valor cheio com os itens discriminados (aluguel líquido + decomposições percentuais + fixos + repassados).
5. Vencimento sempre no dia `contratos.dia_vencimento` do mês **seguinte** ao da competência — mesma regra já usada por `prorata.ts` (evidência do contrato real da Kitnet 16) e por `faturarEnergia.ts`, agora aplicada de forma consistente à fatura de aluguel também.

Idempotente (não duplica fatura para o mesmo contrato+competência+tipo) — mas isso só foi verdade *na prática* depois de uma correção adicional: o `not exists` da consulta e o `insert` não estavam na mesma transação, então duas execuções concorrentes (dois jobs sobrepostos, um retry, ou dois testes em paralelo — foi assim que a suíte pegou) podiam gerar fatura duplicada. Fechado com um índice único parcial no banco (`uq_faturas_aluguel_por_contrato_competencia`) + `on conflict do nothing` no insert — detalhe completo em `server/integracao/README.md`. Contratos `temporada` não são tratados aqui — modelo de cobrança por diária/reserva, fora do escopo de um gerador de fatura mensal recorrente.

### Decisão não confirmada por contrato real, documentada explicitamente

Nenhum dos quatro contratos reais analisados até aqui diz se o pró-rata do primeiro mês deveria incidir só sobre o aluguel ou sobre o total (aluguel + componentes). Optei por proratear o total inteiro, por consistência econômica (ocupação parcial do mês deveria valer para tudo que é cobrado mensalmente, não só o aluguel), mas isso é uma decisão da aplicação, não um fato extraído de um contrato assinado — se um contrato real futuro mostrar o contrário (ex.: comodato cobrado cheio mesmo em mês parcial), revisar aqui.

## Verificação

9 testes de integração contra Postgres real, cobrindo: mês cheio sem componente, pró-rata do primeiro mês (reproduz exatamente o contrato real da Kitnet 16: início 08/07/2026, R$2.490,00 → R$1.992,00), componente fixo somado (reproduz Apto 503: R$1.650,00), componente percentual não somado (reproduz Life Space: total inalterado em R$1.000,00 com decomposição 850/150), componente repassado com e sem valor do mês lançado, idempotência, contrato ainda não iniciado e contrato já encerrado no mês de competência.

Suíte completa após esta mudança: 82 testes unitários + 32 de integração (antes: 74 + 23), build/lint/typecheck limpos.
