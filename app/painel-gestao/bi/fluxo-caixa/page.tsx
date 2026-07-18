'use client';

import { useEffect, useState } from 'react';
import { obterFluxoCaixa } from '@/app/actions/bi/obterFluxoCaixa';
import {
  Sankey,
  Sink,
  Source,
  Link,
  Node,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { AlertCircle, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import type { DadosFluxoCaixa } from '@/server/bi/fluxoCaixaData';

export default function PaginaFluxoCaixa() {
  const [dados, setDados] = useState<DadosFluxoCaixa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  async function carregarFluxo() {
    setCarregando(true);
    setMensagem(null);

    try {
      const resultado = await obterFluxoCaixa(dataInicio, dataFim);

      if (resultado.sucesso && resultado.dados) {
        setDados(resultado.dados);
      } else {
        setMensagem({
          tipo: 'erro',
          texto: resultado.erro || 'Erro ao carregar dados',
        });
      }
    } catch (erro) {
      setMensagem({
        tipo: 'erro',
        texto: erro instanceof Error ? erro.message : 'Erro desconhecido',
      });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarFluxo();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">Fluxo de Caixa</h1>
          <p className="text-slate-400">Visualização do fluxo de receitas, deduções, custos e resultado</p>
        </div>

        {/* Mensagem */}
        {mensagem && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
              mensagem.tipo === 'sucesso'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <AlertCircle
              className={`w-5 h-5 flex-shrink-0 ${
                mensagem.tipo === 'sucesso' ? 'text-green-600' : 'text-red-600'
              }`}
            />
            <p
              className={mensagem.tipo === 'sucesso' ? 'text-green-700' : 'text-red-700'}
            >
              {mensagem.texto}
            </p>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={carregarFluxo}
              disabled={carregando}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {carregando ? 'Carregando...' : 'Filtrar'}
            </button>
          </div>
        </div>

        {/* KPIs de Fluxo */}
        {dados && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Receitas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    R$ {dados.totalizadores.recebitasTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-600">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Deduções</p>
                  <p className="text-2xl font-bold text-gray-900">
                    R$ {dados.totalizadores.deducoesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-600">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-100 rounded-lg">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Custos</p>
                  <p className="text-2xl font-bold text-gray-900">
                    R$ {dados.totalizadores.custosTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-600">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Resultado Líquido</p>
                  <p className={`text-2xl font-bold ${
                    dados.totalizadores.resultadoLiquido >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    R$ {dados.totalizadores.resultadoLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Diagrama Sankey */}
        {carregando ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">Carregando dados...</p>
          </div>
        ) : dados ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Fluxo de Caixa (Sankey)</h2>
            <p className="text-sm text-gray-600 mb-4">
              Visualização do fluxo de dinheiro: quanto sai de cada estágio e para onde vai
            </p>
            <div className="overflow-x-auto">
              <ResponsiveContainer width="100%" height={600}>
                <Sankey
                  data={{
                    nodes: dados.nodes.map((node) => ({
                      ...node,
                      fill: node.color || '#8884d8',
                    })),
                    links: dados.links.map((link) => ({
                      ...link,
                      stroke: dados.nodes[link.source]?.color || '#8884d8',
                      strokeOpacity: 0.5,
                    })),
                  }}
                  node={{ fill: '#8884d8', fillOpacity: 1 }}
                  link={{ stroke: '#d084d8', strokeOpacity: 0.5 }}
                  nodePadding={150}
                  margin={{ top: 20, right: 160, bottom: 20, left: 20 }}
                >
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      padding: '8px',
                    }}
                    formatter={(value) =>
                      `R$ ${(value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    }
                  />
                </Sankey>
              </ResponsiveContainer>
            </div>

            {/* Legenda e Detalhes */}
            <div className="mt-8 pt-6 border-t grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Nós</h3>
                <div className="space-y-2">
                  {dados.nodes.map((node) => (
                    <div key={node.id} className="flex items-center gap-2 text-sm">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: node.color || '#8884d8' }}
                      />
                      <span className="text-gray-700">{node.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Fluxos Principais</h3>
                <div className="space-y-2">
                  {dados.links.map((link, idx) => {
                    const sourceNode = dados.nodes[link.source];
                    const targetNode = dados.nodes[link.target];
                    return (
                      <div key={idx} className="text-sm">
                        <div className="text-gray-600">
                          {sourceNode?.name} → {targetNode?.name}
                        </div>
                        <div className="text-gray-900 font-semibold">
                          R$ {link.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Nenhum dado disponível</p>
          </div>
        )}
      </div>
    </div>
  );
}
