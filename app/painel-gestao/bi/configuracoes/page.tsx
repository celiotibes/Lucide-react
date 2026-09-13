'use client';

import { useState } from 'react';
import { Settings, Save, RotateCcw, Info, Check } from 'lucide-react';

interface ConfiguracaoBi {
  etlAtivo: boolean;
  etlHora: string;
  etlEmailNotificacao: string;
  cacheVidaUtil: number;
  cacheHabilitado: boolean;
  realtimeHabilitado: boolean;
  realtimeDebounce: number;
  alertasDiarios: boolean;
  alertasHora: string;
  alertasEmail: string;
  maxRegistrosPorPagina: number;
  compressaoGraficos: boolean;
  limitePeriodoQuery: number;
}

const CONFIGURACAO_PADRAO: ConfiguracaoBi = {
  etlAtivo: true,
  etlHora: '02:00',
  etlEmailNotificacao: 'admin@projeto.local',
  cacheVidaUtil: 5,
  cacheHabilitado: true,
  realtimeHabilitado: true,
  realtimeDebounce: 1000,
  alertasDiarios: true,
  alertasHora: '08:00',
  alertasEmail: 'admin@projeto.local',
  maxRegistrosPorPagina: 100,
  compressaoGraficos: true,
  limitePeriodoQuery: 365,
};

export default function PaginaConfiguracoes() {
  const [config, setConfig] = useState<ConfiguracaoBi>(CONFIGURACAO_PADRAO);
  const [salvo, setSalvo] = useState(false);

  const atualizarConfig = <K extends keyof ConfiguracaoBi>(chave: K, valor: ConfiguracaoBi[K]) => {
    setConfig((prev) => ({
      ...prev,
      [chave]: valor,
    }));
    setSalvo(false);
  };

  const salvarConfiguracoes = async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    } catch (erro) {
      console.error('Erro ao salvar:', erro);
    }
  };

  const resetarPadrao = () => {
    if (confirm('Deseja restaurar as configurações padrão?')) {
      setConfig(CONFIGURACAO_PADRAO);
      setSalvo(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2 flex items-center gap-3">
            <span className="p-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-purple-500/30">
              <Settings className="w-8 h-8 text-purple-400" />
            </span>
            Configurações BI
          </h1>
          <p className="text-slate-400">Gerencie parâmetros da plataforma BI</p>
        </div>

        {/* Mensagem de Sucesso */}
        {salvo && (
          <div className="mb-6 p-4 rounded-lg glass border-2 border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 flex items-center gap-3 animate-slideDown">
            <Check className="w-5 h-5 text-emerald-400" />
            <p className="text-emerald-300 font-medium">Configurações salvas com sucesso!</p>
          </div>
        )}

        <div className="space-y-6">
          {/* ETL Pipeline */}
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift stagger-item">
            <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-3">
              <span className="w-2 h-6 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full" />
              ETL Pipeline
            </h2>

            <div className="space-y-4">
              <label className="flex items-center gap-4 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={config.etlAtivo}
                  onChange={(e) => atualizarConfig('etlAtivo', e.target.checked)}
                  className="w-5 h-5 rounded accent-cyan-500 cursor-pointer"
                />
                <span className="text-slate-300 font-medium group-hover:text-slate-100 transition-colors">
                  Habilitar ETL automático
                </span>
              </label>

              {config.etlAtivo && (
                <>
                  <div className="ml-9 space-y-3 pt-2 border-l border-slate-700/50 pl-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Horário de Execução
                      </label>
                      <input
                        type="time"
                        value={config.etlHora}
                        onChange={(e) => atualizarConfig('etlHora', e.target.value)}
                        className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Email de Notificação
                      </label>
                      <input
                        type="email"
                        value={config.etlEmailNotificacao}
                        onChange={(e) => atualizarConfig('etlEmailNotificacao', e.target.value)}
                        className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Cache */}
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift stagger-item" style={{animationDelay: '50ms'}}>
            <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-3">
              <span className="w-2 h-6 bg-gradient-to-b from-emerald-500 to-cyan-500 rounded-full" />
              Cache
            </h2>

            <div className="space-y-4">
              <label className="flex items-center gap-4 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={config.cacheHabilitado}
                  onChange={(e) => atualizarConfig('cacheHabilitado', e.target.checked)}
                  className="w-5 h-5 rounded accent-cyan-500 cursor-pointer"
                />
                <span className="text-slate-300 font-medium group-hover:text-slate-100 transition-colors">
                  Habilitar cache de queries
                </span>
              </label>

              {config.cacheHabilitado && (
                <div className="ml-9 pt-2 border-l border-slate-700/50 pl-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Vida Útil do Cache (horas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={config.cacheVidaUtil}
                    onChange={(e) => atualizarConfig('cacheVidaUtil', parseInt(e.target.value))}
                    className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Realtime */}
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift stagger-item" style={{animationDelay: '100ms'}}>
            <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-3">
              <span className="w-2 h-6 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
              Real-time
            </h2>

            <div className="space-y-4">
              <label className="flex items-center gap-4 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={config.realtimeHabilitado}
                  onChange={(e) => atualizarConfig('realtimeHabilitado', e.target.checked)}
                  className="w-5 h-5 rounded accent-cyan-500 cursor-pointer"
                />
                <span className="text-slate-300 font-medium group-hover:text-slate-100 transition-colors">
                  Habilitar Realtime (WebSocket)
                </span>
              </label>

              {config.realtimeHabilitado && (
                <div className="ml-9 pt-2 border-l border-slate-700/50 pl-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Debounce (ms)
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="5000"
                    step="100"
                    value={config.realtimeDebounce}
                    onChange={(e) => atualizarConfig('realtimeDebounce', parseInt(e.target.value))}
                    className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                  <p className="text-xs text-slate-400 mt-2">
                    Tempo mínimo entre atualizações de dados
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Alertas */}
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift stagger-item" style={{animationDelay: '150ms'}}>
            <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-3">
              <span className="w-2 h-6 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full" />
              Alertas
            </h2>

            <div className="space-y-4">
              <label className="flex items-center gap-4 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={config.alertasDiarios}
                  onChange={(e) => atualizarConfig('alertasDiarios', e.target.checked)}
                  className="w-5 h-5 rounded accent-cyan-500 cursor-pointer"
                />
                <span className="text-slate-300 font-medium group-hover:text-slate-100 transition-colors">
                  Executar verificação diária de alertas
                </span>
              </label>

              {config.alertasDiarios && (
                <div className="ml-9 space-y-3 pt-2 border-l border-slate-700/50 pl-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Horário de Verificação
                    </label>
                    <input
                      type="time"
                      value={config.alertasHora}
                      onChange={(e) => atualizarConfig('alertasHora', e.target.value)}
                      className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Email para Notificações
                    </label>
                    <input
                      type="email"
                      value={config.alertasEmail}
                      onChange={(e) => atualizarConfig('alertasEmail', e.target.value)}
                      className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Performance */}
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift stagger-item" style={{animationDelay: '200ms'}}>
            <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-3">
              <span className="w-2 h-6 bg-gradient-to-b from-blue-500 to-violet-500 rounded-full" />
              Performance
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Máximo de Registros por Página
                </label>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  step="10"
                  value={config.maxRegistrosPorPagina}
                  onChange={(e) => atualizarConfig('maxRegistrosPorPagina', parseInt(e.target.value))}
                  className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
              </div>

              <label className="flex items-center gap-4 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={config.compressaoGraficos}
                  onChange={(e) => atualizarConfig('compressaoGraficos', e.target.checked)}
                  className="w-5 h-5 rounded accent-cyan-500 cursor-pointer"
                />
                <span className="text-slate-300 font-medium group-hover:text-slate-100 transition-colors">
                  Compressão de gráficos
                </span>
              </label>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Limite de Período para Queries (dias)
                </label>
                <input
                  type="number"
                  min="30"
                  max="1095"
                  step="30"
                  value={config.limitePeriodoQuery}
                  onChange={(e) => atualizarConfig('limitePeriodoQuery', parseInt(e.target.value))}
                  className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
                <p className="text-xs text-slate-400 mt-2">
                  Máximo de dias que podem ser consultados em um período
                </p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="glass rounded-xl p-4 border-2 border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 flex gap-3 stagger-item" style={{animationDelay: '250ms'}}>
            <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-cyan-300">
              As configurações são aplicadas imediatamente. Cron jobs usam horários UTC. Cache pode ser limpo manualmente do painel de administração.
            </p>
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-4 pt-4 stagger-item" style={{animationDelay: '300ms'}}>
            <button
              onClick={salvarConfiguracoes}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-cyan-500/20"
            >
              <Save className="w-5 h-5" />
              Salvar Configurações
            </button>
            <button
              onClick={resetarPadrao}
              className="flex-1 px-4 py-3 glass rounded-lg text-slate-100 font-semibold hover:bg-slate-700/50 flex items-center justify-center gap-2 transition-all border border-slate-700/50"
            >
              <RotateCcw className="w-5 h-5" />
              Restaurar Padrão
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
