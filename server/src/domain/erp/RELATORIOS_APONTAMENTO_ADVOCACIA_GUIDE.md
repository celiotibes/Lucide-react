# Guia de Relatórios: Apontamento e Advocacia

## Introdução

Este documento apresenta os **8 relatórios especializados** para os módulos de **Apontamento (Prestador)** e **Advocacia (Serviços Legais)**, construídos usando o padrão **RelatorioBuilder** para máxima reusabilidade e consistência.

### Padrão RelatorioBuilder

O padrão oferece:

- **Metadados consistentes**: Título, data de geração, período, origem de módulo, filtros
- **Métodos encadeados**: Construção fluente
- **Formatação integrada**: Moeda (BRL), percentuais, datas
- **Validação**: Verificação de `origem_modulo` para auditoria

```typescript
// Exemplo de uso
const builder = new RelatorioBuilder("Resumo Apontamentos", "apontamento-prestador");
const relatorio = builder
  .adicionar("dados", {...})
  .comPeriodo("01/2024")
  .comFiltros({ status: "ativo" })
  .obter();

console.log(relatorio.metadados.origem_modulo); // "apontamento-prestador"
console.log(builder.formatarMoeda(1234.56));     // "R$ 1.234,56"
```

---

## Módulo Apontamento (6 Relatórios)

### 1. Relatório Resumo de Apontamentos

**Descrição**: Agregação consolidada de todos os apontamentos por tipo e prestador, mostrando produtividade geral.

**Arquivo**: `relatorios-apontamento.ts` > `relatorioResumoApontamentos()`

**Tipo de Retorno**: `ResumoApontamentos`

**Estrutura**:

```typescript
{
  periodo_inicio: string;           // Data inicial do período
  periodo_fim: string;              // Data final do período
  prestadores_ativos: number;       // Quantidade de prestadores com apontamentos
  total_apontamentos: number;       // Total de registros de apontamento
  valor_total_pago: number;         // Somatório de todos os pagamentos (BRL)
  
  por_tipo: {
    urgencias: {
      quantidade: number;           // Número de urgências registradas
      valor: number;                // Valor total (BRL)
      valor_medio: number;          // Valor médio por urgência (BRL)
    };
    airbnb: {
      quantidade: number;
      valor: number;
      valor_medio: number;
    };
    combustivel: {
      quantidade: number;
      valor: number;
      km_total: number;             // Quilometragem total
      km_medio: number;             // Quilometragem média
    };
    horas: {
      quantidade: number;
      valor: number;
      horas_total: number;          // Horas totais trabalhadas
      horas_media: number;
    };
    emprestimo: {
      quantidade: number;           // Número de parcelas
      valor_devido: number;         // Saldo devedor
      valor_pago: number;           // Já pago
    };
  };
  
  prestadores: Array<{
    prestador_id: number;
    nome: string;
    total_apontamentos: number;
    valor_total: number;
    ultimos_30_dias: number;
  }>;
}
```

**Uso**: Análise de produtividade geral, benchmark entre períodos, identificação de sazonalidade.

**Integração DRE**: Os valores em `valor_total_pago` são distribuídos nas contas de receita (5.x) como:
- Receita de Urgências (5.1.xx)
- Receita de Airbnb (5.1.xx)
- Receita de Horas (5.1.xx)
- Deduções de Combustível (6.x)

---

### 2. Relatório Despesas de Remuneração Detalhado

**Descrição**: Análise linha-por-linha de cada componente de remuneração, mostrando distribuição de custos.

**Arquivo**: `relatorios-apontamento.ts` > `relatorioDespesasRemuneracao()`

**Tipo de Retorno**: `DespesasRemuneracao`

**Estrutura**:

```typescript
{
  periodo: string;                   // MM/YYYY
  total_geral: number;               // Soma de todos os tipos
  
  distribuicao: {
    urgencias: {
      valor: number;                 // Valor total
      percentual: number;            // 0.00-1.00
      detalhamento: Array<{
        data: string;
        valor: number;
        duracao_minutos: number;
        eh_domingo: boolean;
        descricao: string;
      }>;
    };
    // ... airbnb, combustivel, horas, emprestimo (estrutura similar)
  };
}
```

**Exemplo de Saída**:

```json
{
  "periodo": "01/2024",
  "total_geral": 15500.00,
  "distribuicao": {
    "urgencias": {
      "valor": 4500.00,
      "percentual": 0.29,
      "detalhamento": [
        {
          "data": "2024-01-05",
          "valor": 150.00,
          "duracao_minutos": 45,
          "eh_domingo": false,
          "descricao": "Urgência elétrica"
        }
      ]
    },
    "airbnb": {
      "valor": 3200.00,
      "percentual": 0.21,
      "detalhamento": [...]
    },
    "combustivel": {
      "valor": 1800.00,
      "percentual": 0.12,
      "detalhamento": [...]
    },
    "horas": {
      "valor": 4000.00,
      "percentual": 0.26,
      "detalhamento": [...]
    },
    "emprestimo": {
      "valor": 2000.00,
      "percentual": 0.13,
      "detalhamento": [...]
    }
  }
}
```

**Uso**: Análise de custos por linha, auditoria de despesas, verificação de conformidade com política de gastos.

**Integração DRE**: Componente importante para cálculo do custo de pessoal (conta 6.x).

---

### 3. Relatório Reembolsos com Controle de Aprovação

**Descrição**: Rastreamento de solicitações de reembolso com status (pendente, aprovado, rejeitado).

**Arquivo**: `relatorios-apontamento.ts` > `relatorioReembolsos()`

**Tipo de Retorno**: `Reembolsos`

**Estrutura**:

```typescript
{
  periodo: string;
  total_solicitado: number;          // Soma de tudo solicitado
  total_aprovado: number;            // Aprovado e pago
  total_rejeitado: number;           // Rejeitado e não pago
  pendente_aprovacao: number;        // Aguardando decisão
  
  linhas: Array<{
    id: number;
    data_solicitacao: string;
    tipo_despesa: string;            // ex: "combustível extra", "ferramentas"
    valor_solicitado: number;
    valor_aprovado: number;
    status: "pendente" | "aprovado" | "rejeitado";
    justificativa?: string;
    observacoes?: string;
    prestador_nome: string;
  }>;
}
```

**KPIs**:

- **Taxa de Aprovação**: `total_aprovado / total_solicitado`
- **Tempo Médio de Processamento**: (data de aprovação - data de solicitação)
- **Valor Médio Rejeitado**: `total_rejeitado / linhas.filter(l => l.status === 'rejeitado').length`

**Uso**: Controle de cash flow, auditoria de políticas de reembolso, identificação de solicitantes recorrentes.

**Integração DRE**: Reembolsos aprovados transitam para conta de deduções (7.x) ou contas a pagar (3.x).

---

### 4. Relatório Comparativo entre Provedores

**Descrição**: Matriz de comparação pessoa-vs-pessoa usando scores de produtividade e compliance.

**Arquivo**: `relatorios-apontamento.ts` > `relatorioComparativoProvedor()`

**Tipo de Retorno**: `ComparativoProvedor`

**Estrutura**:

```typescript
{
  periodo: string;                   // MM/YYYY
  
  prestadores: Array<{
    prestador_id: number;
    nome: string;
    total_apontamentos: number;      // Quantidade de registros
    total_pago: number;              // Valor total remunerado
    valor_medio_apontamento: number; // total_pago / total_apontamentos
    produtividade_score: number;     // 0-100, (apts/50)*100
    
    tipos_servicos: {
      urgencias: number;
      airbnb: number;
      combustivel: number;
      horas: number;
      emprestimo: number;
    };
    
    compliance_score: number;        // 0-100, baseado em rejeições
    taxa_aprovacao: number;          // 0-100%
  }>;
  
  agregados: {
    prestador_mais_ativo: { nome: string; total: number };
    prestador_mais_produtivo: { nome: string; valor_medio: number };
    prestador_maior_taxa_rejeicao: { nome: string; taxa: number };
  };
}
```

**Exemplo de Saída**:

```json
{
  "periodo": "01/2024",
  "prestadores": [
    {
      "prestador_id": 1,
      "nome": "João Silva",
      "total_apontamentos": 45,
      "total_pago": 4500.00,
      "valor_medio_apontamento": 100.00,
      "produtividade_score": 90,
      "compliance_score": 95,
      "taxa_aprovacao": 98,
      "tipos_servicos": { "urgencias": 20, "airbnb": 15, ... }
    }
  ],
  "agregados": {
    "prestador_mais_ativo": { "nome": "João Silva", "total": 45 },
    "prestador_mais_produtivo": { "nome": "Maria Costa", "valor_medio": 120.00 },
    "prestador_maior_taxa_rejeicao": { "nome": "Pedro Oliveira", "taxa": 5.2 }
  }
}
```

**Uso**: Gestão de desempenho, identificação de best practices, suporte a decisões de contratação/desligamento.

**Integração Ledger**: Permite análise de origem_modulo = "apontamento-prestador" para cada prestador.

---

### 5. Relatório Acúmulo IPCA

**Descrição**: Rastreamento de reajustes aplicados por IPCA com cálculo de economia/excesso.

**Arquivo**: `relatorios-apontamento.ts` > `relatorioAcumuloIPCA()`

**Tipo de Retorno**: `AcumuloIPCA`

**Estrutura**:

```typescript
{
  periodo_inicio: string;
  periodo_fim: string;
  
  itens: Array<{
    id: number;
    prestador_nome: string;
    tipo_item: "valor_hora" | "valor_combustivel" | "valor_urgencia";
    valor_anterior: number;
    indice_ipca: number;             // ex: 3.75 (%)
    percentual_acumulado: number;    // (valor_novo - valor_anterior) / valor_anterior
    valor_novo: number;
    economia: number;                // valor_novo - (valor_anterior * (1 + IPCA))
    data_reajuste: string;
  }>;
  
  resumo: {
    total_itens_reajustados: number;
    total_reajuste: number;          // Valor total de ajustes (novo - anterior)
    indice_medio_ipca: number;       // Média ponderada de índices aplicados
    valor_economia_total: number;    // Soma de economias (se negativo = gasto extra)
  };
}
```

**Fórmula de Economia**:

```
economia = valor_novo - (valor_anterior * (1 + indice_ipca / 100))
```

- **economia > 0**: Negociação favorável (abaixo do IPCA)
- **economia < 0**: Reajuste acima do IPCA

**Exemplo**:

```
valor_anterior:    100.00
indice_ipca:       3.75%
reajuste_esperado: 103.75
valor_novo:        103.00  (negociado)
economia:          0.75    (economia favorável)
```

**Uso**: Auditoria de conformidade com índices de mercado, análise de poder de negociação.

**Integração DRE**: Diretamente na conta de Receita (5.1.xx) - reajustes são reconhecidos como variação cambial ou ajuste de receita.

---

### 6. Relatório Provisão de Impostos

**Descrição**: Cálculo de estimativa de IRPJ, PIS e COFINS por prestador.

**Arquivo**: `relatorios-apontamento.ts` > `relatorioProvisaoImposto()`

**Tipo de Retorno**: `ProvisaoImposto`

**Estrutura**:

```typescript
{
  periodo: string;                   // MM/YYYY
  
  prestadores: Array<{
    prestador_id: number;
    nome: string;
    faturamento_bruto: number;       // Todos os apontamentos
    deducoes_permitidas: number;     // ~15% (simplificado)
    base_tributavel: number;         // Faturamento - Deduções
    aliquota_efetiva: number;        // 0-1 (provisão / base_tributavel)
    imposto_estimado: number;        // IRPJ + PIS + COFINS
    provisao_irpj: number;           // 15% de base_tributavel
    provisao_pis: number;            // 1.65% de base_tributavel
    provisao_cofins: number;         // 7.6% de base_tributavel
    provisao_total: number;          // Soma dos três
  }>;
  
  totalizadores: {
    faturamento_bruto_total: number;
    deducoes_total: number;
    base_tributavel_total: number;
    provisao_irpj_total: number;
    provisao_pis_total: number;
    provisao_cofins_total: number;
    provisao_total_geral: number;
  };
}
```

**Alíquotas Padrão**:

- IRPJ: 15% (simplificado, MEI/PJ typical)
- PIS: 1.65%
- COFINS: 7.6%
- **Total Aproximado**: 24.25% sobre base tributável

**Deduções Permitidas**: ~15% (combustível, reembolsos autorizados, etc.)

**Exemplo**:

```
Prestador: João Silva
Faturamento Bruto:    R$ 10.000,00
Deduções (15%):       R$ 1.500,00
Base Tributável:      R$ 8.500,00
Provisão IRPJ (15%):  R$ 1.275,00
Provisão PIS (1.65%): R$ 140,25
Provisão COFINS (7.6%): R$ 646,00
Provisão Total:       R$ 2.061,25
Alíquota Efetiva:     24.25%
```

**Uso**: Planejamento tributário, conformidade com obrigações fiscais, simulação de fluxo de caixa.

**Integração Balanço**: Provisão reconhecida em conta de Passivo (3.x) - Obrigações Tributárias (3.1.03).

---

## Módulo Advocacia (6 Relatórios)

### 1. Relatório Processos Ativos

**Descrição**: Análise detalhada de casos ativos agrupados por status e nível de risco.

**Arquivo**: `relatorios-advocacia.ts` > `relatorioProcessosAtivos()`

**Tipo de Retorno**: `ProcessosAtivos`

**Estrutura**:

```typescript
{
  total_processos_ativos: number;
  valor_total_envolvido: number;     // Soma de valores_causa
  valor_total_estimado: number;      // Soma de estimativas_despesa
  valor_despesas_realizadas: number; // Total pago até agora
  
  por_status: Record<string, number>;
  // ex: { "ativo": 5, "em_recurso": 2, "suspenso": 1 }
  
  por_risco: Record<string, {
    quantidade_processos: number;
    valor_envolvido: number;
    aliquota_provisao: number;       // 25%, 50%, 75%, ou 100%
    provisao_recomendada: number;    // valor * aliquota
  }>;
  
  processos_listados: Array<{
    id: number;
    numero_processo: string;
    tipo: string;
    descricao: string;
    data_ajuizamento: string;
    status: string;
    foro: string;
    valor_causa: number;
    estimativa_despesa: number;
    despesas_realizadas: number;
    risco: string;
    risco_score: number;             // 0-100
    advocados: string[];
    proximos_prazos: string[];
  }>;
  
  alertas: Array<{
    tipo: string;                    // "alto_risco", "perto_vencimento"
    quantidade: number;
    descricao: string;
  }>;
}
```

**Mapeamento de Risco para Score**:

| Risco    | Score | Provisão |
|----------|-------|----------|
| Baixo    | 25    | 25%      |
| Médio    | 50    | 50%      |
| Alto     | 75    | 75%      |
| Crítico  | 100   | 100%     |

**Uso**: Gestão de carteira de processos, identificação de riscos, planejamento de caixa.

**Integração Balanço**: Provisões de risco são reconhecidas em Passivo (3.x) - Provisões para Riscos Trabalhistas/Cíveis.

---

### 2. Relatório Despesas Legais

**Descrição**: Análise de todas as despesas incorridas com processos, agregadas por tipo e advogado.

**Arquivo**: `relatorios-advocacia.ts` > `relatorioDespesasLegais()`

**Tipo de Retorno**: `DespesasLegais`

**Estrutura**:

```typescript
{
  periodo: string;                   // MM/YYYY
  total_geral: number;
  total_pago: number;                // Já pago
  total_pendente: number;            // Ainda a pagar
  
  por_tipo: Record<string, {
    valor: number;
    percentual: number;              // 0-1
    quantidade: number;
    valor_medio: number;
  }>;
  // ex: "honorarios_advocaticios", "custas_judiciais", "pericia", "outro"
  
  por_advogado: Record<string, {
    valor: number;
    percentual: number;
    quantidade_processos: number;
  }>;
  
  despesas_listadas: Array<{
    id: number;
    data_lancamento: string;
    tipo_despesa: string;
    descricao: string;
    processo_numero: string;
    valor: number;
    beneficiario: string;
    status_pagamento: string;
    referencia_documento: string;
  }>;
  
  evolucao_mensal: Array<{
    mes: string;                     // YYYY-MM
    valor: number;
    quantidade: number;
  }>;
}
```

**Exemplo de Saída**:

```json
{
  "periodo": "01/2024",
  "total_geral": 25000.00,
  "total_pago": 25000.00,
  "total_pendente": 0.00,
  "por_tipo": {
    "honorarios_advocaticios": {
      "valor": 15000.00,
      "percentual": 0.60,
      "quantidade": 8,
      "valor_medio": 1875.00
    },
    "custas_judiciais": {
      "valor": 7500.00,
      "percentual": 0.30,
      "quantidade": 15,
      "valor_medio": 500.00
    },
    "pericia": {
      "valor": 2500.00,
      "percentual": 0.10,
      "quantidade": 1,
      "valor_medio": 2500.00
    }
  },
  "por_advogado": {
    "Dr. Carlos Silva": {
      "valor": 12000.00,
      "percentual": 0.48,
      "quantidade_processos": 5
    },
    "Dra. Ana Costa": {
      "valor": 13000.00,
      "percentual": 0.52,
      "quantidade_processos": 4
    }
  }
}
```

**Uso**: Auditoria de gastos legais, análise de custo-benefício por advogado, planejamento de orçamento.

**Integração DRE**: Despesas legais são registradas como Despesa Operacional (6.3.xx) - Despesas com Serviços Terceirizados/Legais.

---

### 3. Relatório Provisões de Risco

**Descrição**: Cálculo de provisão exigida por lei (com alíquotas 25%-75%-100% por nível de risco).

**Arquivo**: `relatorios-advocacia.ts` > `relatorioProvisoesRisco()`

**Tipo de Retorno**: `ProvisaoRisco`

**Estrutura**:

```typescript
{
  risco_baixo: {
    quantidade_processos: number;
    valor_envolvido: number;
    aliquota_provisao: number;       // 0.25
    provisao: number;                // valor * aliquota
  };
  
  risco_medio: {
    quantidade_processos: number;
    valor_envolvido: number;
    aliquota_provisao: number;       // 0.50
    provisao: number;
  };
  
  risco_alto: {
    quantidade_processos: number;
    valor_envolvido: number;
    aliquota_provisao: number;       // 0.75
    provisao: number;
  };
  
  risco_critico: {
    quantidade_processos: number;
    valor_envolvido: number;
    aliquota_provisao: number;       // 1.00
    provisao: number;
  };
  
  provisao_total: number;            // Soma de todas as provisões
  
  composicao_risco: Array<{
    risco: string;
    quantidade: number;
    percentual: number;              // 0-1
  }>;
}
```

**Fórmula LGPL**:

A Lei de Responsabilidade Fiscal exige provisão conforme:

- **Risco Remoto**: 25% do valor da causa (ou não provisionar)
- **Risco Possível**: 50-75% do valor da causa
- **Risco Provável**: 100% do valor da causa

**Exemplo**:

```
Processo: Cobrança de Aluguel
Valor da Causa: R$ 50.000,00
Risco Avaliado: Médio
Provisão: 50% × R$ 50.000 = R$ 25.000,00

Processo: Ação Trabalhista
Valor da Causa: R$ 100.000,00
Risco Avaliado: Crítico
Provisão: 100% × R$ 100.000 = R$ 100.000,00

TOTAL PROVISÃO: R$ 125.000,00
```

**Uso**: Conformidade contábil, DRE e Balanço, análise de risco patrimonial.

**Integração Balanço**: Reconhecido em Passivo Circulante (3.1.04) - Provisão para Processos Judiciais.

---

### 4. Relatório Advogados Comparativos

**Descrição**: Matriz de comparação de performance entre advogados usando taxa de vitória e eficiência.

**Arquivo**: `relatorios-advocacia.ts` > `relatorioAdvogadosComparativos()`

**Tipo de Retorno**: `AdvogadosComparativos`

**Estrutura**:

```typescript
{
  periodo: string;                   // MM/YYYY
  total_advogados: number;
  total_processos: number;
  total_despesas: number;
  
  advogados: Array<{
    id: number;
    nome: string;
    especialidade: string;
    processos_ativos: number;
    processos_concluidos: number;
    taxa_vitoria: number;            // 0-100%
    despesas_totais: number;
    despesa_media_processo: number;
    taxa_reembolso: number;          // 0-100%
    score_eficiencia: number;        // 0-100
  }>;
  
  agregados: {
    advogado_mais_ativo: { nome: string; processos: number };
    advogado_mais_eficiente: { nome: string; score: number };
    advogado_maior_custo: { nome: string; valor: number };
  };
}
```

**Cálculo de Score Eficiência**:

```
score = min(100, (processos_ativos / 5) * 100)
```

**Exemplo**:

```json
{
  "advogados": [
    {
      "nome": "Dr. Carlos Silva",
      "processos_ativos": 8,
      "processos_concluidos": 12,
      "taxa_vitoria": 75,
      "despesas_totais": 24000.00,
      "despesa_media_processo": 3000.00,
      "score_eficiencia": 160 → capped at 100
    },
    {
      "nome": "Dra. Ana Costa",
      "processos_ativos": 5,
      "processos_concluidos": 8,
      "taxa_vitoria": 62,
      "despesas_totais": 18000.00,
      "despesa_media_processo": 2000.00,
      "score_eficiencia": 100
    }
  ],
  "agregados": {
    "advogado_mais_ativo": { "nome": "Dr. Carlos Silva", "processos": 8 },
    "advogado_mais_eficiente": { "nome": "Dra. Ana Costa", "score": 100 },
    "advogado_maior_custo": { "nome": "Dr. Carlos Silva", "valor": 24000.00 }
  }
}
```

**Uso**: Gestão de advogados, decisão de renovação de contratos, benchmarking de custos.

**Integração**: Dados alimentam análise de custo-benefício e ROI de cada advogado.

---

### 5. Relatório Previsão de Despesas

**Descrição**: Budget vs actual com projeção mês-a-mês e alertas de desvio.

**Arquivo**: `relatorios-advocacia.ts` > `relatorioPrevisaoDespesas()`

**Tipo de Retorno**: `PrevisaoDespesasLegais`

**Estrutura**:

```typescript
{
  periodo: string;
  orcamento_anual: number;           // Budget anual (ex: R$ 100.000)
  gasto_realizado: number;           // Já pago
  gasto_projetado: number;           // Realizado × 1.1 (projeção)
  saldo_disponivel: number;          // Orçamento - Realizado
  taxa_utilizacao: number;           // 0-1 (Realizado / Orçamento)
  processos_novos_esperados: number; // Estimativa de novos casos
  despesa_media_processo: number;
  
  projecao_mes_mes: Array<{
    mes: string;                     // MM/YYYY
    orcamento: number;               // Orçamento do mês
    gasto_realizado: number;
    gasto_projetado: number;
    variancia: number;               // Realizado - Orçamento
    percentual_utilizado: number;    // 0-2.0 (permite overshoot)
  }>;
  
  desvios: Array<{
    tipo: string;                    // "acima_orcamento", "processo_novo"
    impacto: number;
    descricao: string;
  }>;
}
```

**Exemplo**:

```json
{
  "periodo": "01/2024",
  "orcamento_anual": 120000.00,
  "gasto_realizado": 15000.00,
  "gasto_projetado": 16500.00,
  "saldo_disponivel": 105000.00,
  "taxa_utilizacao": 0.125,
  "projecao_mes_mes": [
    {
      "mes": "01/2024",
      "orcamento": 10000.00,
      "gasto_realizado": 15000.00,
      "gasto_projetado": 16500.00,
      "variancia": 5000.00,
      "percentual_utilizado": 1.5
    }
  ],
  "desvios": [
    {
      "tipo": "acima_orcamento",
      "impacto": 5000.00,
      "descricao": "Processo de cobrança com pericia extra"
    }
  ]
}
```

**KPIs**:

- **Taxa de Utilização**: Realizado / Orçamento (ideal: 80-90%)
- **Margem de Segurança**: (Orçamento - Realizado) / Orçamento
- **Projeção Anual**: Realizado × 12 meses (simplificado)

**Uso**: Planejamento de fluxo de caixa, controle orçamentário, antecipação de problemas de liquidez.

**Integração**: Informa previsão de contas a pagar (3.1.02) e despesas a reconhecer no DRE.

---

### 6. Relatório Auditoria de Processos

**Descrição**: Trilha de auditoria com histórico de eventos, documentos e valores.

**Arquivo**: `relatorios-advocacia.ts` > `relatorioAuditoriaProcessos()`

**Tipo de Retorno**: `AuditoriaProcessos`

**Estrutura**:

```typescript
{
  periodo: string;
  total_processos_auditados: number;
  conformidade_geral: number;        // 0-1 (95% = bom)
  
  processos: Array<{
    processo_id: number;
    numero_processo: string;
    tipo: string;
    status: string;
    
    trilha_auditoria: Array<{
      data_evento: string;
      tipo_evento: string;           // "criacao", "atualizacao", "despesa", "mudanca_status"
      usuario: string;
      descricao: string;
      documento_referencia?: string;
      valor_afetado?: number;
    }>;
    
    documentos_anexados: Array<{
      id: number;
      nome: string;
      data_upload: string;
      tipo_documento: string;        // "peça_processual", "sentença", "parecer"
      tamanho_bytes: number;
    }>;
    
    historico_valores: Array<{
      data: string;
      tipo_evento: string;
      valor_anterior: number;
      valor_novo: number;
    }>;
  }>;
  
  achados: Array<{
    tipo: string;                    // "documentacao_incompleta", "valores_inconsistentes"
    quantidade: number;
    processos_afetados: string[];    // Números dos processos
  }>;
  
  recomendacoes: string[];
}
```

**Exemplo de Trilha**:

```json
{
  "processo_id": 1,
  "numero_processo": "0001234-56.2023.8.26.0100",
  "trilha_auditoria": [
    {
      "data_evento": "2024-01-02T10:00:00Z",
      "tipo_evento": "criacao",
      "usuario": "Sistema",
      "descricao": "Processo criado no sistema"
    },
    {
      "data_evento": "2024-01-05T14:30:00Z",
      "tipo_evento": "despesa",
      "usuario": "Sistema",
      "descricao": "Lançamento de honorários advocaticios",
      "valor_afetado": 1500.00
    },
    {
      "data_evento": "2024-01-10T09:15:00Z",
      "tipo_evento": "mudanca_status",
      "usuario": "Dr. Carlos",
      "descricao": "Status alterado: ativo → em recurso"
    }
  ]
}
```

**Conformidade**:

- ✓ Todos os valores têm referência a documento
- ✓ Trilha completa sem lacunas
- ✓ Documentos digitalizados e anexados
- ✓ Datas consistentes

**Uso**: Conformidade regulatória (SOX, ISO 27001), investigação de anomalias, reprodução de histórico para auditoria externa.

**Integração**: Suporta auditoria de ledger_entries com origem_modulo = "advocacia".

---

## Integração com DRE e Balanço

### Fluxo de Apontamento → DRE

```
Apontamento Prestador
    ↓
relatorioResumoApontamentos()
    ↓
[Distribuição por Tipo]
    ↓
RECEITAS (conta 5.x):
  - 5.1.01: Receita Urgência
  - 5.1.02: Receita Airbnb
  - 5.1.03: Receita Horas
    ↓
CUSTOS (conta 6.x):
  - 6.1.08: Combustível (dedução)
  - 6.3.xx: Juros s/ Empréstimo (despesa)
    ↓
DRE (Demonstração de Resultado do Exercício)
```

### Fluxo de Advocacia → Balanço

```
Processo Legal
    ↓
relatorioProvisoesRisco()
    ↓
[Alíquota 25-75-100% conforme risco]
    ↓
BALANÇO PATRIMONIAL
  PASSIVO (3.x):
    - 3.1.04: Provisão para Processos Judiciais
    - 3.1.02: Contas a Pagar - Despesas Legais
    
    ↓
DRE (Despesa Reconhecida):
  - 6.3.xx: Despesas com Serviços Legais
  - 6.4.01: Provisão para Riscos Judiciais
```

### Consolidação Ledger

Ambos os módulos registram transações com origem_modulo específica:

```sql
-- Exemplo
INSERT INTO ledger_entries (
  entidade_id, periodo_id, conta_id, valor_credito,
  origem_modulo, origem_id, descricao, referencia_documento
) VALUES (
  1, 1, 501, 1500.00,
  'apontamento-prestador', 123, 'Urgência registrada', 'AP-123-2024'
);

-- Ou
INSERT INTO ledger_entries (
  entidade_id, periodo_id, conta_id, valor_debito,
  origem_modulo, origem_id, descricao, referencia_documento
) VALUES (
  1, 1, 631, 2000.00,
  'advocacia', 45, 'Despesa legal - honorários', 'PR-45-2024'
);
```

Permitindo análise de rentabilidade e custo por módulo:

```typescript
// Filtrar apenas apontamento
const lantamentosApontamento = obterLancamentosParModulo(
  db, entidade_id, periodo_id, 'apontamento-prestador'
);

// Filtrar apenas advocacia
const lancamentosAdvocacia = obterLancamentosParModulo(
  db, entidade_id, periodo_id, 'advocacia'
);
```

---

## Uso Prático

### Exemplo 1: Análise Gerencial Mensal

```typescript
// Executar todos os relatórios do mês
const resumoApontamento = relatorioResumoApontamentos(db, entidade_id, 1);
const despesasApontamento = relatorioDespesasRemuneracao(db, entidade_id, 1);
const comparativoProvedor = relatorioComparativoProvedor(db, entidade_id, 1);

const processosAtivos = relatorioProcessosAtivos(db, entidade_id, 1);
const despesasLegais = relatorioDespesasLegais(db, entidade_id, 1);
const provisoes = relatorioProvisoesRisco(db, entidade_id, 1);

// Exportar para PDF/Excel com formatação
relatorios.forEach(rel => {
  console.log(`\n=== ${rel.metadados.titulo} ===`);
  console.log(`Período: ${rel.metadados.periodo}`);
  console.log(`Módulo: ${rel.metadados.origem_modulo}`);
  // ... formatação e exportação
});
```

### Exemplo 2: Análise de Risco Patrimonial

```typescript
// Somar provisões de todos os processos
const riscos = relatorioProvisoesRisco(db, entidade_id, periodo_id);
const provisaoTotal = riscos.provisao_total;

// Comparar com patrimônio líquido
const balanco = gerarBalanco(db, entidade_id, periodo_id);
const patrimonioLiquido = balanco.patrimonio_liquido;

const ratioRisco = provisaoTotal / patrimonioLiquido;
console.log(`Provisões representam ${(ratioRisco * 100).toFixed(2)}% do PL`);
```

### Exemplo 3: Relatório Executivo

```typescript
// Consolidar métricas principais
const metricas = {
  apontamento: {
    total_pago: relatorioResumoApontamentos(db, entidade_id, periodo_id).valor_total_pago,
    maior_produtor: relatorioComparativoProvedor(db, entidade_id, periodo_id).agregados.prestador_mais_ativo.nome,
    taxa_rejeicao: 0.02, // 2%
  },
  advocacia: {
    processos_ativos: relatorioProcessosAtivos(db, entidade_id, periodo_id).total_processos_ativos,
    valor_envolvido: relatorioProcessosAtivos(db, entidade_id, periodo_id).valor_total_envolvido,
    provisao_recomendada: relatorioProvisoesRisco(db, entidade_id, periodo_id).provisao_total,
    utilizado_orcamento: relatorioPrevisaoDespesas(db, entidade_id, periodo_id).taxa_utilizacao,
  },
};
```

---

## Notas de Implementação

- **Período Fechado**: Verificar com `ledger-period-validation` antes de usar
- **Origem Módulo**: Sempre validar que `origem_modulo` está em enum `OrigemModulo`
- **Precisão**: Usar `Math.abs(a - b) < 0.01` para comparações de moeda
- **Formatação**: Aplicar formatadores (BRL, %, datas) no front-end para internacionalização
- **Cache**: Considerar cache de 5-15 min para relatórios de leitura

---

## Referências

- Ledger: `src/domain/erp/ledger.ts`
- Período: `src/domain/erp/ledger-period-validation.ts`
- Relatórios Integrados: `src/domain/erp/relatorios-integrados.ts`
- Testes: `src/domain/erp/__tests__/relatorios-apontamento-advocacia.test.ts`
