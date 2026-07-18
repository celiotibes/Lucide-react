'use client';

import Link from 'next/link';
import {
  BarChart3,
  TrendingUp,
  AlertCircle,
  FileText,
  Zap,
  Flame,
  Clock,
  Gauge,
  Activity,
  Settings2,
} from 'lucide-react';

interface FeatureBi {
  titulo: string;
  descricao: string;
  href: string;
  icone: React.ReactNode;
  status: 'ativo' | 'em_desenvolvimento' | 'planejado';
  cores: {
    bg: string;
    border: string;
    icon: string;
  };
}

const features: FeatureBi[] = [
  {
    titulo: 'Dashboard Executivo',
    descricao: 'Visão geral de KPIs financeiros e operacionais com gráficos interativos',
    href: '/painel-gestao/bi/dashboard',
    icone: <BarChart3 className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      icon: 'text-blue-400',
    },
  },
  {
    titulo: 'Fluxo de Caixa (Sankey)',
    descricao: 'Visualização do fluxo de receitas, deduções, custos e resultado',
    href: '/painel-gestao/bi/fluxo-caixa',
    icone: <TrendingUp className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      icon: 'text-emerald-400',
    },
  },
  {
    titulo: 'Análise de Custos (Heatmap)',
    descricao: 'Mapa de calor mostrando intensidade de custos por período e categoria',
    href: '/painel-gestao/bi/analise-calor',
    icone: <Flame className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
      icon: 'text-orange-400',
    },
  },
  {
    titulo: 'Relatórios Exportáveis',
    descricao: 'Gere e exporte relatórios em PDF, Excel ou CSV em múltiplos formatos',
    href: '/painel-gestao/bi/relatorios',
    icone: <FileText className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/30',
      icon: 'text-purple-400',
    },
  },
  {
    titulo: 'Sistema de Alertas',
    descricao: 'Configuração e monitoramento de alertas automáticos de margem, anomalias e atrasos',
    href: '/painel-gestao/bi/alertas',
    icone: <AlertCircle className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      icon: 'text-rose-400',
    },
  },
  {
    titulo: 'Histórico de Alertas',
    descricao: 'Consulte todos os alertas disparados com filtros por data e severidade',
    href: '/painel-gestao/bi/alertas/historico',
    icone: <Clock className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      icon: 'text-amber-400',
    },
  },
  {
    titulo: 'DRE (Demonstração de Resultado)',
    descricao: 'Análise detalhada com gráfico Waterfall mostrando composição do resultado',
    href: '/painel-gestao/bi/dre',
    icone: <Gauge className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-500/30',
      icon: 'text-indigo-400',
    },
  },
  {
    titulo: 'Performance & Analytics',
    descricao: 'Métricas de sistema, estatísticas de uso e recomendações de otimização',
    href: '/painel-gestao/bi/performance',
    icone: <Activity className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/30',
      icon: 'text-cyan-400',
    },
  },
  {
    titulo: 'Configurações',
    descricao: 'Gerencie ETL, cache, real-time, alertas e performance do sistema',
    href: '/painel-gestao/bi/configuracoes',
    icone: <Settings2 className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-slate-500/10',
      border: 'border-slate-500/30',
      icon: 'text-slate-400',
    },
  },
  {
    titulo: 'Previsões e ML',
    descricao: 'Forecasting de receitas, custos e detecção de anomalias com machine learning',
    href: '#',
    icone: <Zap className="w-6 h-6" />,
    status: 'planejado',
    cores: {
      bg: 'bg-pink-500/10',
      border: 'border-pink-500/30',
      icon: 'text-pink-400',
    },
  },
];

function getStatusBadge(status: string) {
  switch (status) {
    case 'ativo':
      return (
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          ✓ Ativo
        </span>
      );
    case 'em_desenvolvimento':
      return (
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          🔄 Em Dev
        </span>
      );
    case 'planejado':
      return (
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-400 border border-slate-500/30">
          📅 Planejado
        </span>
      );
    default:
      return null;
  }
}

export default function PaginaBi() {
  const featuresAtivas = features.filter((f) => f.status === 'ativo');
  const featuresEmDev = features.filter((f) => f.status === 'em_desenvolvimento');
  const featuresPlanejadas = features.filter((f) => f.status === 'planejado');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-12 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">Business Intelligence</h1>
          <p className="text-slate-400 text-lg">
            Plataforma integrada de análise, relatórios e alertas do sistema financeiro
          </p>
        </div>

        {/* Resumo Rápido - Glassmorphism Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 backdrop-blur-xl rounded-xl p-6 border-2 border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-300 shadow-xl">
            <p className="text-sm text-emerald-300/70 mb-2">Módulos Ativos</p>
            <p className="text-4xl font-bold text-emerald-400">{featuresAtivas.length}</p>
            <p className="text-xs text-emerald-300/50 mt-3">Prontos para usar</p>
          </div>

          <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/10 backdrop-blur-xl rounded-xl p-6 border-2 border-amber-500/30 hover:border-amber-500/50 transition-all duration-300 shadow-xl">
            <p className="text-sm text-amber-300/70 mb-2">Em Desenvolvimento</p>
            <p className="text-4xl font-bold text-amber-400">{featuresEmDev.length}</p>
            <p className="text-xs text-amber-300/50 mt-3">Chegando em breve</p>
          </div>

          <div className="bg-gradient-to-br from-slate-500/20 to-slate-400/10 backdrop-blur-xl rounded-xl p-6 border-2 border-slate-500/30 hover:border-slate-500/50 transition-all duration-300 shadow-xl">
            <p className="text-sm text-slate-300/70 mb-2">Planejados</p>
            <p className="text-4xl font-bold text-slate-400">{featuresPlanejadas.length}</p>
            <p className="text-xs text-slate-300/50 mt-3">Próximas fases</p>
          </div>
        </div>

        {/* Recursos Ativos - Bento Grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-100 mb-6">Recursos Disponíveis</h2>
          <div className="grid auto-rows-max gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {/* Dashboard Executivo - Hero card (4 cols) */}
            {featuresAtivas.slice(0, 1).map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className={`lg:col-span-2 lg:row-span-2 group rounded-2xl shadow-2xl p-8 border-2 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${feature.cores.bg} ${feature.cores.border} backdrop-blur-xl`}
              >
                <div className="flex items-start justify-between mb-6">
                  <div className={`p-4 rounded-xl bg-white/10 backdrop-blur ${feature.cores.icon}`}>
                    {feature.icone}
                  </div>
                  {getStatusBadge(feature.status)}
                </div>

                <h3 className="text-2xl font-bold text-slate-100 mb-3 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-purple-400 group-hover:bg-clip-text">
                  {feature.titulo}
                </h3>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed">{feature.descricao}</p>

                <div className="mt-auto text-sm font-semibold group-hover:gap-3 inline-flex items-center gap-2 transition-all text-slate-300">
                  Acessar
                  <span className="group-hover:translate-x-2 transition-transform">→</span>
                </div>
              </Link>
            ))}

            {/* Sankey + Heatmap (lado direito) */}
            {featuresAtivas.slice(1, 3).map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className={`group rounded-xl shadow-lg p-6 border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${feature.cores.bg} ${feature.cores.border} backdrop-blur-xl`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg bg-white/10 backdrop-blur ${feature.cores.icon}`}>
                    {feature.icone}
                  </div>
                  {getStatusBadge(feature.status)}
                </div>

                <h3 className="text-lg font-bold text-slate-100 mb-2 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-purple-400 group-hover:bg-clip-text">
                  {feature.titulo}
                </h3>
                <p className="text-xs text-slate-400">{feature.descricao}</p>

                <div className="mt-4 text-xs font-medium group-hover:gap-2 inline-flex items-center gap-1 transition-all text-slate-300">
                  Acessar
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </Link>
            ))}

            {/* Relatórios, Alertas, etc (grid inferior) */}
            {featuresAtivas.slice(3).map((feature, idx) => (
              <Link
                key={feature.href}
                href={feature.href}
                className={`group rounded-xl shadow-lg p-6 border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${feature.cores.bg} ${feature.cores.border} backdrop-blur-xl ${
                  idx === 4 ? 'lg:col-span-2' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg bg-white/10 backdrop-blur ${feature.cores.icon}`}>
                    {feature.icone}
                  </div>
                  {getStatusBadge(feature.status)}
                </div>

                <h3 className="text-lg font-bold text-slate-100 mb-2 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-purple-400 group-hover:bg-clip-text">
                  {feature.titulo}
                </h3>
                <p className="text-xs text-slate-400">{feature.descricao}</p>

                <div className="mt-4 text-xs font-medium group-hover:gap-2 inline-flex items-center gap-1 transition-all text-slate-300">
                  Acessar
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recursos em Desenvolvimento */}
        {featuresEmDev.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-slate-100 mb-6">Em Desenvolvimento</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuresEmDev.map((feature) => (
                <div
                  key={feature.href}
                  className={`group rounded-xl p-6 border-2 opacity-60 ${feature.cores.bg} ${feature.cores.border} backdrop-blur-xl`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg bg-white/10 backdrop-blur ${feature.cores.icon}`}>
                      {feature.icone}
                    </div>
                    {getStatusBadge(feature.status)}
                  </div>

                  <h3 className="text-lg font-semibold text-slate-100 mb-2">{feature.titulo}</h3>
                  <p className="text-sm text-slate-400">{feature.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recursos Planejados */}
        {featuresPlanejadas.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-slate-100 mb-6">Planejados</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuresPlanejadas.map((feature) => (
                <div
                  key={feature.href}
                  className={`group rounded-xl p-6 border-2 opacity-50 ${feature.cores.bg} ${feature.cores.border} backdrop-blur-xl`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg bg-white/10 backdrop-blur ${feature.cores.icon}`}>
                      {feature.icone}
                    </div>
                    {getStatusBadge(feature.status)}
                  </div>

                  <h3 className="text-lg font-semibold text-slate-100 mb-2">{feature.titulo}</h3>
                  <p className="text-sm text-slate-400">{feature.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer com info técnica */}
        <div className="mt-12 pt-8 border-t border-slate-700/50">
          <div className="glass rounded-xl p-6 border-2 border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur-xl">
            <h3 className="text-sm font-semibold text-cyan-300 mb-3">ℹ️ Arquitetura Técnica</h3>
            <ul className="text-sm text-slate-300 space-y-1.5">
              <li>✓ Data Warehouse Star Schema com 5 dimensões e 6 tabelas de fato</li>
              <li>✓ ETL Pipeline automático com execução programada</li>
              <li>✓ Row-Level Security (RLS) para isolamento de dados por papel</li>
              <li>✓ Alertas com 5 tipos de verificação e severity levels (info/alerta/crítico)</li>
              <li>✓ Exportação de relatórios em PDF, Excel e CSV com auditoria</li>
              <li>✓ Sankey Diagrams para visualização de fluxo de caixa</li>
              <li>✓ Heatmaps para análise de centros de custo</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
