import React from 'react';

export interface ForecastPeriod {
  days: number;
  label: string;
  description: string;
  icon: string;
}

interface ForecastPeriodSelectorProps {
  selectedPeriod: number;
  onPeriodChange: (days: number) => void;
  available?: ForecastPeriod[];
}

const DEFAULT_PERIODS: ForecastPeriod[] = [
  {
    days: 7,
    label: 'Curto Prazo',
    description: 'Próximos 7 dias',
    icon: '⚡',
  },
  {
    days: 14,
    label: 'Médio Prazo',
    description: 'Próximas 2 semanas',
    icon: '📊',
  },
  {
    days: 30,
    label: 'Longo Prazo',
    description: 'Próximo mês',
    icon: '📈',
  },
];

export const ForecastPeriodSelector: React.FC<ForecastPeriodSelectorProps> = ({
  selectedPeriod,
  onPeriodChange,
  available = DEFAULT_PERIODS,
}) => {
  const getAccuracyEstimate = (days: number): string => {
    if (days <= 7) return 'Muito Alta (95%+)';
    if (days <= 14) return 'Alta (85-90%)';
    return 'Moderada (70-80%)';
  };

  const getConfidenceWarning = (days: number): string => {
    if (days <= 7) return '✓ Período ideal para previsões confiáveis';
    if (days <= 14) return '⚠ Confiança diminui além de 7 dias';
    return '⚠ Usar com cautela, validar regularmente';
  };

  return (
    <div className="w-full p-4 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md rounded-xl border border-white/20">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
          📅 Período de Previsão
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Selecione o horizonte de previsão desejado
        </p>
      </div>

      {/* Period Buttons */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {available.map((period) => {
          const isSelected = selectedPeriod === period.days;
          return (
            <button
              key={period.days}
              onClick={() => onPeriodChange(period.days)}
              className={`p-3 rounded-lg transition-all ${
                isSelected
                  ? 'bg-blue-500/30 border border-blue-500 text-blue-900 dark:text-blue-300 scale-105'
                  : 'bg-white/5 border border-white/20 text-gray-700 dark:text-gray-300 hover:bg-white/10'
              }`}
            >
              <div className="text-lg mb-1">{period.icon}</div>
              <div className="text-xs font-bold">{period.label}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {period.days}d
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Period Details */}
      <div className="p-3 bg-blue-50/20 dark:bg-blue-950/30 rounded-lg border border-blue-200/30 dark:border-blue-800/30 mb-4">
        <div className="space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                {available.find((p) => p.days === selectedPeriod)?.label ||
                  'Desconhecido'}
              </div>
              <div className="text-xs text-blue-800 dark:text-blue-400 mt-0.5">
                {available.find((p) => p.days === selectedPeriod)?.description}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-blue-200/30 dark:border-blue-800/30">
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-blue-800 dark:text-blue-400">
                  Pontos de Previsão:
                </span>
                <span className="font-semibold text-blue-900 dark:text-blue-300">
                  {selectedPeriod}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-800 dark:text-blue-400">
                  Acurácia Esperada:
                </span>
                <span className="font-semibold text-blue-900 dark:text-blue-300">
                  {getAccuracyEstimate(selectedPeriod)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confidence Warning */}
      <div className="p-2 rounded-lg bg-amber-50/20 dark:bg-amber-950/20 border border-amber-200/30 dark:border-amber-800/30">
        <p className="text-xs text-amber-800 dark:text-amber-400">
          {getConfidenceWarning(selectedPeriod)}
        </p>
      </div>

      {/* Information */}
      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <p>
            💡 <strong>Dica:</strong> Use 7 dias para planejamento tático.
            Use 30 dias para planejamento estratégico.
          </p>
          <p>
            ⚠️ <strong>Nota:</strong> Períodos mais longos têm menor acurácia. Valide regularmente.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForecastPeriodSelector;
