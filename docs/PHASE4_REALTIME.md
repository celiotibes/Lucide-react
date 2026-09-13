# Fase 4: Real-time Data Aggregation

## Overview

Fase 4 implementa suporte a dados em tempo real usando Supabase Realtime, permitindo que dashboards se atualizem automaticamente quando novos dados chegam.

## Componentes Adicionados

### 1. RealtimeProvider (`app/painel-gestao/bi/components/RealtimeProvider.tsx`)

Context Provider para gerenciar conexão real-time com banco de dados.

**Funcionalidades:**
- Subscriptions a mudanças em 4 tabelas principais
- Tracking do último update com timestamp
- Histórico dos últimos 10 updates
- Flag `hasNewData` para indicar atualizações pendentes
- Hook `useRealtime()` para consumo

**Tabelas Monitoradas:**
1. `fact_apontamento` - Novos apontamentos/edições
2. `fact_faturamento` - Novas faturas
3. `fact_despesa` - Novas despesas
4. `fact_recebimento` - Recebimentos processados

**Props do Context:**
```typescript
interface RealtimeContextType {
  isConnected: boolean;           // Conectado ao Realtime?
  lastUpdate?: RealtimeUpdate;    // Último update processado
  updates: RealtimeUpdate[];      // Histórico de updates
  hasNewData: boolean;            // Há dados novos a carregar?
  clearNewData: () => void;       // Marca dados como visualizados
}
```

### 2. useLiveData Hook (`app/painel-gestao/bi/hooks/useLiveData.ts`)

Hook para automatizar refresh de dados quando há mudanças em tabelas monitoradas.

**Features:**
- Auto-refresh baseado em mudanças reais de banco
- Periodic refresh como fallback (padrão 30s)
- Debouncing de updates (aguarda 1s antes de atualizar)
- Tracking de data/hora da última atualização
- Flag de dados "stale" (desatualizados)

**Uso:**
```typescript
const { data, loading, error, refresh, lastUpdated, isStale } = useLiveData(
  async () => {
    const resultado = await obterKPIsFinanceiros(dataInicio, dataFim);
    return resultado.kpis || [];
  },
  {
    autoRefresh: true,
    refreshInterval: 30000, // 30 segundos como fallback
    dependsOnTables: ['fact_faturamento', 'fact_despesa'],
    onDataUpdate: () => console.log('Dados atualizados!'),
  }
);

if (loading) return <div>Carregando...</div>;
if (error) return <div>Erro: {error.message}</div>;
return <div>Dados: {JSON.stringify(data)}</div>;
```

**Options:**
```typescript
interface UseLiveDataOptions {
  autoRefresh?: boolean;              // Habilitar auto-refresh (padrão: true)
  refreshInterval?: number;           // Período de refresh em ms (padrão: 30000)
  onDataUpdate?: () => void;          // Callback quando dados são atualizados
  dependsOnTables?: string[];         // Tabelas que disparam update
}
```

### 3. LiveIndicator Components (`app/painel-gestao/bi/components/LiveIndicator.tsx`)

Componentes visuais para indicar status de conexão real-time.

**LiveIndicator (3 variantes):**

a) `icon`: Ícone pulsante
```tsx
<LiveIndicator variant="icon" size="md" showLabel={true} />
// Output: 🟢 Conectado
```

b) `badge`: Badge com fundo simples
```tsx
<LiveIndicator variant="badge" size="sm" showLabel={true} />
// Output: Badge cinza (offline) ou verde (online)
```

c) `pill`: Pill com gradiente
```tsx
<LiveIndicator variant="pill" size="lg" showLabel={true} />
// Output: Gradiente verde com "Dados ao Vivo"
```

**LastUpdatedLabel:**
```tsx
<LastUpdatedLabel timestamp={lastUpdated} />
// Output: ✓ Agora mesmo
// Output: ✓ Há 5 min
// Output: ✓ Às 14:30
```

## Integração com Dashboards

### Exemplo: Dashboard com Auto-refresh

```typescript
'use client';

import { obterKPIsFinanceiros } from '@/app/actions/bi/obterKPIs';
import { useLiveData } from '@/app/painel-gestao/bi/hooks/useLiveData';
import { LiveIndicator, LastUpdatedLabel } from '@/app/painel-gestao/bi/components/LiveIndicator';

export function KPIDashboard() {
  const { data: kpis, loading, refresh, lastUpdated } = useLiveData(
    async () => {
      const res = await obterKPIsFinanceiros(dataInicio, dataFim);
      return res.kpis || [];
    },
    {
      dependsOnTables: ['fact_faturamento', 'fact_despesa', 'fact_recebimento'],
    }
  );

  return (
    <div className="space-y-4">
      {/* Header com indicador */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-4">
          <LiveIndicator variant="badge" />
          <LastUpdatedLabel timestamp={lastUpdated} />
          <button onClick={refresh}>Atualizar Agora</button>
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {/* KPI Cards */}
        </div>
      )}
    </div>
  );
}
```

### Exemplo: Layout com Realtime Provider

```typescript
// app/painel-gestao/bi/layout.tsx
import { RealtimeProvider } from './components/RealtimeProvider';

export default function BiLayout({ children }) {
  return (
    <ThemeProvider>
      <RealtimeProvider>
        {children}
      </RealtimeProvider>
    </ThemeProvider>
  );
}
```

## Architecture

### Flow

```
┌─────────────────────────────────────┐
│    Supabase Database (Realtime)     │
│  fact_apontamento                   │
│  fact_faturamento                   │
│  fact_despesa                       │
│  fact_recebimento                   │
└────────────┬────────────────────────┘
             │
             │ WebSocket
             ↓
┌─────────────────────────────────────┐
│    RealtimeProvider                 │
│  - Subscriptions ativas             │
│  - Tracks last update               │
│  - Notifies contexts                │
└────────────┬────────────────────────┘
             │
             │ React Context
             ↓
┌─────────────────────────────────────┐
│    useLiveData Hook                 │
│  - Detects table changes            │
│  - Debounces updates                │
│  - Triggers refetch                 │
└────────────┬────────────────────────┘
             │
             │ Calls fetchFunction()
             ↓
┌─────────────────────────────────────┐
│    Server Action                    │
│  obterKPIsFinanceiros()             │
│  obterResumoResidenciais()          │
│  ...                                │
└────────────┬────────────────────────┘
             │
             │ Returns fresh data
             ↓
┌─────────────────────────────────────┐
│    Component State                  │
│  - data updated                     │
│  - lastUpdated refreshed            │
│  - hasNewData cleared               │
└─────────────────────────────────────┘
```

## Performance

### Estratégias de Otimização

1. **Debouncing**: Aguarda 1s antes de processar múltiplos updates
   - Evita múltiplas requisições em rápida sucessão
   - Agrupa updates relacionados

2. **Periodic Refresh**: Fallback a cada 30s
   - Em caso de perda de conexão Realtime
   - Garante dados não ficam desatualizados por muito tempo

3. **Selective Monitoring**: Apenas tabelas relevantes
   - Reduz overhead de subscriptions
   - Permite configuração por componente

4. **Table Filtering**: Hook filtra atualizações por tabela
   - Dashboard de apontamentos ignora updates de despesa
   - Menos rerenders desnecessários

## Supabase Realtime Configuration

### Required Setup

1. **Enable Realtime no Supabase:**
   ```sql
   -- Dashboard → Replication → Turn on for tables
   ```

2. **RLS Policies:**
   ```sql
   -- Realtime respeita RLS policies
   -- Se usuário pode ver tabela, pode se subscribir
   CREATE POLICY "enable_realtime"
     ON fact_apontamento FOR SELECT
     USING (auth.uid() = prestador_id OR fn_eh_admin());
   ```

3. **Connection String:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
   ```

## Limites e Considerações

### Rate Limiting
- Supabase Realtime: 1000 mensagens/min por projeto
- useLiveData debounce: 1s mínimo entre updates
- Periodic refresh: 30s padrão

### Memory
- RealtimeProvider: ~50KB (histórico de 10 updates)
- useLiveData por componente: Varia com tamanho dos dados
- Cleanup automático ao desmontar

### Network
- Handshake inicial: ~100-200ms
- Subscription por tabela: ~5-10ms
- Update message: ~0.5-2KB

## Troubleshooting

### "useRealtime must be used within RealtimeProvider"
Solução: Envolver aplicação com `<RealtimeProvider>` no layout raiz.

### Dados não atualizam
Checklist:
1. RealtimeProvider está ativo?
2. useLiveData tem `autoRefresh: true`?
3. Tabela está habilitada para Realtime no Supabase?
4. RLS policies permitem reads?
5. WebSocket aberto? (DevTools → Network → WS)

### Performance degrada
- Reduzir número de tabelas monitoradas
- Aumentar refreshInterval (30s → 60s)
- Usar `dependsOnTables` para filtrar

## Testing

### Unit Tests
```typescript
describe('useLiveData', () => {
  it('should refresh on table update', async () => {
    // Mock RealtimeProvider context
    // Trigger update event
    // Verify refresh called within 1s
  });

  it('should debounce multiple updates', async () => {
    // Trigger 3 updates rapidly
    // Verify only 1 refresh call
  });
});
```

### Integration Tests
```typescript
describe('Live Dashboard', () => {
  it('should auto-refresh when new fatura is created', async () => {
    // Insert into fact_faturamento
    // Wait for WebSocket message
    // Verify component updates within 2s
  });
});
```

## Próximas Melhorias

- [ ] Compression de WebSocket messages
- [ ] Presence tracking (quem está olhando o dashboard)
- [ ] Conflict resolution para offline updates
- [ ] Smart cache invalidation
- [ ] Push notifications para updates críticos

## Checklist de Implementação

- [x] RealtimeProvider criado
- [x] useLiveData hook criado
- [x] LiveIndicator components criado
- [ ] Dashboard atualizado com RealtimeProvider
- [ ] Hook integrado em páginas principais
- [ ] Supabase Realtime habilitado
- [ ] RLS policies verificadas
- [ ] Testes escrito
- [ ] Documentação completada

## Files Created

```
app/painel-gestao/bi/components/RealtimeProvider.tsx
app/painel-gestao/bi/components/LiveIndicator.tsx
app/painel-gestao/bi/hooks/useLiveData.ts
docs/PHASE4_REALTIME.md
```
