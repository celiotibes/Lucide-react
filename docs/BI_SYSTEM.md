# Business Intelligence System - CRMT Lucide

## Visão Geral

Sistema completo de Business Intelligence para análise financeira e operacional com Data Warehouse em star schema, ETL pipeline automatizado e dashboards executivos interativos.

---

## 1. Arquitetura

### 1.1 Data Warehouse (Star Schema)

#### Dimensões
- **dim_data**: Calendário (anos, meses, trimestres, feriados)
- **dim_prestador**: Prestadores de serviço com histórico
- **dim_contrato**: Contratos (tipos, períodos, valores)
- **dim_residencial**: Propriedades/imóveis gerenciados
- **dim_categoria_despesa**: Classificação de despesas

#### Tabelas de Fatos
- **fact_apontamento**: Horas trabalhadas, valores, anomalias
- **fact_faturamento**: Faturamento mensal por residencial
- **fact_despesa**: Despesas registradas (com OCR confidence)
- **fact_recebimento**: Recebimentos de faturas
- **fact_fluxo_caixa**: Saldo e movimento diário
- **fact_custo_centro**: Análise de custos por centro

#### Views Agregadas
- **vw_kpi_financeiro**: KPIs mensais (faturamento, margem, resultado)
- **vw_resumo_mensal_residencial**: Performance por residencial
- **vw_performance_prestador**: Métricas por prestador

### 1.2 ETL Pipeline

**Localização**: `server/bi/etlPipeline.ts`

**Funções**:
1. `carregarDimData()` - Popula 5 anos de datas
2. `carregarDimPrestador()` - Sincroniza prestadores do operacional
3. `carregarFactApontamento()` - Carrega apontamentos do último mês
4. `carregarFactFaturamento()` - Sincroniza faturas pagas
5. `executarPipelineCompleto()` - Orquestra todas as etapas

**Agendamento**: 
- Cron job em `app/api/cron/etl-bi/route.ts`
- Recomendado: a cada 6 horas
- Requer `CRON_SECRET_TOKEN` para segurança

```bash
# Exemplo com curl
curl -X POST https://seu-dominio.com/api/cron/etl-bi \
  -H "Authorization: Bearer seu-cron-token"
```

### 1.3 Server Actions

**Localização**: `app/actions/bi/obterKPIs.ts`

**Funções**:
- `obterKPIsFinanceiros(dataInicio, dataFim)`: KPIs mensais
- `obterResumoResidenciais(dataInicio, dataFim)`: Por residencial
- `obterPerformancePrestadores(dataInicio, dataFim)`: Por prestador

---

## 2. Dashboards

### 2.1 Dashboard Principal (`/painel-gestao/bi/dashboard`)

**KPIs de Topo**:
- Faturamento Total (R$)
- Receita Líquida (R$)
- Custo Total (R$)
- Margem Média (%)

**Gráficos**:
- **Área**: Faturamento vs Receita Líquida ao longo do tempo
- **Linha**: Evolução de Margem Percentual
- **Barras**: Custos por Residencial (top 10)
- **Pie**: Distribuição de Custos por Residencial
- **Tabela**: Performance de Prestadores (top 10)

**Filtros**: Data início / Data fim

### 2.2 DRE - Demonstração de Resultado (`/painel-gestao/bi/dre`)

**Visualizações**:
- **Waterfall Chart**: Fluxo de resultado (faturamento → deduções → custos → resultado)
- **Tabela Linha-a-Linha**: Todos os componentes financeiros por período

**Cálculos**:
```
Faturamento Bruto
  - Deduções (retenções, cancelamentos)
  = Receita Líquida
  - Custo Operacional (mão de obra)
  - Custos Despesas (combustível, materiais)
  = Resultado Líquido (Margem Bruta)
```

---

## 3. Visualizações Avançadas

### 3.1 Tipos de Gráficos Suportados

| Tipo | Uso | Localização |
|------|-----|------------|
| Area | Tendências com volume | Dashboard (Faturamento vs Receita) |
| Line | Série temporal simples | Dashboard (Margem %) |
| Bar | Comparação categórica | Dashboard (Custos por Residencial) |
| Pie | Distribuição percentual | Dashboard (Custos por Residencial) |
| Waterfall | Fluxo incremental | DRE |
| Sankey | Fluxos complexos | Futuro (cash flows) |
| Heatmap | Matriz de correlação | Futuro (cost centers) |

### 3.2 Biblioteca de Gráficos

Utilizamos **Recharts** (já presente no projeto):
```typescript
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
```

### 3.3 Funcionalidades Interativas

- **Hover**: Tooltips com valores
- **Legenda**: Toggle de série (click)
- **Zoom**: Em gráficos de linha (scroll)
- **Exportação**: Botão de download (futuro)

---

## 4. Data Storytelling

### 4.1 Hierarquia de Detalhe (Progressive Disclosure)

**Nível 1**: Dashboard principal
- Visão geral (KPIs + gráficos principais)
- Identifica tendências

**Nível 2**: Drill-down por dimensão
- Click em residencial → detalhes daquela propriedade
- Click em prestador → performance individual

**Nível 3**: Linha-a-linha
- DRE com cada componente financeiro
- Apontamentos individuais ligados a custos

### 4.2 Narrativa Padrão

1. **O que está acontecendo?** (KPIs)
   - Faturamento cresceu 15% vs mês anterior
   - Margem caiu de 35% para 32%

2. **Onde está o problema?** (Análise por dimensão)
   - Residencial A tem margem de apenas 20%
   - Prestador X tem taxa de anomalia de 12%

3. **Qual é a raiz?** (Detalhes)
   - Custos com combustível subiram 20%
   - Apontamento de 14h foi identificado como anomalia

---

## 5. Integração com Sistema Operacional

### 5.1 Fluxo de Dados

```
Operacional (Supabase)
  ↓ [ETL Pipeline - a cada 6h]
Data Warehouse
  ↓ [Views SQL]
BI Server Actions
  ↓ [API]
React Components
  ↓ [Recharts]
Browser User
```

### 5.2 Latência de Dados

- **Real-time**: Dashboards operacionais (hoje)
- **Quase-real-time**: BI (6 horas)
- **Analítico**: Trends (mensal)

### 5.3 Sincronização de Mudanças

Quando um apontamento é criado/modificado:
1. Salvo em `apontamentos_prestador` (operacional)
2. Na próxima rodada de ETL → carregado em `fact_apontamento`
3. Views SQL reagrupam → KPIs atualizadas
4. Dashboard refresh automático (polling a cada 5 min)

---

## 6. Configuração

### 6.1 Variáveis de Ambiente

```bash
# .env.local
CRON_SECRET_TOKEN=seu-token-aleatorio-seguro
```

### 6.2 Agendamento (Vercel Crons)

Arquivo `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/etl-bi",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

Ou usando serviço externo (EasyCron, AWS EventBridge):
```
Trigger: POST https://seu-dominio.com/api/cron/etl-bi
Header: Authorization: Bearer seu-token
Intervalo: 6 horas
```

### 6.3 Monitoramento

Verifique logs em:
- **Console**: Mensagens de `console.log()`
- **Supabase**: Logs de execução
- **Vercel**: Deployment logs

---

## 7. Performance

### 7.1 Otimizações

- Índices em `data_sk`, `prestador_sk`, `residencial_sk`
- Agregações em views (não em runtime)
- Paginação em tabelas grandes (10k registros)
- Cache de queries (considerar no futuro)

### 7.2 Benchmarks

| Query | Tempo | Registros |
|-------|-------|-----------|
| vw_kpi_financeiro (1 ano) | ~500ms | 12 |
| vw_resumo_mensal_residencial | ~1s | 60+ |
| vw_performance_prestador | ~800ms | 100+ |

### 7.3 Escalabilidade

Para suportar > 1M de registros:
1. Implementar agregações incrementais
2. Particionamento de fact tables por ano
3. Materialized views (refreshes periódicas)
4. Cache layer (Redis)

---

## 8. Roadmap

### Curto Prazo (Próximos 3 meses)
- ✅ Dashboard principal com KPIs
- ✅ DRE com waterfall
- [ ] Exportação PDF/Excel
- [ ] Alertas por email (margens baixas, anomalias)

### Médio Prazo (3-6 meses)
- [ ] Sankey diagrams (cash flows)
- [ ] Heatmaps (cost centers)
- [ ] Previsão (forecast com ML)
- [ ] Drill-down customizável
- [ ] Relatórios automatizados

### Longo Prazo (6+ meses)
- [ ] BI Mobile (React Native)
- [ ] Integração com ferramentas externas (Metabase)
- [ ] API GraphQL para BI
- [ ] Análise preditiva (ELT avançado)

---

## 9. Troubleshooting

### 9.1 ETL não executa

**Problema**: Cron job não está disparando
**Solução**:
1. Verifique `CRON_SECRET_TOKEN` em `.env`
2. Teste manualmente:
   ```bash
   curl -X POST http://localhost:3000/api/cron/etl-bi \
     -H "Authorization: Bearer seu-token"
   ```
3. Verifique logs do Vercel

### 9.2 Dados desatualizados

**Problema**: Dashboard mostra dados antigos
**Solução**:
1. Force refresh do ETL
2. Verifique se views estão corretas:
   ```sql
   SELECT * FROM vw_kpi_financeiro LIMIT 1;
   ```
3. Verifique permissões RLS do usuário

### 9.3 Performance lenta

**Problema**: Dashboard demora para carregar
**Solução**:
1. Verifique índices:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM vw_kpi_financeiro;
   ```
2. Reduza período de filtro
3. Considere agregar dados em tabela separada

---

## 10. Segurança

### 10.1 RLS Policies

```sql
-- Admin vê tudo
CREATE POLICY "admin_full_access" ON fact_apontamento
  USING (auth.jwt() ->> 'role' = 'admin');

-- Prestador vê apenas seus dados
CREATE POLICY "prestador_see_own" ON fact_apontamento
  USING (prestador_sk IN (
    SELECT p.prestador_sk FROM dim_prestador p
    WHERE p.prestador_id = auth.jwt() ->> 'sub'
  ));
```

### 10.2 API Security

- ✅ Validação de permissão em cada server action
- ✅ Audit logging de consultas BI
- ✅ Rate limiting em endpoints
- ✅ CORS configurado

---

## 11. Contato & Suporte

- **Issues**: GitHub
- **Email**: bi-support@projeto.local
- **Slack**: #bi-development

---

**Última atualização**: 2024-07-17
