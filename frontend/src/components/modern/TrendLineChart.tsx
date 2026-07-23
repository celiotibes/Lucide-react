/**
 * Trend Line Chart Component
 * Interactive line chart for displaying financial trends over time
 */

import React, { forwardRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface TrendDataPoint {
  date: string;
  value: number;
  previousValue?: number;
}

interface TrendLineChartProps {
  data: TrendDataPoint[];
  title?: string;
  valueLabel?: string;
  height?: number;
  showLegend?: boolean;
}

export const TrendLineChart = forwardRef<HTMLDivElement, TrendLineChartProps>(
  ({
    data,
    title = 'Trend',
    valueLabel = 'Value',
    height = 300,
    showLegend = true,
  }, ref) => {
    const CustomTooltip = ({ active, payload }: any) => {
      if (active && payload && payload.length) {
        return (
          <div className="bg-[#243549] border border-[#334155] rounded-lg p-3 shadow-lg">
            <p className="text-[#f1f5f9] text-sm font-medium">{payload[0]?.payload?.date}</p>
            {payload.map((entry: any, index: number) => (
              <p key={index} style={{ color: entry.color }} className="text-xs mt-1">
                {entry.name}: {entry.value?.toLocaleString('pt-BR')}
              </p>
            ))}
          </div>
        );
      }
      return null;
    };

    return (
      <div className="w-full h-full" ref={ref}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(226,232,240,0.1)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="#94a3b8"
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => {
              if (value >= 1000000) return `R$${(value / 1000000).toFixed(0)}M`;
              if (value >= 1000) return `R$${(value / 1000).toFixed(0)}K`;
              return `R$${value}`;
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          {showLegend && (
            <Legend
              wrapperStyle={{ color: '#cbd5e1' }}
              iconType="line"
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 6 }}
            name={valueLabel}
            isAnimationActive={true}
          />
          {data[0]?.previousValue !== undefined && (
            <Line
              type="monotone"
              dataKey="previousValue"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: '#94a3b8', r: 3 }}
              name={`${valueLabel} (Previous)`}
              isAnimationActive={true}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      </div>
    );
  }
);

TrendLineChart.displayName = 'TrendLineChart';

export default TrendLineChart;
