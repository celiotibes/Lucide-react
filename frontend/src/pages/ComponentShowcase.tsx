/**
 * Component Showcase
 * Demonstração de todos os componentes modernos do design system
 */

import React from 'react';
import {
  BentoGrid,
  BentoItem,
  KPICardModern,
  GlassCard,
  BottomNavigation,
} from '../components/modern';

export const ComponentShowcase: React.FC = () => {
  const navItems = [
    { label: 'Showcase', path: '/showcase', icon: '🎨' },
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Relatórios', path: '/reports', icon: '📄' },
    { label: 'Perfil', path: '/profile', icon: '👤' },
  ];

  return (
    <div className="bg-[#0f172a] min-h-screen pb-[80px]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a2332] to-[#243549] border-b border-[#334155] py-8">
        <div className="container px-4 max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-[#f1f5f9] mb-2">
            🎨 Design System Showcase
          </h1>
          <p className="text-[#cbd5e1]">
            Componentes modernos: Bento Grid, Glassmorphism, Bottom Navigation
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container px-4 max-w-7xl mx-auto py-8">
        {/* Section: Glass Cards */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            🌫️ Glass Cards
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Default Glass Card */}
            <GlassCard title="Default Glass" icon="⚡">
              <p className="text-[#cbd5e1] text-sm mb-4">
                Card com efeito glassmorphism padrão
              </p>
              <button className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg text-sm hover:bg-[#1e40af] transition-all">
                Ação Primária
              </button>
            </GlassCard>

            {/* Premium Glass Card */}
            <GlassCard variant="premium" title="Premium Glass" icon="✨">
              <p className="text-[#cbd5e1] text-sm mb-4">
                Card com acentuação em ouro
              </p>
              <div className="text-2xl font-bold text-[#d4af37]">Premium Feel</div>
            </GlassCard>

            {/* Interactive Glass Card */}
            <GlassCard variant="interactive" title="Interactive" icon="🎯">
              <p className="text-[#cbd5e1] text-sm mb-4">
                Hover para ver o efeito interativo
              </p>
              <div className="text-sm text-[#94a3b8]">
                Clique para interagir
              </div>
            </GlassCard>
          </div>
        </section>

        {/* Section: KPI Cards with Bento Grid */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            📊 KPI Cards & Bento Grid
          </h2>

          <BentoGrid gap="md">
            {/* KPI: Receita */}
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

            {/* KPI: EBITDA */}
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

            {/* KPI: Margem */}
            <BentoItem size="sm">
              <KPICardModern
                title="Margem de Lucro"
                value={63.8}
                previousValue={57.1}
                unit="%"
                icon="📊"
                trend="up"
                trendPercentage={11.7}
                status="success"
              />
            </BentoItem>

            {/* Chart Area - Tall */}
            <BentoItem size="md">
              <GlassCard variant="premium" title="Tendência de Receita">
                <div className="h-32 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-[#d4af37] mb-2">
                      ↗ +13.6%
                    </div>
                    <p className="text-sm text-[#94a3b8]">
                      vs. período anterior
                    </p>
                  </div>
                </div>
              </GlassCard>
            </BentoItem>

            {/* KPI: Custos */}
            <BentoItem size="sm">
              <KPICardModern
                title="Custos Operacionais"
                value={80000}
                previousValue={85000}
                unit="R$"
                icon="⚙️"
                trend="down"
                trendPercentage={5.9}
                status="success"
              />
            </BentoItem>

            {/* Timeline - Full Width */}
            <BentoItem size="lg">
              <GlassCard title="Últimas Movimentações">
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-3 pb-3 border-b border-[rgba(226,232,240,0.1)] last:border-b-0"
                    >
                      <div className="w-2 h-2 bg-[#3b82f6] rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm text-[#f1f5f9]">
                          Movimentação #{item}
                        </p>
                        <p className="text-xs text-[#94a3b8]">
                          Há {item} hora{item > 1 ? 's' : ''}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-[#10b981]">
                        +R$ 5.000
                      </span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </BentoItem>
          </BentoGrid>
        </section>

        {/* Section: Color Palette */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            🎨 Paleta de Cores
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Primary */}
            <GlassCard>
              <div className="w-full h-24 bg-[#3b82f6] rounded-lg mb-3"></div>
              <p className="font-mono text-xs text-[#94a3b8]">#3b82f6</p>
              <p className="text-sm font-semibold text-[#f1f5f9]">Primária</p>
            </GlassCard>

            {/* Gold */}
            <GlassCard>
              <div className="w-full h-24 bg-[#d4af37] rounded-lg mb-3"></div>
              <p className="font-mono text-xs text-[#94a3b8]">#d4af37</p>
              <p className="text-sm font-semibold text-[#f1f5f9]">Ouro</p>
            </GlassCard>

            {/* Emerald */}
            <GlassCard>
              <div className="w-full h-24 bg-[#10b981] rounded-lg mb-3"></div>
              <p className="font-mono text-xs text-[#94a3b8]">#10b981</p>
              <p className="text-sm font-semibold text-[#f1f5f9]">Esmeralda</p>
            </GlassCard>

            {/* Warning */}
            <GlassCard>
              <div className="w-full h-24 bg-[#f59e0b] rounded-lg mb-3"></div>
              <p className="font-mono text-xs text-[#94a3b8]">#f59e0b</p>
              <p className="text-sm font-semibold text-[#f1f5f9]">Aviso</p>
            </GlassCard>
          </div>
        </section>

        {/* Section: Buttons & States */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            🔘 Botões & Estados
          </h2>

          <GlassCard>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button className="px-6 py-3 bg-[#3b82f6] text-white rounded-lg font-medium hover:bg-[#1e40af] transition-all">
                Primária
              </button>
              <button className="px-6 py-3 bg-[#d4af37] text-[#0f172a] rounded-lg font-medium hover:bg-[#f0e68c] transition-all">
                Destaque
              </button>
              <button className="px-6 py-3 bg-[#10b981] text-white rounded-lg font-medium hover:bg-[#059669] transition-all">
                Sucesso
              </button>
              <button className="px-6 py-3 bg-[#ef4444] text-white rounded-lg font-medium hover:bg-[#dc2626] transition-all">
                Erro
              </button>
            </div>
          </GlassCard>
        </section>

        {/* Section: Responsive Info */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            📱 Responsividade
          </h2>

          <GlassCard>
            <p className="text-[#cbd5e1] mb-4">
              Este design system é <strong>mobile-first</strong> e responsivo:
            </p>
            <ul className="space-y-2 text-sm text-[#cbd5e1]">
              <li>✓ Mobile (< 768px): 1 coluna Bento Grid</li>
              <li>✓ Tablet (768px - 1024px): 2 colunas</li>
              <li>✓ Desktop (> 1024px): 3-4 colunas</li>
              <li>✓ Bottom Navigation fixa em mobile</li>
              <li>✓ Padding adequado para thumbs</li>
            </ul>
          </GlassCard>
        </section>

        {/* Usage Info */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-[#f1f5f9] mb-6">
            📖 Como Usar
          </h2>

          <GlassCard variant="interactive">
            <div className="font-mono text-sm text-[#cbd5e1] space-y-2">
              <p>
                <span className="text-[#d4af37]">import</span>{' '}
                <span className="text-[#10b981]">{'{'}</span>
              </p>
              <p className="ml-4">
                <span className="text-[#3b82f6]">BentoGrid</span>,{' '}
                <span className="text-[#3b82f6]">BentoItem</span>,
              </p>
              <p className="ml-4">
                <span className="text-[#3b82f6]">KPICardModern</span>,{' '}
                <span className="text-[#3b82f6]">GlassCard</span>,
              </p>
              <p className="ml-4">
                <span className="text-[#3b82f6]">BottomNavigation</span>,
              </p>
              <p>
                <span className="text-[#10b981]">{'}'}</span>{' '}
                <span className="text-[#d4af37]">from</span>{' '}
                <span className="text-[#f0e68c]">
                  '@/components/modern'
                </span>
                ;
              </p>
            </div>
          </GlassCard>
        </section>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation items={navItems} />
    </div>
  );
};

export default ComponentShowcase;
