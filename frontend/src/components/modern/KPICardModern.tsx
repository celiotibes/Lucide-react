/**
 * Modern KPI Card
 * Bento Grid compatible with trending indicators and glassmorphism
 */

import React from 'react';
import GlassCard from './GlassCard';

interface KPICardModernProps {
  title: string;
  value: number | string;
  previousValue?: number;
  unit?: string;
  icon?: string;
  trend?: 'up' | 'down' | 'stable';
  trendPercentage?: number;
  status?: 'success' | 'warning' | 'error' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
}

export const KPICardModern: React.FC<KPICardModernProps> = ({
  title,
  value,
  previousValue,
  unit = '',
  icon,
  trend = 'stable',
  trendPercentage = 0,
  status = 'neutral',
  size = 'md',
}) => {
  const statusColors = {
    success: 'text-[#10b981]',
    warning: 'text-[#f59e0b]',
    error: 'text-[#ef4444]',
    neutral: 'text-[#3b82f6]',
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    stable: '→',
  };

  const trendColors = {
    up: 'text-[#10b981]',
    down: 'text-[#ef4444]',
    stable: 'text-[#94a3b8]',
  };

  const sizeClasses = {
    sm: 'col-span-1',
    md: 'col-span-1 row-span-1',
    lg: 'col-span-2 row-span-1',
  };

  const formatValue = (val: number | string) => {
    if (typeof val === 'string') return val;
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  return (
    <GlassCard
      variant="interactive"
      className={`${sizeClasses[size]} h-full flex flex-col justify-between`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-[#94a3b8] font-medium uppercase tracking-wide">
            {title}
          </p>
        </div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>

      {/* Main Value */}
      <div className="mb-6">
        <div className={`text-4xl font-bold ${statusColors[status]} mb-2`}>
          {formatValue(value)}
          {unit && <span className="text-lg ml-2 text-[#cbd5e1]">{unit}</span>}
        </div>

        {/* Trend Indicator */}
        {trend !== 'stable' && (
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${trendColors[trend]}`}>
              {trendIcons[trend]}
            </span>
            <span className={`text-sm font-semibold ${trendColors[trend]}`}>
              {trendPercentage}% from last period
            </span>
          </div>
        )}
      </div>

      {/* Footer Info */}
      {previousValue !== undefined && (
        <div className="pt-4 border-t border-[rgba(226,232,240,0.1)]">
          <p className="text-xs text-[#64748b]">
            Previous: {formatValue(previousValue)}
          </p>
        </div>
      )}

      {/* Visual Progress Bar */}
      <div className="mt-4 h-1 bg-[rgba(226,232,240,0.1)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            status === 'success'
              ? 'bg-[#10b981]'
              : status === 'error'
              ? 'bg-[#ef4444]'
              : status === 'warning'
              ? 'bg-[#f59e0b]'
              : 'bg-[#3b82f6]'
          }`}
          style={{
            width: `${Math.min((parseFloat(String(value)) / (parseFloat(String(previousValue || value)) * 1.5)) * 100, 100)}%`,
          }}
        />
      </div>
    </GlassCard>
  );
};

export default KPICardModern;
