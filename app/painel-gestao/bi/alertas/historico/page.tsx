'use client';

import { useState, useEffect } from 'react';
import { obterHistoricoAlertas } from '@/app/actions/bi/gerenciarAlertas';
import { AlertCircle, Clock, Filter } from 'lucide-react';

interface Alerta {
  id: string;
  titulo: string;
  descricao: string;
  severidade: 'critico' | 'alerta' | 'info';
  timestamp: string;
  tipo: string;
}

export default function PaginaHistoricoAlertas() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [severidadeFilter, setSeveridadeFilter] = useState<'critico' | 'alerta' | 'info' | 'todas'>('todas');
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  async function carregarAlertas() {
    setCarregando(true);
    setMensagem(null);

    try {
      const resultado = await obterHistoricoAlertas(
        dataInicio,
        dataFim,
        severidadeFilter !== 'todas' ? (severidadeFilter as 'critico' | 'alerta' | 'info') : undefined
      );

      if (resultado.sucesso && resultado.alertas) {
        setAlertas(resultado.alertas);
      } else {
        setMensagem({
          tipo: 'erro',
          texto: resultado.erro || 'Erro ao carregar histórico',
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
    carregarAlertas();
  }, []);

  function getSeveridadeColor(severidade: string) {
    switch (severidade) {
      case 'critico':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'alerta':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-900';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-900';
    }
  }

  function getSeveridadeBadge(severidade: string) {
    switch (severidade) {
      case 'critico':
        return 'bg-red-100 text-red-800';
      case 'alerta':
        return 'bg-yellow-100 text-yellow-800';
      case 'info':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function getSeveridadeIcon(severidade: string) {
    switch (severidade) {
      case 'critico':
        return '🚨';
      case 'alerta':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📌';
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Histórico de Alertas</h1>
          <p className="text-gray-600">Visualize todos os alertas disparados e seu histórico</p>
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
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Início
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Fim
              </label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Severidade
              </label>
              <select
                value={severidadeFilter}
                onChange={(e) => setSeveridadeFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todas">Todas</option>
                <option value="critico">Crítico</option>
                <option value="alerta">Alerta</option>
                <option value="info">Informação</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={carregarAlertas}
                disabled={carregando}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {carregando ? 'Carregando...' : 'Filtrar'}
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Alertas */}
        <div className="space-y-4">
          {carregando ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Carregando alertas...</p>
            </div>
          ) : alertas.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">Nenhum alerta encontrado</p>
              <p className="text-gray-500 text-sm">Tente ajustar os filtros</p>
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-600 mb-4">
                Total de alertas: <strong>{alertas.length}</strong>
              </div>
              {alertas.map((alerta) => (
                <div
                  key={alerta.id}
                  className={`border rounded-lg p-6 ${getSeveridadeColor(alerta.severidade)}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl flex-shrink-0">
                        {getSeveridadeIcon(alerta.severidade)}
                      </span>
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg">{alerta.titulo}</h4>
                        <p className="text-sm opacity-75 mt-1">{alerta.descricao}</p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-4 ${getSeveridadeBadge(
                        alerta.severidade
                      )}`}
                    >
                      {alerta.severidade.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm opacity-75 mt-4">
                    <Clock className="w-4 h-4" />
                    {new Date(alerta.timestamp).toLocaleString('pt-BR')}
                  </div>

                  {alerta.tipo && (
                    <div className="mt-3 text-xs opacity-60">
                      Tipo: <code className="bg-black bg-opacity-10 px-2 py-1 rounded">{alerta.tipo}</code>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
