'use client';

import { useState, useEffect } from 'react';
import { Activity, Zap, Database, AlertCircle, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';

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
  tempoMedio: number;
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
        return 'from-emerald-500/20 to-cyan-500/10 border-emerald-500/30';
      case 'bom':
        return 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30';
      case 'alerta':
        return 'from-amber-500/20 to-orange-500/10 border-amber-500/30';
      case 'critico':
        return 'from-rose-500/20 to-red-500/10 border-rose-500/30';
      default:
        return 'from-slate-500/20 to-slate-400/10 border-slate-500/30';
    }
  }

  function getEstadoIcon(estado: string) {
    switch (estado) {
      case 'otimo':
        return <CheckCircle2 className="w-6 h-6 text-emerald-400" />;
      case 'bom':
        return <Zap className="w-6 h-6 text-cyan-400" />;
      case 'alerta':
        return <AlertCircle className="w-6 h-6 text-amber-400" />;
      case 'critico':
        return <AlertCircle className="w-6 h-6 text-rose-400" />;
      default:
        return <Zap className="w-6 h-6 text-slate-400" />;
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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">Performance & Analytics</h1>
          <p className="text-slate-400">Métricas de sistema e estatísticas de uso em tempo real</p>
        </div>

        {/* Metricas de Performance */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {metricas.map((m, idx) => (
            <div
              key={m.nome}
              className={`glass rounded-xl p-6 border-2 ${getEstadoColor(m.estado)} backdrop-blur-xl hover-lift stagger-item transition-all`}
              style={{animationDelay: `${idx * 50}ms`}}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-400 mb-2">{m.nome}</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-slate-100">
                      {m.valor}
                    </p>
                    <span className="text-sm text-slate-400">{m.unidade}</span>
                  </div>
                </div>
                {getEstadoIcon(m.estado)}
              </div>
              <p className="text-xs text-slate-400">{m.descricao}</p>
            </div>
          ))}
        </div>

        {/* Estatísticas de Uso */}
        <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl mb-8 hover-lift animate-slideDown" style={{animationDelay: '300ms'}}>
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3">
            <span className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full" />
            Estatísticas de Uso
          </h2>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 border-b border-slate-700/30">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">Módulo</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Acessos</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Último Acesso</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Tempo Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {estatisticas.map((e) => (
                  <tr key={e.modulo} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-3 text-slate-100 font-medium">{e.modulo}</td>
                    <td className="px-6 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-cyan-400 font-medium">
                        <TrendingUp className="w-4 h-4" />
                        {e.acessos}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {tempoDesdeAcesso(e.ultimoAcesso)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="inline-block px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-400 text-xs font-medium border border-cyan-500/30">
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
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift stagger-item animate-slideDown" style={{animationDelay: '350ms'}}>
            <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-purple-400" />
              <span className="w-1 h-5 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
              Informações Técnicas
            </h3>
            <div className="space-y-4">
              <div className="border-l border-slate-700/50 pl-4">
                <p className="text-sm text-slate-400 mb-1">Database</p>
                <p className="text-slate-100 font-medium">PostgreSQL 14+ (Supabase)</p>
              </div>
              <div className="border-l border-slate-700/50 pl-4">
                <p className="text-sm text-slate-400 mb-1">Warehouse Tables</p>
                <p className="text-slate-100 font-medium">9 (5 dim + 6 fact - 2 shared)</p>
              </div>
              <div className="border-l border-slate-700/50 pl-4">
                <p className="text-sm text-slate-400 mb-1">Real-time</p>
                <p className="text-slate-100 font-medium">Supabase Realtime + WebSocket</p>
              </div>
              <div className="border-l border-slate-700/50 pl-4">
                <p className="text-sm text-slate-400 mb-1">ETL Frequência</p>
                <p className="text-slate-100 font-medium">Diária (cron)</p>
              </div>
              <div className="border-l border-slate-700/50 pl-4">
                <p className="text-sm text-slate-400 mb-1">RLS</p>
                <p className="text-slate-100 font-medium">Ativo em todas tabelas</p>
              </div>
            </div>
          </div>

          {/* Recomendações */}
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift stagger-item animate-slideDown" style={{animationDelay: '400ms'}}>
            <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              <span className="w-1 h-5 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full" />
              Recomendações
            </h3>
            <ul className="space-y-3">
              <li className="flex gap-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-emerald-400 font-bold flex-shrink-0">✓</span>
                <span className="text-slate-300 text-sm">Cache funcionando bem (94.5%)</span>
              </li>
              <li className="flex gap-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-emerald-400 font-bold flex-shrink-0">✓</span>
                <span className="text-slate-300 text-sm">Realtime latency aceitável (250ms)</span>
              </li>
              <li className="flex gap-3 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                <span className="text-cyan-400 font-bold flex-shrink-0">→</span>
                <span className="text-slate-300 text-sm">Monitorar Realtime latency (pico 500ms)</span>
              </li>
              <li className="flex gap-3 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                <span className="text-cyan-400 font-bold flex-shrink-0">→</span>
                <span className="text-slate-300 text-sm">Executar VACUUM em warehouse (mensal)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
