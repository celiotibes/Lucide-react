'use client';

import { useEffect, useState } from 'react';
import {
  obterKPIsFinanceiros,
  obterResumoResidenciais,
  obterPerformancePrestadores,
  type KPIFinanceiro,
  type ResumenMensalResidencial,
  type PerformancePrestador,
} from '@/app/actions/bi/obterKPIs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Users,
  AlertCircle,
  Calendar,
  Home,
  BarChart3,
  PieChart as PieChartIcon,
  RefreshCw,
} from 'lucide-react';
import { AlertasWidget } from '../components/AlertasWidget';
import { useLiveData } from '../hooks/useLiveData';
import { LastUpdatedLabel } from '../components/LiveIndicator';
import { useFiltros } from '../components/FilterContext';
import { StatCard } from '../components/StatCard';

interface DashboardState {
  kpis: KPIFinanceiro[];
  residenciais: ResumenMensalResidencial[];
  prestadores: PerformancePrestador[];
  carregando: boolean;
  erro?: string;
  totalizadores?: {
    faturamentoTotal: number;
    receitaLiquidaTotal: number;
    custoTotal: number;
    margemMedia: number;
  };
}

export default function BiDashboard() {
  const { filtros, atualizarFiltro } = useFiltros();

  const [localDataInicio, setLocalDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    return d.toISOString().split('T')[0];
  });

  const [localDataFim, setLocalDataFim] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );

  const { data: kpisData, loading: kpisLoading, lastUpdated: kpisUpdated } = useLiveData(
    async () => {
      const res = await obterKPIsFinanceiros(localDataInicio, localDataFim);
      return res.sucesso ? res.kpis || [] : [];
    },
    {
      dependsOnTables: ['fact_faturamento', 'fact_despesa', 'fact_recebimento'],
      refreshInterval: 30000
    }
  );

  const { data: residenciaisData, loading: residenciaisLoading } = useLiveData(
    async () => {
      const res = await obterResumoResidenciais(localDataInicio, localDataFim);
      return res.sucesso ? res.residenciais || [] : [];
    },
    { dependsOnTables: ['fact_despesa', 'fact_faturamento'] }
  );

  const { data: prestadoresData, loading: prestadoresLoading } = useLiveData(
    async () => {
      const res = await obterPerformancePrestadores(localDataInicio, localDataFim);
      return res.sucesso ? res.prestadores || [] : [];
    },
    { dependsOnTables: ['fact_apontamento'] }
  );

  const kpisRes = {
    sucesso: true,
    kpis: kpisData || [],
    totalizadores: kpisData && kpisData.length > 0 ? {
      faturamentoTotal: kpisData.reduce((sum, k) => sum + (k.faturamentoTotal || 0), 0),
      receitaLiquidaTotal: kpisData.reduce((sum, k) => sum + (k.receitaLiquida || 0), 0),
      custoTotal: kpisData.reduce((sum, k) => sum + (k.custoOperacional || 0) + (k.custoDespesas || 0), 0),
      margemMedia: kpisData.length > 0 ? kpisData.reduce((sum, k) => sum + (k.margemPercentual || 0), 0) / kpisData.length : 0,
    } : undefined,
  };

  const state: DashboardState = {
    kpis: kpisRes.kpis || [],
    residenciais: residenciaisData || [],
    prestadores: prestadoresData || [],
    carregando: kpisLoading || residenciaisLoading || prestadoresLoading,
    totalizadores: kpisRes.totalizadores,
  };

  const carregarDados = () => {
    window.location.reload();
  };

  const COLORS = ['#06B6D4', '#A855F7', '#10B981', '#F59E0B', '#EF4444'];

  const margemTrend = state.kpis.length > 1
    ? ((state.kpis[state.kpis.length - 1].margemPercentual || 0) - (state.kpis[0].margemPercentual || 0)).toFixed(1)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">Dashboard Executivo</h1>
          <p className="text-slate-400">Análise em tempo real de desempenho financeiro e operacional</p>
        </div>

        {/* Filtros de Data - Glassmorphism */}
        <div className="glass rounded-xl p-6 mb-8 border-2 border-slate-700/50 backdrop-blur-xl animate-slideDown" style={{animationDelay: '50ms'}}>
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-fit">
              <label className="block text-sm font-medium text-slate-300 mb-2">Data Início</label>
              <input
                type="date"
                value={localDataInicio}
                onChange={(e) => setLocalDataInicio(e.target.value)}
                className="px-4 py-2 glass rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              />
            </div>
            <div className="flex-1 min-w-fit">
              <label className="block text-sm font-medium text-slate-300 mb-2">Data Fim</label>
              <input
                type="date"
                value={localDataFim}
                onChange={(e) => setLocalDataFim(e.target.value)}
                className="px-4 py-2 glass rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              />
            </div>
            <button
              onClick={carregarDados}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-medium flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-cyan-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
            <div className="ml-auto flex items-center gap-2">
              <LastUpdatedLabel timestamp={kpisUpdated} loading={state.carregando} />
            </div>
          </div>
        </div>

        {/* Widget de Alertas */}
        <div className="mb-8 animate-slideDown" style={{animationDelay: '100ms'}}>
          <AlertasWidget autoRefresh={true} refreshInterval={60000} />
        </div>

        {/* KPIs Principais - StatCards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="stagger-item">
            <StatCard
              title="Faturamento Total"
              value={`R$ ${(state.totalizadores?.faturamentoTotal || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
              state="otimo"
              icon={<DollarSign className="w-5 h-5" />}
              trend={5}
              data={state.kpis.map(k => k.faturamentoTotal || 0)}
            />
          </div>

          <div className="stagger-item" style={{animationDelay: '50ms'}}>
            <StatCard
              title="Receita Líquida"
              value={`R$ ${(state.totalizadores?.receitaLiquidaTotal || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
              state="otimo"
              icon={<TrendingUp className="w-5 h-5" />}
              trend={3}
              data={state.kpis.map(k => k.receitaLiquida || 0)}
            />
          </div>

          <div className="stagger-item" style={{animationDelay: '100ms'}}>
            <StatCard
              title="Custo Total"
              value={`R$ ${(state.totalizadores?.custoTotal || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
              state="alerta"
              icon={<BarChart3 className="w-5 h-5" />}
              trend={-2}
              data={state.kpis.map(k => (k.custoOperacional || 0) + (k.custoDespesas || 0))}
            />
          </div>

          <div className="stagger-item" style={{animationDelay: '150ms'}}>
            <StatCard
              title="Margem Média"
              value={`${(state.totalizadores?.margemMedia || 0).toFixed(1)}%`}
              state="bom"
              icon={<PieChartIcon className="w-5 h-5" />}
              trend={parseFloat(margemTrend as string)}
              data={state.kpis.map(k => k.margemPercentual || 0)}
            />
          </div>
        </div>

        {/* Gráficos Principais */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Faturamento vs Receita Líquida */}
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{animationDelay: '200ms'}}>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full" />
              Faturamento vs Receita Líquida
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={state.kpis}>
                <defs>
                  <linearGradient id="colorFaturamento" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="nomeMes" stroke="#94A3B8" />
                <YAxis stroke="#94A3B8" />
                <Tooltip
                  formatter={(value) =>
                    `R$ ${(value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  }
                  contentStyle={{backgroundColor: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px'}}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="faturamentoTotal"
                  fill="url(#colorFaturamento)"
                  stroke="#06B6D4"
                  name="Faturamento"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="receitaLiquida"
                  fill="url(#colorReceita)"
                  stroke="#10B981"
                  name="Receita Líquida"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Margem Percentual Mensal */}
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{animationDelay: '250ms'}}>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
              Evolução de Margem
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={state.kpis}>
                <defs>
                  <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="nomeMes" stroke="#94A3B8" />
                <YAxis label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#94A3B8' }} stroke="#94A3B8" />
                <Tooltip
                  formatter={(value) => `${(value as number).toFixed(2)}%`}
                  contentStyle={{backgroundColor: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px'}}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="margemPercentual"
                  stroke="#A855F7"
                  name="Margem %"
                  strokeWidth={3}
                  dot={{ fill: '#A855F7', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Análise por Residencial */}
        <div className="glass rounded-xl p-6 mb-8 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{animationDelay: '300ms'}}>
          <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-cyan-500 rounded-full" />
            Custos por Residencial
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={state.residenciais.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="residencial" angle={-45} textAnchor="end" height={80} stroke="#94A3B8" />
              <YAxis stroke="#94A3B8" />
              <Tooltip
                formatter={(value) =>
                  `R$ ${(value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                }
                contentStyle={{backgroundColor: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px'}}
              />
              <Legend />
              <Bar dataKey="custoTotal" fill="#06B6D4" name="Custo Total" radius={[8, 8, 0, 0]} />
              <Bar dataKey="faturamentoLiquido" fill="#10B981" name="Faturamento Líquido" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribuição de Custos (Pie Chart) */}
        <div className="glass rounded-xl p-6 mb-8 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{animationDelay: '350ms'}}>
          <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-rose-500 to-orange-500 rounded-full" />
            Distribuição de Custos
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={state.residenciais.slice(0, 5)}
                dataKey="custoTotal"
                nameKey="residencial"
                cx="50%"
                cy="50%"
                outerRadius={150}
                label
              >
                {state.residenciais.slice(0, 5).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) =>
                  `R$ ${(value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                }
                contentStyle={{backgroundColor: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px'}}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Performance de Prestadores */}
        <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{animationDelay: '400ms'}}>
          <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full" />
            Top 10 Prestadores por Valor
          </h2>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 border-b border-slate-700/30">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">Prestador</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Apontamentos</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Horas</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Valor Total</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Valor/Hora</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Taxa Anomalia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {state.prestadores
                  .sort((a, b) => b.valorTotal - a.valorTotal)
                  .slice(0, 10)
                  .map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-6 py-3 text-slate-100 font-medium">{p.nomePrestador}</td>
                      <td className="px-6 py-3 text-right text-slate-400">{p.apontamentos}</td>
                      <td className="px-6 py-3 text-right text-slate-400">{p.horasTotais.toFixed(1)}h</td>
                      <td className="px-6 py-3 text-right font-semibold text-cyan-400">
                        R$ {p.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-400">
                        R$ {p.valorHoraEfetivo.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
                            p.taxaAnomalia > 10
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : p.taxaAnomalia > 5
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {p.taxaAnomalia.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
