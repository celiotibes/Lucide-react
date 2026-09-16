# Phase 5: Executive Dashboard & Real-time Analytics - Complete Guide

## Overview

Phase 5 implements a comprehensive executive dashboard layer on top of the fully-integrated ERP system (Phases 1-4). This layer provides real-time KPIs, advanced visualizations, business intelligence, and monitoring capabilities for strategic decision-making.

**Total Implementation:**
- 8 Core Modules: 3,650+ lines of production code
- Comprehensive Test Suite: 200+ test cases
- Database Schema: 8 new tables with optimized indices
- WebSocket Integration: Real-time live updates
- Multi-tenant Support: Row-level security for data access

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  EXECUTIVE DASHBOARD LAYER                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ KPI Engine   │  │ Dashboard    │  │ Analytics &  │       │
│  │ Realtime     │  │ Layout       │  │ Visualization│       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Business     │  │ Alerts &     │  │ Report       │       │
│  │ Intelligence │  │ Notifications│  │ Scheduler    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  ┌──────────────┐  ┌──────────────────────────────────┐     │
│  │ User Audit   │  │ Performance Monitoring            │     │
│  └──────────────┘  └──────────────────────────────────┘     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│         PHASES 1-4: Core ERP (Payroll, Apontamento, etc)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Module 1: Real-time KPI Engine

**File:** `kpi-engine-realtime.ts`  
**Lines:** 650+  
**Tests:** 35+

### Purpose
Live KPI calculations with 5-second refresh intervals for executive dashboards. Continuously monitors key business metrics and detects anomalies.

### Key Features

#### Core KPIs
1. **Margem Lucro** (Profit Margin %)
   - Formula: (Lucro Líquido / Receita) × 100
   - Status: Healthy when > 15%

2. **ROI** (Return on Investment %)
   - Formula: (Lucro Líquido / Ativo Total) × 100
   - Status: Healthy when > 8%

3. **Liquidez Corrente** (Current Ratio)
   - Formula: Ativo Circulante / Passivo Circulante
   - Status: Healthy when > 1.5

4. **Solvabilidade** (Solvency Ratio)
   - Formula: Ativo Total / Passivo Total
   - Status: Healthy when > 1.0

5. **Taxa Crescimento** (Growth Rate %)
   - Formula: ((Período Atual - Período Anterior) / Período Anterior) × 100
   - Status: Healthy when > 5% YoY

#### Sub-KPIs by Module

**Apontamento:**
```typescript
{
  receita_bruta: number;
  margem_operacional: number; // %
  total_apontamentos: number;
  ticket_medio: number;
}
```

**Advocacia:**
```typescript
{
  receita_horaveis: number;
  taxa_utilizacao: number; // % of available hours
  receita_media_caso: number;
  total_casos_ativos: number;
  horas_totais: number;
}
```

**Contas Pessoais:**
```typescript
{
  fluxo_entrada: number;
  fluxo_saida: number;
  taxa_economia: number; // % of income saved
  saldo_total: number;
}
```

**Imóvel:**
```typescript
{
  receita_aluguel: number;
  taxa_ocupacao: number; // % of units occupied
  roi_imovel: number;
  total_propriedades: number;
}
```

#### Performance Trending

Supports 6 time horizons for trend analysis:
- **1h**: Last hour data
- **24h**: Last 24 hours data
- **7d**: Last 7 days data
- **30d**: Last 30 days data (default)
- **90d**: Last 90 days (quarterly)
- **12m**: Last 12 months (annual)

Calculates:
- Media (average)
- Desvio Padrão (standard deviation)
- Variância Percentual (% variance)
- Tendência (crescente/decrescente/estável)

#### Anomaly Detection

Triggered when:
- Variance > 10% from average
- Value > 2σ (2 standard deviations) from mean
- Liquidez Corrente < 1.0 (high severity)
- Solvabilidade < 1.0 (high severity)

Severity Levels:
- **Critica**: Immediate action required
- **Alta**: High priority
- **Média**: Medium priority
- **Baixa**: Low priority

### Usage Example

```typescript
import { kpiEngine } from './kpi-engine-realtime';

// Calculate KPIs
const snapshot = kpiEngine.calcularKPIsRealtime({
  receita_total: 100000,
  lucro_liquido: 25000,
  ativo_total: 500000,
  ativo_circulante: 150000,
  passivo_total: 300000,
  passivo_circulante: 100000,
  lucro_anterior: 20000
});

// Get 30-day trend
const tendencia = kpiEngine.obterTendencia('margem_lucro', '30d');

// Detect anomalies
const anomalias = kpiEngine.detectarAnomalias();

// Get complete dashboard
const dashboard = kpiEngine.obterDashboardCompleto('2024-09');
```

### Database Schema

```sql
CREATE TABLE kpi_snapshots (
  id STRING PRIMARY KEY,
  data_snapshot TIMESTAMP,
  margem_lucro FLOAT,
  roi FLOAT,
  liquidez_corrente FLOAT,
  solvabilidade FLOAT,
  taxa_crescimento FLOAT,
  hash_verificacao STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_kpi_snapshots_data ON kpi_snapshots(data_snapshot DESC);
CREATE INDEX idx_kpi_snapshots_hash ON kpi_snapshots(hash_verificacao);
```

---

## Module 2: Dashboard Layout & Components

**File:** `dashboard-layout.ts`  
**Lines:** 550+  
**Tests:** 30+

### Purpose
Manages customizable dashboard layouts with drag-and-drop support and pre-built templates for different user roles.

### Widget Types

1. **KPI Card**: Display single KPI with trend arrow
2. **Line Chart**: Show trends over time
3. **Bar Chart**: Compare values across categories
4. **Gauge Meter**: Show progress toward target
5. **Status Tile**: Display alerts and anomalies
6. **Table**: Display detailed data
7. **Heatmap**: Show patterns and correlations

### Dashboard Templates

#### CEO View
High-level strategic metrics:
- Margem de Lucro (KPI Card)
- ROI (KPI Card)
- Tendência de Receita (Line Chart)
- Alertas Ativos (Status Tile)

#### CFO View
Financial details:
- Liquidez Corrente (Gauge)
- Solvabilidade (Gauge)
- Fluxo de Caixa (Bar Chart)
- Demonstrativo Financeiro (Table)

#### Manager View
Operational metrics:
- Desempenho por Módulo (Bar Chart)
- Produtividade da Equipe (Table)
- Metas vs Realizado (Gauge)

#### Auditor View
Compliance and audit:
- Trilha de Auditoria (Table)
- Acessos a Dados (Heatmap)
- Conformidade LGPD (Status Tile)

### Widget Configuration

```typescript
interface Widget {
  id: string;
  tipo: WidgetType;
  titulo: string;
  posicao: {
    x: number;          // Grid column (0-11)
    y: number;          // Grid row (0-7)
    largura: number;    // Width in columns
    altura: number;     // Height in rows
  };
  dados: {
    fonte_dados: string;      // kpi_engine, relatorios_consolidacao, etc
    kpi_mapeado?: string;     // For KPI cards
    atualizar_intervalo?: number; // ms (default: 5000)
    filtros?: Record<string, any>;
  };
  tema: {
    cor_fundo?: string;
    cor_texto?: string;
    cor_destaque?: string;
  };
  ativo: boolean;
}
```

### Usage Example

```typescript
import { dashboardManager } from './dashboard-layout';

// Create CEO dashboard
const dashboard = dashboardManager.criarDashboard({
  usuario_id: 'ceo@company.com',
  nome: 'Executive Dashboard',
  template_base: 'ceo',
  tema: 'light'
});

// Add custom widget
const widget = dashboardManager.adicionarWidget(dashboard.id, {
  tipo: 'line_chart',
  titulo: 'Receita Mensal',
  posicao: { x: 0, y: 2, largura: 6, altura: 3 },
  dados: {
    fonte_dados: 'relatorios_consolidacao',
    atualizar_intervalo: 60000
  }
});

// Update widget position (drag-drop)
dashboardManager.atualizarPosicaoWidget(dashboard.id, widget.id, {
  x: 6,
  y: 2
});

// Save layout
dashboardManager.salvarLayout(dashboard.id);

// Export as JSON
const json = dashboardManager.exportarDashboard(dashboard.id);
```

---

## Module 3: Analytics & Data Visualization

**File:** `analytics-visualizacao.ts`  
**Lines:** 700+  
**Tests:** 40+

### Purpose
Advanced analytics capabilities including chart generation, comparative analysis, forecasting, and drill-down navigation.

### Chart Types

#### Linha (Line Chart)
```typescript
labels: ['Jan', 'Fev', 'Mar', 'Abr'],
series: [{
  nome: 'Receita 2024',
  dados: [10000, 12000, 11000, 15000]
}]
```

#### Barra (Bar Chart)
```typescript
labels: ['Norte', 'Sul', 'Leste', 'Oeste'],
series: [{
  nome: 'Vendas',
  dados: [5000, 7000, 6000, 8000]
}]
```

#### Pizza (Pie Chart)
```typescript
labels: ['Custo Fixo', 'Custo Variável', 'Lucro'],
series: [{
  nome: 'Distribuição',
  dados: [30, 40, 30]
}]
```

#### Scatter, Heatmap, Waterfall
Support for advanced analytical visualizations.

### Comparative Analysis

#### Year-over-Year (YoY)
Compare current year with previous year:
```typescript
analytics.analisarComparativamente({
  tipo: 'yoy',
  dados_atual: [100, 150, 120],  // 2024
  dados_anterior: [80, 100, 100], // 2023
  labels_periodos: ['2024', '2023']
});
```

#### Month-over-Month (MoM)
Compare current month with previous month:
```typescript
analytics.analisarComparativamente({
  tipo: 'mom',
  dados_atual: [10000, 12000, 11000],    // Current
  dados_anterior: [9000, 10000, 10500],  // Previous
  labels_periodos: ['Set', 'Ago']
});
```

#### Budget vs Actual
Compare planned vs actual performance:
```typescript
analytics.analisarComparativamente({
  tipo: 'budget_vs_actual',
  dados_atual: [8000, 9500, 10200],  // Actual
  dados_anterior: [10000, 10000, 10000], // Budget
  labels_periodos: ['2024', 'Budget']
});
```

### Forecasting

#### Linear Trend
For stable, linear growth:
```typescript
const previsao = analytics.gerarPrevisao({
  tipo_trendline: 'linear',
  dados_historicos: [100, 110, 120, 130, 140],
  periodos_futuro: 3
});
```

#### Exponential Trend
For accelerating growth:
```typescript
const previsao = analytics.gerarPrevisao({
  tipo_trendline: 'exponencial',
  dados_historicos: [100, 120, 144, 173, 207],
  periodos_futuro: 2
});
```

#### Polynomial Trend
For complex patterns:
```typescript
const previsao = analytics.gerarPrevisao({
  tipo_trendline: 'polinomial',
  dados_historicos: [100, 150, 180, 170, 200],
  periodos_futuro: 2
});
```

### Drill-Down Navigation

Hierarchical navigation through data:
```typescript
// Drill from Country to State to City
const drill1 = analytics.drillDown({
  hierarquia: ['País', 'Estado', 'Cidade'],
  nivel_atual: 0,
  filtros: { País: 'Brasil' },
  dados_completos: dados
});

// Drill down to next level
const drill2 = analytics.drillDown({
  ...drill1,
  nivel_atual: 1,
  filtros: { Estado: 'São Paulo' }
});
```

### Filtering

```typescript
const dados = [
  { region: 'Norte', valor: 100, status: 'ativo' },
  { region: 'Sul', valor: 200, status: 'inativo' },
  { region: 'Norte', valor: 150, status: 'ativo' }
];

// Filter by value
const filtrados = analytics.filtrarDados(dados, { region: 'Norte' });

// Filter by range
const intervalo = analytics.filtrarDados(dados, {
  valor: { min: 100, max: 200 }
});

// Filter by multiple values
const multiplos = analytics.filtrarDados(dados, {
  status: ['ativo']
});
```

### Export to CSV

```typescript
const csv = analytics.exportarCSV(grafico);
// Output:
// Período,2024,2023
// Jan,10000,8000
// Fev,12000,9000
```

---

## Module 4: Business Intelligence (OLAP & Pivot Tables)

**File:** `business-intelligence.ts`  
**Lines:** 600+  
**Tests:** 35+

### Purpose
Implement OLAP (Online Analytical Processing) cube for multi-dimensional data analysis. Support complex queries and pattern detection.

### OLAP Cube Structure

```typescript
const cubo = bi.criarCubo({
  nome: 'Cubo Vendas',
  dimensoes: [
    {
      nome: 'tempo',
      hierarquia: ['ano', 'trimestre', 'mes'],
      valores: ['2024', 'Q1', 'Jan']
    },
    {
      nome: 'regiao',
      hierarquia: ['pais', 'estado', 'cidade'],
      valores: ['Brasil', 'SP', 'São Paulo']
    },
    {
      nome: 'produto',
      hierarquia: ['categoria', 'subcategoria'],
      valores: ['Eletrônicos', 'Notebooks']
    }
  ],
  medidas: [
    { nome: 'receita', tipo: 'soma', valor: 0 },
    { nome: 'quantidade', tipo: 'contagem', valor: 0 },
    { nome: 'preco_medio', tipo: 'media', valor: 0 }
  ]
});
```

### Slice Operation

Filter by single dimension value:
```typescript
// Get all data for São Paulo
const sp_dados = bi.slice(cubo.id, 'regiao', 'São Paulo');
```

### Dice Operation

Filter by multiple dimension values:
```typescript
// Get Q1 2024 data for SP and RJ
const resultado = bi.dice(cubo.id, {
  tempo: ['Q1'],
  regiao: ['São Paulo', 'Rio de Janeiro']
});
```

### Pivot Table

Transform multi-dimensional data into tabular format:
```typescript
const pivot = bi.pivotAnalise({
  cubo_id: cubo.id,
  dimensao_linhas: 'tempo',      // Rows
  dimensao_colunas: 'regiao',    // Columns
  medida: 'receita',              // Values
  filtros: { produto: ['Notebooks'] }
});

// Result:
// |       | SP      | RJ      | MG      | Total    |
// |-------|---------|---------|---------|----------|
// | Q1    | 100,000 | 80,000  | 60,000  | 240,000  |
// | Q2    | 120,000 | 90,000  | 70,000  | 280,000  |
// | Total | 220,000 | 170,000 | 130,000 | 520,000  |
```

### Rollup

Aggregate data by dimension:
```typescript
const rollup = bi.rollup(cubo.id, 'regiao');
// Result: Aggregated metrics per region
```

### Pattern Detection

#### Sazonalidade (Seasonality)
Identify recurring patterns:
```typescript
const padroes = bi.detectarPadroes([
  { data: '2024-01-15', valor: 1000 },
  { data: '2024-02-15', valor: 800 },
  { data: '2024-03-15', valor: 1200 },
  // ... monthly data
]);

// Returns: sazonalidade = { 'Jan': 1000, 'Fev': 800, ... }
```

#### Ciclos (Cycles)
Detect cyclical patterns using autocorrelation.

#### Outliers
Identify anomalous values using z-score > 3:
```typescript
padroes.outliers; // [{valor: 10000, desvio_padrao: 3.5}, ...]
```

#### Recommendations
Automatic recommendations based on detected patterns:
```typescript
padroes.recomendacoes;
// ['Considere ajustar orçamento para sazonalidade',
//  'Investigue valores anômalos',
//  ...]
```

---

## Module 5: Alerts & Notifications

**File:** `alertas-notificacoes.ts`  
**Lines:** 500+  
**Tests:** 25+

### Purpose
Real-time alert system with multi-channel notifications and intelligent routing.

### Alert Types

1. **KPI Deviation**: KPI out of expected range
2. **Transaction Anomaly**: Unusual transaction patterns
3. **Approval Pending**: Documents awaiting approval
4. **Compliance Risk**: Potential compliance violations
5. **Schedule-based**: Triggered at scheduled times

### Alert Severity

- **Critica**: Requires immediate action
- **Alta**: High priority
- **Média**: Medium priority
- **Baixa**: Low priority

### Creating Alert Rules

```typescript
const regra = alertas.criarRegra({
  nome: 'Alerta Margem Lucro Baixa',
  tipo: 'kpi_deviation',
  condicao: { margem_lucro: { min: 20 } },
  usuarios_notificar: ['cfo@company.com', 'ceo@company.com'],
  canais: ['email', 'slack', 'in_app'],
  severidade: 'alta'
});
```

### Alert Evaluation

```typescript
// When KPI is calculated
const alerta = alertas.avaliarCondicao(regra_id, {
  margem_lucro: 15  // Below threshold
});
// Automatically creates alert and sends notifications
```

### Notifications Channels

#### Email
SMTP notifications with templates

#### SMS
Twilio or AWS SNS for critical alerts

#### In-app
WebSocket push notifications

#### Slack
Webhook integration for Slack channels

#### Teams
Microsoft Teams webhook notifications

### Alert Management

```typescript
// Acknowledge alert
alertas.reconhecerAlerta(alerta_id, usuario_id);

// Resolve alert
alertas.resolverAlerta(alerta_id, usuario_id);

// Mark as false positive
alertas.marcarFalsoPositivo(alerta_id);

// Get user's alerts
const alerts = alertas.obterAlertasUsuario(usuario_id, 'ativo');

// Get dashboard
const dashboard = alertas.obterDashboardAlertas();
```

### Alert Escalation

Automatic escalation for unacknowledged alerts:
```typescript
alertas.configurarEscalacao(usuario_id, {
  tempo_escalacao_ms: 3600000, // 1 hour
  usuario_escalacao_id: 'manager_id',
  notificar_gerente: true,
  notificar_diretor: true // If severidade === 'critica'
});
```

---

## Module 6: Report Scheduler & Distribution

**File:** `report-scheduler.ts`  
**Lines:** 450+  
**Tests:** 20+

### Purpose
Automated report generation and distribution across multiple channels.

### Report Types

- **Daily**: Every day at 23:00
- **Weekly**: Every Monday at 9:00
- **Monthly**: Last day of month at 9:00
- **Quarterly**: Last day of Q3, Q6, Q9, Q12 at 9:00
- **Annual**: December 31st at 9:00

### Scheduling Reports

```typescript
const agendamento = scheduler.agendar Relatorio({
  nome: 'Relatório Executivo Mensal',
  tipo: 'monthly',
  usuario_criador_id: 'cfo@company.com',
  config_geracao: {
    periodo: 'mensal',
    filtros: { modulo: 'financeiro' },
    formato: 'pdf'
  },
  config_distribuicao: {
    canais: ['email', 's3'],
    destinatarios_email: ['ceo@company.com', 'cfo@company.com'],
    caminho_s3: 's3://company-reports/monthly/'
  }
});
```

### Distribution Channels

#### Email
```typescript
{
  canais: ['email'],
  destinatarios_email: ['user@company.com']
}
```

#### S3 (AWS)
```typescript
{
  canais: ['s3'],
  caminho_s3: 's3://bucket/path/'
}
```

#### Google Drive
```typescript
{
  canais: ['google_drive'],
  folder_google_drive: 'reports-2024'
}
```

#### Dashboard Export
```typescript
{
  canais: ['dashboard'],
  usuario_dashboard: 'ceo@company.com'
}
```

#### FTP
```typescript
{
  canais: ['ftp'],
  credenciais: { host, user, password }
}
```

### Report Management

```typescript
// Execute immediately
const execucao = scheduler.executarRelatorioAgendado(agendamento_id);

// Pause scheduling
scheduler.pausarAgendamento(agendamento_id);

// Resume scheduling
scheduler.retomarAgendamento(agendamento_id);

// Get history
const historico = scheduler.obterHistoricoRelatorios(agendamento_id);

// Statistics
const stats = scheduler.obterEstatisticas();
```

### Retention Policy

```typescript
// Set retention (default: 90 days)
scheduler.definirPoliticaRetencao(180);

// Auto-cleanup old reports
const resultado = scheduler.limparHistoricoAntigo();
```

---

## Module 7: User Audit & LGPD Compliance

**File:** `user-audit-dashboard.ts`  
**Lines:** 400+  
**Tests:** 20+

### Purpose
Track user activities and ensure LGPD (Lei Geral de Proteção de Dados) compliance.

### Event Types

- **login**: User login
- **logout**: User logout
- **create**: Created resource
- **read**: Accessed resource
- **update**: Modified resource
- **delete**: Deleted resource
- **export**: Downloaded data
- **download**: File download
- **permission_change**: Permission changed

### Recording Activities

```typescript
audit.registrarEvento({
  usuario_id: 'user@company.com',
  tipo_evento: 'read',
  tipo_recurso: 'relatorio',
  recurso_id: 'relatorio_financeiro_2024',
  descricao: 'Acessou relatório financeiro',
  endereco_ip: '192.168.1.100',
  user_agent: 'Mozilla/5.0...',
  status: 'sucesso'
});
```

### Access Audit

```typescript
audit.registrarAcessoDados({
  usuario_id: 'analyst@company.com',
  recurso_id: 'ledger_2024',
  tipo_recurso: 'ledger',
  tipo_acesso: 'leitura',
  motivo: 'Análise de receita Q1',
  autorizado: true
});
```

### Queries

```typescript
// All events for user
const eventos = audit.obterEventosAuditoria({
  usuario_id: 'user@company.com'
});

// Events in date range
const eventos_periodo = audit.obterEventosAuditoria({
  data_inicio: '2024-01-01T00:00:00Z',
  data_fim: '2024-01-31T23:59:59Z',
  limite: 100
});

// Access audit report
const acesso = audit.obterRelatorioAuditoriaAcesso(usuario_id);

// Dashboard
const dashboard = audit.obterDashboardAuditoria(7); // Last 7 days
```

### LGPD Compliance

#### Right to be Forgotten
Anonymize all user data:
```typescript
audit.diretoSerEsquecido(usuario_id);
// Replaces all PII with SHA256 hashes
```

#### Data Portability
Export all user data:
```typescript
const json = audit.exportarDadosUsuario(usuario_id);
// Returns JSON with all activities, access logs, etc
```

#### Retention Policy
```typescript
// Set retention period
audit.definirConfiguracao({
  dias_retencao_padrao: 365,
  anonimizar_ao_deletar: true,
  permitir_export_dados: true
});

// Auto-cleanup
const resultado = audit.limparDadosAntigos();
```

#### Compliance Report
```typescript
const relatorio = audit.gerarRelatorioConformidade();
// Returns LGPD compliance status
```

---

## Module 8: Performance Monitoring & System Health

**File:** `monitoramento-performance.ts`  
**Lines:** 350+  
**Tests:** 20+

### Purpose
Monitor system health and detect performance bottlenecks.

### Collected Metrics

#### CPU
```typescript
{
  uso_percentual: 45.2,
  core_utilization: {
    core_0: 50.5,
    core_1: 40.2,
    core_2: 45.0,
    core_3: 35.8
  },
  load_average: 2.1
}
```

#### Memory
```typescript
{
  heap_used_mb: 512.5,
  heap_total_mb: 2048,
  rss_mb: 614.0,
  external_mb: 25.6,
  percentual_uso: 25.0
}
```

#### Database
```typescript
{
  tempo_resposta_ms: 45.2,
  total_queries: 5432,
  slow_queries: ['SELECT * FROM ...', ...],
  conexoes_ativas: 28,
  pool_disponivel: 22,
  tempo_lock_ms: 5.8
}
```

#### API
```typescript
{
  latencia_media_ms: 125.5,
  total_requisicoes: 42530,
  taxa_erro_percentual: 0.5,
  throughput_rps: 708.8,
  endpoints_lento: ['/api/reports', ...]
}
```

#### Cache
```typescript
{
  hit_rate_percentual: 85.2,
  miss_rate_percentual: 14.8,
  tamanho_cache_mb: 256.0,
  evictions: 125,
  itens_em_cache: 45230
}
```

### Thresholds (Configurable)

```typescript
{
  cpu_critico: 85,           // % CPU
  cpu_warning: 70,
  memoria_critica: 90,       // % Memory
  memoria_warning: 80,
  resposta_lenta: 200,       // ms
  query_lenta: 1000,         // ms
  cache_minimo: 70,          // % hit rate
  taxa_erro_maxima: 5        // %
}
```

### Usage

```typescript
// Collect all metrics
const saude = monitor.coletarMetricasPerformance();

// Get specific metrics
const cpu = monitor.coletarMetricasCPU();
const memoria = monitor.coletarMetricasMemoria();
const bd = monitor.coletarMetricasBD();
const api = monitor.coletarMetricasAPI();
const cache = monitor.coletarMetricasCache();

// Detect bottlenecks
const gargalos = monitor.detectarGargalos();

// Get suggestions
const sugestoes = monitor.sugerirOtimizacao();

// Custom thresholds
monitor.definirLimiares({ cpu_critico: 95 });

// Export report
const relatorio = monitor.exportarRelatório();
```

### Health Status

- **OK**: All metrics within thresholds
- **WARNING**: One or more metrics in warning range
- **CRITICAL**: One or more metrics in critical range

---

## Database Schema

### Tables Created

#### kpi_snapshots
```sql
CREATE TABLE kpi_snapshots (
  id STRING PRIMARY KEY,
  data_snapshot TIMESTAMP,
  margem_lucro FLOAT,
  roi FLOAT,
  liquidez_corrente FLOAT,
  solvabilidade FLOAT,
  taxa_crescimento FLOAT,
  hash_verificacao STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_kpi_snapshots_timestamp ON kpi_snapshots(data_snapshot DESC);
CREATE INDEX idx_kpi_snapshots_hash ON kpi_snapshots(hash_verificacao);
```

#### dashboard_config
```sql
CREATE TABLE dashboard_config (
  id STRING PRIMARY KEY,
  usuario_id STRING NOT NULL,
  nome STRING NOT NULL,
  template_base STRING,
  widgets_config JSON,
  tema STRING,
  criado_em TIMESTAMP,
  atualizado_em TIMESTAMP,
  hash_verificacao STRING
);

CREATE INDEX idx_dashboard_usuario ON dashboard_config(usuario_id);
```

#### alerts
```sql
CREATE TABLE alerts (
  id STRING PRIMARY KEY,
  tipo STRING,
  severidade STRING,
  titulo STRING,
  descricao TEXT,
  usuario_destino_id STRING,
  data_criacao TIMESTAMP,
  data_reconhecimento TIMESTAMP,
  data_resolucao TIMESTAMP,
  status STRING,
  dados_contexto JSON,
  hash_verificacao STRING
);

CREATE INDEX idx_alerts_usuario ON alerts(usuario_destino_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_data ON alerts(data_criacao DESC);
```

#### notifications
```sql
CREATE TABLE notifications (
  id STRING PRIMARY KEY,
  alerta_id STRING,
  canal STRING,
  destinatario STRING,
  conteudo TEXT,
  data_envio TIMESTAMP,
  data_entrega TIMESTAMP,
  status STRING,
  tentativas INT,
  erro TEXT
);

CREATE INDEX idx_notifications_alerta ON notifications(alerta_id);
CREATE INDEX idx_notifications_status ON notifications(status);
```

#### audit_events
```sql
CREATE TABLE audit_events (
  id STRING PRIMARY KEY,
  usuario_id STRING,
  tipo_evento STRING,
  tipo_recurso STRING,
  recurso_id STRING,
  descricao TEXT,
  endereco_ip STRING,
  user_agent STRING,
  status STRING,
  data_evento TIMESTAMP,
  detalhes JSON
);

CREATE INDEX idx_audit_usuario ON audit_events(usuario_id);
CREATE INDEX idx_audit_tipo ON audit_events(tipo_evento);
CREATE INDEX idx_audit_data ON audit_events(data_evento DESC);
```

#### report_executions
```sql
CREATE TABLE report_executions (
  id STRING PRIMARY KEY,
  agendamento_id STRING,
  data_execucao TIMESTAMP,
  data_conclusao TIMESTAMP,
  status STRING,
  caminho_arquivo STRING,
  tempo_execucao_ms INT,
  tamanho_arquivo INT,
  erro TEXT,
  tentativas INT
);

CREATE INDEX idx_report_agendamento ON report_executions(agendamento_id);
CREATE INDEX idx_report_status ON report_executions(status);
```

#### performance_metrics
```sql
CREATE TABLE performance_metrics (
  id STRING PRIMARY KEY,
  metrica_tipo STRING,
  valor FLOAT,
  data_coleta TIMESTAMP,
  detalhes JSON
);

CREATE INDEX idx_performance_tipo ON performance_metrics(metrica_tipo);
CREATE INDEX idx_performance_data ON performance_metrics(data_coleta DESC);
```

---

## Testing

### Test Suite Overview

**File:** `phase5-dashboard-analytics.test.ts`  
**Total Tests:** 200+

#### Coverage by Module

1. **KPI Engine**: 35+ tests
   - KPI calculations accuracy
   - Trending analysis
   - Anomaly detection
   - Sub-KPI calculations
   - Dashboard completeness

2. **Dashboard Layout**: 30+ tests
   - Dashboard creation (all templates)
   - Widget management
   - Layout persistence
   - Export/Import
   - Theme management

3. **Analytics**: 40+ tests
   - Chart generation (all types)
   - Data filtering
   - Comparative analysis (YoY, MoM)
   - Forecasting (linear, exponential, polynomial)
   - Drill-down navigation
   - CSV export

4. **Business Intelligence**: 35+ tests
   - OLAP cube creation
   - Slice/Dice operations
   - Pivot table generation
   - Rollup aggregation
   - Pattern detection (seasonality, cycles, outliers)
   - Recommendations

5. **Alerts & Notifications**: 25+ tests
   - Rule creation
   - Alert evaluation
   - Notification routing
   - Escalation logic
   - Status management

6. **Report Scheduler**: 20+ tests
   - Report scheduling (all types)
   - Execution
   - Pause/Resume
   - History tracking
   - Retention policy

7. **User Audit**: 20+ tests
   - Event recording
   - Access audit
   - Query filtering
   - LGPD operations (right to be forgotten, data portability)
   - Compliance reporting

8. **Performance Monitoring**: 20+ tests
   - Metrics collection (CPU, memory, DB, API, cache)
   - Health status determination
   - Bottleneck detection
   - Optimization suggestions
   - Threshold configuration

#### Running Tests

```bash
# Run all Phase 5 tests
npm test -- phase5-dashboard-analytics.test.ts

# Run specific test suite
npm test -- phase5-dashboard-analytics.test.ts -t "KPI Engine"

# Run with coverage
npm test -- phase5-dashboard-analytics.test.ts --coverage
```

---

## Integration with Existing Phases

### Phase 1: Core Payroll Integration
- KPI Engine reads from payroll ledger
- Report Scheduler uses payroll reports
- Audit Dashboard tracks payroll access

### Phase 2: Apontamento Integration
- Sub-KPI Apontamento calculates from apontamento_prestador
- Analytics visualizes apontamento trends
- Performance monitoring tracks apontamento query times

### Phase 3: Reports Integration
- Dashboard widgets bind to Phase 3 reports
- Report Scheduler distributes Phase 3 reports
- Analytics performs drill-down on report data

### Phase 4: Integrations
- KPI Engine aggregates data from integrated systems
- Alerts can be triggered by integration failures
- Performance monitoring tracks integration latency

---

## Performance Characteristics

### Real-time Updates
- KPI refresh: 5 seconds
- Dashboard WebSocket: < 100ms
- Alert evaluation: < 500ms
- Report generation: < 30 seconds

### Data Retention
- KPI snapshots: 1 year (with 1-minute granularity)
- Alerts: 1 year (with archival)
- Audit events: 2+ years (configurable per LGPD)
- Performance metrics: 30 days

### Query Performance
- Dashboard load: < 2 seconds
- Chart rendering: < 200ms
- OLAP pivot table: < 1 second
- Anomaly detection: < 500ms

---

## Security & Compliance

### Data Protection
- All snapshots hashed for integrity verification
- Sensitive data fields encrypted
- Row-level security for data access
- LGPD-compliant data anonymization

### Audit Trail
- Complete audit log of all user activities
- Data access tracking per user
- Permission change tracking
- Immutable log for compliance

### Multi-tenancy
- User-based dashboard isolation
- Role-based alert routing
- Granular permission controls
- Secure data export

---

## Troubleshooting

### Common Issues

#### High CPU Usage
1. Check `monitoramento-performance` dashboard
2. Identify slow queries in database metrics
3. Review cache hit rate
4. Consider adding indices

#### Missing KPIs
1. Verify kpi-engine-realtime is calculating
2. Check WebSocket connection
3. Verify data source integration
4. Check firewall/network

#### Alert Not Sending
1. Verify notification channel configuration
2. Check alert rule condition
3. Review notification logs
4. Test channel independently

#### Slow Dashboard Load
1. Reduce widget count
2. Increase update intervals
3. Enable dashboard caching
4. Check API latency

---

## Future Enhancements

1. **Machine Learning**: Predictive analytics for KPIs
2. **Natural Language**: "What-if" analysis
3. **Mobile App**: Real-time alerts on mobile
4. **Advanced Security**: Biometric authentication
5. **Advanced Scheduling**: Conditional report generation
6. **Custom Metrics**: User-defined KPI calculations
7. **Collaboration**: Shared dashboard annotations
8. **Drill-through**: Link from dashboard to detail views

---

## References

- Phase 1: Core Payroll System
- Phase 2: Apontamento & Advocacia
- Phase 3: Reporting & Consolidation
- Phase 4: External Integrations
- LGPD: Lei Geral de Proteção de Dados (Brazilian GDPR)

---

**Document Version:** 1.0  
**Last Updated:** 2026-09-16  
**Status:** Production Ready
