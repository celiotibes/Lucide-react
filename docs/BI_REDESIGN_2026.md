# Business Intelligence - Redesign Visual 2026

## Visão Geral

Implementação completa de um redesign visual moderno alinhado com tendências de design 2026, focando em glassmorphism, micro-interações, e uma paleta de cores cyber dark mode.

## Design System

### Paleta de Cores - Dark Mode 2.0

**Primárias:**
- **Cyan**: `#06B6D4` - Botões, CTAs, accent primário
- **Purple**: `#A855F7` - Gradientes, destaques secundários
- **Emerald**: `#10B981` - Status positivo, sucesso

**Semânticas:**
- **Alerta**: `#F43F5E` (rose) - Estados críticos
- **Aviso**: `#FBBF24` (amber) - Estados de alerta moderado
- **Info**: `#0EA5E9` (sky) - Informações gerais

**Fundos:**
- **Dark Base**: `#0F172A` (slate-950) - Background principal
- **Dark Surface**: `#1E293B` (slate-800) - Cards/Surfaces
- **Dark Elevated**: `#334155` (slate-700) - Borders/Dividers

### Tipografia

```
Display (H1): 3.5rem, 700 weight, Inter
Heading (H2): 2.25rem, 600 weight, Inter
Section (H3): 1.5rem, 600 weight, Inter
Body: 1rem, 400 weight, 1.6 line-height, Inter
Label/Caption: 0.875rem, 500 weight, +0.05em tracking
```

### Espaçamento

- **Gap padrão**: 24px (não usar 16px em componentes principais)
- **Padding de cards**: 24px
- **Border radius**: 12px (cards), 8px (buttons), 4px (inputs)

## Componentes Implementados

### 1. **TimelineComponent**
Componente para visualizar eventos cronológicos com animações.

**Props:**
- `events: TimelineEvent[]` - Lista de eventos
- `orientation: 'vertical' | 'horizontal'` - Direção da timeline
- `variant: 'compact' | 'detailed'` - Modo de visualização

**Features:**
- Glassmorphism em cards de evento
- Animações de entrada staggered
- Pulse em eventos ativos
- Cores de severidade (crítico, alerta, info)
- Responsive: vertical em mobile

**Exemplo:**
```tsx
<TimelineComponent
  events={[
    {
      id: '1',
      timestamp: new Date(),
      title: 'Alerta Crítico',
      description: 'Margem baixa detectada',
      status: 'completed',
      severity: 'critico',
      icon: <AlertCircle />
    }
  ]}
  variant="detailed"
/>
```

### 2. **StatCard**
Card de métrica com sparkline animado.

**Props:**
- `title: string` - Título da métrica
- `value: string | number` - Valor principal
- `unit?: string` - Unidade (ex: "%", "R$")
- `data?: number[]` - Dados para sparkline
- `trend?: number` - Percentual de mudança
- `state: 'otimo' | 'bom' | 'alerta' | 'critico'` - Estado visual
- `icon?: ReactNode` - Ícone do card

**Features:**
- Sparkline com gradiente animado
- Trend indicator com cores
- Glassmorphism com glow em hover
- Animação de scale ao carregar
- Badges coloridas de estado

**Exemplo:**
```tsx
<StatCard
  title="Faturamento"
  value="R$ 125.430"
  unit="month"
  state="otimo"
  trend={5}
  data={[1000, 1200, 1150, 1300]}
  icon={<DollarSign />}
/>
```

### 3. **BottomSheet**
Modal inferior arrastável com snap points.

**Props:**
- `isOpen: boolean` - Controla visibilidade
- `onClose: () => void` - Callback ao fechar
- `title?: string` - Título do sheet
- `children: ReactNode` - Conteúdo
- `snapPoints?: (number | string)[]` - Pontos de snap (default: [50, 100])

**Features:**
- Draggable handle no topo
- Snap points customizáveis
- Glassmorphism header
- Safe area padding em mobile
- Backdrop com blur

**Exemplo:**
```tsx
<BottomSheet
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Detalhes"
  snapPoints={['50%', '100%']}
>
  <p>Conteúdo aqui</p>
</BottomSheet>
```

### 4. **BottomNav**
Navegação mobile-first em barra inferior.

**Features:**
- 5 itens principais (Dashboard, Relatórios, Alertas, Performance, Config)
- Active state com border e background gradient
- Icons com labels dinâmicos
- Safe area padding em bottom
- Hidden em desktop (>1024px)

## Padrões Visuais

### Glassmorphism

Aplicado em todos os cards principais:

```css
.glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.glass-lg {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
```

### Bento Grid

Layout assimétrico para dashboard principal:

```
┌──────────────┬──────────────┬──────────────┐
│ Dashboard Ex │  Sankey Flow │  Heatmap (4) │
│ (4 cols)     │  (4 cols)    │              │
├──────────────┼──────────┬────┼──────────────┤
│ Relatórios   │  Alertas │    │ Performance  │
│ (4 cols)     │ (2 cols) │    │ (6 cols)     │
├──────────────┴──────────┴────┼──────────────┤
│ DRE (4 cols) │ Settings (4)  │ ML/Previsão  │
└──────────────────────────────┴──────────────┘
```

### Micro-interações

**Hover Effects:**
- Scale: 1.02 em buttons, 1.03 em cards
- Elevação: -4px translate-y em hover
- Glow: shadow-lg com cor do accent (20% opacidade)

**Loading States:**
- Shimmer animation: 2s ease-in-out infinite
- Gradient slide de esquerda para direita

**Animations:**
- Stagger children: 50ms de delay entre itens
- Slide up entrada: 400ms cubic-bezier(0.4, 0, 0.2, 1)
- Pulse lento em elementos live: 3s infinite

## Páginas Redesenhadas

### 1. Dashboard (`/dashboard`)
- ✅ Background gradiente slate-900 → slate-950
- ✅ KPIs como StatCards com sparklines
- ✅ Gráficos com glassmorphism
- ✅ Inputs com glass styling
- ✅ Tabelas com hover effects
- ✅ Stagger animations na entrada

### 2. Configurações (`/configuracoes`)
- ✅ Sections com accent bars gradient
- ✅ Checkboxes e inputs com glass styling
- ✅ Conditional rendering estilizado
- ✅ Success message glassmorphism
- ✅ Stagger animations

### 3. Performance Analytics (`/performance`)
- ✅ Cards de métrica com ícones de estado
- ✅ Tabela com scrollbar customizado
- ✅ Info técnica com left borders gradient
- ✅ Recomendações com badges coloridos
- ✅ Stagger animations

### 4. Index BI (`/page.tsx`)
- ✅ Bento Grid layout assimétrico
- ✅ Cards com glassmorphism
- ✅ Hero card destacado (4 cols × 2 rows)
- ✅ Resumo rápido com gradientes de estado
- ✅ Hover effects com elevação

## CSS Utilities (`styles/ui.css`)

### Classes Disponíveis

```css
.glass                /* Glassmorphism padrão */
.glass-sm            /* Glassmorphism subtil */
.glass-lg            /* Glassmorphism forte */
.glow-cyan          /* Glow effect cyan */
.glow-purple        /* Glow effect purple */
.glow-pulse         /* Pulse animation */
.transition-smooth  /* Transição 300ms ease-out */
.transition-fast    /* Transição 150ms ease-out */
.gradient-success   /* Background gradient sucesso */
.gradient-alert     /* Background gradient alerta */
.gradient-critical  /* Background gradient crítico */
.text-gradient-cyan /* Text gradient cyan→blue */
.hover-lift         /* Elevação em hover */
.hover-glow-cyan    /* Glow cyan em hover */
.hover-scale        /* Scale 1.05 em hover */
.shimmer            /* Shimmer loading animation */
.animate-pulse-slow /* Pulse 3s lento */
.animate-bounce-soft/* Bounce suave */
.animate-slideUp    /* Slide up animation */
.stagger-item       /* Para listas com stagger */
```

### Animações Customizadas

- `glowPulse` - Pulse do glow (2s)
- `shimmer` - Shimmer loading (2s)
- `pulse-slow` - Pulse lento (3s)
- `bounce-soft` - Bounce suave (1s)
- `slideUp` - Slide up entrada (400ms)
- `slideDown` - Slide down entrada (400ms)
- `progressBar` - Progress bar animation (2s)

## Temas & Dark Mode

Implementado com suporte completo a:

```css
/* Media query nativa */
@media (prefers-color-scheme: dark) { ... }

/* Toggle via classe */
:root[data-theme="dark"] { ... }
:root[data-theme="light"] { ... }

/* Fallback */
@media (prefers-reduced-motion: reduce) { ... }
```

## Responsividade

### Breakpoints

- **Mobile**: < 640px (sm)
- **Tablet**: 640px - 1024px (md/lg)
- **Desktop**: > 1024px (xl)

### Mobile-First

- Bottom navigation fixa em mobile
- Bento grid adaptado para 1 coluna em mobile
- Drawers/bottom sheets em lugar de modals
- Touch targets mínimo 44×44px

## Performance

### Otimizações

- Lazy loading de imagens
- CSS utilities minificadas
- Animations desabilitadas em `prefers-reduced-motion`
- Transitions suaves com GPU acceleration

### Métricas

- Transições: 150ms-400ms (perceptível sem lag)
- Animações: 1s-3s (não distrativo)
- Gap padrão: 24px (breathing room)

## Guia de Implementação Futura

### Para Novas Páginas

1. Use background `gradient-to-b from-slate-900 to-slate-950`
2. Aplique `glass rounded-xl p-6 border-2 border-slate-700/50` em containers principais
3. Use `stagger-item` com `animation-delay` em listas
4. Implemente `animate-slideDown` em headers com delays
5. Use `StatCard` para métricas
6. Use `hover-lift` em cards clicáveis

### Para Componentes

1. Glassmorphism: `glass` ou `glass-lg`
2. Hover effects: `hover-lift`, `hover-glow-cyan`, `hover-scale`
3. Textos: `text-gradient-cyan` para destaques
4. Loading: `shimmer` para skeleton loading
5. Animações: `animate-slideUp`, `animate-slideDown`

### Paleta de Cores em Código

```tsx
// Primary
cyan: '#06B6D4'   // Botões, accent
purple: '#A855F7' // Secundário
emerald: '#10B981' // Success

// Semantic
rose: '#F43F5E'    // Critical
amber: '#FBBF24'   // Warning
sky: '#0EA5E9'     // Info

// Backgrounds
slate-900: '#0F172A'  // Dark base
slate-800: '#1E293B'  // Surfaces
slate-700: '#334155'  // Borders
```

## Commits Realizados

1. **Design: Implementação de componentes base para redesign visual 2026**
   - TimelineComponent, StatCard, BottomSheet, BottomNav
   - CSS utilities com glassmorphism e animações
   - Layout.tsx atualizado

2. **Design: Redesign completo do Dashboard com glassmorphism**
   - Background e cards com novo design
   - KPIs como StatCards
   - Gráficos com glassmorphism
   - Animações staggered

3. **Design: Redesign de Configurações e Performance Analytics**
   - Novo design glassmorphism
   - Accent bars gradient
   - Badges e pills customizados

## Próximos Passos

- [ ] Redesign de páginas específicas (Fluxo Caixa, Heatmap, Relatórios, Alertas)
- [ ] Implementar BottomSheet em tabelas com progressive disclosure
- [ ] Adicionar TimelineComponent para fluxos de processo
- [ ] Otimizar animações em mobile
- [ ] Implementar temas custom (Patrimônio, Jurídico, Contábil, Acadêmico)
- [ ] Integração com ferramentas de IA (Galileo, v0)

## Referências

- Design Trends 2026: Bento Grid, Glassmorphism, Bottom Navigation
- Acessibilidade: WCAG 2.1 AA
- Performance: Web Vitals (LCP < 2.5s, CLS < 0.1)
- Padrões: Component-based, Utility-first (Tailwind)
