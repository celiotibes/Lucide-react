import React, { useState } from 'react';

export interface WidgetConfig {
  id: string;
  name: string;
  enabled: boolean;
  size: 'small' | 'medium' | 'large';
  position: number;
  icon: string;
  color: string;
}

interface WidgetConfiguratorProps {
  widgets: WidgetConfig[];
  onWidgetsChange: (widgets: WidgetConfig[]) => void;
  onReset: () => void;
}

export const WidgetConfigurator: React.FC<WidgetConfiguratorProps> = ({
  widgets,
  onWidgetsChange,
  onReset,
}) => {
  const [isDragging, setIsDragging] = useState<string | null>(null);

  const handleToggleWidget = (id: string) => {
    const updated = widgets.map((w) =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    );
    onWidgetsChange(updated);
  };

  const handleSizeChange = (id: string, size: 'small' | 'medium' | 'large') => {
    const updated = widgets.map((w) =>
      w.id === id ? { ...w, size } : w
    );
    onWidgetsChange(updated);
  };

  const handleMove = (id: string, direction: 'up' | 'down') => {
    const index = widgets.findIndex((w) => w.id === id);
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === widgets.length - 1)) {
      return;
    }

    const updated = [...widgets];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];

    const reordered = updated.map((w, idx) => ({ ...w, position: idx }));
    onWidgetsChange(reordered);
  };

  const enabledCount = widgets.filter((w) => w.enabled).length;

  return (
    <div className="w-full p-4 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md rounded-xl border border-white/20">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            ⚙️ Configurador de Widgets
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Personalize o layout do seu dashboard
          </p>
        </div>
        <button
          onClick={onReset}
          className="px-3 py-1.5 text-xs font-medium bg-gray-500/20 text-gray-600 dark:text-gray-400 hover:bg-gray-500/30 rounded-lg transition-colors"
        >
          Resetar
        </button>
      </div>

      {/* Widgets Enabled Counter */}
      <div className="mb-4 p-2 bg-blue-50/20 dark:bg-blue-950/30 rounded-lg">
        <div className="text-xs font-semibold text-blue-900 dark:text-blue-300">
          {enabledCount}/{widgets.length} widgets ativos
        </div>
        <div className="h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden mt-1">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${(enabledCount / widgets.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Widgets List */}
      <div className="space-y-2">
        {widgets.map((widget, index) => (
          <div
            key={widget.id}
            className={`p-3 rounded-lg border transition-all ${
              widget.enabled
                ? 'bg-white/5 border-white/20 hover:bg-white/10'
                : 'bg-gray-500/10 border-gray-500/20 opacity-60'
            }`}
          >
            {/* Widget Header */}
            <div className="flex items-center gap-2 mb-2">
              {/* Icon & Name */}
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={widget.enabled}
                  onChange={() => handleToggleWidget(widget.id)}
                  className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                />
                <span className="text-lg">{widget.icon}</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {widget.name}
                </span>
              </div>

              {/* Move Buttons */}
              <div className="flex gap-1">
                <button
                  onClick={() => handleMove(widget.id, 'up')}
                  disabled={index === 0}
                  className="p-1.5 text-xs bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                  title="Mover para cima"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMove(widget.id, 'down')}
                  disabled={index === widgets.length - 1}
                  className="p-1.5 text-xs bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                  title="Mover para baixo"
                >
                  ▼
                </button>
              </div>
            </div>

            {/* Size Selector */}
            {widget.enabled && (
              <div className="pl-7 space-y-2">
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                  Tamanho:
                </div>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => handleSizeChange(widget.id, size)}
                      className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-all ${
                        widget.size === size
                          ? 'bg-blue-500/30 border border-blue-500 text-blue-900 dark:text-blue-300'
                          : 'bg-white/5 border border-white/10 text-gray-700 dark:text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {size === 'small' ? 'Pequeno' : size === 'medium' ? 'Médio' : 'Grande'}
                    </button>
                  ))}
                </div>

                {/* Size Description */}
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  {widget.size === 'small' && '📱 1 coluna no grid'}
                  {widget.size === 'medium' && '💻 2 colunas no grid'}
                  {widget.size === 'large' && '🖥️ 3+ colunas no grid'}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className="mt-4 pt-3 border-t border-white/10 space-y-1">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          💡 <strong>Dica:</strong> Ordene os widgets usando os botões ▲/▼
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          🎨 <strong>Tamanho:</strong> Ajuste o tamanho para otimizar seu espaço
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          💾 <strong>Auto-save:</strong> Suas preferências são salvas automaticamente
        </p>
      </div>
    </div>
  );
};

export default WidgetConfigurator;
