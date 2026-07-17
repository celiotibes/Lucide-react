'use client';

import { useState } from 'react';
import { Settings, Save, RotateCcw, Info } from 'lucide-react';

interface ConfiguracaoBi {
  // ETL
  etlAtivo: boolean;
  etlHora: string;
  etlEmailNotificacao: string;

  // Cache
  cacheVidaUtil: number; // horas
  cacheHabilitado: boolean;

  // Realtime
  realtimeHabilitado: boolean;
  realtimeDebounce: number; // ms

  // Alertas
  alertasDiarios: boolean;
  alertasHora: string;
  alertasEmail: string;

  // Performance
  maxRegistrosPorPagina: number;
  compressaoGraficos: boolean;
  limitePeriodoQuery: number; // dias
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
    // Simular salvamento
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
            <Settings className="w-8 h-8" />
            Configurações BI
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Gerencie parâmetros da plataforma BI</p>
        </div>

        {/* Mensagem de Sucesso */}
        {salvo && (
          <div className="mb-6 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-green-500" />
            <p className="text-green-800 dark:text-green-400 font-medium">Configurações salvas com sucesso!</p>
          </div>
        )}

        <div className="space-y-8">
          {/* ETL Pipeline */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                ⚙️
              </span>
              ETL Pipeline
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={config.etlAtivo}
                  onChange={(e) => atualizarConfig('etlAtivo', e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <label className="text-gray-700 dark:text-gray-300 font-medium">Habilitar ETL automático</label>
              </div>

              {config.etlAtivo && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Horário de Execução
                    </label>
                    <input
                      type="time"
                      value={config.etlHora}
                      onChange={(e) => atualizarConfig('etlHora', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email de Notificação
                    </label>
                    <input
                      type="email"
                      value={config.etlEmailNotificacao}
                      onChange={(e) => atualizarConfig('etlEmailNotificacao', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Cache */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                💾
              </span>
              Cache
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={config.cacheHabilitado}
                  onChange={(e) => atualizarConfig('cacheHabilitado', e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <label className="text-gray-700 dark:text-gray-300 font-medium">Habilitar cache de queries</label>
              </div>

              {config.cacheHabilitado && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Vida Útil do Cache (horas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={config.cacheVidaUtil}
                    onChange={(e) => atualizarConfig('cacheVidaUtil', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Realtime */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                🔄
              </span>
              Real-time
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={config.realtimeHabilitado}
                  onChange={(e) => atualizarConfig('realtimeHabilitado', e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <label className="text-gray-700 dark:text-gray-300 font-medium">Habilitar Realtime (WebSocket)</label>
              </div>

              {config.realtimeHabilitado && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Debounce (ms)
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="5000"
                    step="100"
                    value={config.realtimeDebounce}
                    onChange={(e) => atualizarConfig('realtimeDebounce', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Tempo mínimo entre atualizações de dados
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Alertas */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                🔔
              </span>
              Alertas
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={config.alertasDiarios}
                  onChange={(e) => atualizarConfig('alertasDiarios', e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <label className="text-gray-700 dark:text-gray-300 font-medium">Executar verificação diária de alertas</label>
              </div>

              {config.alertasDiarios && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Horário de Verificação
                    </label>
                    <input
                      type="time"
                      value={config.alertasHora}
                      onChange={(e) => atualizarConfig('alertasHora', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email para Notificações
                    </label>
                    <input
                      type="email"
                      value={config.alertasEmail}
                      onChange={(e) => atualizarConfig('alertasEmail', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Performance */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                ⚡
              </span>
              Performance
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Máximo de Registros por Página
                </label>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  step="10"
                  value={config.maxRegistrosPorPagina}
                  onChange={(e) => atualizarConfig('maxRegistrosPorPagina', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={config.compressaoGraficos}
                  onChange={(e) => atualizarConfig('compressaoGraficos', e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <label className="text-gray-700 dark:text-gray-300 font-medium">Compressão de gráficos</label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Limite de Período para Queries (dias)
                </label>
                <input
                  type="number"
                  min="30"
                  max="1095"
                  step="30"
                  value={config.limitePeriodoQuery}
                  onChange={(e) => atualizarConfig('limitePeriodoQuery', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Máximo de dias que podem ser consultados em um período
                </p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              As configurações são aplicadas imediatamente. Cron jobs usam horários UTC. Cache pode ser limpo manualmente do painel de administração.
            </p>
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={salvarConfiguracoes}
              className="flex-1 px-4 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              Salvar Configurações
            </button>
            <button
              onClick={resetarPadrao}
              className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center gap-2"
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
