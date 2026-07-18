'use client';

import { useEffect, useState } from 'react';
import { obterAnaliseCalor } from '@/app/actions/bi/obterAnaliseCalor';
import { AlertCircle, Maximize2, RefreshCw } from 'lucide-react';
import { mapearValorParaCor, type DadosAnaliseCalor } from '@/server/bi/analiseCalorCores';

export default function PaginaAnaliseCalor() {
  const [dados, setDados] = useState<DadosAnaliseCalor | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [agruparPor, setAgruparPor] = useState<'categoria' | 'residencial'>('categoria');
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  async function carregarAnalise() {
    setCarregando(true);
    setMensagem(null);

    try {
      const resultado = await obterAnaliseCalor(dataInicio, dataFim, agruparPor);

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
    carregarAnalise();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">Análise de Custos (Heatmap)</h1>
          <p className="text-slate-400">Visualização da intensidade de custos por período e categoria</p>
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
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Agrupar Por</label>
              <select
                value={agruparPor}
                onChange={(e) => setAgruparPor(e.target.value as 'categoria' | 'residencial')}
                className="px-4 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              >
                <option value="categoria" className="bg-slate-800">Categoria</option>
                <option value="residencial" className="bg-slate-800">Residencial</option>
              </select>
            </div>
            <button
              onClick={carregarAnalise}
              disabled={carregando}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-600 text-white rounded-lg font-medium flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
              {carregando ? 'Carregando...' : 'Filtrar'}
            </button>
          </div>
        </div>

        {/* Heatmap */}
        {carregando ? (
          <div className="glass rounded-xl p-8 text-center border-2 border-slate-700/50 backdrop-blur-xl">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Carregando dados...</p>
          </div>
        ) : dados && dados.celulas.length > 0 ? (
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{ animationDelay: '100ms' }}>
            <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-rose-500 to-amber-500 rounded-full" />
              Intensidade de Custos por {agruparPor === 'categoria' ? 'Categoria' : 'Residencial'} e Período
            </h2>

            {/* Grid de Heatmap */}
            <div className="overflow-x-auto mb-8 scrollbar-thin rounded-lg border border-slate-700/50">
              <div className="inline-block min-w-full">
                {/* Header com períodos */}
                <div className="flex">
                  <div className="w-40 flex-shrink-0 bg-slate-800/70 border border-slate-700/50 p-3 font-semibold text-sm text-slate-200 sticky left-0 z-10">
                    {agruparPor === 'categoria' ? 'Categoria' : 'Residencial'}
                  </div>
                  {dados.periodos.map((periodo) => (
                    <div
                      key={periodo}
                      className="w-32 flex-shrink-0 bg-slate-800/70 border border-slate-700/50 p-3 font-semibold text-sm text-slate-200 text-center"
                    >
                      {periodo}
                    </div>
                  ))}
                </div>

                {/* Linhas de dados */}
                {dados.categorias.map((categoria) => (
                  <div key={categoria} className="flex">
                    <div className="w-40 flex-shrink-0 bg-slate-800/40 border border-slate-700/50 p-3 text-sm text-slate-200 font-medium sticky left-0 z-10">
                      {categoria}
                    </div>
                    {dados.periodos.map((periodo) => {
                      const celula = dados.celulas.find(
                        (c) => c.periodo === periodo && c.categoria === categoria
                      );
                      const cor = celula
                        ? mapearValorParaCor(celula.valor, dados.minimo, dados.maximo)
                        : 'rgba(255,255,255,0.03)';

                      return (
                        <div
                          key={`${categoria}-${periodo}`}
                          className="w-32 flex-shrink-0 border border-slate-700/50 p-3 text-center text-sm cursor-help transition-all hover:brightness-110 hover:scale-105 hover:z-10 relative"
                          style={{
                            backgroundColor: cor,
                          }}
                          title={
                            celula
                              ? `R$ ${celula.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${celula.percentual.toFixed(1)}%)`
                              : 'Sem dados'
                          }
                        >
                          {celula ? (
                            <div>
                              <div className="font-semibold text-slate-900">
                                R$ {(celula.valor / 1000).toFixed(1)}k
                              </div>
                              <div className="text-xs text-slate-700">{celula.percentual.toFixed(1)}%</div>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500">-</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legenda */}
            <div className="border-t border-slate-700/50 pt-6 mt-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <span className="w-1 h-4 bg-gradient-to-b from-cyan-500 to-purple-500 rounded-full" />
                Legenda
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-sm rounded-lg p-4 border border-slate-700/30">
                  <p className="text-xs font-medium text-slate-400 mb-3">Intervalo de Valores</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded ring-2 ring-white/10"
                        style={{
                          backgroundColor: mapearValorParaCor(dados.minimo, dados.minimo, dados.maximo),
                        }}
                      />
                      <span className="text-sm text-slate-300">
                        Mínimo: R$ {dados.minimo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded ring-2 ring-white/10"
                        style={{
                          backgroundColor: mapearValorParaCor(dados.media, dados.minimo, dados.maximo),
                        }}
                      />
                      <span className="text-sm text-slate-300">
                        Média: R$ {dados.media.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded ring-2 ring-white/10"
                        style={{
                          backgroundColor: mapearValorParaCor(dados.maximo, dados.minimo, dados.maximo),
                        }}
                      />
                      <span className="text-sm text-slate-300">
                        Máximo: R$ {dados.maximo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="glass-sm rounded-lg p-4 border border-slate-700/30">
                  <p className="text-xs font-medium text-slate-400 mb-3">Cores</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded ring-2 ring-white/10" style={{ backgroundColor: '#90EE90' }} />
                      <span className="text-sm text-slate-300">Baixo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded ring-2 ring-white/10" style={{ backgroundColor: '#FFD700' }} />
                      <span className="text-sm text-slate-300">Médio</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded ring-2 ring-white/10" style={{ backgroundColor: '#FF6B6B' }} />
                      <span className="text-sm text-slate-300">Alto</span>
                    </div>
                  </div>
                </div>

                <div className="glass-sm rounded-lg p-4 border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-blue-500/5">
                  <p className="text-xs font-medium text-slate-400 mb-3">Dicas</p>
                  <ul className="text-sm text-slate-300 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-rose-400">●</span>
                      <span>Cores quentes (vermelho) = custos altos</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400">●</span>
                      <span>Cores frias (verde) = custos baixos</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400">→</span>
                      <span>Passe o mouse para ver valores exatos</span>
                    </li>
                  </ul>
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
