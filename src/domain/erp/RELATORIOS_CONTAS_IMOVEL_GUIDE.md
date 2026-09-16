# Guia de Relatórios - Contas Pessoais e Imóvel-Gestão

## Visão Geral

Este documento fornece orientações completas sobre os 8 relatórios financeiros implementados para os módulos de **contas pessoais** e **gestão imobiliária**. Todos os relatórios seguem o padrão **RelatorioBuilder** para construção fluente e consolidada.

---

## Módulo 1: Contas Pessoais

### Descrição Geral

O módulo de contas pessoais fornece análise granular de movimentos financeiros em contas de pessoas físicas, rastreando receitas, despesas, transferências e investimentos.

### Relatórios Disponíveis

#### 1. **Relatório de Movimentos da Conta** (`relatorioMovimentosConta()`)

**Propósito:** Extrato detalhado de todas as transações de uma conta em período definido.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `conta_id: number` - ID da conta pessoal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioMovimentos {
  periodo: string;                          // "2024-01-01 a 2024-01-31"
  conta_id: number;
  conta_descricao: string;                  // Ex: "Conta Corrente Principal"
  saldo_inicial: number;                    // Saldo no início do período
  saldo_final: number;                      // Saldo no final do período
  total_entradas: number;                   // Soma de todas as entradas
  total_saidas: number;                     // Soma de todas as saídas
  total_transferencias_saidas: number;
  total_transferencias_entradas: number;
  movimentos: LinhaMovimento[];             // Detalhes de cada transação
}
```

**Uso Financeiro:**
- Reconciliação bancária
- Auditoria de transações
- Análise de fluxo mensal
- Validação de saldos

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31
Conta: Conta Corrente Principal

Saldo Inicial:    R$ 5.000,00
Total Entradas:   R$ 12.000,00 (3 transações)
Total Saídas:     R$ 8.500,00 (5 transações)
Saldo Final:      R$ 8.500,00

Movimentos:
  01/01  Depósito Salário              +R$ 8.000,00  → R$ 13.000,00
  05/01  Pagamento Conta Água          -R$ 150,00   → R$ 12.850,00
  10/01  Depósito Freelance            +R$ 4.000,00 → R$ 16.850,00
  ...
```

---

#### 2. **Relatório de Depósitos e Saques** (`relatorioDepositosSaques()`)

**Propósito:** Resumo consolidado de inflows e outflows por categoria.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioDepositosSaques {
  periodo: string;
  total_depositos: number;              // Soma de depósitos (entradas)
  total_saques: number;                 // Soma de saques (saídas)
  quantidade_depositos: number;
  quantidade_saques: number;
  deposito_medio: number;               // Depósito médio
  saque_medio: number;                  // Saque médio
  linhas: LinhaDepositoSaque[];         // Detalhes de cada operação
}
```

**Uso Financeiro:**
- Análise de padrão de gastos
- Previsão de fluxo de caixa
- Segmentação por tipo de operação
- Identificação de anomalias

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31

DEPOSITOS
  Total:            R$ 20.000,00
  Quantidade:       4 operações
  Média:            R$ 5.000,00
  Mínimo:           R$ 2.000,00
  Máximo:           R$ 8.000,00

SAQUES/DESPESAS
  Total:            R$ 8.500,00
  Quantidade:       6 operações
  Média:            R$ 1.416,67
  Mínimo:           R$ 100,00
  Máximo:           R$ 2.000,00

Taxa de Poupança: 57,5% (depositos / (depositos + saques))
```

---

#### 3. **Relatório de Transferências Pessoais** (`relatorioTransferenciasPessoais()`)

**Propósito:** Rastreamento de transferências entre contas pessoais da mesma pessoa.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioTransferencias {
  periodo: string;
  total_transferencias: number;         // Valor agregado de transferências
  quantidade_transferencias: number;
  transferencia_media: number;
  transferencias_saidas: number;        // Transferências de saída (origem)
  transferencias_entradas: number;      // Transferências de entrada (destino)
  linhas: LinhaTransferencia[];
}
```

**Uso Financeiro:**
- Consolidação de patrimônio
- Alocação de recursos
- Rastreamento de movimentação entre contas
- Análise de investimentos

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31

Total de Transferências: R$ 15.000,00
Quantidade: 3 operações
Média por Transferência: R$ 5.000,00

Transferências de Saída: 2
Transferências de Entrada: 1

Detalhes:
  05/01  Conta Corrente → Poupança          R$ 5.000,00
  12/01  Conta Corrente → Investimentos     R$ 7.000,00
  20/01  Poupança → Conta Corrente          R$ 3.000,00
```

---

#### 4. **Relatório de Aportes versus Resgates** (`relatorioAportesVersusResgates()`)

**Propósito:** Análise de capital investido (aportes) versus retirada (resgates).

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioAportesResgates {
  periodo: string;
  total_aportes: number;                // Capital investido
  total_resgates: number;               // Capital retirado
  quantidade_aportes: number;
  quantidade_resgates: number;
  aporte_liquido: number;               // Aportes - Resgates
  aporte_medio: number;
  resgate_medio: number;
  registros: AporteResgate[];
}
```

**Uso Financeiro:**
- Análise de investimentos
- Projeção de patrimônio
- Rentabilidade (aportes × yield = lucro)
- Planejamento de aposentadoria

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31

APORTES (Investimentos)
  Total:            R$ 25.000,00
  Quantidade:       3 operações
  Média:            R$ 8.333,33

RESGATES
  Total:            R$ 5.000,00
  Quantidade:       1 operação
  Média:            R$ 5.000,00

APORTE LÍQUIDO: R$ 20.000,00
(Incremento de patrimônio)
```

---

#### 5. **Relatório de Saldo por Pessoa** (`relatorioSaldoPorPessoa()`)

**Propósito:** Consolidação de saldos de todas as contas de uma pessoa física.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal

**Saída:**
```typescript
interface RelatorioSaldoPorPessoa {
  data_consulta: string;
  total_geral: number;                  // Patrimônio líquido
  quantidade_pessoas: number;
  saldos: SaldoPessoa[];
}

interface SaldoPessoa {
  pessoa_nome: string;
  saldos_por_conta: Record<string, number>;  // {"Conta X": 5000, "Conta Y": 3000}
  saldo_total: number;                  // Soma de todas as contas
  quantidade_contas: number;
  data_consulta: string;
}
```

**Uso Financeiro:**
- Visão consolidada de patrimônio
- Declaração de imposto de renda
- Análise de diversificação de investimentos
- Gestão de múltiplas contas

**Exemplo de Saída:**
```
Consulta: 2024-01-31

JOÃO DA SILVA
  Conta Corrente     R$ 8.500,00
  Poupança           R$ 25.000,00
  Investimentos      R$ 42.300,00
  ─────────────────────────────
  Total:             R$ 75.800,00

MARIA SANTOS
  Conta Corrente     R$ 3.200,00
  Poupança           R$ 12.000,00
  ─────────────────────────────
  Total:             R$ 15.200,00

PATRIMÔNIO LÍQUIDO TOTAL: R$ 91.000,00
```

---

#### 6. **Relatório de Mudança de Saldo por Período** (`relatorioMudancaSaldoPeriodo()`)

**Propósito:** Comparação de saldos entre dois períodos contábeis (período a período).

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `periodo_anterior_id: number` - ID do período anterior
- `periodo_atual_id: number` - ID do período atual

**Saída:**
```typescript
interface RelatorioCombinacaoPeriodos {
  periodo_anterior: string;             // "12/2023"
  periodo_atual: string;                // "01/2024"
  total_variacao_absoluta: number;      // Mudança total em reais
  total_variacao_percentual: number;    // Mudança percentual
  contas: ComparisonPeriodo[];
}

interface ComparisonPeriodo {
  conta_descricao: string;
  saldo_periodo_anterior: number;
  saldo_periodo_atual: number;
  variacao_absoluta: number;
  variacao_percentual: number;          // Percentual de mudança
  entradas_periodo: number;             // Inflows do período atual
  saidas_periodo: number;               // Outflows do período atual
}
```

**Uso Financeiro:**
- Análise de tendências
- Previsão de fluxo futuro
- Identificação de crescimento/queda
- Planejamento anual

**Exemplo de Saída:**
```
Comparação: Dez/2023 vs Jan/2024

CONTA CORRENTE
  Saldo Anterior:        R$ 8.000,00
  Saldo Atual:           R$ 8.500,00
  Variação:              +R$ 500,00 (+6,25%)
  Entradas Jan:          R$ 12.000,00
  Saídas Jan:            -R$ 8.500,00

POUPANÇA
  Saldo Anterior:        R$ 23.000,00
  Saldo Atual:           R$ 25.000,00
  Variação:              +R$ 2.000,00 (+8,70%)
  Entradas Jan:          R$ 2.500,00
  Saídas Jan:            -R$ 500,00

VARIAÇÃO TOTAL: +R$ 2.500,00 (+7,89%)
```

---

## Módulo 2: Gestão Imobiliária

### Descrição Geral

O módulo de gestão imobiliária fornece análise completa de performance de imóveis alugados, incluindo receitas, despesas, ROI e provisões futuras.

### Relatórios Disponíveis

#### 1. **Relatório de Receitas de Aluguel** (`relatorioReceitasAluguel()`)

**Propósito:** Detalhamento de receitas de aluguel por inquilino e imóvel.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `imovel_id: number` - ID do imóvel
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioReceitasAluguel {
  periodo: string;
  imovel_id: number;
  endereco: string;                     // "Rua das Flores 123, Apt 45"
  total_receita_aluguel: number;
  quantidade_inquilinos_ativos: number;
  receita_media_mensal: number;
  receita_minima: number;               // Menor pagamento
  receita_maxima: number;               // Maior pagamento
  linhas: LinhaReceitaAluguel[];
}

interface LinhaReceitaAluguel {
  data_vencimento: string;
  inquilino_nome: string;
  valor_aluguel: number;
  reajuste?: number;
  total_recebido: number;
  status_pagamento: "pago" | "vencido" | "a_vencer";
}
```

**Uso Financeiro:**
- Fluxo de receitas esperadas
- Índice de inadimplência
- Planejamento de receitas
- Análise de ocupação

**Exemplo de Saída:**
```
Imóvel: Rua das Flores 123, Apt 45
Período: 2024-01-01 a 2024-01-31

RECEITAS TOTAIS: R$ 3.000,00

Inquilino: José da Silva
  Vencimento: 05/01/2024
  Aluguel:     R$ 1.500,00
  Reajuste:    R$ 50,00 (IPCA)
  Status:      PAGO

Inquilino: Maria Santos
  Vencimento: 10/01/2024
  Aluguel:     R$ 1.500,00
  Status:      A VENCER (em dia)

ÍNDICE DE RECEBIMENTO: 100%
```

---

#### 2. **Relatório de Despesas Operacionais** (`relatorioDespesasOperacionais()`)

**Propósito:** Consolidação de despesas operacionais (condomínio, utilidades, manutenção).

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioDespesasOperacionais {
  periodo: string;
  total_condominio: number;
  total_agua_esgoto: number;
  total_energia: number;
  total_internet: number;
  total_manutencao: number;
  total_seguros: number;
  total_geral: number;
  quantidade_despesas: number;
  despesa_media: number;
  despesas_por_imovel: Record<string, number>;  // Agregado por imóvel
  linhas: LinhaDespesaOperacional[];
}
```

**Uso Financeiro:**
- Orçamento operacional
- Análise de custos
- Benchmarking entre imóveis
- Planejamento de manutenção

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31

DESPESAS OPERACIONAIS TOTAIS: R$ 1.850,00

Condomínio         R$ 800,00  (43,2%)
Água/Esgoto        R$ 250,00  (13,5%)
Energia            R$ 400,00  (21,6%)
Internet           R$ 150,00  (8,1%)
Manutenção         R$ 200,00  (10,8%)
Seguros            R$ 50,00   (2,7%)

Despesa Média: R$ 308,33 por lançamento
Quantidade: 6 operações

Por Imóvel:
  Rua das Flores 123 → R$ 950,00
  Av. Brasil 456     → R$ 900,00
```

---

#### 3. **Relatório de Retorno de Imagem (ROI)** (`relatorioRetornoImagem()`)

**Propósito:** Análise de rentabilidade e retorno sobre investimento para cada imóvel.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioRetornoImagem {
  periodo: string;
  quantidade_imoveis: number;
  roi_medio_geral: number;              // ROI% médio de todos os imóveis
  yield_medio_geral: number;            // Yield% médio anual
  roi_total_anual: number;              // Lucro total anual
  imoveis: RetornoImovel[];
}

interface RetornoImovel {
  imovel_id: number;
  endereco: string;
  valor_aquisicao: number;              // Valor de compra
  receita_anual_estimada: number;       // Aluguel × 12
  despesa_anual_estimada: number;       // Custos × 12
  lucro_liquido_anual: number;
  roi_percentual: number;               // (Lucro / Investimento) × 100
  periodo_payback_anos: number;         // Anos para recuperar investimento
  yield_mensal: number;                 // Aluguel / Valor × 100
  yield_anual: number;                  // Yield Mensal × 12
}
```

**Fórmulas Utilizadas:**
```
ROI% = (Lucro Líquido Anual / Valor Aquisição) × 100
Yield Mensal% = (Aluguel Mensal / Valor Aquisição) × 100
Yield Anual% = Yield Mensal × 12
Payback = Valor Aquisição / Receita Anual
```

**Uso Financeiro:**
- Decisão de venda/manutenção
- Comparação com outras inversões
- Análise de performance histórica
- Rebalanceamento de portfólio

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31

ROI MÉDIO GERAL: 8,45% a.a.
YIELD MÉDIO GERAL: 7,20% a.a.
LUCRO TOTAL ANUAL ESTIMADO: R$ 85.400,00

IMÓVEL: Rua das Flores 123, Apt 45
  Valor de Aquisição:        R$ 500.000,00
  Receita Anual Estimada:    R$ 36.000,00 (R$ 3.000/mês)
  Despesa Anual Estimada:    R$ 22.200,00 (R$ 1.850/mês)
  Lucro Líquido Anual:       R$ 13.800,00
  
  ROI Anual:                 2,76%
  Yield Mensal:              0,60%
  Yield Anual:               7,20%
  Período Payback:           13,89 anos

IMÓVEL: Av. Brasil 456
  Valor de Aquisição:        R$ 400.000,00
  Receita Anual Estimada:    R$ 48.000,00 (R$ 4.000/mês)
  Despesa Anual Estimada:    R$ 21.600,00 (R$ 1.800/mês)
  Lucro Líquido Anual:       R$ 26.400,00
  
  ROI Anual:                 6,60%
  Yield Mensal:              1,00%
  Yield Anual:               12,00%
  Período Payback:           8,33 anos
```

---

#### 4. **Relatório Comparativo de Propriedades** (`relatorioComparativoPropriedades()`)

**Propósito:** Análise comparativa de performance entre todos os imóveis da carteira.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioComparativoPropriedades {
  periodo: string;
  quantidade_imoveis: number;
  melhor_desempenho: ComparativoImovel;  // Imóvel com score mais alto
  pior_desempenho: ComparativoImovel;    // Imóvel com score mais baixo
  desempenho_medio: {
    valor_aluguel_medio: number;
    despesas_medias: number;
    margem_media: number;
    roi_medio: number;
  };
  imoveis: ComparativoImovel[];          // Ordenado por score (descrescente)
}

interface ComparativoImovel {
  imovel_id: number;
  endereco: string;
  tipo_imovel: string;                  // "apartamento", "casa", etc
  valor_aquisicao: number;
  valor_aluguel_mensal: number;
  despesas_mensais: number;
  margem_liquida: number;
  margem_percentual: number;            // (Margem / Aluguel) × 100
  ocupacao_percentual: number;          // Taxa de ocupação
  roi_anual: number;
  score_performance: number;            // 0-100 (ranking)
}
```

**Uso Financeiro:**
- Identificação de imóveis com melhor desempenho
- Estratégia de venda de ativos com baixa performance
- Alocação de recursos para manutenção
- Planejamento de expansão

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31

MELHOR DESEMPENHO
  Av. Brasil 456 (Apartamento)
  Score: 85/100

PIOR DESEMPENHO
  Rua Central 789 (Casa)
  Score: 42/100

DESEMPENHO MÉDIO
  Aluguel Médio:      R$ 3.500,00
  Despesas Médias:    R$ 1.800,00
  Margem Média:       R$ 1.700,00
  ROI Médio:          6,45%

RANKING DE IMÓVEIS
┌─────────────────────────────────────────────────────────┐
│ Av. Brasil 456               │ Score: 85 │ ROI: 8,90%  │
├─────────────────────────────────────────────────────────┤
│ Rua das Flores 123           │ Score: 72 │ ROI: 6,50%  │
├─────────────────────────────────────────────────────────┤
│ Rua Central 789              │ Score: 42 │ ROI: 2,10%  │
└─────────────────────────────────────────────────────────┘
```

---

#### 5. **Relatório de Manutenção Agendada** (`relatorioManutencaoAgendada()`)

**Propósito:** Rastreamento de manutenção preventiva e corretiva.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioManutencaoAgendada {
  periodo: string;
  total_pendente: number;               // Valor de manutenções não feitas
  total_concluida: number;
  total_cancelada: number;
  custo_total_pendente: number;
  custo_total_concluido: number;
  quantidade_pendente: number;
  quantidade_concluida: number;
  linhas: LinhaManutencao[];
}

interface LinhaManutencao {
  data_manutencao: string;
  imovel_endereco: string;
  tipo_manutencao: string;              // "Elétrica", "Hidráulica", etc
  descricao: string;
  valor: number;
  prestador_servico: string;
  status: "pendente" | "concluida" | "cancelada";
  dias_atraso?: number;                 // Se pendente e atrasado
}
```

**Uso Financeiro:**
- Orçamento de capex (capital expenditure)
- Planejamento de cash flow
- Identificação de problemas urgentes
- Gestão de fornecedores

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31

MANUTENÇÃO PENDENTE
  Total:       R$ 4.500,00
  Quantidade:  3 atividades
  Atrasadas:   2 (total de 15 dias)

MANUTENÇÃO CONCLUÍDA
  Total:       R$ 8.200,00
  Quantidade:  5 atividades

MANUTENÇÃO CANCELADA
  Total:       R$ 1.200,00
  Quantidade:  1 atividade

DETALHES DE PENDÊNCIAS
  Data: 15/01 | Rua das Flores 123 | Hidráulica | Reparo torneira
    Valor: R$ 300,00 | Status: ATRASADO (16 DIAS) | Prestador: João Encanador

  Data: 20/01 | Av. Brasil 456 | Elétrica | Instalação novas luminárias
    Valor: R$ 2.000,00 | Status: AGENDADO | Prestador: Eletro Empresa

  Data: 25/01 | Rua Central 789 | Geral | Limpeza de caixa d'água
    Valor: R$ 2.200,00 | Status: AGENDADO | Prestador: Limpeza Total
```

---

#### 6. **Relatório de Fluxo de Caixa de Propriedades** (`relatorioFluxoCaixaPropriedades()`)

**Propósito:** Análise de fluxo de entrada e saída de caixa para cada imóvel.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioFluxoCaixaPropriedades {
  periodo: string;
  quantidade_imoveis: number;
  fluxo_total_geral: number;            // Saldo consolidado
  entradas_totais: number;              // Todas as receitas
  saidas_totais: number;                // Todas as despesas
  imagem: FluxoCaixaPropriedade[];
}

interface FluxoCaixaPropriedade {
  imovel_id: number;
  endereco: string;
  saldo_inicial: number;                // Caixa no início do período
  entradas_aluguel: number;             // Receita de aluguel
  entradas_outras: number;              // Outras receitas (devolução depósito, etc)
  total_entradas: number;
  saidas_despesas: number;              // Condomínio, água, energia, etc
  saidas_manutencao: number;            // Custos de manutenção
  total_saidas: number;
  fluxo_liquido: number;                // Entradas - Saídas
  saldo_final: number;                  // Caixa no final do período
}
```

**Uso Financeiro:**
- Planejamento de necessidade de capital
- Retirada de dividendos
- Reinvestimento de lucros
- Identificação de imóveis "cash negative"

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31

FLUXO CONSOLIDADO
  Saldo Inicial Total:      R$ 50.000,00
  Total de Entradas:        R$ 36.000,00
  Total de Saídas:          R$ 22.200,00
  Fluxo Líquido:            R$ 13.800,00
  Saldo Final:              R$ 63.800,00

POR IMÓVEL
┌─────────────────────────────────────────────────────────────┐
│ Rua das Flores 123, Apt 45                                  │
│                                                             │
│ Saldo Inicial:         R$ 15.000,00                         │
│   Aluguel Recebido:       +R$ 3.000,00                      │
│   Despesas:               -R$ 1.850,00                      │
│ ───────────────────────────────────────                     │
│ Fluxo Líquido:         +R$ 1.150,00                         │
│ Saldo Final:           R$ 16.150,00                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Av. Brasil 456                                              │
│                                                             │
│ Saldo Inicial:         R$ 25.000,00                         │
│   Aluguel Recebido:       +R$ 4.000,00                      │
│   Despesas:               -R$ 1.800,00                      │
│ ───────────────────────────────────────                     │
│ Fluxo Líquido:         +R$ 2.200,00                         │
│ Saldo Final:           R$ 27.200,00                         │
└─────────────────────────────────────────────────────────────┘
```

---

#### 7. **Relatório de Provisões Futuras** (`relatorioProvisioneFuturas()`)

**Propósito:** Cálculo de reservas necessárias para manutenção futura e contingências.

**Parâmetros:**
- `db: Database` - Conexão com banco de dados
- `entidade_id: number` - ID da entidade legal
- `data_inicio: string` - Data inicial (YYYY-MM-DD)
- `data_fim: string` - Data final (YYYY-MM-DD)

**Saída:**
```typescript
interface RelatorioProvisioneFuturas {
  periodo: string;
  quantidade_imoveis: number;
  provisao_total_manutencao: number;    // 10% da receita anual
  provisao_total_seguro: number;        // 5% da receita anual
  provisao_total_vaga: number;          // 5% da receita anual
  provisao_total_reforma: number;       // 15% da receita anual
  provisao_total_geral: number;         // Soma total
  imoveis: ProvisioneFutura[];
}

interface ProvisioneFutura {
  imovel_id: number;
  endereco: string;
  reserva_manutencao: number;           // Manutenção preventiva
  reserva_seguro: number;               // Coberturas adicionais
  reserva_vaga: number;                 // Vacância entre inquilinos
  reserva_reforma: number;              // Reforma estrutural
  total_provisoes: number;
  percentual_receita: number;           // % da receita anual reservada
  situacao: "adequada" | "insuficiente" | "excessiva";
}
```

**Benchmarks Recomendados:**
- 20-40% da receita anual como provisão é adequado
- < 20% = Insuficiente (risco de falta de recursos)
- > 40% = Excessivo (oportunidade de distribuição)

**Uso Financeiro:**
- Planejamento de contingências
- Análise de sustentabilidade
- Distribuição de dividendos (após provisões)
- Seguros e coberturas necessárias

**Exemplo de Saída:**
```
Período: 2024-01-01 a 2024-01-31

PROVISÕES CONSOLIDADAS
  Manutenção:    R$ 36.000,00 (10% × receita anual)
  Seguro:        R$ 18.000,00 (5% × receita anual)
  Vacância:      R$ 18.000,00 (5% × receita anual)
  Reforma:       R$ 54.000,00 (15% × receita anual)
  ────────────────────────────
  TOTAL:         R$ 126.000,00 (35% da receita)
  ✓ SITUAÇÃO: ADEQUADA

POR IMÓVEL
Rua das Flores 123 (Aluguel: R$ 3.000/mês = R$ 36.000/ano)
  Manutenção:    R$ 3.600
  Seguro:        R$ 1.800
  Vacância:      R$ 1.800
  Reforma:       R$ 5.400
  ────────────────
  Provisão:      R$ 12.600 (35% - ADEQUADA)

Av. Brasil 456 (Aluguel: R$ 4.000/mês = R$ 48.000/ano)
  Manutenção:    R$ 4.800
  Seguro:        R$ 2.400
  Vacância:      R$ 2.400
  Reforma:       R$ 7.200
  ────────────────
  Provisão:      R$ 16.800 (35% - ADEQUADA)

Rua Central 789 (Aluguel: R$ 2.000/mês = R$ 24.000/ano)
  Manutenção:    R$ 2.400
  Seguro:        R$ 1.200
  Vacância:      R$ 1.200
  Reforma:       R$ 3.600
  ────────────────
  Provisão:      R$ 8.400 (35% - ADEQUADA)
```

---

## Padrão RelatorioBuilder

Todos os relatórios podem ser construídos de forma fluente usando a classe `RelatorioBuilder` ou `RelatorioImovelBuilder`:

### Exemplo: Contas Pessoais

```typescript
import { RelatorioBuilder, relatorioMovimentosConta } from './relatorios-contas-pessoais';

const builder = new RelatorioBuilder(db, entidade_id)
  .comPeriodo(periodo_id)
  .comConta(conta_id)
  .entreDataas('2024-01-01', '2024-01-31');

const config = builder.build();

const relatorio = relatorioMovimentosConta(
  config.db,
  config.entidade_id,
  config.conta_id!,
  config.data_inicio!,
  config.data_fim!
);
```

### Exemplo: Imóvel-Gestão

```typescript
import { RelatorioImovelBuilder, relatorioRetornoImagem } from './relatorios-imovel';

const builder = new RelatorioImovelBuilder(db, entidade_id)
  .comPeriodo(periodo_id)
  .comImovel(imovel_id)
  .entreDataas('2024-01-01', '2024-01-31');

const config = builder.build();

const relatorio = relatorioRetornoImagem(
  config.db,
  config.entidade_id,
  config.data_inicio!,
  config.data_fim!
);
```

---

## Integração com Plano de Contas

Os relatórios integram-se com o plano de contas centralizado através do `origen_modulo`:

- **Contas Pessoais**: `origem_modulo = 'contas-pessoais'`
- **Imóvel-Gestão**: `origem_modulo = 'imovel-gestao'`
- **Centro de Custo**: Cada imóvel é um centro de custo separado para alocação de despesas

### Exemplo: Rastreamento de Despesas por Imóvel

```
Imóvel A (Centro de Custo ID: 1) → Contas de Despesa
  ├─ Condomínio (Conta 6.1.01)
  ├─ Água (Conta 6.1.02)
  └─ Energia (Conta 6.1.03)

Imóvel B (Centro de Custo ID: 2) → Mesmas contas
```

---

## Boas Práticas

### Contas Pessoais

1. **Revise movimentos mensalmente** - Use `relatorioMovimentosConta()` para reconciliar com extratos
2. **Monitore índice de poupança** - Extraído de `relatorioDepositosSaques()`
3. **Consolide patrimônio** - Use `relatorioSaldoPorPessoa()` para IR anual
4. **Acompanhe aportes** - Use `relatorioAportesVersusResgates()` para planejamento de investimentos

### Imóvel-Gestão

1. **ROI é métrica chave** - Imóveis com ROI < 5% ao ano devem ser avaliados para venda
2. **Provisões previnem crises** - Mantenha provisões no intervalo 20-40%
3. **Fluxo de caixa positivo** - Identifique imóveis com fluxo negativo rapidamente
4. **Rebalancear portfolio** - Venda baixa performance, reinvista em alta performance

---

## Troubleshooting

### Problema: Saldos não baterão

**Causa:** Movimentos não registrados ou período incorreto

**Solução:** Verifique:
- Data dos movimentos vs período
- Movimentos deletados não estão sendo considerados
- Contas inativas estão incluídas?

### Problema: ROI negativo

**Causa:** Despesas > Receitas ou imóvel vago

**Solução:**
- Revise despesas em `relatorioDespesasOperacionais()`
- Aumente aluguel ou encontre inquilino
- Considere vender se desempenho persistir

### Problema: Provisões excessivas

**Causa:** Cálculos baseados em receita histórica alta

**Solução:**
- Reduza alíquotas de provisão em código se histórico mudou
- Distribua provisões anteriores antes de acumular mais

---

## Versão

- **Data**: 2026-09-16
- **Versão**: 1.0
- **Status**: Production-Ready
