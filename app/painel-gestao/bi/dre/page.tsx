'use client';

import { useEffect, useState } from 'react';
import { obterKPIsFinanceiros, type KPIFinanceiro } from '@/app/actions/bi/obterKPIs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RefreshCw } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">DRE - Demonstração de Resultado</h1>
          <p className="text-slate-400">Análise detalhada de receitas, custos e resultado líquido</p>
        </div>

        {/* Filtros */}
        <div className="glass rounded-xl p-6 mb-8 border-2 border-slate-700/50 backdrop-blur-xl animate-slideDown" style={{ animationDelay: '50ms' }}>
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="px-4 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Data Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="px-4 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              />
            </div>
            <div className="ml-auto flex items-center gap-2 text-sm text-slate-400">
              {carregando && <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />}
              {carregando ? 'Atualizando...' : `${dados.length} períodos carregados`}
            </div>
          </div>
        </div>

        {/* Waterfall Chart */}
        <div className="glass rounded-xl p-6 mb-8 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{ animationDelay: '100ms' }}>
          <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-emerald-500 rounded-full" />
            Fluxo de Resultado (Waterfall)
          </h2>
          {carregando && dados.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={dados} margin={{ bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="mes" angle={-45} textAnchor="end" height={80} stroke="#94A3B8" />
                <YAxis stroke="#94A3B8" />
                <Tooltip
                  formatter={(value: number) =>
                    `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  }
                  labelFormatter={(label: string) => `${label}`}
                  contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E2E8F0' }}
                />
                <Legend />
                <Bar dataKey="faturamentoBruto" fill="#06B6D4" name="Faturamento Bruto" radius={[6, 6, 0, 0]} />
                <Bar dataKey="deducoes" fill="#F43F5E" name="Deduções" radius={[6, 6, 0, 0]} />
                <Bar dataKey="custoOperacional" fill="#FBBF24" name="Custo Operacional" radius={[6, 6, 0, 0]} />
                <Bar dataKey="custosDespesas" fill="#FB923C" name="Custos Despesas" radius={[6, 6, 0, 0]} />
                <Bar dataKey="resultadoLiquido" fill="#10B981" name="Resultado Líquido" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tabela Detalhada */}
        <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{ animationDelay: '150ms' }}>
          <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
            Análise Linha a Linha
          </h2>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 border-b border-slate-700/30">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">Período</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Faturamento</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Deduções</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Receita Líquida</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Custo Op.</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Custo Desp.</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Margem Bruta</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-300">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {dados.map((linha, idx) => (
                  <tr key={idx} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-100">{linha.mes}</td>
                    <td className="px-6 py-3 text-right text-cyan-400">
                      R$ {linha.faturamentoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right text-rose-400">
                      -R$ {linha.deducoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-100">
                      R$ {linha.receitaLiquida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right text-amber-400">
                      -R$ {linha.custoOperacional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right text-amber-400">
                      -R$ {linha.custosDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right text-emerald-400 font-semibold">
                      R$ {linha.margemBruta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-slate-100">
                      R$ {linha.resultadoLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {dados.length === 0 && !carregando && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                      Nenhum dado disponível para o período selecionado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
