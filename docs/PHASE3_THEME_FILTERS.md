# Fase 3: Light/Dark Mode e Cross-Filtering

## Overview

Fase 3 implementa suporte a tema (Light/Dark mode) e sistema de cross-filtering para a plataforma BI, melhorando a usabilidade e experiência do usuário.

## Componentes Adicionados

### 1. ThemeProvider (`app/painel-gestao/bi/components/ThemeProvider.tsx`)

Context Provider para gerenciar tema da aplicação.

**Funcionalidades:**
- Suporte a 3 modos: `'light'`, `'dark'`, `'system'`
- Persistência em localStorage
- Sincronização com preferências do sistema (prefers-color-scheme)
- Auto-aplicação de classes CSS (`dark` no html)
- Hook `useTheme()` para acesso em componentes

**Uso:**
```typescript
const { theme, setTheme, effectiveTheme } = useTheme();
```

### 2. ThemeToggle (`app/painel-gestao/bi/components/ThemeToggle.tsx`)

Botão flutuante com 3 opções de tema.

**Visual:**
- 3 ícones: Sol (Light), Lua (Dark), Monitor (System)
- Feedback visual do tema ativo
- Suporte a dark mode no próprio toggle

### 3. FilterContext (`app/painel-gestao/bi/components/FilterContext.tsx`)

Context para filtros globais da aplicação.

**Filtros Suportados:**
```typescript
interface Filtros {
  dataInicio: string;       // ISO date
  dataFim: string;          // ISO date
  residencial?: string;     // ID
  prestador?: string;       // ID
  categoria?: string;       // ID/nome
  severidade?: 'critico' | 'alerta' | 'info' | 'todas';
}
```

**Hook:**
```typescript
const { filtros, atualizarFiltro, atualizarFiltros, limparFiltros } = useFiltros();
```

### 4. FilterBar (`app/painel-gestao/bi/components/FilterBar.tsx`)

Barra de filtros reutilizável com suporte a:
- Seleção de período (dataInicio, dataFim)
- Filtro opcional por residencial
- Filtro opcional por prestador
- Filtro opcional por categoria
- Exibição de filtros ativos com botão de remoção
- Botão "Limpar Filtros"
- Dark mode completo

**Props:**
```typescript
interface FilterBarProps {
  mostrarResidencial?: boolean;
  mostrarPrestador?: boolean;
  mostrarCategoria?: boolean;
  residenciais?: Array<{ id: string; nome: string }>;
  prestadores?: Array<{ id: string; nome: string }>;
  categorias?: Array<{ id: string; nome: string }>;
}
```

### 5. Layout (`app/painel-gestao/bi/layout.tsx`)

Layout raiz para toda a seção BI com:
- Envolvimento com ThemeProvider
- Header sticky com logo e ThemeToggle
- Dark mode classes em todos os elementos
- Transições suaves de tema

## Dark Mode Implementação

### Strategy
Usa Tailwind CSS com `dark:` prefix e adiciona classe `.dark` ao `<html>` quando necessário.

### Padrão de Cores Dark Mode

**Backgrounds:**
- `bg-gray-50` → `dark:bg-gray-950` (páginas)
- `bg-white` → `dark:bg-gray-800` (cards)
- `bg-gray-100` → `dark:bg-gray-700` (backgrounds secundários)

**Texto:**
- `text-gray-900` → `dark:text-white` (principal)
- `text-gray-600` → `dark:text-gray-400` (secundário)
- `text-gray-500` → `dark:text-gray-500` (terciário)

**Borders:**
- `border-gray-200` → `dark:border-gray-700` (divisores)
- `border-gray-300` → `dark:border-gray-600` (inputs)

### Aplicação ao Theme Toggle

```typescript
// Exemplo de uso em componentes
<div className="bg-white dark:bg-gray-800">
  <p className="text-gray-900 dark:text-white">
    Conteúdo
  </p>
</div>
```

## Cross-Filtering

### Arquitetura

```
FilterContext (estado global de filtros)
    ↓
FilterBar (UI para seleção)
    ↓
[Componentes que leem de useFiltros()]
    ↓
Atualizam queries baseado em filtros
```

### Uso em Dashboards

**Exemplo de implementação em página:**

```typescript
import { FilterProvider, FilterBar, useFiltros } from '@/app/painel-gestao/bi/components';

export default function MeuDashboard() {
  return (
    <FilterProvider>
      <div>
        <FilterBar 
          mostrarResidencial={true}
          mostrarPrestador={true}
          residenciais={residenciais}
          prestadores={prestadores}
        />
        <ComponenteQueUsaFiltros />
      </div>
    </FilterProvider>
  );
}

function ComponenteQueUsaFiltros() {
  const { filtros } = useFiltros();
  
  useEffect(() => {
    // Recarregar dados com filtros atualizados
    carregarDados(filtros);
  }, [filtros]);
  
  return <div>{/* renderizar dados */}</div>;
}
```

## Próximas Etapas

### Phase 4: Real-time Data
- [ ] WebSocket subscriptions via Supabase Realtime
- [ ] Auto-refresh de dashboards
- [ ] Notificações de atualizações de dados

### Phase 5: Advanced Filtering
- [ ] Multi-select nos filtros
- [ ] Saved filter presets
- [ ] Filter history
- [ ] Advanced query builder

### Phase 6: Forecasting & ML
- [ ] Time-series forecasting
- [ ] Anomaly detection
- [ ] Trend analysis
- [ ] Predictive alerts

## Performance Considerations

### Recomendações

1. **Memoization**: Usar `useMemo()` para queries derivadas de filtros
2. **Lazy Loading**: Carregar dados sob demanda quando filtros mudam
3. **Debouncing**: Debounce de mudanças de filtro antes de query (500ms)
4. **Query Params**: Usar URL query params para persistir estado de filtros

### Exemplo com Debounce

```typescript
const { filtros } = useFiltros();
const [debouncedFiltros, setDebouncedFiltros] = useState(filtros);

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedFiltros(filtros);
  }, 500);

  return () => clearTimeout(timer);
}, [filtros]);

useEffect(() => {
  carregarDados(debouncedFiltros);
}, [debouncedFiltros]);
```

## Testando

### Dark Mode
1. Abrir DevTools → Console
2. `localStorage.setItem('bi-theme', 'dark')`
3. Recarregar página
4. Deverá aparecer em dark mode

### Tema do Sistema
1. Windows: Settings → Personalization → Colors
2. macOS: System Preferences → General → Appearance
3. Linux: Depende do tema do desktop

### Filtros
1. Ajustar data/residencial/prestador
2. Verificar que badges aparecem com os filtros ativos
3. Clicar em X no badge remove o filtro
4. "Limpar Filtros" reseta tudo

## Arquivos Criados

```
app/painel-gestao/bi/
├── components/
│   ├── ThemeProvider.tsx        # Context de tema
│   ├── ThemeToggle.tsx          # Toggle visual
│   ├── FilterContext.tsx        # Context de filtros
│   ├── FilterBar.tsx            # Barra de filtros UI
│   └── index.ts                 # Exports
├── layout.tsx                   # Layout raiz com providers
└── ... (outras páginas)
```

## Checksum

- 4 novos componentes + 1 layout
- ~900 linhas de código
- 0 breaking changes
- Retrocompatível com código existente
