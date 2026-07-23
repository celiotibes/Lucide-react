import React from 'react';
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { Forecast, TimeSeriesData } from '../../utils/analyticsEngine';

interface ForecastChartProps {
  actualData: TimeSeriesData[];
  forecast: Forecast[];
  title?: string;
  height?: number;
  showConfidence?: boolean;
}

export const ForecastChart: React.FC<ForecastChartProps> = ({
  actualData,
  forecast,
  title = 'Previsão de Tendência',
  height = 300,
  showConfidence = true,
}) => {
  if (!actualData || actualData.length === 0 || !forecast || forecast.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 text-[#94a3b8]">
        Dados insuficientes para gerar gráfico de previsão
      </div>
    );
  }

  // Combine actual data with forecast for plotting
  const chartData = [
    ...actualData.map((d) => ({
      date: d.date.toLocaleDateString('pt-BR', { month: '2-digit', day: '2-digit' }),
      actual: d.value,
      timestamp: d.date.getTime(),
    })),
    ...forecast.map((f) => ({
      date: f.date.toLocaleDateString('pt-BR', { month: '2-digit', day: '2-digit' }),
      predicted: f.predicted,
      lower: f.lower,
      upper: f.upper,
      timestamp: f.date.getTime(),
    })),
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#243549] border border-[#334155] rounded-lg p-3 shadow-lg">
          <p className="text-[#f1f5f9] text-sm font-medium">{data.date}</p>
          {data.actual && (
            <p className="text-[#3b82f6] text-xs mt-1">
              Atual: R$ {data.actual?.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </p>
          )}
          {data.predicted && (
            <p className="text-[#10b981] text-xs mt-1">
              Previsão: R$ {data.predicted?.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </p>
          )}
          {data.lower && data.upper && (
            <p className="text-[#94a3b8] text-xs mt-1">
              IC 95%: R${' '}
              {data.lower?.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} - R$
              {data.upper?.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-sm font-semibold text-[#f1f5f9] mb-3">{title}</h3>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
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
          <Legend
            wrapperStyle={{ color: '#cbd5e1' }}
            verticalAlign="top"
            height={36}
          />

          {/* Confidence interval as area */}
          {showConfidence && (
            <Area
              type="monotone"
              dataKey="lower"
              fill="#10b981"
              stroke="none"
              fillOpacity={0.1}
              isAnimationActive={false}
              name="IC 95%"
            />
          )}

          {/* Actual data line */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 6 }}
            name="Dados Reais"
            isAnimationActive={true}
          />

          {/* Forecast line */}
          <Line
            type="monotone"
            dataKey="predicted"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
            name="Previsão"
            isAnimationActive={true}
          />

          {/* Upper confidence bound */}
          {showConfidence && (
            <Line
              type="monotone"
              dataKey="upper"
              stroke="#10b981"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              name="Limite Superior"
              isAnimationActive={false}
              opacity={0.3}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {showConfidence && (
        <div className="mt-3 text-xs text-[#94a3b8]">
          <p>📊 Intervalo de confiança de 95% para a previsão</p>
        </div>
      )}
    </div>
  );
};

export default ForecastChart;
