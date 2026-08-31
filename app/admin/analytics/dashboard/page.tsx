// Admin analytics dashboard: cohort analysis, churn risk, revenue forecast

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/ssr';

interface CohortData {
  cohortMes: string;
  numeroContratos: number;
  taxaPagamentoAdia: number;
  diasMedioAtraso: number;
  valorMedioAluguel: number;
}

interface RiscoData {
  contratoId: string;
  locatarioNome: string;
  imovelIdentificacao: string;
  scoreRisco: number;
  motivoRisco: string[];
  recomenacao: 'baixo' | 'medio' | 'alto' | 'critico';
}

interface PrevisaoData {
  diasFuturos: 30 | 60 | 90;
  receitaPrevista: number;
  limiteInferior: number;
  limiteSuperior: number;
  tendencia: 'crescente' | 'estavel' | 'decrescente';
  confianca: number;
}

interface HistoricoReceita {
  mes: string;
  receitaPrevista: number;
  receitaRealizada: number | null;
  taxaColeta: number;
}

interface AnalyticsData {
  cohorts: CohortData[];
  riscos: RiscoData[];
  previsoes: PrevisaoData[];
  historico: HistoricoReceita[];
  taxaColetaMedia: number;
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroRisco, setFiltroRisco] = useState<'todos' | 'bajo' | 'medio' | 'alto' | 'critico'>('todos');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');

  const supabase = createClient();

  useEffect(() => {
    carregarDados();
  }, [filtroRisco, dataInicio, dataFim]);

  async function carregarDados() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/admin/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filtroRisco: filtroRisco === 'todos' ? null : filtroRisco,
          dataInicio,
          dataFim,
        }),
      });

      if (!response.ok) {
        const erro = await response.json();
        throw new Error(erro.erro || 'Erro ao carregar dados');
      }

      const resultado = await response.json();
      setData(resultado.dados);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8">Carregando analytics...</div>;
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 text-red-800 rounded">
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="p-8">Sem dados disponíveis</div>;
  }

  const riscosFiltrados =
    filtroRisco === 'todos'
      ? data.riscos
      : data.riscos.filter((r) => r.recomenacao === filtroRisco);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Analytics & Previsões</h1>
          <p className="text-gray-600 mt-2">Análise de coortes, risco de churn e previsão de receita</p>
        </div>

        {/* Métricas principais */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Taxa de Coleta Média</div>
            <div className="text-2xl font-bold text-blue-600">{data.taxaColetaMedia.toFixed(1)}%</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Contratos em Risco Alto+</div>
            <div className="text-2xl font-bold text-red-600">
              {data.riscos.filter((r) => ['alto', 'critico'].includes(r.recomenacao)).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Receita 30 dias</div>
            <div className="text-2xl font-bold text-green-600">
              R$ {(data.previsoes.find((p) => p.diasFuturos === 30)?.receitaPrevista || 0).toLocaleString('pt-BR')}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Coortes Analisadas</div>
            <div className="text-2xl font-bold text-purple-600">{data.cohorts.length}</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow p-4 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filtro Risco</label>
              <select
                value={filtroRisco}
                onChange={(e) => setFiltroRisco(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="todos">Todos</option>
                <option value="bajo">Baixo</option>
                <option value="medio">Médio</option>
                <option value="alto">Alto</option>
                <option value="critico">Crítico</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={carregarDados}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Atualizar
              </button>
            </div>
          </div>
        </div>

        {/* Previsão de Receita */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Previsão de Receita</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data.previsoes.map((prev) => (
              <div key={prev.diasFuturos} className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-2">Próximos {prev.diasFuturos} dias</div>
                <div className="text-3xl font-bold text-blue-600 mb-2">
                  R$ {prev.receitaPrevista.toLocaleString('pt-BR')}
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  Intervalo: R$ {prev.limiteInferior.toLocaleString('pt-BR')} - R$ {prev.limiteSuperior.toLocaleString('pt-BR')}
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      prev.tendencia === 'crescente'
                        ? 'bg-green-100 text-green-800'
                        : prev.tendencia === 'decrescente'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {prev.tendencia}
                  </span>
                  <span className="text-gray-600">{prev.confianca}% confiança</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Histórico de Receita */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Histórico de Receita (últimos 12 meses)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Mês</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Receita Realizada</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Taxa Coleta</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.historico.map((h) => (
                  <tr key={h.mes} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{h.mes}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      R$ {(h.receitaRealizada || 0).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">{h.taxaColeta.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Análise de Coortes */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Análise de Coortes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Coorte</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Contratos</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Taxa Pagamento em Dia</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Dias Médio Atraso</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Valor Médio Aluguel</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.cohorts.map((c) => (
                  <tr key={c.cohortMes} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{c.cohortMes}</td>
                    <td className="px-4 py-3 text-right">{c.numeroContratos}</td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        c.taxaPagamentoAdia > 85
                          ? 'text-green-700'
                          : c.taxaPagamentoAdia > 70
                            ? 'text-yellow-700'
                            : 'text-red-700'
                      }`}
                    >
                      {c.taxaPagamentoAdia.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">{c.diasMedioAtraso.toFixed(1)} dias</td>
                    <td className="px-4 py-3 text-right">R$ {c.valorMedioAluguel.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scoring de Risco */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Scoring de Risco de Churn</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Imóvel</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Locatário</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-700">Score</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-700">Recomendação</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Motivos</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {riscosFiltrados.slice(0, 20).map((r) => (
                  <tr key={r.contratoId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.imovelIdentificacao}</td>
                    <td className="px-4 py-3">{r.locatarioNome}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                          r.scoreRisco >= 80
                            ? 'bg-red-100 text-red-800'
                            : r.scoreRisco >= 60
                              ? 'bg-orange-100 text-orange-800'
                              : r.scoreRisco >= 40
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {r.scoreRisco}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                          r.recomenacao === 'critico'
                            ? 'bg-red-100 text-red-800'
                            : r.recomenacao === 'alto'
                              ? 'bg-orange-100 text-orange-800'
                              : r.recomenacao === 'medio'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {r.recomenacao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="space-y-1">
                        {r.motivoRisco.map((motivo, idx) => (
                          <div key={idx} className="text-gray-600">
                            • {motivo}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {riscosFiltrados.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Nenhum contrato encontrado com esse filtro de risco.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
