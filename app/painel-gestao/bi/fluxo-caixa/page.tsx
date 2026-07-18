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
import { AlertCircle, DollarSign, TrendingDown, TrendingUp, RefreshCw } from 'lucide-react';
import type { DadosFluxoCaixa } from '@/server/bi/fluxoCaixaData';
import { StatCard } from '../components/StatCard';

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
            className={`mb-6 p-4 rounded-xl glass border-2 flex items-start gap-3 animate-slideDown ${
              mensagem.tipo === 'sucesso'
                ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10'
                : 'border-rose-500/30 bg-gradient-to-r from-rose-500/10 to-orange-500/10'
            }`}
          >
            <AlertCircle
              className={`w-5 h-5 flex-shrink-0 ${
                mensagem.tipo === 'sucesso' ? 'text-emerald-400' : 'text-rose-400'
              }`}
            />
            <p className={mensagem.tipo === 'sucesso' ? 'text-emerald-300' : 'text-rose-300'}>
              {mensagem.texto}
            </p>
          </div>
        )}

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
            <button
              onClick={carregarFluxo}
              disabled={carregando}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-600 text-white rounded-lg font-medium flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
              {carregando ? 'Carregando...' : 'Filtrar'}
            </button>
          </div>
        </div>

        {/* KPIs de Fluxo */}
        {dados && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="stagger-item">
              <StatCard
                title="Receitas"
                value={`R$ ${dados.totalizadores.recebitasTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                state="otimo"
                icon={<TrendingUp className="w-5 h-5" />}
              />
            </div>
            <div className="stagger-item" style={{ animationDelay: '50ms' }}>
              <StatCard
                title="Deduções"
                value={`R$ ${dados.totalizadores.deducoesTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                state="alerta"
                icon={<AlertCircle className="w-5 h-5" />}
              />
            </div>
            <div className="stagger-item" style={{ animationDelay: '100ms' }}>
              <StatCard
                title="Custos"
                value={`R$ ${dados.totalizadores.custosTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                state="critico"
                icon={<TrendingDown className="w-5 h-5" />}
              />
            </div>
            <div className="stagger-item" style={{ animationDelay: '150ms' }}>
              <StatCard
                title="Resultado Líquido"
                value={`R$ ${dados.totalizadores.resultadoLiquido.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                state={dados.totalizadores.resultadoLiquido >= 0 ? 'bom' : 'critico'}
                icon={<DollarSign className="w-5 h-5" />}
              />
            </div>
          </div>
        )}

        {/* Diagrama Sankey */}
        {carregando ? (
          <div className="glass rounded-xl p-8 text-center border-2 border-slate-700/50 backdrop-blur-xl">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Carregando dados...</p>
          </div>
        ) : dados ? (
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{ animationDelay: '200ms' }}>
            <h2 className="text-xl font-semibold text-slate-100 mb-2 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-purple-500 rounded-full" />
              Fluxo de Caixa (Sankey)
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              Visualização do fluxo de dinheiro: quanto sai de cada estágio e para onde vai
            </p>
            <div className="overflow-x-auto scrollbar-thin">
              <ResponsiveContainer width="100%" height={600}>
                <Sankey
                  data={{
                    nodes: dados.nodes.map((node) => ({
                      ...node,
                      fill: node.color || '#06B6D4',
                    })),
                    links: dados.links.map((link) => ({
                      ...link,
                      stroke: dados.nodes[link.source]?.color || '#06B6D4',
                      strokeOpacity: 0.4,
                    })),
                  }}
                  node={{ fill: '#06B6D4', fillOpacity: 1 }}
                  link={{ stroke: '#A855F7', strokeOpacity: 0.4 }}
                  nodePadding={150}
                  margin={{ top: 20, right: 160, bottom: 20, left: 20 }}
                >
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#E2E8F0',
                    }}
                    formatter={(value) =>
                      `R$ ${(value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    }
                  />
                </Sankey>
              </ResponsiveContainer>
            </div>

            {/* Legenda e Detalhes */}
            <div className="mt-8 pt-6 border-t border-slate-700/50 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full" />
                  Nós
                </h3>
                <div className="space-y-2">
                  {dados.nodes.map((node) => (
                    <div key={node.id} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-slate-700/20 transition-colors">
                      <div
                        className="w-4 h-4 rounded-full ring-2 ring-white/10"
                        style={{ backgroundColor: node.color || '#06B6D4' }}
                      />
                      <span className="text-slate-300">{node.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                  Fluxos Principais
                </h3>
                <div className="space-y-2">
                  {dados.links.map((link, idx) => {
                    const sourceNode = dados.nodes[link.source];
                    const targetNode = dados.nodes[link.target];
                    return (
                      <div key={idx} className="text-sm p-2 rounded-lg hover:bg-slate-700/20 transition-colors">
                        <div className="text-slate-400">
                          {sourceNode?.name} <span className="text-cyan-400">→</span> {targetNode?.name}
                        </div>
                        <div className="text-slate-100 font-semibold">
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
          <div className="glass rounded-xl p-8 text-center border-2 border-slate-700/50 backdrop-blur-xl">
            <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">Nenhum dado disponível</p>
          </div>
        )}
      </div>
    </div>
  );
}
