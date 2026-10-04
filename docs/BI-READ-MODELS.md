# Read-models para BI (item 13 da auditoria)

Views somente leitura sobre o razão canônico (`ledger_entries` via `v_ledger_titular_atual`), no bloco
`-- BEGIN READ MODELS BI ... -- END READ MODELS BI` do fim de `contabilidade-reconstituicao/schema.sql`.
Consumidas por `src/domain/erp/readModelsBi.ts` (`resultadoMensal`, `saldoPorConta`, `resultadoPorCentroCusto`).

## Regras

- **Centavos inteiros**: cada perna vira `CAST(ROUND(valor*100) AS INTEGER)` e só se soma inteiro. Nenhuma divisão
  nem float no SQL. A conversão para reais é só `centavosParaReais`/`emReais` (borda de apresentação).
- **Estorno**: o par (original com `estornado_por_id` + reverso com `estorno_de_id`) é excluído inteiro — mesmo
  critério usado nas consultas de deduplicação do código (`estornado_por_id IS NULL AND estorno_de_id IS NULL`).
- **Titularidade**: `titular_economico_id` vem do overlay vigente (`ledger_atribuicoes_titularidade`); sem atribuição, é o
  próprio `entidade_id`.
- **Mês**: ano/mês do período contábil do lançamento (`periodos_contabeis`), formato `competencia = 'YYYY-MM'`.
- **Encerramento**: `resultado_mensal` e `resultado_por_centro_custo` ignoram a zeragem de `fecharContasDeResultado`
  (`origem_modulo='manual'`, `referencia_documento LIKE 'ENCERRAMENTO-%'`); sem isso todo mês fechado teria resultado 0.
  `v_bi_saldo_contas` a inclui (saldo patrimonial).
- **Imóvel**: `ledger_entries` NÃO tem `imovel_id`, e `centros_custo` não tem FK para `imoveis`. O vínculo é só a
  convenção de código `IM-####` de `criarCentroCustoImovel`; a view expõe `imovel_id` derivado dela (NULL se fora da
  convenção). Por isso a visão é por centro de custo, não `v_bi_resultado_por_imovel`.
- **Migração**: DROP+CREATE a cada abertura (definição versionável). `reconstruirLedgerEntries` (db/migracoes.ts)
  derruba as views `v_bi_*` antes de recriar a tabela.

| View | Granularidade |
|---|---|
| `v_bi_lancamento_efetivo` | base: uma linha por perna viva, com conta/centro/competência |
| `v_bi_resultado_mensal` | mês x conta x centro de custo x titular (receita/despesa) |
| `v_bi_saldo_contas` | conta x titular, acumulado (saldo pela natureza) |
| `v_bi_resultado_por_centro_custo` | mês x centro de custo x titular, receita/despesa líquidas |

## Divergências em relação aos cálculos existentes (por isso NÃO foram refatorados)

Nenhum cálculo existente foi trocado pelo read-model: a equivalência exata só vale em dados sem estorno e sem
contrapartida, e a regra era não alterar números exibidos. A paridade sem estorno e a divergência com estorno estão
provadas em `src/domain/erp/__tests__/readModelsBi.test.ts` (teste "paridade com analiseRentabilidadePorCentro").

1. **Estorno ignorado nos cálculos antigos.** `analiseRentabilidadePorCentro` (alocacao-centros-custo.ts),
   `calcularKPIRentabilidade`, `calcularOcupacao`, `budget-variance.ts` e `cash-forecast.ts` somam só
   `valor_credito` (receita) ou só `valor_debito` (despesa) sem excluir o par estornado. Receita estornada continua
   contando (o reverso, em débito, é descartado). Ex.: receita 1000 + 400 estornada => antigo 1400, read-model 1000.
   É provavelmente bug do lado antigo, mas corrigir muda números exibidos; fica como decisão de produto.
2. **Bruto x líquido.** Os cálculos antigos usam crédito bruto em receita e débito bruto em despesa; o read-model usa
   o líquido (crédito − débito em receita; débito − crédito em despesa). Só coincidem sem estornos/devoluções.
3. **Estorno em outro mês.** O par é excluído das views; a soma crua do razão mostra +X no mês original e −X no mês do
   estorno. O BI mostra a atividade efetiva (nenhum dos dois); relatórios contábeis crus continuam com o par.
4. **Granularidade.** Cálculos antigos filtram por `periodo_id`; as views expõem `periodo_id` e `competencia`,
   equivalentes quando há um período por mês por entidade.
5. **Margem/percentuais.** Cálculos antigos dividem em SQL/JS (float). As views não têm percentuais; quem precisar
   calcula na apresentação a partir dos centavos.
6. **`cash-forecast.ts`** soma caixa por códigos `1.1.01-03` (da numeração do plano do app, que não coincide com o
   plano ERP — ver mapeamentoPlanoApp.ts) e usa `periodo_id`, não data; não comparável com `v_bi_saldo_contas`.

## Próximo passo sugerido

Decidir o item 1 (excluir pares estornados nos cálculos antigos). Se aprovado, trocar `analiseRentabilidadePorCentro`
e `calcularKPIRentabilidade` por `resultadoPorCentroCusto`/`resultadoMensal` e ajustar os testes que fixam os números
atuais.
