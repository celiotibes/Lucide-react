'use client';

import { useEffect, useState } from 'react';
import { obterKPIsFinanceiros, type KPIFinanceiro } from '@/app/actions/bi/obterKPIs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DREData {
  mes: string;
  faturamentoBruto: number;
  deducoes: number;
  receitaLiquida: number;
  custoOperacional: number;
  custosDespesas: number;
  margemBruta: number;
  resultadoLiquido: number;
}

export default function PaginaDRE() {
  const [dados, setDados] = useState<DREData[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    carregarDados();
  }, [dataInicio, dataFim]);

  async function carregarDados() {
    setCarregando(true);
    try {
      const resultado = await obterKPIsFinanceiros(dataInicio, dataFim);
      if (resultado.sucesso && resultado.kpis) {
        const dreData: DREData[] = resultado.kpis.map((k) => ({
          mes: `${k.nomeMes}/${k.ano}`,
          faturamentoBruto: k.faturamentoTotal,
          deducoes: k.deducoesTotal,
          receitaLiquida: k.receitaLiquida,
          custoOperacional: k.custoOperacional,
          custosDespesas: k.custoDespesas,
          margemBruta: k.margemBruta,
          resultadoLiquido: k.margemBruta,
        }));
        setDados(dreData);
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">DRE - Demonstração de Resultado</h1>
          <p className="text-gray-600">Análise detalhada de receitas, custos e resultado líquido</p>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Waterfall Chart */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Fluxo de Resultado (Waterfall)</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={dados} margin={{ bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip
                formatter={(value) =>
                  `R$ ${(value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                }
                labelFormatter={(label) => `${label}`}
              />
              <Legend />
              <Bar dataKey="faturamentoBruto" fill="#3B82F6" name="Faturamento Bruto" />
              <Bar dataKey="deducoes" fill="#EF4444" name="Deduções" />
              <Bar dataKey="custoOperacional" fill="#F59E0B" name="Custo Operacional" />
              <Bar dataKey="custosDespesas" fill="#F59E0B" name="Custos Despesas" />
              <Bar dataKey="resultadoLiquido" fill="#10B981" name="Resultado Líquido" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabela Detalhada */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Análise Linha a Linha</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-900">Período</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Faturamento</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Deduções</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Receita Líquida</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Custo Op.</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Custo Desp.</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Margem Bruta</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-900">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dados.map((linha, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{linha.mes}</td>
                    <td className="px-6 py-3 text-right text-blue-600">
                      R$ {linha.faturamentoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right text-red-600">
                      -R$ {linha.deducoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      R$ {linha.receitaLiquida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right text-orange-600">
                      -R$ {linha.custoOperacional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right text-orange-600">
                      -R$ {linha.custosDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right text-green-600 font-semibold">
                      R$ {linha.margemBruta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-gray-900">
                      R$ {linha.resultadoLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
