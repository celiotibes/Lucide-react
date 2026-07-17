# 🎨 Design System - Modern BI Dashboard

**Lucide React - Gestão Patrimonial, Análise Financeira & Contábil**

Padrões visuais modernos com foco em:
- 🔷 **Bento Grid** - Layouts responsivos e elegantes
- 🌫️ **Glassmorphism** - Efeitos de vidro translúcido
- 🎯 **Bottom Navigation** - Navegação ergonômica mobile-first
- ✨ **Micro-interações** - Feedback visual sutil e sofisticado

---

## 📋 Índice

1. [Paleta de Cores](#paleta-de-cores)
2. [Tipografia](#tipografia)
3. [Componentes](#componentes)
4. [Padrões de Layout](#padrões-de-layout)
5. [Guia de Uso](#guia-de-uso)
6. [Acessibilidade](#acessibilidade)

---

## 🎨 Paleta de Cores

### Dark Mode 2.0 (Principal)

```
Fundo Primário:     #0f172a (Deep Navy)
Fundo Secundário:   #1a2332 (Slightly Lighter)
Fundo Terciário:    #243549 (Card Backgrounds)
Fundo Hover:        #2d4563 (Interactive States)

Texto Principal:    #f1f5f9 (Light)
Texto Secundário:   #cbd5e1 (Medium)
Texto Terciário:    #94a3b8 (Subtle)

Borda Clara:        #334155 (Subtle)
Borda Média:        #475569 (Medium)
```

### Cores de Acentuação

```
Primária (Azul):    #3b82f6 (Ações principais)
Ouro:               #d4af37 (Premium, destaque)
Esmeralda (Verde):  #10b981 (Sucesso, crescimento)

Semânticas:
- Sucesso:          #10b981 (Green)
- Aviso:            #f59e0b (Amber)
- Erro:             #ef4444 (Red)
- Info:             #3b82f6 (Blue)
```

### Glassmorphism (Transparência)

```css
--glass-bg: rgba(30, 41, 59, 0.7);           /* Semi-transparent base */
--glass-border: rgba(226, 232, 240, 0.1);    /* Subtle white border */
--glass-blur: backdrop-filter blur(10px);    /* Blur effect */
```

**Exemplo CSS**:
```css
.glass {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(226, 232, 240, 0.1);
  border-radius: 12px;
}
```

---

## 🔤 Tipografia

### Fonte

**Display & UI**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif`  
**Mono**: `'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Menlo`

### Escala de Tamanhos

| Nível | Tamanho | Peso | Caso | Uso |
|-------|---------|------|------|-----|
| H1 | 2rem (32px) | 700 | Sentence | Títulos principais |
| H2 | 1.5rem (24px) | 700 | Sentence | Subtítulos |
| H3 | 1.25rem (20px) | 600 | Sentence | Seções |
| H4 | 1rem (16px) | 600 | Sentence | Labels |
| Body | 1rem (16px) | 400 | Sentence | Conteúdo |
| Small | 0.875rem (14px) | 400 | Sentence | Secundário |
| Micro | 0.75rem (12px) | 500 | UPPERCASE | Badges |

### Espaçamento (Escala de 0.5rem)

```
xs:   0.25rem (4px)    sm:  0.5rem (8px)
md:   1rem (16px)      lg:  1.5rem (24px)
xl:   2rem (32px)      2xl: 3rem (48px)
```

---

## 🧩 Componentes

### 1. Glass Card

Componente base para todos os cards com efeito glassmorphism.

**Props**:
```typescript
interface GlassCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'premium' | 'interactive';
  title?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}
```

**Uso**:
```tsx
import { GlassCard } from '@/components/modern';

<GlassCard variant="premium" title="Receita Total" icon="💰">
  <div className="text-3xl font-bold text-[#d4af37]">R$ 250.000</div>
</GlassCard>
```

**Variantes**:
- `default`: Vidro translúcido padrão
- `premium`: Com brilho ouro (destaque especial)
- `interactive`: Com hover effect e cursor pointer

---

### 2. KPI Card Modern

Card específico para indicadores-chave com tendências.

**Props**:
```typescript
interface KPICardModernProps {
  title: string;
  value: number | string;
  previousValue?: number;
  unit?: string;
  icon?: string;
  trend?: 'up' | 'down' | 'stable';
  trendPercentage?: number;
  status?: 'success' | 'warning' | 'error' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
}
```

**Uso**:
```tsx
import { KPICardModern } from '@/components/modern';

<KPICardModern
  title="EBITDA"
  value={150000}
  previousValue={120000}
  unit="R$"
  icon="📈"
  trend="up"
  trendPercentage={25}
  status="success"
  size="md"
/>
```

**Status Colors**:
- `success`: Verde (#10b981)
- `warning`: Âmbar (#f59e0b)
- `error`: Vermelho (#ef4444)
- `neutral`: Azul (#3b82f6)

---

### 3. Bento Grid

Layout responsivo em grade assimétrica.

**Props**:
```typescript
interface BentoGridProps {
  children: React.ReactNode;
  gap?: 'sm' | 'md' | 'lg';  // spacing entre items
}

interface BentoItemProps {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';  // tamanho do item
}
```

**Uso**:
```tsx
import { BentoGrid, BentoItem } from '@/components/modern';

<BentoGrid gap="md">
  <BentoItem size="sm">
    <KPICardModern ... />
  </BentoItem>
  <BentoItem size="md">
    {/* Ocupa 2 linhas em desktop */}
    <GlassCard>Chart Content</GlassCard>
  </BentoItem>
  <BentoItem size="lg">
    {/* Ocupa 2 colunas */}
    <GlassCard>Full Width Chart</GlassCard>
  </BentoItem>
</BentoGrid>
```

**Responsividade**:
```
Mobile:   1 coluna (todos size 'sm')
Tablet:   2 colunas (size 'md' = 2 linhas)
Desktop:  4 colunas (size 'lg' = 2 colunas)
```

---

### 4. Bottom Navigation

Navegação ergonômica posicionada na parte inferior.

**Props**:
```typescript
interface NavItem {
  label: string;
  path: string;
  icon: string;
  badge?: number;  // notificações
}

interface BottomNavigationProps {
  items: NavItem[];
}
```

**Uso**:
```tsx
import { BottomNavigation } from '@/components/modern';

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: '📊' },
  { label: 'KPIs', path: '/kpis', icon: '📈' },
  { label: 'Relatórios', path: '/reports', icon: '📄' },
  { label: 'Configurações', path: '/settings', icon: '⚙️', badge: 2 },
];

<BottomNavigation items={navItems} />
```

**Features**:
- Indicador ativo com glow
- Badges para notificações
- Hover effect elegante
- Mobile-first design

---

## 🎯 Padrões de Layout

### Dashboard Principal (Bento Grid Cognitivo)

```
┌─────────────────────────────────────────┐
│  [KPI 1: Receita]  [Gráfico Tendências]  │
│  [KPI 2: EBITDA]   [Gráfico Tendências]  │
├─────────────────────────────────────────┤
│  [Timeline / Status Processado]  (Full) │
├─────────────────────────────────────────┤
│  [Alertas]      │  [Movimentações]      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ [Bottom Navigation]                     │
└─────────────────────────────────────────┘
```

### Mobile (Single Column)

```
┌──────────────┐
│ [KPI 1]      │
├──────────────┤
│ [KPI 2]      │
├──────────────┤
│ [Chart]      │
├──────────────┤
│ [Timeline]   │
├──────────────┤
│ [Bottom Nav] │
└──────────────┘
```

---

## 📱 Guia de Uso

### Exemplo Completo: Dashboard Modern

```tsx
import React from 'react';
import {
  BentoGrid,
  BentoItem,
  KPICardModern,
  GlassCard,
  BottomNavigation,
} from '@/components/modern';

export const DashboardModern: React.FC = () => {
  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Relatórios', path: '/reports', icon: '📄' },
    { label: 'Análises', path: '/analytics', icon: '📈' },
  ];

  return (
    <div className="bg-[#0f172a] min-h-screen pb-[80px]">
      <div className="container px-4 py-6">
        <h1 className="text-3xl font-bold text-[#f1f5f9] mb-8">
          Dashboard Patrimonial
        </h1>

        <BentoGrid gap="md">
          {/* KPI - Receita Bruta */}
          <BentoItem size="sm">
            <KPICardModern
              title="Faturamento Bruto"
              value={250000}
              previousValue={220000}
              unit="R$"
              icon="💰"
              trend="up"
              trendPercentage={13.6}
              status="success"
            />
          </BentoItem>

          {/* KPI - EBITDA */}
          <BentoItem size="sm">
            <KPICardModern
              title="EBITDA"
              value={150000}
              previousValue={120000}
              unit="R$"
              icon="📈"
              trend="up"
              trendPercentage={25}
              status="success"
            />
          </BentoItem>

          {/* Gráfico - Margem */}
          <BentoItem size="md">
            <GlassCard variant="premium" title="Margem de Lucro">
              <div className="text-4xl font-bold text-[#d4af37]">63.8%</div>
              <div className="mt-4 h-2 bg-[rgba(226,232,240,0.1)] rounded-full">
                <div
                  className="h-full bg-[#d4af37] rounded-full w-3/4"
                  style={{ boxShadow: '0 0 10px rgba(212,175,55,0.5)' }}
                />
              </div>
            </GlassCard>
          </BentoItem>

          {/* Timeline */}
          <BentoItem size="lg">
            <GlassCard title="Últimas Movimentações">
              {/* Timeline Component */}
            </GlassCard>
          </BentoItem>
        </BentoGrid>
      </div>

      <BottomNavigation items={navItems} />
    </div>
  );
};

export default DashboardModern;
```

---

## ♿ Acessibilidade

### Contraste

✓ Todas as cores atendem WCAG AA  
✓ Razão mínima de contraste: 4.5:1 para texto  
✓ Razão mínima de contraste: 3:1 para elementos UI  

### Navegação

✓ Teclado: Tab, Enter, Arrow Keys  
✓ Screen Readers: ARIA labels implementados  
✓ Focus: Sempre visível com outline  

### Motion

✓ `prefers-reduced-motion` respeitado  
✓ Animações não são essenciais  
✓ Sem flashes ou piscadas  

### Exemplo com Acessibilidade

```tsx
<GlassCard
  role="article"
  aria-label="KPI: Faturamento Bruto"
  tabIndex={0}
>
  {/* Content */}
</GlassCard>
```

---

## 🎬 Animações & Transições

### Velocidades Padrão

```css
--transition-fast:  150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-base:  250ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow:  350ms cubic-bezier(0.4, 0, 0.2, 1);
```

### Micro-interações Recomendadas

**Hover Effect**: -2px translateY + shadow glow  
**Active Effect**: Sem transform, apenas shadow ajustado  
**Focus Effect**: 3px outline com cor primária  
**Loading**: Skeleton com gradient animation  

---

## 🎓 Referências & Inspiração

**Tendências Aplicadas**:
- Apple Bento Grid Layout
- Microsoft Fluent Design (Dark Mode)
- Figma Interface (Glassmorphism)
- WhatsApp / Telegram (Bottom Navigation)
- Dribbble Trending (Premium Feel)

**Ferramentas Recomendadas**:
- [Tailwind CSS](https://tailwindcss.com)
- [Framer Motion](https://framer.com/motion)
- [Recharts](https://recharts.org)
- [Radix UI](https://www.radix-ui.com)

---

## 📞 Suporte

Para dúvidas ou sugestões sobre o design system:

1. Verifique os exemplos em `/frontend/src/components/modern/`
2. Teste as cores em `frontend/src/styles/design-system.css`
3. Abra uma issue com tag `design` ou `ui`

---

**Última atualização**: 2026-07-17  
**Versão**: 1.0.0  
**Status**: ✅ Production Ready

Desenvolvido com ❤️ para Lucide React BI Dashboard
