/**
 * Comparison Bar Chart Component
 * Side-by-side bars for comparing current vs previous period
 */

import React, { forwardRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ComparisonItem {
  category: string;
  current: number;
  previous: number;
}

interface ComparisonBarChartProps {
  data: ComparisonItem[];
  title?: string;
  currentLabel?: string;
  previousLabel?: string;
  height?: number;
  showLegend?: boolean;
}

export const ComparisonBarChart = forwardRef<HTMLDivElement, ComparisonBarChartProps>(
  ({
    data,
    title = 'Comparison',
    currentLabel = 'Current',
    previousLabel = 'Previous',
    height = 300,
    showLegend = true,
  }, ref) => {
    const CustomTooltip = ({ active, payload }: any) => {
      if (active && payload && payload.length) {
        return (
          <div className="bg-[#243549] border border-[#334155] rounded-lg p-3 shadow-lg">
            <p className="text-[#f1f5f9] text-sm font-medium">{payload[0]?.payload?.category}</p>
            {payload.map((entry: any, index: number) => {
              const change = (
                ((entry.value - payload[1-index]?.value) / payload[1-index]?.value) * 100
              ).toFixed(1);
              return (
                <p key={index} style={{ color: entry.color }} className="text-xs mt-1">
                  {entry.name}: R$ {entry.value?.toLocaleString('pt-BR')}
                </p>
              );
            })}
          </div>
        );
      }
      return null;
    };

    return (
      <div className="w-full h-full" ref={ref}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(226,232,240,0.1)"
            vertical={false}
          />
          <XAxis
            dataKey="category"
            stroke="#94a3b8"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#94a3b8"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => {
              if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
              if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
              return `${value}`;
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          {showLegend && (
            <Legend
              wrapperStyle={{ color: '#cbd5e1' }}
            />
          )}
          <Bar
            dataKey="current"
            fill="#3b82f6"
            name={currentLabel}
            radius={[8, 8, 0, 0]}
            isAnimationActive={true}
          />
          <Bar
            dataKey="previous"
            fill="#94a3b8"
            name={previousLabel}
            radius={[8, 8, 0, 0]}
            isAnimationActive={true}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
    );
  }
);

ComparisonBarChart.displayName = 'ComparisonBarChart';

export default ComparisonBarChart;
