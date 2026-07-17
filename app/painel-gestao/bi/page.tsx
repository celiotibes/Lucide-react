'use client';

import Link from 'next/link';
import {
  BarChart3,
  TrendingUp,
  AlertCircle,
  FileText,
  Zap,
  HeatmapSquare,
  Clock,
  Gauge,
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
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: 'text-blue-600',
    },
  },
  {
    titulo: 'Fluxo de Caixa (Sankey)',
    descricao: 'Visualização do fluxo de receitas, deduções, custos e resultado',
    href: '/painel-gestao/bi/fluxo-caixa',
    icone: <TrendingUp className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      icon: 'text-green-600',
    },
  },
  {
    titulo: 'Análise de Custos (Heatmap)',
    descricao: 'Mapa de calor mostrando intensidade de custos por período e categoria',
    href: '/painel-gestao/bi/analise-calor',
    icone: <HeatmapSquare className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      icon: 'text-orange-600',
    },
  },
  {
    titulo: 'Relatórios Exportáveis',
    descricao: 'Gere e exporte relatórios em PDF, Excel ou CSV em múltiplos formatos',
    href: '/painel-gestao/bi/relatorios',
    icone: <FileText className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      icon: 'text-purple-600',
    },
  },
  {
    titulo: 'Sistema de Alertas',
    descricao: 'Configuração e monitoramento de alertas automáticos de margem, anomalias e atrasos',
    href: '/painel-gestao/bi/alertas',
    icone: <AlertCircle className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'text-red-600',
    },
  },
  {
    titulo: 'Histórico de Alertas',
    descricao: 'Consulte todos os alertas disparados com filtros por data e severidade',
    href: '/painel-gestao/bi/alertas/historico',
    icone: <Clock className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      icon: 'text-yellow-600',
    },
  },
  {
    titulo: 'DRE (Demonstração de Resultado)',
    descricao: 'Análise detalhada com gráfico Waterfall mostrando composição do resultado',
    href: '/painel-gestao/bi/dre',
    icone: <Gauge className="w-6 h-6" />,
    status: 'ativo',
    cores: {
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      icon: 'text-indigo-600',
    },
  },
  {
    titulo: 'Previsões e ML',
    descricao: 'Forecasting de receitas, custos e detecção de anomalias com machine learning',
    href: '#',
    icone: <Zap className="w-6 h-6" />,
    status: 'planejado',
    cores: {
      bg: 'bg-pink-50',
      border: 'border-pink-200',
      icon: 'text-pink-600',
    },
  },
];

function getStatusBadge(status: string) {
  switch (status) {
    case 'ativo':
      return (
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
          ✓ Ativo
        </span>
      );
    case 'em_desenvolvimento':
      return (
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
          🔄 Em Dev
        </span>
      );
    case 'planejado':
      return (
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Business Intelligence</h1>
          <p className="text-gray-600 text-lg">
            Plataforma integrada de análise, relatórios e alertas do sistema financeiro
          </p>
        </div>

        {/* Resumo Rápido */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
            <p className="text-sm text-gray-600 mb-1">Módulos Ativos</p>
            <p className="text-3xl font-bold text-green-600">{featuresAtivas.length}</p>
            <p className="text-xs text-gray-500 mt-2">Prontos para usar</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-600">
            <p className="text-sm text-gray-600 mb-1">Em Desenvolvimento</p>
            <p className="text-3xl font-bold text-yellow-600">{featuresEmDev.length}</p>
            <p className="text-xs text-gray-500 mt-2">Chegando em breve</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-gray-600">
            <p className="text-sm text-gray-600 mb-1">Planejados</p>
            <p className="text-3xl font-bold text-gray-600">{featuresPlanejadas.length}</p>
            <p className="text-xs text-gray-500 mt-2">Próximas fases</p>
          </div>
        </div>

        {/* Recursos Ativos */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Recursos Disponíveis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuresAtivas.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className={`group rounded-lg shadow p-6 border transition-all hover:shadow-lg hover:scale-105 ${feature.cores.bg} ${feature.cores.border} border-2`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg bg-white ${feature.cores.icon}`}>
                    {feature.icone}
                  </div>
                  {getStatusBadge(feature.status)}
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:underline">
                  {feature.titulo}
                </h3>
                <p className="text-sm text-gray-700">{feature.descricao}</p>

                <div className="mt-4 text-sm font-medium group-hover:gap-3 inline-flex items-center gap-2 transition-all">
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
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Em Desenvolvimento</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuresEmDev.map((feature) => (
                <div
                  key={feature.href}
                  className={`group rounded-lg shadow p-6 border opacity-60 ${feature.cores.bg} ${feature.cores.border} border-2`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg bg-white ${feature.cores.icon}`}>
                      {feature.icone}
                    </div>
                    {getStatusBadge(feature.status)}
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.titulo}</h3>
                  <p className="text-sm text-gray-700">{feature.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recursos Planejados */}
        {featuresPlanejadas.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Planejados</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuresPlanejadas.map((feature) => (
                <div
                  key={feature.href}
                  className={`group rounded-lg shadow p-6 border opacity-50 ${feature.cores.bg} ${feature.cores.border} border-2`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg bg-white ${feature.cores.icon}`}>
                      {feature.icone}
                    </div>
                    {getStatusBadge(feature.status)}
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.titulo}</h3>
                  <p className="text-sm text-gray-700">{feature.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer com info técnica */}
        <div className="mt-12 pt-8 border-t">
          <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">ℹ️ Arquitetura Técnica</h3>
            <ul className="text-sm text-blue-800 space-y-1">
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
