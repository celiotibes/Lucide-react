import React from 'react';
import { TrendingUp, TrendingDown, Zap, Calendar } from 'lucide-react';

interface MetricsPanelProps {
  trendStrength: number;
  volatility: number;
  hasSeasonality: boolean;
  seasonalityPeriod: number;
  confidence: number;
  method: string;
  isReliable: boolean;
  rmse?: number;
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  trendStrength,
  volatility,
  hasSeasonality,
  seasonalityPeriod,
  confidence,
  method,
  isReliable,
  rmse,
}) => {
  const getTrendIcon = (strength: number) => {
    if (strength > 0.5) {
      return <TrendingUp className="w-4 h-4 text-green-400" />;
    } else if (strength < -0.5) {
      return <TrendingDown className="w-4 h-4 text-red-400" />;
    }
    return <Zap className="w-4 h-4 text-blue-400" />;
  };

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return 'text-green-400';
    if (conf >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getMetricGauge = (value: number, label: string) => {
    const percentage = (value * 100).toFixed(0);
    const bgColor = value > 0.7 ? 'bg-red-900' : value > 0.4 ? 'bg-yellow-900' : 'bg-green-900';

    return (
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-[#94a3b8] mb-1">{label}</p>
          <div className="h-2 bg-[#1e293b] rounded-full overflow-hidden">
            <div
              className={`h-full ${bgColor} transition-all`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        <p className="text-sm font-semibold text-[#f1f5f9] min-w-[45px] text-right">{percentage}%</p>
      </div>
    );
  };

  return (
    <div className="w-full rounded-lg border border-[rgba(226,232,240,0.15)] bg-[rgba(30,41,59,0.5)] backdrop-blur p-4">
      <h3 className="text-sm font-semibold text-[#f1f5f9] mb-4 flex items-center gap-2">
        <Zap className="w-4 h-4 text-blue-400" />
        Métricas Avançadas
      </h3>

      <div className="space-y-4">
        {/* Trend Strength */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[#cbd5e1]">Força da Tendência</label>
            <div className="flex items-center gap-1">
              {getTrendIcon(trendStrength)}
              <span className="text-xs text-[#94a3b8]">
                {Math.abs(trendStrength).toFixed(2)}
              </span>
            </div>
          </div>
          {getMetricGauge(Math.abs(trendStrength), '')}
          <p className="text-xs text-[#94a3b8] mt-2">
            {Math.abs(trendStrength) > 0.7
              ? trendStrength > 0
                ? '📈 Tendência ascendente forte'
                : '📉 Tendência descendente forte'
              : '➡️ Tendência fraca ou lateral'}
          </p>
        </div>

        {/* Volatility */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[#cbd5e1]">Volatilidade</label>
            <span className="text-xs text-[#94a3b8]">{(volatility * 100).toFixed(0)}%</span>
          </div>
          {getMetricGauge(volatility, '')}
          <p className="text-xs text-[#94a3b8] mt-2">
            {volatility > 0.5
              ? '⚠️ Dados altamente voláteis'
              : volatility > 0.3
              ? '⚡ Volatilidade moderada'
              : '✓ Dados estáveis'}
          </p>
        </div>

        {/* Seasonality */}
        <div className="rounded-lg border border-[rgba(226,232,240,0.1)] bg-[rgba(30,41,59,0.3)] p-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-[#cbd5e1] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              Sazonalidade
            </label>
            <span className={`text-xs font-semibold ${hasSeasonality ? 'text-purple-400' : 'text-[#94a3b8]'}`}>
              {hasSeasonality ? 'Detectada' : 'Não detectada'}
            </span>
          </div>
          {hasSeasonality && (
            <p className="text-xs text-[#cbd5e1]">
              Período: <span className="font-semibold">{seasonalityPeriod} dias</span>
            </p>
          )}
        </div>

        {/* Confidence & Method */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-[rgba(226,232,240,0.1)] bg-[rgba(30,41,59,0.3)] p-3">
            <p className="text-xs text-[#94a3b8] mb-1">Confiança</p>
            <p className={`text-sm font-semibold ${getConfidenceColor(confidence)}`}>
              {(confidence * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-[#94a3b8] mt-1">
              {confidence >= 0.8
                ? '🟢 Alta'
                : confidence >= 0.6
                ? '🟡 Moderada'
                : '🔴 Baixa'}
            </p>
          </div>

          <div className="rounded-lg border border-[rgba(226,232,240,0.1)] bg-[rgba(30,41,59,0.3)] p-3">
            <p className="text-xs text-[#94a3b8] mb-1">Método</p>
            <p className="text-sm font-semibold text-[#f1f5f9] capitalize">
              {method === 'linear' ? 'Linear' : 'Exponencial'}
            </p>
            <p className="text-xs text-[#94a3b8] mt-1">
              {isReliable ? '✓ Confiável' : '✗ Baixa confiabilidade'}
            </p>
          </div>
        </div>

        {/* RMSE */}
        {rmse !== undefined && (
          <div className="rounded-lg border border-[rgba(226,232,240,0.1)] bg-[rgba(30,41,59,0.3)] p-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#cbd5e1]">Erro Médio Quadrático</label>
              <p className="text-xs text-[#f1f5f9] font-semibold">
                R$ {rmse.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        {/* Reliability Status */}
        <div
          className={`rounded-lg border p-3 ${
            isReliable
              ? 'border-green-700 bg-[rgba(16,185,129,0.1)]'
              : 'border-yellow-700 bg-[rgba(234,179,8,0.1)]'
          }`}
        >
          <p className={`text-xs font-medium ${isReliable ? 'text-green-400' : 'text-yellow-400'}`}>
            {isReliable
              ? '✓ Previsão confiável'
              : '⚠️ Previsão pode ser imprecisa'}
          </p>
          <p className="text-xs text-[#cbd5e1] mt-1">
            {isReliable
              ? 'Os dados e tendências indicam uma previsão relativamente confiável.'
              : 'Considere usar esta previsão com cautela. Verifique os dados subjacentes.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MetricsPanel;
