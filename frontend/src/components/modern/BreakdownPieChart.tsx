/**
 * Breakdown Pie Chart Component
 * Circular chart for displaying financial breakdown (revenue/costs by category)
 */

import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

interface BreakdownItem {
  name: string;
  value: number;
  color?: string;
}

interface BreakdownPieChartProps {
  data: BreakdownItem[];
  title?: string;
  height?: number;
  showLegend?: boolean;
}

const DEFAULT_COLORS = [
  '#3b82f6', // Blue
  '#d4af37', // Gold
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
];

export const BreakdownPieChart: React.FC<BreakdownPieChartProps> = ({
  data,
  title = 'Breakdown',
  height = 300,
  showLegend = true,
}) => {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const { name, value, color } = payload[0];
      const total = data.reduce((sum, item) => sum + item.value, 0);
      const percentage = ((value / total) * 100).toFixed(1);

      return (
        <div className="bg-[#243549] border border-[#334155] rounded-lg p-3 shadow-lg">
          <p className="text-[#f1f5f9] text-sm font-medium">{name}</p>
          <p style={{ color }} className="text-sm font-bold mt-1">
            R$ {value?.toLocaleString('pt-BR')}
          </p>
          <p className="text-[#94a3b8] text-xs mt-1">{percentage}% do total</p>
        </div>
      );
    }
    return null;
  };

  const chartData = data.map((item, index) => ({
    ...item,
    color: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  }));

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            isAnimationActive={true}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          {showLegend && (
            <Legend
              wrapperStyle={{ color: '#cbd5e1' }}
              verticalAlign="bottom"
              height={36}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BreakdownPieChart;
