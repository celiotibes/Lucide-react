'use client';

import { useEffect, useState } from 'react';
import { obterAnaliseCalor } from '@/app/actions/bi/obterAnaliseCalor';
import { AlertCircle, Maximize2 } from 'lucide-react';
import { mapearValorParaCor } from '@/server/bi/analiseCalorData';
import type { DadosAnaliseCalor } from '@/server/bi/analiseCalorData';

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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Análise de Custos (Heatmap)</h1>
          <p className="text-gray-600">Visualização da intensidade de custos por período e categoria</p>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Agrupar Por</label>
              <select
                value={agruparPor}
                onChange={(e) => setAgruparPor(e.target.value as 'categoria' | 'residencial')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="categoria">Categoria</option>
                <option value="residencial">Residencial</option>
              </select>
            </div>
            <button
              onClick={carregarAnalise}
              disabled={carregando}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {carregando ? 'Carregando...' : 'Filtrar'}
            </button>
          </div>
        </div>

        {/* Heatmap */}
        {carregando ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">Carregando dados...</p>
          </div>
        ) : dados && dados.celulas.length > 0 ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Intensidade de Custos por {agruparPor === 'categoria' ? 'Categoria' : 'Residencial'} e Período
            </h2>

            {/* Grid de Heatmap */}
            <div className="overflow-x-auto mb-8">
              <div className="inline-block min-w-full">
                {/* Header com períodos */}
                <div className="flex">
                  <div className="w-40 flex-shrink-0 bg-gray-100 border border-gray-300 p-3 font-semibold text-sm text-gray-900 sticky left-0 z-10">
                    {agruparPor === 'categoria' ? 'Categoria' : 'Residencial'}
                  </div>
                  {dados.periodos.map((periodo) => (
                    <div
                      key={periodo}
                      className="w-32 flex-shrink-0 bg-gray-100 border border-gray-300 p-3 font-semibold text-sm text-gray-900 text-center"
                    >
                      {periodo}
                    </div>
                  ))}
                </div>

                {/* Linhas de dados */}
                {dados.categorias.map((categoria) => (
                  <div key={categoria} className="flex">
                    <div className="w-40 flex-shrink-0 bg-gray-50 border border-gray-300 p-3 text-sm text-gray-900 font-medium sticky left-0 z-10">
                      {categoria}
                    </div>
                    {dados.periodos.map((periodo) => {
                      const celula = dados.celulas.find(
                        (c) => c.periodo === periodo && c.categoria === categoria
                      );
                      const cor = celula
                        ? mapearValorParaCor(celula.valor, dados.minimo, dados.maximo)
                        : '#f9fafb';

                      return (
                        <div
                          key={`${categoria}-${periodo}`}
                          className="w-32 flex-shrink-0 border border-gray-300 p-3 text-center text-sm cursor-help"
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
                              <div className="font-semibold text-gray-900">
                                R$ {(celula.valor / 1000).toFixed(1)}k
                              </div>
                              <div className="text-xs text-gray-600">{celula.percentual.toFixed(1)}%</div>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">-</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legenda */}
            <div className="border-t pt-6 mt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Legenda</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Intervalo de Valores</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded"
                        style={{
                          backgroundColor: mapearValorParaCor(dados.minimo, dados.minimo, dados.maximo),
                        }}
                      />
                      <span className="text-sm text-gray-700">
                        Mínimo: R$ {dados.minimo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded"
                        style={{
                          backgroundColor: mapearValorParaCor(dados.media, dados.minimo, dados.maximo),
                        }}
                      />
                      <span className="text-sm text-gray-700">
                        Média: R$ {dados.media.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded"
                        style={{
                          backgroundColor: mapearValorParaCor(dados.maximo, dados.minimo, dados.maximo),
                        }}
                      />
                      <span className="text-sm text-gray-700">
                        Máximo: R$ {dados.maximo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Cores</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{ backgroundColor: '#90EE90' }} />
                      <span className="text-sm text-gray-700">Baixo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{ backgroundColor: '#FFD700' }} />
                      <span className="text-sm text-gray-700">Médio</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{ backgroundColor: '#FF6B6B' }} />
                      <span className="text-sm text-gray-700">Alto</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Dicas</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>✓ Cores quentes (vermelho) = custos altos</li>
                    <li>✓ Cores frias (verde) = custos baixos</li>
                    <li>✓ Passe o mouse para ver valores exatos</li>
                  </ul>
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
