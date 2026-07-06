# Módulo Financeiro

Funções puras (sem I/O, sem chamada de rede/banco) que implementam os cálculos financeiros mais sensíveis do sistema: juros/multa por atraso, pró-rata do primeiro mês de contrato, e split de pagamento entre sócios/proprietários. A decisão de arquitetura (`docs/03-arquitetura-e-stack.md`) é que essa lógica vive em código versionado e testado, não dentro de um workflow do n8n — aqui está a primeira implementação real dessa decisão.

## `jurosMulta.ts`
Multa moratória de 10% (evento único) + juros de 2% a.m. *pro rata die* + honorários extrajudiciais de 20% a partir de 30 dias de atraso. `permiteAcordo` suspende tudo (fatura em renegociação). Os parâmetros (`MULTA_PCT`, `JUROS_PCT_AM`, `HONORARIOS_PCT`, `DIAS_GATILHO_HONORARIOS`) são exportados como constantes nomeadas, não *magic numbers* — os mesmos valores já usados como default na tabela `confissoes_divida` do schema.

## `prorata.ts`
Regra de pró-rata do primeiro mês (contrato até dia 15 → ciclo do mês corrente; a partir do dia 16 → ciclo desloca para vencimento no dia 10 do mês seguinte). **Contém uma decisão de default ainda não confirmada por contador**: usa dias corridos de calendário para o rateio, não uma divisão fixa por 30 — está documentado no topo do arquivo e em `docs/01-auditoria-critica.md` (item 1) como pergunta que o material de origem nunca respondeu de forma conclusiva. Não coloque em produção sem validar esse ponto com quem assina a contabilidade.

## `splitPagamento.ts`
Divide um valor entre beneficiários por percentual sem nunca perder ou criar centavos por arredondamento — o bug clássico de dividir R$100 em três partes de 33,33% e a soma dar R$99,99. Usa aritmética inteira em centavos com o método dos maiores restos, mais uma reconciliação final que garante a invariante crítica (soma dos splits = valor total) mesmo sob erro residual de ponto flutuante na validação dos percentuais.

## Testes

```
npm test
```

34 testes no total (Fase atual do projeto). Destaque para o teste de `splitPagamento`: 300 combinações aleatórias (com seed fixa, reproduzível) de 2 a 7 beneficiários e valores até R$10.000,00, verificando que a soma dos centavos distribuídos bate exatamente com o total em todas as iterações — é o tipo de bug que só aparece sob volume, não em 2-3 exemplos manuais.

## O que falta antes de usar em produção

Estas são funções puras — não persistem nada, não chamam o Asaas, não gravam `fatura_itens`/`split_pagamento`. A integração (ler uma fatura do Supabase, calcular, gravar o resultado, disparar o webhook) é trabalho da Fase 0 (M3) e ainda não existe neste repositório.
