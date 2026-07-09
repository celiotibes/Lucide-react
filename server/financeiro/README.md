# Módulo Financeiro

Funções puras (sem I/O, sem chamada de rede/banco) que implementam os cálculos financeiros mais sensíveis do sistema: juros/multa por atraso, pró-rata do primeiro mês de contrato, e split de pagamento entre sócios/proprietários. A decisão de arquitetura (`docs/03-arquitetura-e-stack.md`) é que essa lógica vive em código versionado e testado, não dentro de um workflow do n8n — aqui está a primeira implementação real dessa decisão.

## `jurosMulta.ts`
Multa moratória de 10% (evento único) + juros de 2% a.m. *pro rata die* + honorários extrajudiciais de 20% a partir de 30 dias de atraso. `permiteAcordo` suspende tudo (fatura em renegociação). Os parâmetros (`MULTA_PCT`, `JUROS_PCT_AM`, `HONORARIOS_PCT`, `DIAS_GATILHO_HONORARIOS`) são exportados como constantes nomeadas, não *magic numbers* — os mesmos valores já usados como default na tabela `confissoes_divida` do schema.

## `prorata.ts`
Regra de pró-rata do primeiro mês de contrato: base fixa de 30 dias ("mês comercial"), não dias corridos de calendário — corrigido e confirmado por 4 contratos reais independentes (`docs/10-auditoria-contrato-real.md`, `docs/11-auditoria-contratos-curitiba.md`). Vencimento da primeira fatura sempre no dia `contratos.dia_vencimento` do mês seguinte ao de início, mesmo quando esse dia ainda não tinha passado no mês de início. Consumida por `server/integracao/gerarFaturaMensal.ts`.

## `valorMensalContrato.ts`
Valor mensal total de um contrato a partir do aluguel-base + `contrato_componentes_mensais` (docs/11). Três naturezas, três regras: `valor_fixo` soma ao total; `percentual_do_aluguel` **não soma** — é só um detalhamento do mesmo aluguel-base (achado tardio: um primeiro rascunho tratou isso como aditivo, o que teria cobrado em dobro contratos como o da Life Space Estação 509B); `repassado_variavel` soma somente quando o valor do mês é informado, senão é reportado em `faltantes` sem estimar nem ignorar. Ver `docs/12-gerador-fatura-mensal.md`.

## `splitPagamento.ts`
Divide um valor entre beneficiários por percentual sem nunca perder ou criar centavos por arredondamento — o bug clássico de dividir R$100 em três partes de 33,33% e a soma dar R$99,99. Usa aritmética inteira em centavos com o método dos maiores restos, mais uma reconciliação final que garante a invariante crítica (soma dos splits = valor total) mesmo sob erro residual de ponto flutuante na validação dos percentuais.

**Esta função também é o "motor de rateio multidimensional"** que o material de origem descrevia como um recurso separado (dividir o custo de limpeza da escadaria entre as 6 kitnets de um residencial, por exemplo). Rateio igualitário entre N unidades é apenas um split com `percentual = 1/N` para cada uma — implementar uma segunda função faria a mesma conta de outro jeito. Reaproveitar aqui é deliberado, não uma omissão.

## `rendimentoCaucao.ts`
Rendimento do depósito caução pro rata die. Recebe a taxa mensal da poupança **já resolvida por quem chama** (a partir da série do Bacen) — a fórmula oficial de remuneração da poupança (TR + 0,5% a.m. ou 70% da Selic, conforme o patamar da Selic) é uma regra externa/regulatória que não deveria ficar hardcoded aqui como se fosse definitiva; ver comentário no topo do arquivo.

## `../energia/calcularFaturaEnergia.ts`
Franquia mínima (30 ou 50 kWh conforme a data do contrato), taxa administrativa de 25% sempre discriminada como item separado (nunca embutida sem descrição — auditoria item 1), e rejeição explícita de leitura atual menor que a anterior (medidor resetado/erro) em vez de faturar consumo negativo.

## Testes

```
npm test
```

Destaque para o teste de `splitPagamento`: 300 combinações aleatórias (com seed fixa, reproduzível) de 2 a 7 beneficiários e valores até R$10.000,00, verificando que a soma dos centavos distribuídos bate exatamente com o total em todas as iterações — é o tipo de bug que só aparece sob volume, não em 2-3 exemplos manuais.

## Integração

Estas são funções puras — não persistem nada sozinhas. `server/integracao/` liga cada uma ao banco: `gerarFaturaMensal.ts` usa `prorata.ts` + `valorMensalContrato.ts`; `reguaCobranca.ts` usa `jurosMulta.ts`; `faturarEnergia.ts` usa `../energia/calcularFaturaEnergia.ts`. `splitPagamento.ts` e `rendimentoCaucao.ts` ainda não têm um chamador de integração no repositório.
