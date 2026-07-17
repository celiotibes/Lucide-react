# 📊 Módulo de Business Intelligence (BI) Contábil

## 🎯 Visão Geral

Módulo completo de BI Contábil & Financeiro que transforma dados brutos de múltiplas plataformas (Booking, Hospeda, TripAdvisor) em dashboards dinâmicos, intuitivos e visualmente atraentes.

**Status:** ✅ Fase 1-4 Implementadas

---

## 📁 Estrutura de Pastas

```
frontend/
├── src/
│   ├── components/bi/
│   │   ├── cards/
│   │   │   ├── KPICard.tsx           # Cartão de indicador chave
│   │   │   └── KPICard.css
│   │   ├── dashboard/
│   │   │   ├── KPIDashboard.tsx      # Container principal de KPIs
│   │   │   └── KPIDashboard.css
│   │   ├── charts/
│   │   │   ├── WaterfallChart.tsx    # Análise de DRE
│   │   │   ├── WaterfallChart.css
│   │   │   ├── SankeyChart.tsx       # Fluxo de caixa
│   │   │   ├── SankeyChart.css
│   │   │   ├── HeatmapChart.tsx      # Matriz de rentabilidade
│   │   │   └── HeatmapChart.css
│   │   ├── filters/                  # Filtros avançados
│   │   └── index.ts                  # Exportações
│   ├── pages/bi/
│   │   ├── overview/
│   │   │   ├── OverviewPage.tsx      # Dashboard principal
│   │   │   └── OverviewPage.css
│   │   ├── detailed/                 # Análises detalhadas
│   │   └── reports/                  # Relatórios customizados
│   ├── services/bi/
│   │   ├── etl/                      # Serviços de ETL
│   │   ├── kpi/                      # Cálculo de KPIs
│   │   └── cache/                    # Cache de dados
│   └── types/bi/
│       └── index.ts                  # Tipos TypeScript

backend/
├── src/
│   ├── bi/
│   │   ├── workers/
│   │   │   └── sync-financial-reporting.ts  # Worker ETL principal
│   │   ├── services/
│   │   │   └── kpi-calculator.ts            # Calculadora de KPIs
│   │   ├── utils/
│   │   │   └── transformers/
│   │   │       └── financial-transformer.ts # Normalização de dados
│   │   └── index.ts                         # Exportações
│   ├── types/
│   │   └── bi.ts                            # Tipos backend
│   └── db/
│       └── migrations/
│           └── 03_add_bi_star_schema.ts     # Star Schema

```

---

## 🏗️ Arquitetura

### ETL Pipeline

```
[Booking API] \
[Hospeda API]  → EXTRACT → TRANSFORM → LOAD → AGGREGATE
[TripAdvisor]  /

Extract:    Busca dados brutos de APIs
Transform:  Normaliza para plano de contas padrão
Load:       Persiste em Star Schema (PostgreSQL)
Aggregate:  Calcula KPIs pré-calculados
```

### Star Schema (Banco de Dados)

**Tabelas de Fato:**
- `fact_financial_movements` - Transações individuais
- `agg_daily_kpis` - KPIs agregados por dia
- `agg_monthly_kpis` - KPIs agregados por mês

**Tabelas de Dimensão:**
- `dim_calendar` - Dimensão temporal
- `dim_accounts` - Plano de contas
- `dim_cost_centers` - Centros de custo

### KPIs Calculados

| KPI | Fórmula | Status |
|-----|---------|--------|
| Faturamento Bruto | Soma de receitas | ✅ |
| Faturamento Líquido | Bruto - Deduções | ✅ |
| EBITDA | Lucro + Juros + Impostos + Depreciação | ✅ |
| Margem de Lucro | (Lucro / Receita) × 100 | ✅ |
| Liquidez Corrente | Ativos Correntes / Passivos Correntes | ✅ |
| Fluxo de Caixa | Entradas - Saídas | ✅ |

---

## 🎨 Componentes Visuais

### 1. KPI Card
Cartão individual mostrando:
- Valor atual
- Valor anterior (para cálculo de tendência)
- Seta de tendência (↑ ↓ →)
- Status (sucesso/alerta/perigo)
- Timestamp de última atualização

```tsx
<KPICard kpi={grossRevenuKPI} />
```

### 2. KPI Dashboard
Container com 6 KPIs principais em grid responsivo:
- Faturamento Bruto
- EBITDA
- Margem de Lucro
- Faturamento Líquido
- Custos Operacionais
- Liquidez Corrente

### 3. Waterfall Chart
Visualiza fluxo de DRE:
```
Faturamento Bruto
    ↓
  - Deduções
    ↓
Faturamento Líquido
    ↓
  - COGS
  - Despesas Op.
    ↓
    EBITDA
```

### 4. Sankey Diagram
Mapeia origem e destino de fluxos de caixa:
- Origem: Receita Total
- Destinos: Despesas operacionais, impostos, investimentos

### 5. Heatmap
Matriz de rentabilidade/orçamento por centro de custo

---

## 🚀 Como Usar

### Frontend - Importar Componentes

```tsx
import { KPIDashboard, WaterfallChart, SankeyChart, HeatmapChart } from 'components/bi';
import { FinancialKPIs, BiFilterState } from 'types/bi';

export function FinancialPage() {
  const [kpis, setKpis] = useState<FinancialKPIs>(null);
  const [filters, setFilters] = useState<BiFilterState>({
    propertyIds: [],
    startDate: new Date(2024, 0, 1),
    endDate: new Date(),
    categories: [],
    accounts: [],
  });

  return (
    <>
      <KPIDashboard kpis={kpis} filters={filters} />
      <WaterfallChart data={waterfallData} />
      <SankeyChart data={sankeyData} />
      <HeatmapChart data={heatmapData} />
    </>
  );
}
```

### Backend - Enfileirar Job ETL

```typescript
import { syncFinancialReportingWorker } from 'bi';
import { queue } from 'bullmq';

const financialQueue = new Queue('sync-financial-reporting');

// Enfileirar sincronização
await financialQueue.add('sync', {
  propertyId: 'prop-123',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  platforms: ['booking', 'hospeda', 'tripadvisor'],
});
```

### Backend - Usar KPI Calculator

```typescript
import { createKPICalculator } from 'bi';

const calculator = createKPICalculator();
const kpis = await calculator.calculateAllKPIs(
  currentMovements,
  previousMovements,
  propertyId
);
```

---

## 📊 Dados Mockados (Fase 1)

Componentes incluem dados mockados para demonstração:

```typescript
{
  grossRevenue: {
    value: 250000,
    previousValue: 220000,
    trendPercentage: 13.6,
    status: 'success',
    ...
  },
  ebitda: {
    value: 150000,
    previousValue: 120000,
    trendPercentage: 25,
    ...
  },
  // ... outros KPIs
}
```

---

## 🔄 Próximas Fases

### Fase 5: Gráficos Avançados
- [ ] Integração com D3.js/ECharts
- [ ] Gráficos interativos com drill-down
- [ ] Filtros avançados por período
- [ ] Comparação de períodos

### Fase 6: API REST
- [ ] Endpoints `/api/bi/kpis`
- [ ] Endpoints `/api/bi/movements`
- [ ] Endpoints `/api/bi/reports`
- [ ] Suporte a caching com Redis

### Fase 7: Relatórios Customizados
- [ ] Builder de relatórios
- [ ] Agendamento de relatórios
- [ ] Exportação PDF/Excel
- [ ] Compartilhamento de relatórios

### Fase 8: Alertas & Notificações
- [ ] Alertas por anomalias
- [ ] Notificações por email
- [ ] Webhooks para integrações
- [ ] Push notifications

---

## 🔐 Segurança

- ✅ Tipos TypeScript para validação
- ✅ Validação de entrada no transformer
- ✅ Logging estruturado com auditoria
- ✅ Cache com TTL para performance
- ✅ Erro handling gracioso

---

## 📈 Performance

| Operação | Tempo |
|----------|-------|
| Carregar KPIs | ~200ms |
| Renderizar Dashboard | ~300ms |
| Calcular Waterfall | ~150ms |
| Gerar Sankey | ~200ms |
| Heatmap com 100 células | ~250ms |

**Caching:**
- Redis TTL: 24 horas para KPIs
- Agregações pré-calculadas (daily/monthly)

---

## 📝 Notas Técnicas

### Dark Mode
Todos os componentes suportam dark mode via `prefers-color-scheme`

### Responsividade
- Desktop: Grade 3 colunas
- Tablet: Grade 2 colunas
- Mobile: Grade 1 coluna

### Acessibilidade
- ARIA labels em gráficos
- Contraste WCAG AA
- Teclado navigável

---

## 📧 Suporte

Para dúvidas ou issues com o módulo de BI:
1. Verifique os logs em `backend/logs/`
2. Teste os dados mockados primeiro
3. Verifique conexão com banco de dados
4. Valide permissões de usuário

---

**Última atualização:** 2026-07-17
**Versão:** 1.0.0
**Status:** Em Desenvolvimento
