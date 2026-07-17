'use client';

import { useState, useEffect } from 'react';
import { Activity, Zap, Database, AlertCircle, TrendingUp, Clock } from 'lucide-react';

interface MetricaPerformance {
  nome: string;
  valor: number;
  unidade: string;
  estado: 'otimo' | 'bom' | 'alerta' | 'critico';
  descricao: string;
}

interface EstatisticaUso {
  modulo: string;
  acessos: number;
  ultimoAcesso: Date;
  tempoMedio: number; // ms
}

export default function PaginaPerformance() {
  const [metricas, setMetricas] = useState<MetricaPerformance[]>([
    {
      nome: 'Query Time (Média)',
      valor: 150,
      unidade: 'ms',
      estado: 'otimo',
      descricao: 'Tempo médio de resposta das queries principais',
    },
    {
      nome: 'ETL Pipeline',
      valor: 4.2,
      unidade: 'min',
      estado: 'otimo',
      descricao: 'Tempo de execução do pipeline diário',
    },
    {
      nome: 'Cache Hit Rate',
      valor: 94.5,
      unidade: '%',
      estado: 'otimo',
      descricao: 'Percentual de requisições servidas do cache',
    },
    {
      nome: 'Realtime Latency',
      valor: 250,
      unidade: 'ms',
      estado: 'bom',
      descricao: 'Latência de updates em tempo real',
    },
    {
      nome: 'Data Warehouse Size',
      valor: 2.3,
      unidade: 'GB',
      estado: 'bom',
      descricao: 'Tamanho total do warehouse',
    },
    {
      nome: 'Dashboard Load Time',
      valor: 1.2,
      unidade: 's',
      estado: 'otimo',
      descricao: 'Tempo de carregamento da página principal',
    },
  ]);

  const [estatisticas, setEstatisticas] = useState<EstatisticaUso[]>([
    {
      modulo: 'Dashboard Executivo',
      acessos: 1245,
      ultimoAcesso: new Date(Date.now() - 5 * 60000),
      tempoMedio: 1200,
    },
    {
      modulo: 'Relatórios',
      acessos: 342,
      ultimoAcesso: new Date(Date.now() - 30 * 60000),
      tempoMedio: 800,
    },
    {
      modulo: 'Alertas',
      acessos: 567,
      ultimoAcesso: new Date(Date.now() - 10 * 60000),
      tempoMedio: 400,
    },
    {
      modulo: 'Sankey',
      acessos: 189,
      ultimoAcesso: new Date(Date.now() - 2 * 60 * 60000),
      tempoMedio: 900,
    },
  ]);

  function getEstadoColor(estado: string) {
    switch (estado) {
      case 'otimo':
        return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'bom':
        return 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'alerta':
        return 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
      case 'critico':
        return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      default:
        return '';
    }
  }

  function formatarTempo(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function tempoDesdeAcesso(data: Date) {
    const diff = Date.now() - data.getTime();
    const minutos = Math.floor(diff / 60000);
    const horas = Math.floor(minutos / 60);

    if (minutos < 1) return 'Agora';
    if (minutos < 60) return `Há ${minutos}m`;
    if (horas < 24) return `Há ${horas}h`;
    return `Há ${Math.floor(horas / 24)}d`;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Performance & Analytics</h1>
          <p className="text-gray-600 dark:text-gray-400">Métricas de sistema e estatísticas de uso</p>
        </div>

        {/* Metricas de Performance */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {metricas.map((m) => (
            <div
              key={m.nome}
              className={`rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${getEstadoColor(m.estado)}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{m.nome}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                    {m.valor} <span className="text-lg text-gray-600 dark:text-gray-400">{m.unidade}</span>
                  </p>
                </div>
                <Zap className="w-6 h-6" />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{m.descricao}</p>
            </div>
          ))}
        </div>

        {/* Estatísticas de Uso */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Estatísticas de Uso
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Módulo</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Acessos</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Último Acesso</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Tempo Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {estatisticas.map((e) => (
                  <tr key={e.modulo} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-3 text-gray-900 dark:text-white font-medium">{e.modulo}</td>
                    <td className="px-6 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        {e.acessos}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {tempoDesdeAcesso(e.ultimoAcesso)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="inline-block px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-xs font-medium">
                        {formatarTempo(e.tempoMedio)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sistema de Informação */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Info Técnica */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Informações Técnicas
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Database</p>
                <p className="text-gray-900 dark:text-white font-medium">PostgreSQL 14+ (Supabase)</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Warehouse Tables</p>
                <p className="text-gray-900 dark:text-white font-medium">9 (5 dim + 6 fact - 2 shared)</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Real-time</p>
                <p className="text-gray-900 dark:text-white font-medium">Supabase Realtime + WebSocket</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">ETL Frequência</p>
                <p className="text-gray-900 dark:text-white font-medium">Diária (cron)</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">RLS</p>
                <p className="text-gray-900 dark:text-white font-medium">Ativo em todas tabelas</p>
              </div>
            </div>
          </div>

          {/* Recomendações */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Recomendações
            </h3>
            <ul className="space-y-3">
              <li className="flex gap-2">
                <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
                <span className="text-gray-700 dark:text-gray-300">Cache funcionando bem (94.5%)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-green-600 dark:text-green-400 font-bold">✓</span>
                <span className="text-gray-700 dark:text-gray-300">Realtime latency aceitável (250ms)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-bold">→</span>
                <span className="text-gray-700 dark:text-gray-300">Monitorar Realtime latency (pico 500ms)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-bold">→</span>
                <span className="text-gray-700 dark:text-gray-300">Executar VACUUM em warehouse (mensal)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
