'use client';

import { useState, useEffect } from 'react';
import { obterHistoricoAlertas } from '@/app/actions/bi/gerenciarAlertas';
import { AlertCircle, Clock, Filter, RefreshCw } from 'lucide-react';
import { TimelineComponent, type TimelineEvent } from '../../components/TimelineComponent';

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

  function getSeveridadeIconEmoji(severidade: string) {
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

  const mapSeveridade = (s: string): 'info' | 'alerta' | 'critico' => {
    if (s === 'critico' || s === 'alerta' || s === 'info') return s;
    return 'info';
  };

  const timelineEvents: TimelineEvent[] = alertas.map((alerta) => ({
    id: alerta.id,
    timestamp: new Date(alerta.timestamp),
    title: alerta.titulo,
    description: alerta.descricao + (alerta.tipo ? ` · ${alerta.tipo}` : ''),
    status: 'completed',
    severity: mapSeveridade(alerta.severidade),
    icon: <span className="text-lg">{getSeveridadeIconEmoji(alerta.severidade)}</span>,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">Histórico de Alertas</h1>
          <p className="text-slate-400">Visualize todos os alertas disparados e seu histórico</p>
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
        <div className="glass rounded-xl p-6 mb-6 border-2 border-slate-700/50 backdrop-blur-xl animate-slideDown" style={{ animationDelay: '50ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-slate-100">Filtros</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Data Início
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Data Fim
              </label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Severidade
              </label>
              <select
                value={severidadeFilter}
                onChange={(e) => setSeveridadeFilter(e.target.value as any)}
                className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              >
                <option value="todas" className="bg-slate-800">Todas</option>
                <option value="critico" className="bg-slate-800">Crítico</option>
                <option value="alerta" className="bg-slate-800">Alerta</option>
                <option value="info" className="bg-slate-800">Informação</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={carregarAlertas}
                disabled={carregando}
                className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
                {carregando ? 'Carregando...' : 'Filtrar'}
              </button>
            </div>
          </div>
        </div>

        {/* Timeline de Alertas */}
        <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl animate-slideDown" style={{ animationDelay: '100ms' }}>
          {carregando ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-400">Carregando alertas...</p>
            </div>
          ) : alertas.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-300 text-lg">Nenhum alerta encontrado</p>
              <p className="text-slate-500 text-sm">Tente ajustar os filtros</p>
            </div>
          ) : (
            <>
              <div className="text-sm text-slate-400 mb-6 flex items-center gap-2">
                <span className="w-1 h-4 bg-gradient-to-b from-cyan-500 to-purple-500 rounded-full" />
                Total de alertas: <strong className="text-slate-100">{alertas.length}</strong>
              </div>
              <TimelineComponent events={timelineEvents} orientation="vertical" variant="detailed" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
