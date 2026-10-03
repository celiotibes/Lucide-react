/**
 * Dashboard de Margens por Propriedade
 * 
 * Mostra:
 * - Tabela com ranking (Top 5 + Bottom 5) do período
 * - Código de cores por margem: verde (>70%), amarelo (50-70%), vermelho (<50%)
 * - Clique em imóvel para expandir histórico dos últimos 12 meses
 * - Alertas para margens críticas
 */

import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

interface MargemRankingItem {
  rank: number;
  imovelId: number;
  nomePropriedade: string;
  receita: number;
  despesa: number;
  margem: number;
  status: "OK" | "ATENÇÃO" | "CRÍTICO";
}

interface PeriodoHistorico {
  periodo: string;
  receita: number;
  despesa: number;
  margem: number;
  status: "OK" | "ATENÇÃO" | "CRÍTICO";
}

interface HistoricoCompleto {
  imovelId: number;
  nomePropriedade: string;
  periodos: PeriodoHistorico[];
}

export const MargensPropriedadesView: React.FC = () => {
  const [periodoMes, setPeriodoMes] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [top5, setTop5] = useState<MargemRankingItem[]>([]);
  const [bottom5, setBottom5] = useState<MargemRankingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedImovel, setExpandedImovel] = useState<number | null>(null);
  const [historicos, setHistoricos] = useState<Record<number, HistoricoCompleto>>({});

  // Carregar ranking
  useEffect(() => {
    carregarRanking();
  }, [periodoMes]);

  const carregarRanking = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/relatorios/margens/ranking?periodoMes=${periodoMes}`,
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`Erro ao carregar ranking: ${response.statusText}`);
      }

      const data = await response.json();
      setTop5(data.top5);
      setBottom5(data.bottom5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  const carregarHistorico = async (imovelId: number) => {
    if (historicos[imovelId]) {
      setExpandedImovel(expandedImovel === imovelId ? null : imovelId);
      return;
    }

    try {
      const dataFim = new Date();
      const dataInicio = new Date(dataFim);
      dataInicio.setMonth(dataInicio.getMonth() - 12);

      const response = await fetch(
        `/api/relatorios/margens?imovelId=${imovelId}&dataInicio=${dataInicio.toISOString().slice(0, 10)}&dataFim=${dataFim.toISOString().slice(0, 10)}`,
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`Erro ao carregar histórico: ${response.statusText}`);
      }

      const data = await response.json();
      setHistoricos((prev) => ({
        ...prev,
        [imovelId]: data,
      }));
      setExpandedImovel(imovelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar histórico");
    }
  };

  const getStatusColor = (margem: number): string => {
    if (margem > 70) return "bg-green-50";
    if (margem >= 50) return "bg-yellow-50";
    return "bg-red-50";
  };

  const getStatusBadgeColor = (status: string): string => {
    switch (status) {
      case "OK":
        return "bg-green-100 text-green-800";
      case "ATENÇÃO":
        return "bg-yellow-100 text-yellow-800";
      case "CRÍTICO":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const RankeimTable: React.FC<{ items: MargemRankingItem[]; title: string }> = ({ items, title }) => (
    <div className="mb-8">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Rank</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Propriedade</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Receita</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Despesa</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Margem %</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <React.Fragment key={`${item.imovelId}-row`}>
                <tr
                  className={`border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition ${getStatusColor(item.margem)}`}
                  onClick={() => carregarHistorico(item.imovelId)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-700">#{item.rank}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.nomePropriedade}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(item.receita)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(item.despesa)}</td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span className="font-semibold text-gray-900">{item.margem.toFixed(2)}%</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeColor(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>

                {/* Histórico expandido */}
                {expandedImovel === item.imovelId && historicos[item.imovelId] && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 bg-gray-50">
                      <HistoricoGrafico historico={historicos[item.imovelId]} />
                    </td>
                  </tr>
                )}

                {/* Alerta de margem crítica */}
                {item.status === "CRÍTICO" && (
                  <tr className="bg-red-50 border-b border-gray-200">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex items-center gap-2 text-red-700">
                        <AlertTriangle size={16} />
                        <span className="text-sm font-medium">
                          Margem crítica! Considere revisar o preço do aluguel ou reduzir despesas operacionais.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const HistoricoGrafico: React.FC<{ historico: HistoricoCompleto }> = ({ historico }) => {
    const dados = historico.periodos.map((p) => ({
      periodo: p.periodo,
      margem: p.margem,
      receita: p.receita / 100,
      despesa: p.despesa / 100,
    }));

    return (
      <div className="space-y-4">
        <h4 className="text-md font-semibold text-gray-800">
          Histórico de Margens - {historico.nomePropriedade}
        </h4>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dados}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="periodo" />
            <YAxis />
            <Tooltip
              formatter={(value: number) => {
                if (typeof value === "number") {
                  return value.toFixed(2) + (typeof value > 100 ? " R$" : "%");
                }
                return value;
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="margem" stroke="#10b981" name="Margem %" dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded border border-gray-200">
            <div className="text-sm text-gray-600">Última Receita</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(historico.periodos[historico.periodos.length - 1]?.receita || 0)}</div>
          </div>
          <div className="bg-white p-4 rounded border border-gray-200">
            <div className="text-sm text-gray-600">Última Despesa</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(historico.periodos[historico.periodos.length - 1]?.despesa || 0)}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Análise de Margens por Propriedade</h1>
        <p className="text-gray-600">Monitore a rentabilidade de cada imóvel aluguel</p>
      </div>

      {/* Seletor de período */}
      <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-lg">
        <label htmlFor="periodo" className="text-sm font-medium text-gray-700">
          Período:
        </label>
        <input
          id="periodo"
          type="month"
          value={periodoMes}
          onChange={(e) => setPeriodoMes(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Indicadores de status */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-green-700 text-sm font-semibold">Muito Rentável (>70%)</div>
          <div className="text-2xl font-bold text-green-900 mt-2">{top5.filter((i) => i.status === "OK").length}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="text-yellow-700 text-sm font-semibold">Atenção (50-70%)</div>
          <div className="text-2xl font-bold text-yellow-900 mt-2">{(top5.concat(bottom5)).filter((i) => i.status === "ATENÇÃO").length}</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="text-red-700 text-sm font-semibold">Crítico (<50%)</div>
          <div className="text-2xl font-bold text-red-900 mt-2">{(top5.concat(bottom5)).filter((i) => i.status === "CRÍTICO").length}</div>
        </div>
      </div>

      {/* Mensagens de erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Tabelas de ranking */}
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="text-gray-600 mt-2">Carregando ranking...</p>
        </div>
      ) : (
        <>
          <RankeimTable items={top5} title="Top 5 - Propriedades Mais Rentáveis" />
          <RankeimTable items={bottom5} title="Bottom 5 - Propriedades Menos Rentáveis" />
        </>
      )}

      {/* Dica de uso */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <p className="text-sm text-blue-800">
          💡 <strong>Dica:</strong> Clique em qualquer propriedade para ver o histórico de margens dos últimos 12 meses e identificar tendências.
        </p>
      </div>
    </div>
  );
};

export default MargensPropriedadesView;
