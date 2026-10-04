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

## Critério explícito de estorno, período e `asOf` (sem mudar números nem dados)

Em vez de trocar os cálculos antigos (decisão de produto pendente), eles ganharam um último parâmetro
opcional `criterio?: CriterioBi` (`src/domain/erp/criterioBi.ts`). **Omitido, o SQL é byte a byte o de antes**
(`fragmentoLedger` devolve fragmento vazio), então nenhum número exibido muda.

| Campo | Efeito |
|---|---|
| `tratamentoEstorno: 'bruto'` (padrão) | comportamento histórico: soma o razão como está, par estornado+estornador incluso |
| `tratamentoEstorno: 'liquido'` | exclui o par (`estornado_por_id IS NULL AND estorno_de_id IS NULL`), o critério das views `v_bi_*` |
| `de` / `ate` (`YYYY-MM`) | competência do período contábil do lançamento (`periodos_contabeis.ano/mes`), inclusivo |
| `asOf` (`YYYY-MM-DD` ou `YYYY-MM-DD HH:MM[:SS]`) | só lançamentos com `criado_em <= asOf`; data sem hora vale o dia inteiro (23:59:59) |

Funções que aceitam o critério: `calcularKPIRentabilidade`, `calcularTendencia`, `calcularOcupacao`,
`calcularComposicaoPatrimonio`, `calcularRankingImoveisPerformance` (analytics-integradas.ts),
`calcularBudgetVariance`, `gerarProjecaoCaixa`, `analiseRentabilidadePorCentro` e
`dashboardRentabilidadePorImovel` (alocacao-centros-custo.ts), `gerarDRE`, `gerarBalanco`, `gerarFluxoCaixa` e
`gerarRelatorioIntegrado` (relatorios-integrados.ts).

Fora do escopo, de propósito:
- `dashboard-portfolio.ts` **não lê `ledger_entries`** (usa `contas_a_pagar` e `contratos_locacao`), então estorno do
  razão não o afeta; não recebeu o parâmetro.
- Relatórios de auditoria/por módulo (`obterLancamentosParModulo`, `gerarRelatorioAuditoriaParModulo`, variantes
  `...ComFiltro`) mostram o razão cru por definição e ficam como estão.

### Retroativo e histórico acumulado (somente leitura)

- **Retroativo**: recalcular um período já fechado é só chamar a função com o `periodo_id` e o critério desejados;
  nada é gravado. Nada escreve em `ledger_entries` (lançamentos importados/conferidos continuam imutáveis) nem migra dados.
- **`asOf`** reconstitui o que o BI mostraria numa data de corte. Usa `ledger_entries.criado_em`
  (`DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`, UTC). **Não existe coluna de data de estorno**: o instante do estorno é
  o `criado_em` da linha reversa (apontada por `estornado_por_id`). Com `'liquido'`, o original só sai da soma se o
  reverso já existia em `asOf`; antes disso o par ainda contava como vivo, como no fechamento da época.
- **Limites**: `asOf` assume que `criado_em` é fiel ao momento da gravação. Lançamentos importados em lote ficam com a
  data da importação, não a do fato (use `de`/`ate` e `data_lancamento` para o fato). Mudanças de titularidade
  (overlay) e de `centro_custo_id` (atualizável) não têm histórico por data: valem pelo estado atual.
  O estado de um período (aberto/fechado) não entra em `asOf`.

### Views x SQL direto no `'liquido'`

As views `v_bi_*` não têm `asOf`. `compararBrutoLiquido` usa **a view** (`v_bi_resultado_mensal`) para o líquido
quando não há `asOf`, e o mesmo critério em SQL direto quando há; um teste prova que os dois caminhos coincidem. Já as
funções antigas, com `'liquido'`, mantêm a fórmula própria (crédito bruto em receita, débito bruto em despesa) e só
acrescentam a exclusão do par: coincidem com a view quando não há contrapartida/devolução nem zeragem de encerramento
(a view usa crédito − débito e ignora `ENCERRAMENTO-%`), por isso não foram trocadas pela view.

### `compararBrutoLiquido(db, filtros)` (readModelsBi.ts)

Devolve, por **mês e conta de resultado**, `bruto_centavos`, `liquido_centavos` e `diferenca_centavos` (bruto − líquido),
em centavos inteiros, usando o resultado crédito − débito (mesma definição de `resultado_centavos` das views, sem a
zeragem de encerramento). Filtros: `entidadeId`, `titularId`, `contaId`, `grupo`, `de`, `ate`, `asOf`.
`resumirDivergenciaEstornos(linhas)` resume (`temDivergencia`, diferença total e absoluta, competências afetadas).
Atenção: como é crédito − débito, a divergência só aparece quando o par cruza meses; as funções antigas, que somam só
um lado, também divergem no mesmo mês (veja o item 1 acima). Por isso a UI compara o resultado da própria tela nos dois
critérios para avisar.

### UI

`AnalyticsIntegradosView`, `BudgetVarianceView`, `CashForecastView` e `RelatoriosIntegradosView` têm o seletor
"Estornos: considerar / desconsiderar" (`SeletorEstornos`, `<label>`+`<select>` nativos). Padrão "considerar" = `'bruto'`
= números de sempre. Quando o critério alternativo daria números diferentes na tela, aparece um aviso (`role="status"`).

## Próximo passo sugerido

Decidir o item 1 (tornar `'liquido'` o padrão, ou excluir pares estornados nos cálculos antigos). Se aprovado, trocar `analiseRentabilidadePorCentro`
e `calcularKPIRentabilidade` por `resultadoPorCentroCusto`/`resultadoMensal` e ajustar os testes que fixam os números
atuais.
