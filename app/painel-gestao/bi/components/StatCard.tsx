'use client';

import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface SparklinePoint {
  value: number;
  timestamp?: Date;
}

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  data?: number[];
  trend?: number; // percentual de mudança
  state: 'otimo' | 'bom' | 'alerta' | 'critico';
  icon?: React.ReactNode;
}

const getStateGradient = (state: string) => {
  switch (state) {
    case 'otimo':
      return 'from-emerald-500/20 to-cyan-500/10 border-emerald-500/30';
    case 'bom':
      return 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30';
    case 'alerta':
      return 'from-amber-500/20 to-orange-500/10 border-amber-500/30';
    case 'critico':
      return 'from-rose-500/20 to-red-500/10 border-rose-500/30';
    default:
      return 'from-slate-500/20 to-slate-400/10 border-slate-500/30';
  }
};

const getStateBorderColor = (state: string) => {
  switch (state) {
    case 'otimo':
      return 'hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/20';
    case 'bom':
      return 'hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/20';
    case 'alerta':
      return 'hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/20';
    case 'critico':
      return 'hover:border-rose-500/50 hover:shadow-lg hover:shadow-rose-500/20';
    default:
      return '';
  }
};

const getTrendColor = (trend?: number) => {
  if (!trend) return 'text-slate-400';
  if (trend > 0) return 'text-emerald-400';
  return 'text-rose-400';
};

const getTrendBgColor = (trend?: number) => {
  if (!trend) return 'bg-slate-500/20';
  if (trend > 0) return 'bg-emerald-500/20';
  return 'bg-rose-500/20';
};

export function StatCard({
  title,
  value,
  unit,
  data,
  trend,
  state,
  icon,
}: StatCardProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsAnimating(true);
  }, [value]);

  const renderSparkline = () => {
    if (!data || data.length === 0) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((val) => ((val - min) / range) * 100);

    const pathData = points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * 100;
        return `${x},${100 - point}`;
      })
      .join(' ');

    const stateColor = {
      otimo: '#10B981',
      bom: '#06B6D4',
      alerta: '#FBBF24',
      critico: '#F43F5E',
    };

    return (
      <svg
        viewBox="0 0 100 50"
        className="w-full h-12 mt-2 opacity-60 hover:opacity-100 transition-opacity"
      >
        <defs>
          <linearGradient id={`sparkline-${state}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={stateColor[state]} stopOpacity="0.4" />
            <stop offset="100%" stopColor={stateColor[state]} stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Area under line */}
        <polyline
          points={`0,50 ${pathData} 100,50`}
          fill={`url(#sparkline-${state})`}
          stroke="none"
        />

        {/* Line */}
        <polyline
          points={pathData}
          fill="none"
          stroke={stateColor[state]}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        {/* Last point dot */}
        <circle
          cx={100}
          cy={100 - points[points.length - 1]}
          r="2"
          fill={stateColor[state]}
          opacity="0.8"
        />
      </svg>
    );
  };

  return (
    <div
      className={`relative p-6 rounded-xl border-2 bg-gradient-to-br ${getStateGradient(state)} backdrop-blur-xl transition-all duration-300 ${getStateBorderColor(state)} group`}
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold text-slate-100 transition-all duration-500 ${
                  isAnimating ? 'scale-100' : 'scale-95'
                }`}
              >
                {value}
              </span>
              {unit && <span className="text-sm text-slate-400">{unit}</span>}
            </div>
          </div>

          {icon ? (
            <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center text-slate-300 group-hover:scale-110 transition-transform">
              {icon}
            </div>
          ) : null}
        </div>

        {/* Sparkline */}
        {data && data.length > 0 && renderSparkline()}

        {/* Trend */}
        {trend !== undefined && (
          <div className={`inline-flex items-center gap-1 mt-3 px-2 py-1 rounded-lg ${getTrendBgColor(trend)}`}>
            {trend > 0 ? (
              <TrendingUp className={`w-4 h-4 ${getTrendColor(trend)}`} />
            ) : (
              <TrendingDown className={`w-4 h-4 ${getTrendColor(trend)}`} />
            )}
            <span className={`text-xs font-semibold ${getTrendColor(trend)}`}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
