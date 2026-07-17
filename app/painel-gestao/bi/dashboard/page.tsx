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
} from 'lucide-react';
import { AlertasWidget } from '../components/AlertasWidget';
import { useLiveData } from '../hooks/useLiveData';
import { LastUpdatedLabel } from '../components/LiveIndicator';
import { useFiltros } from '../components/FilterContext';

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

  // Use filtros globais ou valores padrão
  const [localDataInicio, setLocalDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    return d.toISOString().split('T')[0];
  });

  const [localDataFim, setLocalDataFim] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );

  // Live data hooks
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
    // Force refresh via live data hooks
    window.location.reload();
  };

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Business Intelligence</h1>
          <p className="text-gray-600">Dashboard executivo de desempenho financeiro e operacional</p>
        </div>

        {/* Filtros de Data */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8 border border-gray-200 dark:border-gray-700">
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data Início</label>
              <input
                type="date"
                value={localDataInicio}
                onChange={(e) => setLocalDataInicio(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data Fim</label>
              <input
                type="date"
                value={localDataFim}
                onChange={(e) => setLocalDataFim(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={carregarDados}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 font-medium"
            >
              Atualizar
            </button>
            <div className="ml-auto flex items-center gap-2">
              <LastUpdatedLabel timestamp={kpisUpdated} loading={state.carregando} />
            </div>
          </div>
        </div>

        {/* Widget de Alertas */}
        <div className="mb-8">
          <AlertasWidget autoRefresh={true} refreshInterval={60000} />
        </div>

        {/* KPIs Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-blue-600 dark:border-blue-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <DollarSign className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Faturamento Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  R$ {(state.totalizadores?.faturamentoTotal || 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-green-600 dark:border-green-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Receita Líquida</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  R$ {(state.totalizadores?.receitaLiquidaTotal || 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-purple-600 dark:border-purple-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <BarChart3 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Custo Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  R$ {(state.totalizadores?.custoTotal || 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-orange-600 dark:border-orange-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <PieChartIcon className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Margem Média</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {(state.totalizadores?.margemMedia || 0).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Gráficos Principais */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Faturamento vs Receita Líquida */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Faturamento vs Receita Líquida</h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={state.kpis}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nomeMes" />
                <YAxis />
                <Tooltip
                  formatter={(value) =>
                    `R$ ${(value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  }
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="faturamentoTotal"
                  fill="#3B82F6"
                  stroke="#3B82F6"
                  name="Faturamento"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="receitaLiquida"
                  fill="#10B981"
                  stroke="#10B981"
                  name="Receita Líquida"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Margem Percentual Mensal */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Evolução de Margem</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={state.kpis}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nomeMes" />
                <YAxis label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => `${(value as number).toFixed(2)}%`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="margemPercentual"
                  stroke="#8B5CF6"
                  name="Margem %"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Análise por Residencial */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Custos por Residencial</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={state.residenciais.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="residencial" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip
                formatter={(value) =>
                  `R$ ${(value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                }
              />
              <Legend />
              <Bar dataKey="custoTotal" fill="#3B82F6" name="Custo Total" />
              <Bar dataKey="faturamentoLiquido" fill="#10B981" name="Faturamento Líquido" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribuição de Custos (Pie Chart) */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Distribuição de Custos por Residencial</h2>
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
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Performance de Prestadores */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Prestadores por Valor</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-900">Prestador</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Apontamentos</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Horas</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Valor Total</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Valor/Hora</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Taxa Anomalia</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {state.prestadores
                  .sort((a, b) => b.valorTotal - a.valorTotal)
                  .slice(0, 10)
                  .map((p, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-900">{p.nomePrestador}</td>
                      <td className="px-6 py-3 text-right text-gray-900">{p.apontamentos}</td>
                      <td className="px-6 py-3 text-right text-gray-900">{p.horasTotais.toFixed(1)}h</td>
                      <td className="px-6 py-3 text-right font-semibold text-gray-900">
                        R$ {p.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-3 text-right text-gray-900">
                        R$ {p.valorHoraEfetivo.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            p.taxaAnomalia > 10
                              ? 'bg-red-100 text-red-700'
                              : p.taxaAnomalia > 5
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
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
