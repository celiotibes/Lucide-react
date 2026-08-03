import React, { useState, useEffect } from 'react';

interface ThresholdControlProps {
  currentThreshold: number;
  onThresholdChange: (threshold: number) => void;
  method: 'zscore' | 'iqr' | 'both';
  sensitivity?: 'low' | 'medium' | 'high';
}

const ThresholdPresets = {
  low: { zscore: 3.0, label: 'Conservador', description: 'Apenas anomalias muito óbvias' },
  medium: { zscore: 2.5, label: 'Moderado', description: 'Balanço entre precisão e cobertura' },
  high: { zscore: 2.0, label: 'Sensível', description: 'Detecta variações menores' },
};

export const ThresholdControl: React.FC<ThresholdControlProps> = ({
  currentThreshold,
  onThresholdChange,
  method,
  sensitivity = 'medium',
}) => {
  const [localThreshold, setLocalThreshold] = useState<number>(currentThreshold);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setLocalThreshold(currentThreshold);
  }, [currentThreshold]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setLocalThreshold(value);
    onThresholdChange(value);
  };

  const handlePresetClick = (preset: keyof typeof ThresholdPresets) => {
    const value = ThresholdPresets[preset].zscore;
    setLocalThreshold(value);
    onThresholdChange(value);
  };

  const getConfidenceLevel = (threshold: number): number => {
    if (threshold <= 1.5) return 0.93;
    if (threshold <= 2.0) return 0.954;
    if (threshold <= 2.5) return 0.988;
    return 0.997;
  };

  const getSensitivityLabel = (threshold: number): string => {
    if (threshold <= 1.5) return 'Muito Sensível';
    if (threshold <= 2.0) return 'Sensível';
    if (threshold <= 2.5) return 'Moderado';
    return 'Conservador';
  };

  const confidence = getConfidenceLevel(localThreshold);
  const sensitivityLabel = getSensitivityLabel(localThreshold);

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md rounded-xl border border-white/20">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
          🎚️ Controle de Limiar
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Ajuste a sensibilidade da detecção de anomalias
        </p>
      </div>

      {/* Preset Buttons */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(Object.entries(ThresholdPresets) as [keyof typeof ThresholdPresets, typeof ThresholdPresets[keyof typeof ThresholdPresets]][]).map(
          ([key, preset]) => (
            <button
              key={key}
              onClick={() => handlePresetClick(key)}
              className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                Math.abs(localThreshold - preset.zscore) < 0.1
                  ? 'bg-blue-500 text-white shadow-lg scale-105'
                  : 'bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-white/20'
              }`}
            >
              {preset.label}
            </button>
          )
        )}
      </div>

      {/* Slider */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Z-Score Threshold
          </span>
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
            {localThreshold.toFixed(2)}σ
          </span>
        </div>
        <input
          type="range"
          min="1.0"
          max="4.0"
          step="0.1"
          value={localThreshold}
          onChange={handleSliderChange}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
          <span>Sensível</span>
          <span>Conservador</span>
        </div>
      </div>

      {/* Sensitivity Label */}
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">
          {sensitivityLabel}
        </div>
        <div className="text-xs text-blue-800 dark:text-blue-400">
          Confiança: {(confidence * 100).toFixed(1)}%
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white/5 p-2 rounded-lg">
          <div className="text-xs text-gray-600 dark:text-gray-400">Método</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
            {method}
          </div>
        </div>
        <div className="bg-white/5 p-2 rounded-lg">
          <div className="text-xs text-gray-600 dark:text-gray-400">Cobertura</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            {(confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Details Toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
      >
        {showDetails ? '▼ Ocultar Detalhes' : '▶ Mostrar Detalhes'}
      </button>

      {/* Details Section */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Anomalias Esperadas (30 dias):</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {method === 'zscore' ? Math.max(0, Math.round((1 - confidence) * 30)) : '1-2'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Tipo de Método:</span>
              <span className="font-semibold text-gray-900 dark:text-white capitalize">
                {method === 'zscore' ? 'Estatístico' : method === 'iqr' ? 'Quartil' : 'Combinado'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Sensibilidade:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {sensitivityLabel}
              </span>
            </div>
          </div>
          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {localThreshold <= 1.5
                ? '⚠️ Muito sensível: Pode gerar falsos positivos'
                : localThreshold <= 2.0
                  ? '✓ Bom balanço entre precisão e cobertura'
                  : localThreshold <= 2.5
                    ? '✓ Configuração recomendada para produção'
                    : '✓ Conservador: Apenas anomalias óbvias'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThresholdControl;
