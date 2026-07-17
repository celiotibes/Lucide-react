'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { obterCustosPorResidencial, listarApontamentosNaoRateados } from '@/app/actions/integracao/rateioApontamentosLocacao';
import { DollarSign, Home, Clock, TrendingUp } from 'lucide-react';

interface CustoResidencial {
  residencial_id: string;
  residencial_nome: string;
  totalHoras: number;
  totalCusto: number;
  apontamentos: number;
}

interface ApontamentoNaoRateado {
  id: string;
  data: string;
  horas_trabalhadas: number;
  residenciais_ids: string;
  contratos_prestador?: {
    prestadores_servico?: {
      nome_completo: string;
    };
  };
}

export default function PaginaRateioCustos() {
  const [custosPorResidencial, setCustosPorResidencial] = useState<CustoResidencial[]>([]);
  const [apontamentosNaoRateados, setApontamentosNaoRateados] = useState<ApontamentoNaoRateado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [totais, setTotais] = useState({ totalHoras: '0', totalCusto: '0', residenciais: 0 });

  const supabase = createClient();

  useEffect(() => {
    carregarDados();
  }, [dataInicio, dataFim]);

  async function carregarDados() {
    try {
      setCarregando(true);

      // Buscar custos por residencial
      const resultCustos = await obterCustosPorResidencial(
        new Date(dataInicio),
        new Date(dataFim)
      );

      if (resultCustos.sucesso) {
        setCustosPorResidencial(resultCustos.resumo || []);
        setTotais(resultCustos.totais || { totalHoras: '0', totalCusto: '0', residenciais: 0 });
      }

      // Buscar apontamentos não rateados
      const resultApontamentos = await listarApontamentosNaoRateados();
      if (resultApontamentos.sucesso) {
        setApontamentosNaoRateados(resultApontamentos.apontamentos || []);
      }
    } finally {
      setCarregando(false);
    }
  }

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(num);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando dados...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Rateio de Custos por Residencial</h1>
          <p className="text-gray-600">Análise de custos de apontamentos distribuídos entre propriedades</p>
        </div>

        {/* Filtros de Data */}
        <div className="bg-white rounded-lg shadow mb-6 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-600">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total de Custos</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totais.totalCusto)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Clock className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total de Horas</p>
                <p className="text-2xl font-bold text-gray-900">{totais.totalHoras}h</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-600">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Home className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Residenciais</p>
                <p className="text-2xl font-bold text-gray-900">{totais.residenciais}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de Custos por Residencial */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-bold text-gray-900">Custos por Residencial</h2>
          </div>

          {custosPorResidencial.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600">Nenhum custo para o período selecionado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Residencial
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      Horas Trabalhadas
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      Apontamentos
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      Total de Custos
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      % do Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {custosPorResidencial.map((custo) => {
                    const percentual =
                      (parseFloat(totais.totalCusto) > 0
                        ? (custo.totalCusto / parseFloat(totais.totalCusto)) * 100
                        : 0
                      ).toFixed(1);
                    return (
                      <tr key={custo.residencial_id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            <Home className="w-4 h-4 text-gray-400" />
                            {custo.residencial_nome}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">
                          {custo.totalHoras.toFixed(2)}h
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-900">
                          {custo.apontamentos}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                          {formatCurrency(custo.totalCusto)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${percentual}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium">{percentual}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Seção: Apontamentos Não Rateados */}
        {apontamentosNaoRateados.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="border-b px-6 py-4 bg-yellow-50">
              <h2 className="text-xl font-bold text-gray-900">
                Atenção: {apontamentosNaoRateados.length} Apontamento(s) Não Rateado(s)
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Esses apontamentos visitaram múltiplas residências mas ainda não foram rateados manualmente
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Data
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Prestador
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      Horas
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Residenciais Visitadas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {apontamentosNaoRateados.map((apontamento) => (
                    <tr key={apontamento.id} className="hover:bg-yellow-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatDate(apontamento.data)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {apontamento.contratos_prestador?.prestadores_servico?.nome_completo ||
                          'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {apontamento.horas_trabalhadas.toFixed(2)}h
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                          {apontamento.residenciais_ids?.split(',').length || 0} residencial(is)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
