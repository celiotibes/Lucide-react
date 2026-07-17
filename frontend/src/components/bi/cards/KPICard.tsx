import React from 'react';
import { KPI } from '../../../types/bi';
import './KPICard.css';

interface KPICardProps {
  kpi: KPI;
  onClick?: () => void;
  isLoading?: boolean;
}

export const KPICard: React.FC<KPICardProps> = ({ kpi, onClick, isLoading = false }) => {
  const formatValue = (value: number, unit: string) => {
    switch (unit) {
      case 'currency':
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value);
      case 'percentage':
        return `${value.toFixed(2)}%`;
      default:
        return new Intl.NumberFormat('pt-BR').format(value);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return '#10b981'; // Green
      case 'warning':
        return '#f59e0b'; // Amber
      case 'danger':
        return '#ef4444'; // Red
      default:
        return '#6b7280'; // Gray
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return '↑';
    if (trend === 'down') return '↓';
    return '→';
  };

  const getTrendColor = (trend: string) => {
    if (trend === 'up') return '#10b981';
    if (trend === 'down') return '#ef4444';
    return '#6b7280';
  };

  return (
    <div
      className="kpi-card"
      style={{ '--status-color': getStatusColor(kpi.status) } as React.CSSProperties}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {isLoading ? (
        <div className="kpi-skeleton">
          <div className="skeleton-name"></div>
          <div className="skeleton-value"></div>
        </div>
      ) : (
        <>
          <div className="kpi-header">
            <h3 className="kpi-name">{kpi.name}</h3>
            <span className="kpi-status-dot"></span>
          </div>

          <div className="kpi-value">
            {formatValue(kpi.value, kpi.unit)}
          </div>

          <div className="kpi-footer">
            <div className="kpi-comparison">
              <span
                className="kpi-trend"
                style={{ color: getTrendColor(kpi.trend) }}
              >
                <span className="trend-icon">{getTrendIcon(kpi.trend)}</span>
                {kpi.trendPercentage > 0 ? '+' : ''}
                {kpi.trendPercentage.toFixed(1)}%
              </span>
              {kpi.unit === 'currency' && (
                <span className="kpi-previous">
                  vs. {formatValue(kpi.previousValue, kpi.unit)}
                </span>
              )}
            </div>
            <span className="kpi-timestamp">
              Atualizado há {getTimeAgo(kpi.lastUpdated)}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'poucos segundos';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

export default KPICard;
