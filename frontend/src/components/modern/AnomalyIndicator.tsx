import React from 'react';
import { AlertCircle, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { AnomalyPoint } from '../../utils/analyticsEngine';

interface AnomalyIndicatorProps {
  anomalies: AnomalyPoint[];
  onDismiss?: () => void;
  compact?: boolean;
}

export const AnomalyIndicator: React.FC<AnomalyIndicatorProps> = ({
  anomalies,
  onDismiss,
  compact = false,
}) => {
  if (anomalies.length === 0) {
    return null;
  }

  const latestAnomaly = anomalies[anomalies.length - 1];
  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
  const highCount = anomalies.filter((a) => a.severity === 'high').length;

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'bg-red-900 border-red-700';
      case 'high':
        return 'bg-orange-900 border-orange-700';
      case 'medium':
        return 'bg-yellow-900 border-yellow-700';
      default:
        return 'bg-blue-900 border-blue-700';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-400" />;
      case 'high':
        return <AlertCircle className="w-5 h-5 text-orange-400" />;
      case 'medium':
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-blue-400" />;
    }
  };

  const getTrendIcon = (type: string) => {
    if (type === 'sudden_spike') {
      return <TrendingUp className="w-4 h-4 text-red-400" />;
    } else if (type === 'sudden_drop') {
      return <TrendingDown className="w-4 h-4 text-red-400" />;
    }
    return null;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {getSeverityIcon(latestAnomaly.severity)}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-[#f1f5f9]">
            {anomalies.length} Anomalia{anomalies.length !== 1 ? 's' : ''} Detectada
            {anomalies.length !== 1 ? 's' : ''}
          </p>
          {criticalCount > 0 && (
            <p className="text-xs text-red-400">{criticalCount} crítica{criticalCount !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${getSeverityColor(latestAnomaly.severity)}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          {getSeverityIcon(latestAnomaly.severity)}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-[#f1f5f9]">
                Anomalia Detectada
              </h3>
              {getTrendIcon(latestAnomaly.type)}
            </div>

            <p className="text-xs text-[#cbd5e1] mb-3">
              {latestAnomaly.explanation || 'Valor anômalo detectado no período'}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[#94a3b8]">Data</p>
                <p className="text-[#f1f5f9] font-medium">
                  {latestAnomaly.date.toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div>
                <p className="text-[#94a3b8]">Valor</p>
                <p className="text-[#f1f5f9] font-medium">
                  R$ {latestAnomaly.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-[#94a3b8]">Z-Score</p>
                <p className="text-[#f1f5f9] font-medium">
                  {latestAnomaly.zScore.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[#94a3b8]">Severidade</p>
                <p className="text-[#f1f5f9] font-medium capitalize">
                  {latestAnomaly.severity}
                </p>
              </div>
            </div>

            {anomalies.length > 1 && (
              <div className="mt-3 pt-3 border-t border-[rgba(226,232,240,0.1)]">
                <p className="text-xs text-[#94a3b8]">
                  {criticalCount > 0 && (
                    <span className="text-red-400">
                      {criticalCount} crítica{criticalCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {criticalCount > 0 && highCount > 0 && <span>, </span>}
                  {highCount > 0 && (
                    <span className="text-orange-400">
                      {highCount} alta{highCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-[#94a3b8] hover:text-[#f1f5f9] transition-colors p-1"
            aria-label="Descartar"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default AnomalyIndicator;
